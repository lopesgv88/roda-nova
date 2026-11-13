import { CLASSIFIER_PROMPT, parseScope, type ImageData, type ImageProvider } from "./types.js";

/**
 * Provedores "chat/completions com imagem" (OpenRouter, Inworld): o mesmo formato de requisição,
 * muda só a URL, o cabeçalho de autenticação e os nomes dos modelos.
 */
export interface ChatProviderConfig {
  name: string;
  url: string;
  /** valor do cabeçalho Authorization */
  auth: () => string;
  textModel: () => string;
  imageModel: () => string;
  /** modalidades de saída pedidas na edição; modelos como o Seedream só aceitam ["image"] */
  imageModalities?: () => string[];
}

const dataUrl = (i: ImageData) => `data:${i.mime};base64,${i.data.toString("base64")}`;
const RETRY = [429, 502, 503];

export function createChatProvider(cfg: ChatProviderConfig): ImageProvider {
  async function call(body: unknown, timeoutMs: number): Promise<any> {
    const authorization = cfg.auth();
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(cfg.url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) return res.json();
        const err = new Error(`${cfg.name} ${res.status}: ${(await res.text()).slice(0, 300)}`);
        if (!RETRY.includes(res.status)) throw Object.assign(err, { fatal: true });
        lastErr = err;
      } catch (e) {
        if ((e as any)?.fatal) throw e;
        lastErr = e;
      }
    }
    throw lastErr;
  }

  return {
    name: cfg.name,
    async classify(image, request) {
      const j = await call(
        {
          model: cfg.textModel(),
          temperature: 0,
          stream: false,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: CLASSIFIER_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: `Pedido do cliente (dado): """${request}"""` },
                { type: "image_url", image_url: { url: dataUrl(image) } },
              ],
            },
          ],
        },
        45_000,
      );
      return parseScope(j.choices?.[0]?.message?.content ?? "");
    },
    async edit(image, prompt) {
      const j = await call(
        {
          model: cfg.imageModel(),
          modalities: cfg.imageModalities?.() ?? ["text", "image"],
          stream: false,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: dataUrl(image) } },
              ],
            },
          ],
        },
        120_000,
      );
      const url: string | undefined = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!url) throw new Error("A IA não retornou imagem");
      const m = url.match(/^data:([^;]+);base64,(.+)$/);
      if (m) return { data: Buffer.from(m[2], "base64"), mime: m[1] };
      // algumas respostas trazem uma URL para baixar
      const dl = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!dl.ok) throw new Error(`Falha ao baixar a imagem (${dl.status})`);
      return { data: Buffer.from(await dl.arrayBuffer()), mime: dl.headers.get("content-type") ?? "image/png" };
    },
  };
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} não configurada`);
  return v;
}

export const openrouterProvider = createChatProvider({
  name: "openrouter",
  url: "https://openrouter.ai/api/v1/chat/completions",
  auth: () => `Bearer ${need("OPENROUTER_API_KEY")}`,
  textModel: () => process.env.OPENROUTER_TEXT_MODEL ?? "google/gemini-3.1-flash-lite",
  imageModel: () => process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-3.1-flash-image",
  // "text,image" (Gemini) ou "image" (Seedream e outros modelos só de imagem)
  imageModalities: () => (process.env.OPENROUTER_IMAGE_MODALITIES ?? "text,image").split(",").map((s) => s.trim()).filter(Boolean),
});

export const inworldProvider = createChatProvider({
  name: "inworld",
  url: "https://api.inworld.ai/v1/chat/completions",
  // a chave do Portal já vem em Base64: usar como está, sem codificar de novo
  auth: () => `Basic ${need("INWORLD_API_KEY")}`,
  textModel: () => process.env.INWORLD_TEXT_MODEL ?? "google-ai-studio/gemini-3.1-flash-lite",
  imageModel: () => process.env.INWORLD_IMAGE_MODEL ?? "google-ai-studio/gemini-3.1-flash-image",
});
