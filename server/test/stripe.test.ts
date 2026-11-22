import { createHmac } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { db } from "../src/db.js";
import type { ImageProvider } from "../src/providers/types.js";
import { verifyStripeSignature } from "../src/stripe.js";

const SECRET = "whsec_teste";
const prov: ImageProvider = { name: "fake", classify: async () => ({ isCar: true, wheelsVisible: true, requestAboutWheelPaint: true }), edit: async (i) => i };

/** Assina o corpo como o Stripe faz: t=<segundos>,v1=HMAC_SHA256("<t>.<corpo>") */
const sign = (body: string, t = Math.floor(Date.now() / 1000), secret = SECRET) =>
  `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;

describe("verifyStripeSignature", () => {
  const body = '{"id":"evt_1"}';
  it("aceita assinatura correta", () => expect(verifyStripeSignature(body, sign(body), SECRET)).toBe(true));
  it("recusa corpo alterado", () => expect(verifyStripeSignature(body + " ", sign(body), SECRET)).toBe(false));
  it("recusa segredo errado", () => expect(verifyStripeSignature(body, sign(body, undefined, "outro"), SECRET)).toBe(false));
  it("recusa aviso antigo (reenvio)", () => expect(verifyStripeSignature(body, sign(body, Math.floor(Date.now() / 1000) - 3600), SECRET)).toBe(false));
  it("recusa sem cabeçalho", () => expect(verifyStripeSignature(body, undefined, SECRET)).toBe(false));
});

describe("cobrança na web (Stripe)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let n = 0;
  beforeAll(async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    app = await buildApp({ provider: prov });
  });
  afterEach(() => vi.restoreAllMocks());

  const signup = async () => {
    const email = `st${++n}@b.com`;
    const r = await app.inject({ method: "POST", url: "/auth/register", payload: { email, password: "123456", acceptTerms: true } });
    const token = r.json().token as string;
    const id = (await app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${token}` } })).json().id as number;
    return { email, token, id, h: { authorization: `Bearer ${token}` } };
  };
  const me = async (h: any) => (await app.inject({ method: "GET", url: "/me", headers: h })).json();
  const hook = (event: unknown, signature?: string) => {
    const body = JSON.stringify(event);
    return app.inject({ method: "POST", url: "/billing/stripe", payload: body, headers: { "content-type": "application/json", "stripe-signature": signature ?? sign(body) } });
  };
  const invoice = (id: string, userId: number, plan: string, extra: Record<string, unknown> = {}) => ({
    id, type: "invoice.paid",
    data: { object: { customer: `cus_${userId}`, amount_paid: 3999, subscription_details: { metadata: { userId: String(userId), plan } }, lines: { data: [{ period: { end: Math.floor(Date.now() / 1000) + 30 * 86400 } }] }, ...extra } },
  });

  it("/plans avisa que a web pode cobrar quando há chave do Stripe", async () => {
    expect((await app.inject({ method: "GET", url: "/plans" })).json().webCheckout).toBe(true);
  });

  it("checkout cria a sessão do Stripe com o valor e os dados do plano", async () => {
    const u = await signup();
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ url: "https://checkout.stripe.com/pay/cs_1" }), { status: 200 }));
    const r = await app.inject({ method: "POST", url: "/billing/stripe/checkout", payload: { plan: "pro" }, headers: u.h });
    expect(r.statusCode).toBe(200);
    expect(r.json().url).toBe("https://checkout.stripe.com/pay/cs_1");
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    const sent = new URLSearchParams(String(init.body));
    expect(sent.get("mode")).toBe("subscription");
    expect(sent.get("line_items[0][price_data][unit_amount]")).toBe("7999"); // R$ 79,99 em centavos
    expect(sent.get("line_items[0][price_data][currency]")).toBe("brl");
    expect(sent.get("metadata[userId]")).toBe(String(u.id));
    expect(sent.get("metadata[plan]")).toBe("pro");
    expect(sent.get("subscription_data[metadata][plan]")).toBe("pro");
    expect(sent.get("customer_email")).toBe(u.email);
  });

  it("checkout recusa plano grátis/inexistente e quem não está logado", async () => {
    const u = await signup();
    expect((await app.inject({ method: "POST", url: "/billing/stripe/checkout", payload: { plan: "free" }, headers: u.h })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/billing/stripe/checkout", payload: { plan: "xyz" }, headers: u.h })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/billing/stripe/checkout", payload: { plan: "pro" } })).statusCode).toBe(401);
  });

  it("pagamento libera as rodas do plano UMA vez (aviso repetido não duplica)", async () => {
    const u = await signup();
    const ev = invoice("evt_pago_1", u.id, "basico");
    expect((await hook(ev)).statusCode).toBe(200);
    expect(await me(u.h)).toMatchObject({ plan: "basico", credits: 43 }); // 3 grátis + 40 do Básico
    const again = await hook(ev);
    expect(again.json().duplicate).toBe(true);
    expect((await me(u.h)).credits).toBe(43);
    expect((db.prepare("SELECT stripe_customer_id FROM users WHERE id=?").get(u.id) as any).stripe_customer_id).toBe(`cus_${u.id}`);
  });

  it("renovação do mês seguinte soma mais rodas", async () => {
    const u = await signup();
    await hook(invoice("evt_r1", u.id, "pro"));
    await hook(invoice("evt_r2", u.id, "pro"));
    expect(await me(u.h)).toMatchObject({ plan: "pro", credits: 203 });
  });

  it("não libera nada sem pagamento (valor 0) nem com plano inválido", async () => {
    const u = await signup();
    await hook(invoice("evt_zero", u.id, "pro", { amount_paid: 0 }));
    await hook(invoice("evt_free", u.id, "free"));
    expect(await me(u.h)).toMatchObject({ plan: "free", credits: 3 });
  });

  it("recusa aviso com assinatura falsa e não libera nada", async () => {
    const u = await signup();
    const r = await hook(invoice("evt_fake", u.id, "estudio"), "t=1,v1=00");
    expect(r.statusCode).toBe(400);
    expect((await me(u.h)).credits).toBe(3);
  });

  it("assinatura cancelada volta para o grátis e mantém as rodas que sobraram", async () => {
    const u = await signup();
    await hook(invoice("evt_c1", u.id, "basico"));
    // sem os metadados, acha a pessoa pelo cliente do Stripe
    await hook({ id: "evt_c2", type: "customer.subscription.deleted", data: { object: { customer: `cus_${u.id}` } } });
    expect(await me(u.h)).toMatchObject({ plan: "free", credits: 43 });
  });

  it("sem segredo configurado o aviso responde 503", async () => {
    const old = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect((await app.inject({ method: "POST", url: "/billing/stripe", payload: "{}", headers: { "content-type": "application/json" } })).statusCode).toBe(503);
    process.env.STRIPE_WEBHOOK_SECRET = old;
  });

  it("portal pede que a pessoa já tenha assinado pela web", async () => {
    const u = await signup();
    expect((await app.inject({ method: "POST", url: "/billing/stripe/portal", headers: u.h })).statusCode).toBe(404);
  });
});
