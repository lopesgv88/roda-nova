import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import fstatic from "@fastify/static";
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { db } from "./db.js";
import { colorKeys, compact, parseQuery, suggest } from "./cars.js";
import { prepareImage } from "./images.js";
import { legalDoc, legalHtml, TERMS_VERSION } from "./legal.js";
import { getMailer, type Mailer } from "./mailer.js";
import { getProvider } from "./providers/index.js";
import type { ImageProvider } from "./providers/types.js";
import { FREE_LIBRARY_LIMIT, PLANS, planById, planByProductId } from "./plans.js";
import { buildEditPrompt, checkScope } from "./scope.js";
import { EditDriftError, editWheelsOnly } from "./wheelEdit.js";
import { Limiter, LoginGuard } from "./security.js";
import { stripeEnabled, stripeRequest, verifyStripeSignature } from "./stripe.js";
import { kiwifyActionOf, kiwifyCheckoutUrl, kiwifyEnabled, kiwifyPlanOf, kiwifyValidUntil, verifyKiwifySignature } from "./kiwify.js";
import { openaiTranscribe, type Transcriber } from "./transcribe.js";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Descobre o tipo real da imagem pelos primeiros bytes (o celular nem sempre informa o mime certo). */
function sniffMime(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b.length > 7 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 11 && b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null; // HEIC e outros formatos não são aceitos pelos provedores
}

function hash(pw: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
function verify(pw: string, stored: string): boolean {
  const [s, h] = stored.split(":");
  const a = scryptSync(pw, Buffer.from(s, "hex"), 64);
  return timingSafeEqual(a, Buffer.from(h, "hex"));
}

const NO_CREDITS_MSG = "Seus créditos acabaram. Escolha um plano para continuar pintando rodas.";

export interface AppOptions {
  provider?: ImageProvider;
  transcribe?: Transcriber;
  unlockPlans?: boolean;
  mailer?: Mailer;
  /** liga os limites de requisição (desligado nos testes, ligado por padrão) */
  rateLimit?: boolean;
}

export async function buildApp(opts: AppOptions = {}) {
  const transcribe = opts.transcribe ?? openaiTranscribe;
  const unlockPlans = opts.unlockPlans ?? process.env.PLANS_UNLOCK_FOR_TESTING === "true";
  const mailer = opts.mailer ?? getMailer();
  const rateOn = opts.rateLimit ?? !process.env.VITEST;
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test" && !process.env.VITEST,
    bodyLimit: 25 * 1024 * 1024,
    trustProxy: process.env.TRUST_PROXY === "true", // true quando atrás de Render/Railway/Nginx
  });
  const provider = () => opts.provider ?? getProvider();

  // Guarda o corpo cru do JSON: o aviso de pagamento do Stripe só pode ser conferido com o texto exato que chegou.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    (req as any).rawBody = body;
    try {
      done(null, body ? JSON.parse(body as string) : {});
    } catch (e) {
      (e as any).statusCode = 400;
      done(e as Error, undefined);
    }
  });

  // ---------- Proteção contra abuso ----------
  const globalLimiter = new Limiter(240, 60_000); // por IP
  const authLimiter = new Limiter(12, 60_000); // cadastro/login/senha, por IP
  const paintLimiter = new Limiter(8, 60_000); // gerações por usuário
  const forgotLimiter = new Limiter(3, 60 * 60_000); // pedidos de código por e-mail
  const loginGuard = new LoginGuard();
  app.addHook("onRequest", async (req, reply) => {
    if (!rateOn) return;
    const tooMany = () => reply.code(429).send({ error: "Muitas tentativas em pouco tempo. Aguarde um pouco e tente de novo." });
    if (!globalLimiter.hit(req.ip)) return tooMany();
    if (req.url.startsWith("/auth/") && !authLimiter.hit(req.ip)) return tooMany();
  });

  // O app é nativo e não precisa de CORS; libere origens só se for usar um site (CORS_ORIGIN="https://a.com,https://b.com").
  const corsOrigin = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map((s) => s.trim()) : config.production ? false : true;
  await app.register(cors, { origin: corsOrigin });
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 12 } });
  await app.register(fstatic, { root: config.uploadsDir, prefix: "/files/" });

  // Versão web do app (para quem usa iPhone/Safari): arquivos do `expo export` em server/web, servidos em /app/.
  // Só liga se a pasta existir; não muda nada para o app do Android.
  const webRoot = fileURLToPath(new URL("../web", import.meta.url));
  if (existsSync(path.join(webRoot, "index.html"))) {
    await app.register(fstatic, { root: webRoot, prefix: "/app/", decorateReply: false });
    app.get("/app", async (_req, reply) => reply.redirect("/app/"));
    // o endereço curto (ex.: app.rodanovaapp.com) leva direto ao app
    app.get("/", async (_req, reply) => reply.redirect("/app/"));
    app.setNotFoundHandler(async (req, reply) => {
      // telas internas do app (ex.: /app/library) devolvem o index.html; o resto segue 404 normal
      if (req.method === "GET" && req.url.startsWith("/app/") && !path.extname(req.url.split("?")[0]))
        return reply.type("text/html; charset=utf-8").send(readFileSync(path.join(webRoot, "index.html")));
      return reply.code(404).send({ message: `Route ${req.method}:${req.url} not found`, error: "Not Found", statusCode: 404 });
    });
  }

  const auth = async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: "Sessão inválida. Entre novamente." });
    }
  };
  const uid = (req: FastifyRequest) => (req.user as { id: number }).id;

  /** Assinatura vencida volta para o plano grátis (os créditos que sobraram continuam). */
  const expireSub = (id: number) =>
    db
      .prepare("UPDATE users SET plan='free', subscription_until=NULL WHERE id=? AND plan!='free' AND subscription_until IS NOT NULL AND subscription_until < ?")
      .run(id, new Date().toISOString());
  const meOf = (id: number) => {
    expireSub(id);
    const u = db.prepare("SELECT email, plan, credits, terms_accepted_at, subscription_until FROM users WHERE id=?").get(id) as any;
    if (!u) return null;
    return { id, email: u.email, plan: u.plan, credits: u.credits, termsAccepted: !!u.terms_accepted_at, subscriptionUntil: u.subscription_until ?? null };
  };
  /** Apaga do disco todos os arquivos do usuário (nomes começam com "<id>_"). */
  const removeUserFiles = (id: number) => {
    try {
      for (const f of readdirSync(config.uploadsDir)) if (f.startsWith(`${id}_`)) rmSync(path.join(config.uploadsDir, f), { force: true });
    } catch (e) {
      console.error("[files]", e);
    }
  };

  app.get("/health", async () => ({ ok: true, provider: provider().name }));

  // ---------- Auth ----------
  const creds = (b: any) => {
    const email = String(b?.email ?? "").trim().toLowerCase();
    const password = String(b?.password ?? "");
    if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "E-mail inválido." };
    if (password.length < 6) return { error: "A senha precisa de pelo menos 6 caracteres." };
    return { email, password };
  };

  app.post("/auth/register", async (req, reply) => {
    const c = creds(req.body);
    if ("error" in c) return reply.code(400).send({ error: c.error });
    if ((req.body as any)?.acceptTerms !== true)
      return reply.code(400).send({ error: "Aceite os Termos de Uso e a Política de Privacidade para criar a conta." });
    try {
      const r = db
        .prepare("INSERT INTO users(email,password_hash,terms_accepted_at,terms_version) VALUES(?,?,?,?)")
        .run(c.email, hash(c.password), new Date().toISOString(), TERMS_VERSION);
      const id = Number(r.lastInsertRowid);
      return { token: app.jwt.sign({ id }), email: c.email };
    } catch {
      return reply.code(409).send({ error: "Esse e-mail já está cadastrado." });
    }
  });

  app.post("/auth/login", async (req, reply) => {
    const c = creds(req.body);
    if ("error" in c) return reply.code(400).send({ error: c.error });
    if (loginGuard.locked(c.email))
      return reply.code(429).send({ error: "Muitas tentativas com senha errada. Tente de novo em alguns minutos ou recupere a senha." });
    const u = db.prepare("SELECT id,password_hash FROM users WHERE email=?").get(c.email) as any;
    if (!u || !verify(c.password, u.password_hash)) {
      loginGuard.fail(c.email);
      return reply.code(401).send({ error: "E-mail ou senha incorretos." });
    }
    loginGuard.ok(c.email);
    return { token: app.jwt.sign({ id: u.id }), email: c.email };
  });

  // Recuperar senha: manda um código de 6 dígitos por e-mail (vale 15 min). A resposta é sempre a mesma,
  // para não revelar quais e-mails têm conta.
  const codeHash = (code: string, email: string) => createHash("sha256").update(`${code}:${email}:${config.jwtSecret}`).digest("hex");
  app.post("/auth/forgot", async (req) => {
    const email = String((req.body as any)?.email ?? "").trim().toLowerCase();
    const generic = { ok: true, message: "Se esse e-mail tiver conta, enviamos um código para ele." };
    if (!/^\S+@\S+\.\S+$/.test(email)) return generic;
    if (rateOn && !forgotLimiter.hit(email)) return generic;
    const u = db.prepare("SELECT id FROM users WHERE email=?").get(email) as { id: number } | undefined;
    if (!u) return generic;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    db.prepare(
      "INSERT INTO password_resets(user_id,code_hash,expires_at,attempts) VALUES(?,?,?,0) ON CONFLICT(user_id) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0",
    ).run(u.id, codeHash(code, email), Date.now() + 15 * 60_000);
    try {
      await mailer.send(email, "Seu código do Roda Nova", `Seu código para criar uma nova senha é ${code}.\nEle vale por 15 minutos. Se não foi você, ignore este e-mail.`);
    } catch (e) {
      console.error("[mail]", e);
    }
    return generic;
  });

  app.post("/auth/reset", async (req, reply) => {
    const email = String((req.body as any)?.email ?? "").trim().toLowerCase();
    const code = String((req.body as any)?.code ?? "").trim();
    const password = String((req.body as any)?.password ?? "");
    if (password.length < 6) return reply.code(400).send({ error: "A senha precisa de pelo menos 6 caracteres." });
    const bad = () => reply.code(400).send({ error: "Código inválido ou expirado. Peça um novo." });
    const u = db.prepare("SELECT id FROM users WHERE email=?").get(email) as { id: number } | undefined;
    if (!u) return bad();
    const r = db.prepare("SELECT code_hash, expires_at, attempts FROM password_resets WHERE user_id=?").get(u.id) as any;
    if (!r || r.expires_at < Date.now() || r.attempts >= 5) return bad();
    if (codeHash(code, email) !== r.code_hash) {
      db.prepare("UPDATE password_resets SET attempts = attempts + 1 WHERE user_id=?").run(u.id);
      return bad();
    }
    db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(hash(password), u.id);
    db.prepare("DELETE FROM password_resets WHERE user_id=?").run(u.id);
    loginGuard.ok(email);
    return { ok: true };
  });

  // ---------- IA: pintar rodas ----------
  app.post("/ai/wheel-paint", { preHandler: auth }, async (req, reply) => {
    const fields: Record<string, string> = {};
    let image: { data: Buffer; mime: string } | null = null;
    for await (const part of req.parts()) {
      if (part.type === "file") {
        const data = await part.toBuffer();
        const mime = sniffMime(data);
        if (!mime) return reply.code(400).send({ error: "Envie uma imagem JPG, PNG ou WEBP." });
        image = { data, mime };
      } else fields[part.fieldname] = String(part.value ?? "");
    }
    if (!image) return reply.code(400).send({ error: "Envie a foto do carro." });
    const color = (fields.color ?? "").trim().slice(0, 80);
    if (!color) return reply.code(400).send({ error: "Informe a cor desejada para as rodas." });
    const finish = (fields.finish ?? "").trim().slice(0, 60);
    const details = (fields.details ?? "").trim().slice(0, 400);

    const userId = uid(req);
    expireSub(userId);
    const bal = db.prepare("SELECT credits, terms_accepted_at FROM users WHERE id=?").get(userId) as { credits: number; terms_accepted_at: string | null } | undefined;
    if (!bal) return reply.code(401).send({ error: "Sessão inválida. Entre novamente." });
    if (!bal.terms_accepted_at)
      return reply.code(403).send({ error: "Aceite os Termos de Uso e a Política de Privacidade para gerar imagens.", code: "terms_required" });
    if (rateOn && !paintLimiter.hit(String(userId)))
      return reply.code(429).send({ error: "Você está gerando imagens rápido demais. Aguarde um minutinho." });
    if (bal.credits < 1) return reply.code(402).send({ error: NO_CREDITS_MSG, code: "no_credits" });
    // reduz e endireita a foto: mais rápido e mais barato para a IA
    image = await prepareImage(image.data, image.mime);

    const p = provider();
    const request = [color, finish, details].filter(Boolean).join(" | ");
    let verdict;
    try {
      verdict = await checkScope(p, image, request);
    } catch (e) {
      console.error("[classify]", e);
      return reply.code(502).send({ error: "Não consegui analisar a foto agora. Tente novamente." });
    }
    if (!verdict.ok) return reply.code(422).send({ error: verdict.message, code: verdict.code });

    // desconta 1 crédito antes de gerar (atômico); devolve se a geração falhar
    const taken = db.prepare("UPDATE users SET credits = credits - 1 WHERE id=? AND credits > 0").run(userId);
    if (!taken.changes) return reply.code(402).send({ error: NO_CREDITS_MSG, code: "no_credits" });

    let result;
    try {
      // pinta só a roda: recorta as rodas, a IA pinta, e cola de volta na foto original
      result = await editWheelsOnly(p, image, buildEditPrompt({ color, finish, details }), verdict.wheels, (i) =>
        console.log(`[wheel] modo=${i.mode}${i.reason ? ` (${i.reason})` : ""}${i.crop ? ` recorte=${i.crop.width}x${i.crop.height}` : ""}`),
      );
    } catch (e) {
      db.prepare("UPDATE users SET credits = credits + 1 WHERE id=?").run(userId);
      console.error("[edit]", e);
      if (e instanceof EditDriftError)
        return reply.code(502).send({ error: "A IA alterou o carro além da roda e preferi não entregar o resultado. Seu crédito foi devolvido: tente de novo ou use uma foto mais nítida, com a roda bem visível." });
      return reply.code(502).send({ error: "A geração falhou. Tente novamente em instantes." });
    }
    const user = uid(req);
    const beforeFile = `${user}_${randomUUID()}.${EXT[image.mime]}`;
    const afterFile = `${user}_${randomUUID()}.${EXT[result.mime] ?? "png"}`;
    await writeFile(path.join(config.uploadsDir, beforeFile), image.data);
    await writeFile(path.join(config.uploadsDir, afterFile), result.data);
    db.prepare("INSERT INTO generations(user_id,before_file,after_file,color,finish) VALUES(?,?,?,?,?)").run(userId, beforeFile, afterFile, color, finish || null);
    const left = db.prepare("SELECT credits FROM users WHERE id=?").get(userId) as { credits: number };
    return { beforeFile, afterFile, beforeUrl: `/files/${beforeFile}`, afterUrl: `/files/${afterFile}`, credits: left.credits };
  });

  // ---------- Conta, créditos e planos ----------
  app.get("/me", { preHandler: auth }, async (req, reply) => {
    const m = meOf(uid(req));
    if (!m) return reply.code(401).send({ error: "Sessão inválida. Entre novamente." });
    return m;
  });

  // Quem criou a conta antes dos termos existirem aceita por aqui.
  app.post("/me/terms", { preHandler: auth }, async (req, reply) => {
    if ((req.body as any)?.accept !== true) return reply.code(400).send({ error: "É preciso aceitar para continuar." });
    db.prepare("UPDATE users SET terms_accepted_at=?, terms_version=? WHERE id=?").run(new Date().toISOString(), TERMS_VERSION, uid(req));
    return meOf(uid(req));
  });

  // Excluir a conta: apaga usuário, biblioteca, histórico e todas as fotos. Pede a senha para confirmar.
  app.delete("/me", { preHandler: auth }, async (req, reply) => {
    const id = uid(req);
    const password = String((req.body as any)?.password ?? "");
    const u = db.prepare("SELECT password_hash FROM users WHERE id=?").get(id) as { password_hash: string } | undefined;
    if (!u) return reply.code(401).send({ error: "Sessão inválida. Entre novamente." });
    if (!password || !verify(password, u.password_hash)) return reply.code(403).send({ error: "Senha incorreta." });
    db.prepare("DELETE FROM users WHERE id=?").run(id); // entradas, fotos, histórico e códigos saem em cascata
    removeUserFiles(id);
    return { ok: true };
  });

  // ---------- Histórico das imagens geradas ----------
  app.get("/history", { preHandler: auth }, async (req) => {
    const rows = db.prepare("SELECT * FROM generations WHERE user_id=? ORDER BY id DESC LIMIT 60").all(uid(req)) as any[];
    return rows.map((g) => ({
      id: g.id,
      beforeFile: g.before_file,
      afterFile: g.after_file,
      beforeUrl: `/files/${g.before_file}`,
      afterUrl: `/files/${g.after_file}`,
      color: g.color,
      finish: g.finish,
      createdAt: g.created_at,
    }));
  });

  app.delete("/history/:id", { preHandler: auth }, async (req, reply) => {
    const id = uid(req);
    const g = db.prepare("SELECT * FROM generations WHERE id=? AND user_id=?").get(Number((req.params as any).id), id) as any;
    if (!g) return reply.code(404).send({ error: "Não encontrado." });
    db.prepare("DELETE FROM generations WHERE id=?").run(g.id);
    // só apaga o arquivo se a biblioteca não o estiver usando
    for (const f of [g.before_file, g.after_file]) {
      const used = db.prepare("SELECT 1 FROM photos WHERE file=?").get(f);
      if (!used) rmSync(path.join(config.uploadsDir, f), { force: true });
    }
    return { ok: true };
  });

  // ---------- Textos legais (o app mostra, e as lojas pedem uma URL pública) ----------
  app.get("/legal/:doc", async (req, reply) => {
    const d = legalDoc(String((req.params as any).doc));
    return d ?? reply.code(404).send({ error: "Não encontrado." });
  });
  const page = (id: string) => async (_req: FastifyRequest, reply: FastifyReply) => {
    const html = legalHtml(id);
    return html ? reply.type("text/html; charset=utf-8").send(html) : reply.code(404).send("Não encontrado");
  };
  app.get("/privacidade", page("privacy"));
  app.get("/termos", page("terms"));
  app.get("/excluir-conta", page("deletion"));

  // webCheckout: a versão web pode cobrar pelo Stripe (o app do Android ignora e segue pela Google Play)
  // webProvider: quem cobra na web (a Kiwify tem prioridade quando está ligada)
  const webProvider = () => (kiwifyEnabled() ? "kiwify" : stripeEnabled() ? "stripe" : null);
  app.get("/plans", async () => ({ plans: PLANS, webCheckout: webProvider() !== null, webProvider: webProvider() }));

  // Escolher plano. Sem gateway de pagamento ligado, só o plano grátis funciona;
  // PLANS_UNLOCK_FOR_TESTING=true libera os pagos sem cobrar (apenas para testes).
  app.post("/plans/select", { preHandler: auth }, async (req, reply) => {
    const plan = planById(String((req.body as any)?.plan ?? ""));
    if (!plan) return reply.code(400).send({ error: "Plano inválido." });
    const userId = uid(req);
    if (plan.id !== "free") {
      if (!unlockPlans) {
        return reply.code(402).send({ error: "A assinatura ainda não está disponível. Em breve você poderá assinar por aqui.", code: "payment_unavailable" });
      }
      const until = new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
      db.prepare("UPDATE users SET plan=?, credits = credits + ?, subscription_until=? WHERE id=?").run(plan.id, plan.credits, until, userId);
    }
    return meOf(userId);
  });

  // ---------- Cobrança (RevenueCat) ----------
  // O RevenueCat avisa aqui quando alguém assina, renova ou deixa a assinatura vencer.
  // Configure no painel do RevenueCat: Integrations → Webhooks → URL .../billing/revenuecat
  // e o mesmo texto secreto em "Authorization header value" e na variável REVENUECAT_WEBHOOK_AUTH.
  // O app identifica o comprador pelo ID do usuário (Purchases.logIn(String(id))).
  app.post("/billing/revenuecat", async (req, reply) => {
    const secret = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (!secret) return reply.code(503).send({ error: "Cobrança não configurada." });
    const given = String(req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const a = Buffer.from(given);
    const b = Buffer.from(secret.replace(/^Bearer\s+/i, ""));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return reply.code(401).send({ error: "Não autorizado." });

    const ev = (req.body as any)?.event;
    if (!ev || typeof ev !== "object" || !ev.id || !ev.type) return reply.code(400).send({ error: "Evento inválido." });

    const eventId = String(ev.id);
    if (db.prepare("SELECT 1 FROM billing_events WHERE id=?").get(eventId)) return { ok: true, duplicate: true }; // o aviso pode chegar repetido

    const userId = Number(ev.app_user_id); // ID anônimo do RevenueCat ("$RCAnonymousID:...") vira NaN e é ignorado
    const user = Number.isInteger(userId) && userId > 0 ? (db.prepare("SELECT id FROM users WHERE id=?").get(userId) as any) : undefined;
    const record = () =>
      db.prepare("INSERT OR IGNORE INTO billing_events (id, user_id, type, product_id) VALUES (?,?,?,?)").run(eventId, user?.id ?? null, String(ev.type), ev.product_id ? String(ev.product_id) : null);
    if (!user) {
      record();
      return { ok: true, ignored: "usuário desconhecido" };
    }

    const plan = ev.product_id ? planByProductId(String(ev.product_id)) : undefined;
    const until = Number(ev.expiration_at_ms) > 0 ? new Date(Number(ev.expiration_at_ms)).toISOString() : null;

    switch (String(ev.type)) {
      case "INITIAL_PURCHASE":
      case "RENEWAL":
      case "PRODUCT_CHANGE": {
        // Só libera créditos quando o produto é de um plano nosso e a assinatura ainda vale.
        if (plan && until && new Date(until) > new Date()) {
          db.prepare("UPDATE users SET plan=?, credits = credits + ?, subscription_until=? WHERE id=?").run(plan.id, plan.credits, until, user.id);
        }
        break;
      }
      case "EXPIRATION": {
        // Assinatura acabou: volta ao grátis (as rodas que sobraram continuam).
        db.prepare("UPDATE users SET plan='free', subscription_until=NULL WHERE id=?").run(user.id);
        break;
      }
      default:
        break; // CANCELLATION (vale até vencer), BILLING_ISSUE, TEST etc.: só registramos
    }
    record();
    return { ok: true };
  });

  // ---------- Cobrança na WEB (Stripe) ----------
  // Só vale para a versão web. A Google Play continua cobrando o app do Android pelo RevenueCat.
  const webBase = (req: FastifyRequest) => process.env.WEB_BASE_URL?.replace(/\/$/, "") ?? `https://${req.headers.host}`;

  // Cria o checkout (página segura do Stripe) para o plano escolhido. Assinatura mensal por cartão (Apple Pay incluso).
  app.post("/billing/stripe/checkout", { preHandler: auth }, async (req, reply) => {
    if (!stripeEnabled()) return reply.code(503).send({ error: "A cobrança pela web ainda não está disponível.", code: "payment_unavailable" });
    const plan = planById(String((req.body as any)?.plan ?? ""));
    if (!plan || plan.id === "free") return reply.code(400).send({ error: "Plano inválido." });
    const userId = uid(req);
    const u = db.prepare("SELECT email, stripe_customer_id FROM users WHERE id=?").get(userId) as { email: string; stripe_customer_id: string | null } | undefined;
    if (!u) return reply.code(401).send({ error: "Sessão inválida. Entre novamente." });
    const base = webBase(req);
    try {
      const session = await stripeRequest<{ url: string }>("POST", "/checkout/sessions", {
        mode: "subscription",
        locale: "pt-BR",
        client_reference_id: String(userId),
        ...(u.stripe_customer_id ? { customer: u.stripe_customer_id } : { customer_email: u.email }),
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "brl",
              unit_amount: Math.round(plan.priceBRL * 100),
              recurring: { interval: "month" },
              product_data: { name: `Roda Nova ${plan.name}`, description: `${plan.credits} rodas por mês` },
            },
          },
        ],
        metadata: { userId: String(userId), plan: plan.id },
        subscription_data: { metadata: { userId: String(userId), plan: plan.id } },
        success_url: `${base}/app/plans?checkout=success`,
        cancel_url: `${base}/app/plans?checkout=cancel`,
      });
      return { url: session.url };
    } catch (e) {
      console.error("[stripe checkout]", e);
      return reply.code(502).send({ error: "Não foi possível abrir o pagamento agora. Tente de novo em instantes." });
    }
  });

  // Portal do Stripe: o cliente troca o cartão, vê as cobranças e cancela a assinatura.
  app.post("/billing/stripe/portal", { preHandler: auth }, async (req, reply) => {
    if (!stripeEnabled()) return reply.code(503).send({ error: "A cobrança pela web ainda não está disponível.", code: "payment_unavailable" });
    const u = db.prepare("SELECT stripe_customer_id FROM users WHERE id=?").get(uid(req)) as { stripe_customer_id: string | null } | undefined;
    if (!u?.stripe_customer_id) return reply.code(404).send({ error: "Você ainda não tem assinatura pela web." });
    try {
      const s = await stripeRequest<{ url: string }>("POST", "/billing_portal/sessions", { customer: u.stripe_customer_id, return_url: `${webBase(req)}/app/` });
      return { url: s.url };
    } catch (e) {
      console.error("[stripe portal]", e);
      return reply.code(502).send({ error: "Não foi possível abrir o gerenciamento agora. Tente de novo em instantes." });
    }
  });

  // O Stripe avisa aqui quando uma cobrança é paga (1ª e renovações) ou a assinatura é cancelada.
  // Configure no Stripe: Desenvolvedores → Webhooks → URL .../billing/stripe e copie o segredo (whsec_...) para STRIPE_WEBHOOK_SECRET.
  app.post("/billing/stripe", async (req, reply) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return reply.code(503).send({ error: "Cobrança não configurada." });
    const raw: string = (req as any).rawBody ?? "";
    if (!verifyStripeSignature(raw, req.headers["stripe-signature"] as string | undefined, secret)) return reply.code(400).send({ error: "Assinatura inválida." });

    const ev = req.body as any;
    if (!ev?.id || !ev?.type) return reply.code(400).send({ error: "Evento inválido." });
    const eventId = `stripe:${ev.id}`;
    if (db.prepare("SELECT 1 FROM billing_events WHERE id=?").get(eventId)) return { ok: true, duplicate: true }; // o aviso pode chegar repetido

    const obj = ev.data?.object ?? {};
    let userId: number | null = null;
    let handled = "";
    try {
      switch (String(ev.type)) {
        case "invoice.paid": {
          // metadados do plano ficam na assinatura; o Stripe os repete na fatura
          const subId: string | undefined = obj.subscription ?? obj.parent?.subscription_details?.subscription;
          let meta = obj.subscription_details?.metadata ?? obj.parent?.subscription_details?.metadata ?? obj.lines?.data?.[0]?.metadata;
          if (!meta?.userId && subId) meta = (await stripeRequest("GET", `/subscriptions/${subId}`))?.metadata;
          const uid_ = Number(meta?.userId);
          const plan = planById(String(meta?.plan ?? ""));
          const periodEnd = Number(obj.lines?.data?.[0]?.period?.end);
          const user = Number.isInteger(uid_) && uid_ > 0 ? (db.prepare("SELECT id FROM users WHERE id=?").get(uid_) as any) : undefined;
          userId = user?.id ?? null;
          // só libera rodas se pagou de verdade (valor > 0), o plano é nosso e o período ainda vale
          if (user && plan && plan.id !== "free" && Number(obj.amount_paid) > 0 && periodEnd > 0) {
            const until = new Date(periodEnd * 1000).toISOString();
            if (new Date(until) > new Date()) {
              db.prepare("UPDATE users SET plan=?, credits = credits + ?, subscription_until=?, stripe_customer_id=COALESCE(?, stripe_customer_id) WHERE id=?").run(
                plan.id, plan.credits, until, obj.customer ? String(obj.customer) : null, user.id,
              );
              handled = "creditos";
            }
          }
          break;
        }
        case "customer.subscription.deleted": {
          // assinatura acabou: volta ao grátis (as rodas que sobraram continuam)
          const metaId = Number(obj.metadata?.userId);
          const byId = metaId > 0 ? (db.prepare("SELECT id FROM users WHERE id=?").get(metaId) as any) : undefined;
          const u2 = byId ?? (obj.customer ? (db.prepare("SELECT id FROM users WHERE stripe_customer_id=?").get(String(obj.customer)) as any) : undefined);
          userId = u2?.id ?? null;
          if (u2) {
            db.prepare("UPDATE users SET plan='free', subscription_until=NULL WHERE id=?").run(u2.id);
            handled = "cancelada";
          }
          break;
        }
        default:
          break; // outros eventos: só registramos
      }
    } catch (e) {
      console.error("[stripe webhook]", e);
      return reply.code(500).send({ error: "Falha ao processar." }); // o Stripe tenta de novo
    }
    db.prepare("INSERT OR IGNORE INTO billing_events (id, user_id, type, product_id) VALUES (?,?,?,?)").run(eventId, userId, String(ev.type), handled || null);
    return { ok: true };
  });

  // ---------- Cobrança na WEB (Kiwify) ----------
  // Só vale para a versão web. O cliente paga na página da Kiwify (Pix, cartão ou boleto) e ela avisa o servidor.
  // Configure na Kiwify: Apps → Webhooks → URL .../billing/kiwify, eventos de compra aprovada, renovação, cancelamento e reembolso.
  // O token que a Kiwify gera vai na variável KIWIFY_WEBHOOK_TOKEN.
  app.post("/billing/kiwify/checkout", { preHandler: auth }, async (req, reply) => {
    if (!kiwifyEnabled()) return reply.code(503).send({ error: "A cobrança pela web ainda não está disponível.", code: "payment_unavailable" });
    const plan = planById(String((req.body as any)?.plan ?? ""));
    if (!plan || plan.id === "free") return reply.code(400).send({ error: "Plano inválido." });
    const userId = uid(req);
    const u = db.prepare("SELECT email FROM users WHERE id=?").get(userId) as { email: string } | undefined;
    if (!u) return reply.code(401).send({ error: "Sessão inválida. Entre novamente." });
    const url = kiwifyCheckoutUrl(plan.id, u.email, userId);
    if (!url) return reply.code(400).send({ error: "Plano inválido." });
    return { url };
  });

  app.post("/billing/kiwify", async (req, reply) => {
    const token = process.env.KIWIFY_WEBHOOK_TOKEN;
    if (!token) return reply.code(503).send({ error: "Cobrança não configurada." });
    const raw: string = (req as any).rawBody ?? "";
    const signature = (req.query as any)?.signature as string | undefined;
    if (!verifyKiwifySignature(raw, signature, token)) return reply.code(401).send({ error: "Assinatura inválida." });

    const body = req.body as any;
    const orderId = String(body?.order_id ?? "");
    if (!body || typeof body !== "object" || !orderId) return reply.code(400).send({ error: "Evento inválido." });
    const { action, event } = kiwifyActionOf(body);
    const eventId = `kiwify:${orderId}:${event}`;
    if (db.prepare("SELECT 1 FROM billing_events WHERE id=?").get(eventId)) return { ok: true, duplicate: true }; // o aviso pode chegar repetido

    // acha a conta: pelo e-mail da compra; se não bater, pelo ID que o nosso link de pagamento levou (sck)
    const email = String(body?.Customer?.email ?? "").trim().toLowerCase();
    let user = email ? (db.prepare("SELECT id FROM users WHERE email=?").get(email) as { id: number } | undefined) : undefined;
    if (!user) {
      const sck = Number(body?.TrackingParameters?.sck);
      if (Number.isInteger(sck) && sck > 0) user = db.prepare("SELECT id FROM users WHERE id=?").get(sck) as { id: number } | undefined;
    }
    const plan = kiwifyPlanOf(body);
    let handled = "";
    try {
      if (user && plan && plan.id !== "free") {
        if (action === "grant") {
          db.prepare("UPDATE users SET plan=?, credits = credits + ?, subscription_until=? WHERE id=?").run(plan.id, plan.credits, kiwifyValidUntil(body), user.id);
          handled = "creditos";
        } else if (action === "revoke") {
          db.prepare("UPDATE users SET plan='free', subscription_until=NULL WHERE id=?").run(user.id); // reembolso/chargeback: volta ao grátis
          handled = "revogada";
        }
      } else handled = user ? "produto de outro plano" : "usuario desconhecido";
    } catch (e) {
      console.error("[kiwify webhook]", e);
      return reply.code(500).send({ error: "Falha ao processar." }); // a Kiwify tenta de novo
    }
    db.prepare("INSERT OR IGNORE INTO billing_events (id, user_id, type, product_id) VALUES (?,?,?,?)").run(eventId, user?.id ?? null, event, handled || null);
    return { ok: true };
  });

  // ---------- Biblioteca ----------
  const entryWithPhotos = (e: any) => ({
    id: e.id,
    make: e.make,
    model: e.model,
    year: e.year,
    color: e.color,
    notes: e.notes,
    createdAt: e.created_at,
    photos: (db.prepare("SELECT id,kind,file FROM photos WHERE entry_id=? ORDER BY id").all(e.id) as any[]).map((p) => ({
      id: p.id,
      kind: p.kind,
      url: `/files/${p.file}`,
    })),
  });

  app.post("/library/entries", { preHandler: auth }, async (req, reply) => {
    const user = uid(req);
    // Plano grátis tem limite de rodas na biblioteca; os planos pagos são ilimitados.
    expireSub(user);
    const owner = db.prepare("SELECT plan FROM users WHERE id=?").get(user) as { plan: string } | undefined;
    if (owner?.plan === "free") {
      const { n } = db.prepare("SELECT COUNT(*) AS n FROM entries WHERE user_id=?").get(user) as { n: number };
      if (n >= FREE_LIBRARY_LIMIT)
        return reply.code(402).send({
          error: `Você chegou ao limite de ${FREE_LIBRARY_LIMIT} rodas do plano grátis. Escolha um plano para guardar rodas sem limite.`,
          code: "library_full",
        });
    }
    const fields: Record<string, string> = {};
    const photos: Array<{ kind: string; file: string }> = [];
    for await (const part of req.parts()) {
      if (part.type === "file") {
        const kind = ["before", "after", "other"].includes(part.fieldname) ? part.fieldname : "other";
        const data = await part.toBuffer();
        const mime = sniffMime(data);
        if (!mime) return reply.code(400).send({ error: "Envie imagens JPG, PNG ou WEBP." });
        const file = `${user}_${randomUUID()}.${EXT[mime]}`;
        await writeFile(path.join(config.uploadsDir, file), data);
        photos.push({ kind, file });
      } else fields[part.fieldname] = String(part.value ?? "");
    }
    // arquivos já gerados pela IA (pertencentes ao usuário)
    for (const [key, kind] of [["beforeFile", "before"], ["afterFile", "after"]] as const) {
      const f = fields[key];
      if (f) {
        if (!f.startsWith(`${user}_`) || f.includes("/") || f.includes("\\") || !existsSync(path.join(config.uploadsDir, f)))
          return reply.code(400).send({ error: "Arquivo inválido." });
        photos.push({ kind, file: f });
      }
    }
    const make = (fields.make ?? "").trim();
    const model = (fields.model ?? "").trim();
    if (!make || !model) return reply.code(400).send({ error: "Informe a marca e o modelo do carro." });
    if (!photos.length) return reply.code(400).send({ error: "Adicione pelo menos uma foto." });
    const year = fields.year ? Number(fields.year) : null;
    if (year !== null && (!Number.isInteger(year) || year < 1950 || year > 2100))
      return reply.code(400).send({ error: "Ano inválido." });

    const r = db
      .prepare("INSERT INTO entries(user_id,make,model,make_norm,model_norm,year,color,notes) VALUES(?,?,?,?,?,?,?,?)")
      .run(user, make, model, compact(make), compact(model), year, (fields.color ?? "").trim() || null, (fields.notes ?? "").trim() || null);
    const id = Number(r.lastInsertRowid);
    const ins = db.prepare("INSERT INTO photos(entry_id,kind,file) VALUES(?,?,?)");
    for (const p of photos) ins.run(id, p.kind, p.file);
    return entryWithPhotos(db.prepare("SELECT * FROM entries WHERE id=?").get(id));
  });

  app.get("/library/entries", { preHandler: auth }, async (req) => {
    const q = String((req.query as any)?.q ?? "").trim();
    const rows = db.prepare("SELECT * FROM entries WHERE user_id=? ORDER BY created_at DESC, id DESC").all(uid(req)) as any[];
    if (!q) return rows.map(entryWithPhotos);
    const pq = parseQuery(q);
    const restTokens = pq.rest.split(" ").map(compact).filter(Boolean);
    const filtered = rows.filter((e) => {
      // "Opala" também acha "Opala Diplomata" e vice-versa
      const wantModel = pq.model ? compact(pq.model) : "";
      if (wantModel && !(e.model_norm.includes(wantModel) || wantModel.includes(e.model_norm))) return false;
      if (!wantModel && pq.make && e.make_norm !== compact(pq.make)) return false;
      if (pq.year && e.year !== pq.year) return false;
      // cor da roda: "cinza" acha "cinza fosco", "grafite", "Cinza metálico"
      if (pq.color && !colorKeys(`${e.color ?? ""} ${e.notes ?? ""}`).has(pq.color)) return false;
      // sobras de texto livre: precisam aparecer em marca/modelo/cor/notas
      const hay = compact(`${e.make} ${e.model} ${e.color ?? ""} ${e.notes ?? ""}`);
      return restTokens.every((t) => hay.includes(t));
    });
    return filtered.map(entryWithPhotos);
  });

  app.get("/library/entries/:id", { preHandler: auth }, async (req, reply) => {
    const e = db.prepare("SELECT * FROM entries WHERE id=? AND user_id=?").get(Number((req.params as any).id), uid(req));
    if (!e) return reply.code(404).send({ error: "Não encontrado." });
    return entryWithPhotos(e);
  });

  app.delete("/library/entries/:id", { preHandler: auth }, async (req, reply) => {
    const r = db.prepare("DELETE FROM entries WHERE id=? AND user_id=?").run(Number((req.params as any).id), uid(req));
    if (!r.changes) return reply.code(404).send({ error: "Não encontrado." });
    return { ok: true };
  });

  app.get("/library/suggest", { preHandler: auth }, async (req) => ({
    items: suggest(String((req.query as any)?.q ?? "")),
  }));

  // ---------- Voz / texto livre -> campos ----------
  app.post("/voice/parse", { preHandler: auth }, async (req) => {
    const text = String((req.body as any)?.text ?? "").slice(0, 300);
    const { make, model, year, color, finish } = parseQuery(text);
    return { make, model, year, color, finish };
  });

  // Áudio gravado no app -> texto -> carro/ano/cor
  app.post("/voice/transcribe", { preHandler: auth }, async (req, reply) => {
    let audio: Buffer | null = null;
    let filename = "voice.m4a";
    for await (const part of req.parts()) {
      if (part.type === "file") {
        audio = await part.toBuffer();
        filename = part.filename || filename;
      }
    }
    if (!audio || audio.length < 1000) return reply.code(400).send({ error: "Não ouvi nada. Segure um pouco mais e fale o carro e o ano." });
    let text: string;
    try {
      text = await transcribe(audio, filename);
    } catch (e) {
      console.error("[transcribe]", e);
      // áudio curto demais / sem conteúdo: a OpenAI recusa com 400 (erro nosso não é)
      if (/OpenAI 400/.test(String((e as Error)?.message))) return reply.code(422).send({ error: "Não ouvi nada. Toque no microfone, espere o sinal e fale o carro e a cor da roda." });
      return reply.code(502).send({ error: "Não consegui entender o áudio agora. Tente de novo ou digite." });
    }
    // em silêncio o transcritor às vezes devolve a própria dica ("Busca de carros por voz...")
    if (/busca de carros por voz|marcas e modelos:/i.test(text)) text = "";
    if (!text) return reply.code(422).send({ error: "Não ouvi nada. Toque no microfone, espere o sinal e fale o carro e a cor da roda." });
    const { make, model, year, color, finish } = parseQuery(text);
    return { text, make, model, year, color, finish };
  });

  return app;
}
