import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cobrança pelo Stripe na versão WEB (iPhone/Safari). O app do Android continua pela Google Play (RevenueCat).
 * Só liga se STRIPE_SECRET_KEY existir; sem ela nada muda.
 * Usamos a API REST direto (sem biblioteca extra).
 */
const API = "https://api.stripe.com/v1";

export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;

/** Converte { a: { b: 1 }, c: [x] } no formato de formulário do Stripe: a[b]=1&c[0]=x */
function flatten(obj: unknown, prefix = "", out = new URLSearchParams()): URLSearchParams {
  if (obj === null || obj === undefined) return out;
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}[${k}]` : k, out);
  } else out.append(prefix, String(obj));
  return out;
}

export async function stripeRequest<T = any>(method: "GET" | "POST", path: string, params?: unknown): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY não configurada");
  const body = method === "POST" && params ? flatten(params).toString() : undefined;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${String(json?.error?.message ?? "erro").slice(0, 200)}`);
  return json as T;
}

/**
 * Confere a assinatura do aviso (webhook) do Stripe: cabeçalho "Stripe-Signature: t=...,v1=...".
 * `raw` é o corpo EXATAMENTE como chegou. Rejeita avisos antigos (proteção contra reenvio malicioso).
 */
export function verifyStripeSignature(raw: string, header: string | undefined, secret: string, toleranceSec = 300, now = Date.now()): boolean {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length) return false;
  if (Math.abs(now / 1000 - Number(t)) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  const eb = Buffer.from(expected);
  return sigs.some((s) => {
    const sb = Buffer.from(s);
    return sb.length === eb.length && timingSafeEqual(sb, eb);
  });
}
