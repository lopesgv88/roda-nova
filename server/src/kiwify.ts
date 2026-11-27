import { createHmac, timingSafeEqual } from "node:crypto";
import { planById, type Plan } from "./plans.js";

/**
 * Cobrança na WEB pela Kiwify (só a versão web; o Android segue pela Google Play / RevenueCat).
 * A Kiwify cobra o cliente na página de pagamento dela e avisa o servidor por webhook.
 * Ligada quando KIWIFY_WEBHOOK_TOKEN existe (o token que a Kiwify mostra ao criar o webhook).
 */
export const kiwifyEnabled = () => !!process.env.KIWIFY_WEBHOOK_TOKEN;

/** Um produto de assinatura da Kiwify por plano: ID do produto (painel da Kiwify) e link de pagamento. */
export const KIWIFY_PLANS: Record<string, { productId: string; checkoutUrl: string }> = {
  basico: { productId: "1d99dd60-ea8c-11f1-b4b2-5dbf3704dc60", checkoutUrl: "https://pay.kiwify.com.br/fAV7YpY" },
  pro: { productId: "855f4390-ea8c-11f1-abd1-5f13b982a4a2", checkoutUrl: "https://pay.kiwify.com.br/46utyjY" },
  estudio: { productId: "e8046840-ea8c-11f1-be97-0d38708fc6fa", checkoutUrl: "https://pay.kiwify.com.br/dL6qhMT" },
};

/** Link de pagamento com e-mail preenchido e o ID do usuário (volta no aviso, para achar a conta). */
export function kiwifyCheckoutUrl(planId: string, email: string, userId: number): string | null {
  const p = KIWIFY_PLANS[planId];
  if (!p) return null;
  const q = new URLSearchParams({ email, sck: String(userId) });
  return `${p.checkoutUrl}?${q.toString()}`;
}

/** A Kiwify assina o corpo do aviso: HMAC-SHA1 (hex) com o token, enviado no parâmetro "signature" da URL. */
export function verifyKiwifySignature(raw: string, signature: string | undefined, token: string): boolean {
  if (!signature || !token) return false;
  const expected = createHmac("sha1", token).update(raw).digest("hex");
  const a = Buffer.from(signature.trim().toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Descobre o plano do aviso: pelo ID do produto; se não bater, pelo nome do produto/plano. */
export function kiwifyPlanOf(body: any): Plan | undefined {
  const pid = String(body?.Product?.product_id ?? body?.product_id ?? "");
  for (const [planId, v] of Object.entries(KIWIFY_PLANS)) if (pid && v.productId === pid) return planById(planId);
  const name = `${body?.Product?.product_name ?? ""} ${body?.Subscription?.plan?.name ?? ""}`.toLowerCase();
  if (!name.includes("roda nova")) return undefined; // produto que não é do app: ignora
  if (name.includes("estúdio") || name.includes("estudio")) return planById("estudio");
  if (name.includes("plano pro")) return planById("pro");
  if (name.includes("básico") || name.includes("basico")) return planById("basico");
  return undefined;
}

export type KiwifyAction = "grant" | "revoke" | "none";

/** O que o aviso significa: pagou/renovou (libera rodas), reembolso/chargeback (tira o plano) ou só registrar. */
export function kiwifyActionOf(body: any): { action: KiwifyAction; event: string } {
  const event = String(body?.webhook_event_type ?? body?.order_status ?? "").toLowerCase();
  const status = String(body?.order_status ?? "").toLowerCase();
  if (event === "order_approved" || event === "subscription_renewed") {
    return { action: status && status !== "paid" ? "none" : "grant", event };
  }
  if (event === "paid") return { action: "grant", event };
  if (["order_refunded", "refunded", "chargeback", "chargedback"].includes(event)) return { action: "revoke", event };
  return { action: "none", event }; // subscription_canceled (vale até vencer), subscription_late, boleto gerado etc.
}

/** Até quando a assinatura vale: próxima cobrança informada pela Kiwify; sem ela, 32 dias. */
export function kiwifyValidUntil(body: any, now = Date.now()): string {
  const next = Date.parse(String(body?.Subscription?.next_payment ?? ""));
  if (Number.isFinite(next) && next > now) return new Date(next).toISOString();
  return new Date(now + 32 * 24 * 60 * 60_000).toISOString();
}
