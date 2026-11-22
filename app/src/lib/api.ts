import Constants from "expo-constants";
import { File } from "expo-file-system";
import { Platform } from "react-native";

/** URL do servidor: EXPO_PUBLIC_API_URL, ou o IP do PC que serve o Expo (porta 3000). */
function resolveBase(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host ?? "localhost"}:3000`;
}
export const API_URL = resolveBase();

export const fileUrl = (u: string) => (u.startsWith("http") ? u : `${API_URL}${u}`);

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;
export const setToken = (t: string | null) => (token = t);
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

async function request<T>(path: string, init: RequestInit = {}, timeoutMs = 60_000): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (token) headers.authorization = `Bearer ${token}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers, signal: ctl.signal });
  } catch {
    throw new ApiError(
      ctl.signal.aborted ? "Está demorando demais. Tente de novo em instantes." : "Sem conexão com o servidor. Verifique sua internet.",
      0,
    );
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(body.error ?? "Algo deu errado.", res.status, body.code);
  }
  return body as T;
}

const json = (b: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(b),
});

export interface Photo { id: number; kind: "before" | "after" | "other"; url: string }
export interface Entry {
  id: number; make: string; model: string; year: number | null;
  color: string | null; notes: string | null; createdAt: string; photos: Photo[];
}
export interface PaintResult { beforeFile: string; afterFile: string; beforeUrl: string; afterUrl: string; credits: number }
export interface Plan {
  id: string; name: string; credits: number; priceBRL: number;
  once?: boolean; popular?: boolean; productId?: string; perks: string[];
}
export interface Me { id: number; email: string; plan: string; credits: number; termsAccepted: boolean; subscriptionUntil: string | null }
export interface HistoryItem {
  id: number; beforeFile: string; afterFile: string; beforeUrl: string; afterUrl: string;
  color: string | null; finish: string | null; createdAt: string;
}
export interface LegalDoc { title: string; body: string }
export interface Parsed { make?: string; model?: string; year?: number; color?: string; finish?: string }

export interface Voice extends Parsed { text: string }

export type LocalImage = { uri: string; mime?: string | null };
// Celular: o fetch do Expo (SDK 54+) não aceita { uri, name, type }; precisa de um File (Blob) do expo-file-system.
// Navegador: o seletor devolve um endereço blob:/data:, que se lê com fetch() e vira um Blob de verdade.
const isWeb = Platform.OS === "web";
async function filePart(img: LocalImage, _name: string): Promise<Blob> {
  if (isWeb) return (await fetch(img.uri)).blob();
  return new File(img.uri) as unknown as Blob;
}
const audioExt = (type: string) => (/webm/.test(type) ? "webm" : /ogg/.test(type) ? "ogg" : /wav/.test(type) ? "wav" : /mpeg|mp3/.test(type) ? "mp3" : "m4a");

export const api = {
  login: (email: string, password: string) => request<{ token: string; email: string }>("/auth/login", json({ email, password })),
  register: (email: string, password: string) =>
    request<{ token: string; email: string }>("/auth/register", json({ email, password, acceptTerms: true })),
  forgot: (email: string) => request<{ ok: true; message: string }>("/auth/forgot", json({ email })),
  reset: (email: string, code: string, password: string) => request<{ ok: true }>("/auth/reset", json({ email, code, password })),

  me: () => request<Me>("/me"),
  acceptTerms: () => request<Me>("/me/terms", json({ accept: true })),
  deleteAccount: (password: string) =>
    request<{ ok: true }>("/me", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) }),
  legal: (doc: string) => request<LegalDoc>(`/legal/${doc}`),
  history: () => request<HistoryItem[]>("/history"),
  deleteHistory: (id: number) => request<{ ok: true }>(`/history/${id}`, { method: "DELETE" }),
  plans: () => request<{ plans: Plan[] }>("/plans"),
  selectPlan: (plan: string) => request<Me>("/plans/select", json({ plan })),

  async paintWheels(img: LocalImage, o: { color: string; finish?: string; details?: string }) {
    const f = new FormData();
    f.append("color", o.color);
    if (o.finish) f.append("finish", o.finish);
    if (o.details) f.append("details", o.details);
    f.append("photo", await filePart(img, "car"));
    return request<PaintResult>("/ai/wheel-paint", { method: "POST", body: f }, 180_000);
  },

  entries: (q = "") => request<Entry[]>(`/library/entries?q=${encodeURIComponent(q)}`),
  entry: (id: number) => request<Entry>(`/library/entries/${id}`),
  deleteEntry: (id: number) => request<{ ok: true }>(`/library/entries/${id}`, { method: "DELETE" }),
  suggest: (q: string) => request<{ items: string[] }>(`/library/suggest?q=${encodeURIComponent(q)}`),
  async transcribe(uri: string) {
    const f = new FormData();
    if (isWeb) {
      const blob = await (await fetch(uri)).blob();
      f.append("audio", blob, `voice.${audioExt(blob.type)}`); // o servidor usa a extensão para o tipo do áudio
    } else f.append("audio", new File(uri) as unknown as Blob);
    return request<Voice>("/voice/transcribe", { method: "POST", body: f });
  },
  parse: (text: string) => request<Parsed>("/voice/parse", json({ text })),

  async saveEntry(o: {
    make: string; model: string; year?: string; color?: string; notes?: string;
    before?: LocalImage; after?: LocalImage; others?: LocalImage[];
    beforeFile?: string; afterFile?: string;
  }) {
    const f = new FormData();
    f.append("make", o.make);
    f.append("model", o.model);
    if (o.year) f.append("year", o.year);
    if (o.color) f.append("color", o.color);
    if (o.notes) f.append("notes", o.notes);
    if (o.beforeFile) f.append("beforeFile", o.beforeFile);
    if (o.afterFile) f.append("afterFile", o.afterFile);
    if (o.before) f.append("before", await filePart(o.before, "before"));
    if (o.after) f.append("after", await filePart(o.after, "after"));
    for (const [i, img] of (o.others ?? []).entries()) f.append("other", await filePart(img, `other${i}`));
    return request<Entry>("/library/entries", { method: "POST", body: f });
  },
};
