import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { ImageProvider } from "../src/providers/types.js";
import { KIWIFY_PLANS, kiwifyActionOf, kiwifyPlanOf, kiwifyValidUntil, verifyKiwifySignature } from "../src/kiwify.js";

const TOKEN = "token_teste";
const prov: ImageProvider = { name: "fake", classify: async () => ({ isCar: true, wheelsVisible: true, requestAboutWheelPaint: true }), edit: async (i) => i };
const sign = (body: string, token = TOKEN) => createHmac("sha1", token).update(body).digest("hex");

describe("verifyKiwifySignature", () => {
  const body = '{"order_id":"1"}';
  it("aceita assinatura correta", () => expect(verifyKiwifySignature(body, sign(body), TOKEN)).toBe(true));
  it("aceita maiúsculas no hex", () => expect(verifyKiwifySignature(body, sign(body).toUpperCase(), TOKEN)).toBe(true));
  it("recusa corpo alterado", () => expect(verifyKiwifySignature(body + " ", sign(body), TOKEN)).toBe(false));
  it("recusa token errado", () => expect(verifyKiwifySignature(body, sign(body, "outro"), TOKEN)).toBe(false));
  it("recusa sem assinatura", () => expect(verifyKiwifySignature(body, undefined, TOKEN)).toBe(false));
});

describe("kiwifyPlanOf / kiwifyActionOf", () => {
  it("acha o plano pelo ID do produto", () => {
    expect(kiwifyPlanOf({ Product: { product_id: KIWIFY_PLANS.pro.productId } })?.id).toBe("pro");
    expect(kiwifyPlanOf({ Product: { product_id: KIWIFY_PLANS.estudio.productId } })?.id).toBe("estudio");
    expect(kiwifyPlanOf({ Product: { product_id: KIWIFY_PLANS.basico.productId } })?.id).toBe("basico");
  });
  it("sem ID conhecido, acha pelo nome do produto do Roda Nova", () => {
    expect(kiwifyPlanOf({ Product: { product_id: "x", product_name: "Roda Nova - Plano Estúdio (250 rodas por mês)" } })?.id).toBe("estudio");
    expect(kiwifyPlanOf({ Product: { product_id: "x", product_name: "Roda Nova - Plano Pro (100 rodas por mês)" } })?.id).toBe("pro");
  });
  it("ignora produto que não é do Roda Nova", () => {
    expect(kiwifyPlanOf({ Product: { product_id: "x", product_name: "Curso de Toxina Botulínica Pro" } })).toBeUndefined();
  });
  it("classifica os eventos", () => {
    expect(kiwifyActionOf({ webhook_event_type: "order_approved", order_status: "paid" }).action).toBe("grant");
    expect(kiwifyActionOf({ webhook_event_type: "subscription_renewed", order_status: "paid" }).action).toBe("grant");
    expect(kiwifyActionOf({ webhook_event_type: "order_approved", order_status: "waiting_payment" }).action).toBe("none");
    expect(kiwifyActionOf({ webhook_event_type: "order_refunded" }).action).toBe("revoke");
    expect(kiwifyActionOf({ webhook_event_type: "chargeback" }).action).toBe("revoke");
    expect(kiwifyActionOf({ webhook_event_type: "subscription_canceled" }).action).toBe("none");
    expect(kiwifyActionOf({ webhook_event_type: "subscription_late" }).action).toBe("none");
  });
  it("validade: usa a próxima cobrança ou 32 dias", () => {
    const now = Date.parse("2026-12-01T00:00:00Z");
    expect(kiwifyValidUntil({ Subscription: { next_payment: "2026-12-31T00:00:00Z" } }, now)).toBe("2026-12-31T00:00:00.000Z");
    expect(kiwifyValidUntil({}, now)).toBe(new Date(now + 32 * 86400_000).toISOString());
    expect(kiwifyValidUntil({ Subscription: { next_payment: "2020-01-01T00:00:00Z" } }, now)).toBe(new Date(now + 32 * 86400_000).toISOString());
  });
});

describe("cobrança na web (Kiwify)", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let n = 0;
  beforeAll(async () => {
    process.env.KIWIFY_WEBHOOK_TOKEN = TOKEN;
    app = await buildApp({ provider: prov });
  });

  const signup = async () => {
    const email = `kw${++n}@b.com`;
    const r = await app.inject({ method: "POST", url: "/auth/register", payload: { email, password: "123456", acceptTerms: true } });
    const token = r.json().token as string;
    const h = { authorization: `Bearer ${token}` };
    const id = (await app.inject({ method: "GET", url: "/me", headers: h })).json().id as number;
    return { email, id, h };
  };
  const me = async (h: any) => (await app.inject({ method: "GET", url: "/me", headers: h })).json();
  const hook = (event: unknown, signature?: string) => {
    const body = JSON.stringify(event);
    return app.inject({ method: "POST", url: `/billing/kiwify?signature=${signature ?? sign(body)}`, payload: body, headers: { "content-type": "application/json" } });
  };
  const order = (orderId: string, planId: keyof typeof KIWIFY_PLANS, email: string, extra: Record<string, unknown> = {}) => ({
    order_id: orderId,
    order_status: "paid",
    webhook_event_type: "order_approved",
    Product: { product_id: KIWIFY_PLANS[planId].productId, product_name: `Roda Nova - Plano ${planId}` },
    Customer: { email },
    Subscription: { next_payment: new Date(Date.now() + 30 * 86400_000).toISOString() },
    ...extra,
  });

  it("/plans avisa que a web cobra pela Kiwify", async () => {
    const r = (await app.inject({ method: "GET", url: "/plans" })).json();
    expect(r.webCheckout).toBe(true);
    expect(r.webProvider).toBe("kiwify");
  });

  it("checkout devolve o link do plano com e-mail e ID do usuário", async () => {
    const u = await signup();
    const r = await app.inject({ method: "POST", url: "/billing/kiwify/checkout", payload: { plan: "pro" }, headers: u.h });
    expect(r.statusCode).toBe(200);
    const url = new URL(r.json().url);
    expect(url.origin + url.pathname).toBe(KIWIFY_PLANS.pro.checkoutUrl);
    expect(url.searchParams.get("email")).toBe(u.email);
    expect(url.searchParams.get("sck")).toBe(String(u.id));
  });

  it("checkout recusa plano grátis/inexistente e quem não está logado", async () => {
    const u = await signup();
    expect((await app.inject({ method: "POST", url: "/billing/kiwify/checkout", payload: { plan: "free" }, headers: u.h })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/billing/kiwify/checkout", payload: { plan: "xx" }, headers: u.h })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/billing/kiwify/checkout", payload: { plan: "pro" } })).statusCode).toBe(401);
  });

  it("compra aprovada libera as rodas do plano e repetir o aviso não soma de novo", async () => {
    const u = await signup();
    const before = (await me(u.h)).credits as number;
    const ev = order("ord_1", "pro", u.email);
    expect((await hook(ev)).statusCode).toBe(200);
    const m = await me(u.h);
    expect(m.plan).toBe("pro");
    expect(m.credits).toBe(before + 100);
    expect(m.subscriptionUntil).toBeTruthy();
    const again = await hook(ev);
    expect(again.json().duplicate).toBe(true);
    expect((await me(u.h)).credits).toBe(before + 100);
  });

  it("cada plano libera as rodas certas (Básico 40, Estúdio 250)", async () => {
    const a = await signup();
    const b = await signup();
    const ca = (await me(a.h)).credits as number;
    const cb = (await me(b.h)).credits as number;
    await hook(order("ord_b", "basico", a.email));
    await hook(order("ord_e", "estudio", b.email));
    expect((await me(a.h)).credits).toBe(ca + 40);
    expect((await me(b.h)).credits).toBe(cb + 250);
    expect((await me(b.h)).plan).toBe("estudio");
  });

  it("renovação soma as rodas do mês de novo", async () => {
    const u = await signup();
    const before = (await me(u.h)).credits as number;
    await hook(order("ord_r1", "basico", u.email));
    await hook(order("ord_r2", "basico", u.email, { webhook_event_type: "subscription_renewed" }));
    expect((await me(u.h)).credits).toBe(before + 80);
  });

  it("acha a conta pelo ID do link quando o e-mail da compra é outro", async () => {
    const u = await signup();
    const before = (await me(u.h)).credits as number;
    await hook(order("ord_s1", "pro", "outro.email@x.com", { TrackingParameters: { sck: String(u.id) } }));
    expect((await me(u.h)).credits).toBe(before + 100);
  });

  it("compra de e-mail desconhecido não libera nada, mas fica registrada", async () => {
    const r = await hook(order("ord_x", "pro", "ninguem@x.com"));
    expect(r.statusCode).toBe(200);
  });

  it("produto que não é do Roda Nova não libera rodas", async () => {
    const u = await signup();
    const before = (await me(u.h)).credits as number;
    await hook({ order_id: "ord_o", order_status: "paid", webhook_event_type: "order_approved", Product: { product_id: "outro", product_name: "Curso de Toxina" }, Customer: { email: u.email } });
    expect((await me(u.h)).credits).toBe(before);
    expect((await me(u.h)).plan).toBe("free");
  });

  it("boleto/Pix aguardando pagamento não libera rodas", async () => {
    const u = await signup();
    const before = (await me(u.h)).credits as number;
    await hook(order("ord_w", "pro", u.email, { order_status: "waiting_payment" }));
    expect((await me(u.h)).credits).toBe(before);
  });

  it("cancelar mantém o plano até vencer; reembolso volta ao grátis e mantém as rodas que sobraram", async () => {
    const u = await signup();
    await hook(order("ord_c1", "pro", u.email));
    const credits = (await me(u.h)).credits as number;
    await hook(order("ord_c1", "pro", u.email, { webhook_event_type: "subscription_canceled" }));
    expect((await me(u.h)).plan).toBe("pro");
    await hook(order("ord_c1", "pro", u.email, { webhook_event_type: "order_refunded", order_status: "refunded" }));
    const m = await me(u.h);
    expect(m.plan).toBe("free");
    expect(m.credits).toBe(credits);
  });

  it("recusa aviso sem assinatura ou com assinatura errada", async () => {
    const u = await signup();
    const body = JSON.stringify(order("ord_bad", "pro", u.email));
    expect((await app.inject({ method: "POST", url: "/billing/kiwify", payload: body, headers: { "content-type": "application/json" } })).statusCode).toBe(401);
    expect((await hook(order("ord_bad", "pro", u.email), "deadbeef")).statusCode).toBe(401);
    expect((await me(u.h)).plan).toBe("free");
  });

  it("recusa aviso sem número do pedido", async () => {
    expect((await hook({ webhook_event_type: "order_approved" })).statusCode).toBe(400);
  });
});
