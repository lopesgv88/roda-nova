import { CLASSIFIER_PROMPT, parseScope, type ImageProvider } from "./types.js";

function key(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY não configurada");
  return k;
}

export const openaiProvider: ImageProvider = {
  name: "openai",
  async classify(image, request) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key()}` },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: CLASSIFIER_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Pedido do cliente (dado): """${request}"""` },
              { type: "image_url", image_url: { url: `data:${image.mime};base64,${image.data.toString("base64")}` } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j: any = await res.json();
    return parseScope(j.choices?.[0]?.message?.content ?? "");
  },
  async edit(image, prompt) {
    const form = new FormData();
    form.append("model", process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1-mini");
    form.append("prompt", prompt);
    // custo: "low" ~ mais barato, "medium" equilibrado, "high" caro. Para pintar rodas, low/medium bastam.
    form.append("quality", process.env.OPENAI_IMAGE_QUALITY ?? "medium");
    form.append("size", process.env.OPENAI_IMAGE_SIZE ?? "1024x1024");
    form.append("image", new Blob([new Uint8Array(image.data)], { type: image.mime }), "car.png");
    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { authorization: `Bearer ${key()}` },
      body: form,
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j: any = await res.json();
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) throw new Error("A IA não retornou imagem");
    return { data: Buffer.from(b64, "base64"), mime: "image/png" };
  },
};

