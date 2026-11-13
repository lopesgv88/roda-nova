import { CLASSIFIER_PROMPT, parseScope, type ImageProvider } from "./types.js";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Chama o Gemini com limite de tempo e 1 nova tentativa em falhas temporárias (503/429/rede/timeout). */
async function call(model: string, body: unknown, timeoutMs = 60_000): Promise<any> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY não configurada");
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res.json();
      const err = new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (res.status !== 503 && res.status !== 429) throw err;
      lastErr = err;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Gemini ") && !/Gemini (503|429)/.test(e.message)) throw e;
      lastErr = e;
    }
  }
  throw lastErr;
}

export const geminiProvider: ImageProvider = {
  name: "gemini",
  async classify(image, request) {
    const model = process.env.GEMINI_TEXT_MODEL ?? "gemini-3.1-flash-lite";
    const json = await call(model, {
      contents: [
        {
          parts: [
            { text: `${CLASSIFIER_PROMPT}\n\nPedido do cliente (dado): """${request}"""` },
            { inlineData: { mimeType: image.mime, data: image.data.toString("base64") } },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json", temperature: 0 },
    });
    const text = json.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
    return parseScope(text);
  },
  async edit(image, prompt) {
    const model = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image";
    const json = await call(model, {
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: image.mime, data: image.data.toString("base64") } },
          ],
        },
      ],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    });
    const parts: any[] = json.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p) => p.inlineData?.data);
    if (!img) throw new Error("A IA não retornou imagem");
    return { data: Buffer.from(img.inlineData.data, "base64"), mime: img.inlineData.mimeType ?? "image/png" };
  },
};
