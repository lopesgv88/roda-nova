import { describe, expect, it, beforeAll, vi } from "vitest";

import { parseQuery } from "../src/cars.js";
import { readdirSync } from "node:fs";
import sharp from "sharp";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import { db } from "../src/db.js";
import { prepareImage } from "../src/images.js";
import type { ImageProvider } from "../src/providers/types.js";

describe("parseQuery", () => {
  it("entende 'civic 2018 preto fosco'", () => {
    const p = parseQuery("Civic 2018 preto fosco");
    expect(p).toMatchObject({ make: "Honda", model: "Civic", year: 2018, color: "preto", finish: "fosco" });
  });
  it("entende apelidos e variações", () => {
    expect(parseQuery("hb 20 2020").model).toBe("HB20");
    expect(parseQuery("vw gol g5").model).toBe("Gol");
    expect(parseQuery("golf mk7 2017").year).toBe(2017);
    expect(parseQuery("Citroen C4 Cactus").model).toBe("C4 Cactus");
  });
});

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

function multipart(fields: Record<string, string>, file?: { name: string; data: Buffer }) {
  const b = "----t" + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields))
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (file)
    parts.push(
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${file.name}"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n`),
      file.data,
      Buffer.from("\r\n"),
    );
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${b}` } };
}

describe("API", () => {
  const edit = vi.fn(async (img: any) => img);
  let verdict = { isCar: true, wheelsVisible: true, requestAboutWheelPaint: true };
  const provider: ImageProvider = { name: "fake", classify: async () => verdict, edit };
  let app: Awaited<ReturnType<typeof buildApp>>;
  let token = "";

  beforeAll(async () => {
    app = await buildApp({ provider });
    const r = await app.inject({ method: "POST", url: "/auth/register", payload: { email: "a@b.com", password: "123456", acceptTerms: true } });
    token = r.json().token;
  });
  const h = () => ({ authorization: `Bearer ${token}` });

  it("recusa foto que não é carro sem gerar imagem", async () => {
    verdict = { isCar: false, wheelsVisible: false, requestAboutWheelPaint: true };
    const m = multipart({ color: "preto" }, { name: "photo", data: png });
    const r = await app.inject({ method: "POST", url: "/ai/wheel-paint", payload: m.payload, headers: { ...m.headers, ...h() } });
    expect(r.statusCode).toBe(422);
    expect(r.json().code).toBe("not_car");
    expect(edit).not.toHaveBeenCalled();
  });

  it("recusa pedido fora do contexto", async () => {
    verdict = { isCar: true, wheelsVisible: true, requestAboutWheelPaint: false };
    const m = multipart({ color: "ponha um gato no teto" }, { name: "photo", data: png });
    const r = await app.inject({ method: "POST", url: "/ai/wheel-paint", payload: m.payload, headers: { ...m.headers, ...h() } });
    expect(r.statusCode).toBe(422);
    expect(edit).not.toHaveBeenCalled();
  });

  it("gera quando carro + pedido de roda", async () => {
    verdict = { isCar: true, wheelsVisible: true, requestAboutWheelPaint: true };
    const m = multipart({ color: "preto", finish: "fosco" }, { name: "photo", data: png });
    const r = await app.inject({ method: "POST", url: "/ai/wheel-paint", payload: m.payload, headers: { ...m.headers, ...h() } });
    expect(r.statusCode).toBe(200);
    expect(edit).toHaveBeenCalledOnce();
    const { beforeFile, afterFile } = r.json();

    // salva na biblioteca usando os arquivos gerados
    const s = multipart({ make: "Honda", model: "Civic", year: "2018", color: "preto fosco", beforeFile, afterFile });
    const saved = await app.inject({ method: "POST", url: "/library/entries", payload: s.payload, headers: { ...s.headers, ...h() } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().photos).toHaveLength(2);
  });

  it("busca 'civic 2018' acha, 'gol 2015' não", async () => {
    const ok = await app.inject({ method: "GET", url: "/library/entries?q=civic%202018", headers: h() });
    expect(ok.json()).toHaveLength(1);
    const no = await app.inject({ method: "GET", url: "/library/entries?q=gol%202015", headers: h() });
    expect(no.json()).toHaveLength(0);
  });

  it("transcreve voz e entende o carro", async () => {
    const t = buildApp({ provider, transcribe: async () => "Civic 2018 preto" });
    const a = await t;
    const reg = await a.inject({ method: "POST", url: "/auth/register", payload: { email: "v@b.com", password: "123456", acceptTerms: true } });
    const m = multipart({}, { name: "audio", data: Buffer.alloc(2000, 1) });
    const r = await a.inject({ method: "POST", url: "/voice/transcribe", payload: m.payload, headers: { ...m.headers, authorization: `Bearer ${reg.json().token}` } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ text: "Civic 2018 preto", model: "Civic", year: 2018, color: "preto" });
  });

  it("acha 'opala roda cinza' e 'corolla roda preta' (cor + carro)", async () => {
    const a = await buildApp({ provider });
    const reg = await a.inject({ method: "POST", url: "/auth/register", payload: { email: "c@b.com", password: "123456", acceptTerms: true } });
    const auth = { authorization: `Bearer ${reg.json().token}` };
    const add = async (fields: Record<string, string>) => {
      const m = multipart(fields, { name: "after", data: png });
      return a.inject({ method: "POST", url: "/library/entries", payload: m.payload, headers: { ...m.headers, ...auth } });
    };
    await add({ make: "Chevrolet", model: "Opala", year: "1978", color: "Cinza fosco" });
    await add({ make: "Toyota", model: "Corolla", year: "2020", color: "Preta" });
    await add({ make: "Chevrolet", model: "Opala", year: "1980", color: "Vermelha" });
    const q = (s: string) => a.inject({ method: "GET", url: `/library/entries?q=${encodeURIComponent(s)}`, headers: auth }).then((r) => r.json());
    expect(parseQuery("opala roda cinza")).toMatchObject({ make: "Chevrolet", model: "Opala", color: "cinza", rest: "" });
    const opala = await q("opala roda cinza");
    expect(opala).toHaveLength(1);
    expect(opala[0]).toMatchObject({ make: "Chevrolet", model: "Opala", color: "Cinza fosco" });
    const corolla = await q("corolla roda preta");
    expect(corolla).toHaveLength(1);
    expect(corolla[0].model).toBe("Corolla");
    expect(await q("opala")).toHaveLength(2);
    expect(await q("opala roda azul")).toHaveLength(0);
  });

  it("exige login", async () => {
    const r = await app.inject({ method: "GET", url: "/library/entries" });
    expect(r.statusCode).toBe(401);
  });
});

describe("créditos e planos", () => {
  let fail = false;
  let notCar = false;
  const prov: ImageProvider = {
    name: "fake2",
    classify: async () => ({ isCar: !notCar, wheelsVisible: true, requestAboutWheelPaint: true }),
    edit: async (i) => {
      if (fail) throw new Error("falha simulada");
      return i;
    },
  };
  const gen = (a: Awaited<ReturnType<typeof buildApp>>, token: string) => {
    const m = multipart({ color: "preto" }, { name: "photo", data: png });
    return a.inject({ method: "POST", url: "/ai/wheel-paint", payload: m.payload, headers: { ...m.headers, authorization: `Bearer ${token}` } });
  };
  const me = (a: Awaited<ReturnType<typeof buildApp>>, token: string) =>
    a.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
  const signup = async (a: Awaited<ReturnType<typeof buildApp>>, email: string) =>
    (await a.inject({ method: "POST", url: "/auth/register", payload: { email, password: "123456", acceptTerms: true } })).json().token as string;

  it("novo usuário ganha 3 créditos, cada imagem gasta 1 e no zero bloqueia", async () => {
    const a = await buildApp({ provider: prov });
    const t = await signup(a, "cred1@b.com");
    expect(await me(a, t)).toMatchObject({ plan: "free", credits: 3 });
    for (const left of [2, 1, 0]) {
      const r = await gen(a, t);
      expect(r.statusCode).toBe(200);
      expect(r.json().credits).toBe(left);
    }
    const blocked = await gen(a, t);
    expect(blocked.statusCode).toBe(402);
    expect(blocked.json().code).toBe("no_credits");
  });

  it("não gasta crédito quando a geração falha nem quando a foto é recusada", async () => {
    const a = await buildApp({ provider: prov });
    const t = await signup(a, "cred2@b.com");
    fail = true;
    expect((await gen(a, t)).statusCode).toBe(502);
    fail = false;
    notCar = true;
    expect((await gen(a, t)).statusCode).toBe(422);
    notCar = false;
    expect((await me(a, t)).credits).toBe(3);
  });

  it("lista os planos e só libera plano pago quando o pagamento existe", async () => {
    const a = await buildApp({ provider: prov });
    const plans = (await a.inject({ method: "GET", url: "/plans" })).json().plans;
    expect(plans.map((p: any) => p.id)).toEqual(["free", "basico", "pro", "estudio"]);
    const t = await signup(a, "plan1@b.com");
    const h = { authorization: `Bearer ${t}` };
    const denied = await a.inject({ method: "POST", url: "/plans/select", payload: { plan: "pro" }, headers: h });
    expect(denied.statusCode).toBe(402);
    expect(denied.json().code).toBe("payment_unavailable");
    expect((await me(a, t)).credits).toBe(3);

    const free = await a.inject({ method: "POST", url: "/plans/select", payload: { plan: "free" }, headers: h });
    expect(free.statusCode).toBe(200);

    const b = await buildApp({ provider: prov, unlockPlans: true });
    const t2 = await signup(b, "plan2@b.com");
    const ok = await b.inject({ method: "POST", url: "/plans/select", payload: { plan: "pro" }, headers: { authorization: `Bearer ${t2}` } });
    expect(ok.json()).toMatchObject({ plan: "pro", credits: 103 });
  });

  it("assinatura vencida volta para o grátis e mantém os créditos", async () => {
    const b = await buildApp({ provider: prov, unlockPlans: true });
    const t = await signup(b, "sub1@b.com");
    const h = { authorization: `Bearer ${t}` };
    await b.inject({ method: "POST", url: "/plans/select", payload: { plan: "basico" }, headers: h });
    expect(await me(b, t)).toMatchObject({ plan: "basico", credits: 43 });
    db.prepare("UPDATE users SET subscription_until=? WHERE email=?").run("2020-01-01T00:00:00.000Z", "sub1@b.com");
    expect(await me(b, t)).toMatchObject({ plan: "free", credits: 43 });
  });
});

describe("cobrança (RevenueCat)", () => {
  const SECRET = "segredo-de-teste-123";
  const future = () => Date.now() + 30 * 24 * 60 * 60_000;
  const signup = async (a: Awaited<ReturnType<typeof buildApp>>, email: string) => {
    const r = (await a.inject({ method: "POST", url: "/auth/register", payload: { email, password: "123456", acceptTerms: true } })).json();
    const m = (await a.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${r.token}` } })).json();
    return { token: r.token as string, id: m.id as number };
  };
  const me = (a: Awaited<ReturnType<typeof buildApp>>, token: string) =>
    a.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${token}` } }).then((r) => r.json());
  const hook = (a: Awaited<ReturnType<typeof buildApp>>, event: Record<string, unknown>, auth: string | null = SECRET) =>
    a.inject({ method: "POST", url: "/billing/revenuecat", payload: { api_version: "1.0", event }, headers: auth === null ? {} : { authorization: auth } });

  it("fica desligado sem a chave secreta e recusa quem não manda a chave certa", async () => {
    const a = await buildApp();
    delete process.env.REVENUECAT_WEBHOOK_AUTH;
    expect((await hook(a, { id: "x1", type: "TEST" })).statusCode).toBe(503);
    process.env.REVENUECAT_WEBHOOK_AUTH = SECRET;
    expect((await hook(a, { id: "x2", type: "TEST" }, null)).statusCode).toBe(401);
    expect((await hook(a, { id: "x3", type: "TEST" }, "errada")).statusCode).toBe(401);
    expect((await hook(a, { id: "x4", type: "TEST" })).statusCode).toBe(200);
  });

  it("compra libera o plano e os créditos; o mesmo aviso repetido não credita duas vezes", async () => {
    process.env.REVENUECAT_WEBHOOK_AUTH = SECRET;
    const a = await buildApp();
    const u = await signup(a, "bill1@b.com");
    const ev = { id: "buy1", type: "INITIAL_PURCHASE", app_user_id: String(u.id), product_id: "pro_mensal:mensal", expiration_at_ms: future() };
    expect((await hook(a, ev)).statusCode).toBe(200);
    expect(await me(a, u.token)).toMatchObject({ plan: "pro", credits: 103 });
    const again = await hook(a, ev);
    expect(again.json()).toMatchObject({ duplicate: true });
    expect((await me(a, u.token)).credits).toBe(103);
  });

  it("renovação soma créditos do mês e vencimento volta ao grátis mantendo as rodas", async () => {
    process.env.REVENUECAT_WEBHOOK_AUTH = SECRET;
    const a = await buildApp();
    const u = await signup(a, "bill2@b.com");
    const base = { app_user_id: String(u.id), product_id: "basico_mensal:mensal", expiration_at_ms: future() };
    await hook(a, { id: "r1", type: "INITIAL_PURCHASE", ...base });
    await hook(a, { id: "r2", type: "RENEWAL", ...base });
    expect(await me(a, u.token)).toMatchObject({ plan: "basico", credits: 83 });
    await hook(a, { id: "r3", type: "EXPIRATION", app_user_id: String(u.id), product_id: "basico_mensal:mensal" });
    expect(await me(a, u.token)).toMatchObject({ plan: "free", credits: 83 });
  });

  it("cancelamento não tira nada antes de vencer; produto desconhecido, assinatura já vencida e usuário inexistente são ignorados", async () => {
    process.env.REVENUECAT_WEBHOOK_AUTH = SECRET;
    const a = await buildApp();
    const u = await signup(a, "bill3@b.com");
    const id = String(u.id);
    await hook(a, { id: "c1", type: "INITIAL_PURCHASE", app_user_id: id, product_id: "estudio_mensal:mensal", expiration_at_ms: future() });
    await hook(a, { id: "c2", type: "CANCELLATION", app_user_id: id, product_id: "estudio_mensal:mensal" });
    expect(await me(a, u.token)).toMatchObject({ plan: "estudio", credits: 253 });
    await hook(a, { id: "c3", type: "INITIAL_PURCHASE", app_user_id: id, product_id: "produto_falso", expiration_at_ms: future() });
    await hook(a, { id: "c4", type: "RENEWAL", app_user_id: id, product_id: "basico_mensal:mensal", expiration_at_ms: Date.now() - 1000 });
    expect((await me(a, u.token)).credits).toBe(253);
    const ghost = await hook(a, { id: "c5", type: "INITIAL_PURCHASE", app_user_id: "$RCAnonymousID:abc", product_id: "pro_mensal:mensal", expiration_at_ms: future() });
    expect(ghost.json()).toMatchObject({ ok: true, ignored: expect.any(String) });
    expect((await hook(a, { type: "TEST" })).statusCode).toBe(400);
  });

  it("os planos pagos têm o ID do produto para o app comprar", async () => {
    const a = await buildApp();
    const plans = (await a.inject({ method: "GET", url: "/plans" })).json().plans;
    expect(plans.filter((p: any) => p.id !== "free").map((p: any) => p.productId)).toEqual(["basico_mensal", "pro_mensal", "estudio_mensal"]);
  });
});

describe("segurança, conta e privacidade", () => {
  const prov: ImageProvider = {
    name: "fake3",
    classify: async () => ({ isCar: true, wheelsVisible: true, requestAboutWheelPaint: true }),
    edit: async (i) => i,
  };
  const sent: Array<{ to: string; text: string }> = [];
  const mailer = { name: "teste", send: async (to: string, _s: string, text: string) => void sent.push({ to, text }) };
  let a: Awaited<ReturnType<typeof buildApp>>;
  const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
  const post = (url: string, payload: any, headers: any = {}) => a.inject({ method: "POST", url, payload, headers });
  const signup = async (email: string) => (await post("/auth/register", { email, password: "123456", acceptTerms: true })).json().token as string;
  const gen = (t: string) => {
    const m = multipart({ color: "preto" }, { name: "photo", data: png });
    return a.inject({ method: "POST", url: "/ai/wheel-paint", payload: m.payload, headers: { ...m.headers, ...bearer(t) } });
  };

  beforeAll(async () => {
    a = await buildApp({ provider: prov, mailer });
  });

  it("cadastro exige aceitar os termos", async () => {
    const r = await post("/auth/register", { email: "t1@b.com", password: "123456" });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/Termos/);
  });

  it("sem aceite dos termos não gera imagem; aceitando, libera", async () => {
    const t = await signup("t2@b.com");
    db.prepare("UPDATE users SET terms_accepted_at=NULL WHERE email=?").run("t2@b.com");
    const blocked = await gen(t);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe("terms_required");
    const acc = await post("/me/terms", { accept: true }, bearer(t));
    expect(acc.json().termsAccepted).toBe(true);
    expect((await gen(t)).statusCode).toBe(200);
  });

  it("recuperar senha: código por e-mail, código errado falha, novo código troca a senha", async () => {
    await signup("rec@b.com");
    const unknown = await post("/auth/forgot", { email: "ninguem@b.com" });
    expect(unknown.json().ok).toBe(true);
    expect(sent.find((s) => s.to === "ninguem@b.com")).toBeUndefined();

    await post("/auth/forgot", { email: "rec@b.com" });
    const code = sent.filter((s) => s.to === "rec@b.com").at(-1)!.text.match(/\b(\d{6})\b/)![1];
    const wrong = await post("/auth/reset", { email: "rec@b.com", code: code === "000000" ? "111111" : "000000", password: "novaSenha1" });
    expect(wrong.statusCode).toBe(400);
    const ok = await post("/auth/reset", { email: "rec@b.com", code, password: "novaSenha1" });
    expect(ok.statusCode).toBe(200);
    expect((await post("/auth/login", { email: "rec@b.com", password: "123456" })).statusCode).toBe(401);
    expect((await post("/auth/login", { email: "rec@b.com", password: "novaSenha1" })).statusCode).toBe(200);
    // o código só vale uma vez
    expect((await post("/auth/reset", { email: "rec@b.com", code, password: "outra123" })).statusCode).toBe(400);
  });

  it("excluir conta apaga usuário, histórico e arquivos", async () => {
    const t = await signup("del@b.com");
    const g = await gen(t);
    expect(g.statusCode).toBe(200);
    const uid = (db.prepare("SELECT id FROM users WHERE email=?").get("del@b.com") as any).id as number;
    const files = () => readdirSync(config.uploadsDir).filter((f) => f.startsWith(`${uid}_`));
    expect(files().length).toBe(2);

    const hist = await a.inject({ method: "GET", url: "/history", headers: bearer(t) });
    expect(hist.json()).toHaveLength(1);

    const wrong = await a.inject({ method: "DELETE", url: "/me", payload: { password: "errada" }, headers: bearer(t) });
    expect(wrong.statusCode).toBe(403);
    const ok = await a.inject({ method: "DELETE", url: "/me", payload: { password: "123456" }, headers: bearer(t) });
    expect(ok.statusCode).toBe(200);
    expect(files()).toHaveLength(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM generations WHERE user_id=?").get(uid)).toMatchObject({ n: 0 });
    expect((await post("/auth/login", { email: "del@b.com", password: "123456" })).statusCode).toBe(401);
  });

  it("histórico: lista e apaga uma geração", async () => {
    const t = await signup("hist@b.com");
    await gen(t);
    const list = (await a.inject({ method: "GET", url: "/history", headers: bearer(t) })).json();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ color: "preto" });
    const del = await a.inject({ method: "DELETE", url: `/history/${list[0].id}`, headers: bearer(t) });
    expect(del.statusCode).toBe(200);
    expect((await a.inject({ method: "GET", url: "/history", headers: bearer(t) })).json()).toHaveLength(0);
  });

  it("bloqueia o e-mail depois de muitas senhas erradas", async () => {
    await signup("lock@b.com");
    for (let i = 0; i < 8; i++) expect((await post("/auth/login", { email: "lock@b.com", password: "errada1" })).statusCode).toBe(401);
    const locked = await post("/auth/login", { email: "lock@b.com", password: "123456" });
    expect(locked.statusCode).toBe(429);
  });

  it("limita tentativas de cadastro/login por IP", async () => {
    const limited = await buildApp({ provider: prov, mailer, rateLimit: true });
    const codes: number[] = [];
    for (let i = 0; i < 14; i++) {
      const r = await limited.inject({ method: "POST", url: "/auth/login", payload: { email: `x${i}@b.com`, password: "123456" } });
      codes.push(r.statusCode);
    }
    expect(codes.slice(0, 12).every((c) => c === 401)).toBe(true);
    expect(codes[13]).toBe(429);
  });

  it("serve política de privacidade e termos", async () => {
    const j = (await a.inject({ method: "GET", url: "/legal/privacy" })).json();
    expect(j.title).toBe("Política de Privacidade");
    expect(j.body).toMatch(/LGPD/);
    const html = await a.inject({ method: "GET", url: "/privacidade" });
    expect(html.statusCode).toBe(200);
    expect(html.headers["content-type"]).toMatch(/text\/html/);
    expect((await a.inject({ method: "GET", url: "/termos" })).statusCode).toBe(200);
    expect((await a.inject({ method: "GET", url: "/legal/nada" })).statusCode).toBe(404);
  });

  it("reduz fotos grandes antes de enviar para a IA", async () => {
    const big = await sharp({ create: { width: 3200, height: 2000, channels: 3, background: { r: 120, g: 120, b: 130 } } }).png().toBuffer();
    const out = await prepareImage(big, "image/png");
    const meta = await sharp(out.data).metadata();
    expect(out.mime).toBe("image/jpeg");
    expect(Math.max(meta.width!, meta.height!)).toBe(1536);
    expect(meta.width! / meta.height!).toBeCloseTo(1.6, 1);
  });
});
