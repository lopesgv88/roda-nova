import { CATALOG } from "./cars.js";

export type Transcriber = (audio: Buffer, filename: string) => Promise<string>;

const ALLOWED = ["m4a", "mp4", "wav", "webm", "mp3", "mpga", "mpeg", "ogg"];
const MIME: Record<string, string> = { m4a: "audio/mp4", mp4: "audio/mp4", wav: "audio/wav", webm: "audio/webm", mp3: "audio/mpeg", mpga: "audio/mpeg", mpeg: "audio/mpeg", ogg: "audio/ogg" };

// Dica para o transcritor acertar nomes de carros (HB20, T-Cross, EcoSport...)
const HINT = `Busca de carros por voz. Exemplos de falas: "Civic 2018", "Gol G5 preto", "HB20 2020". Marcas e modelos: ${Object.entries(CATALOG)
  .flatMap(([make, models]) => [make, ...models])
  .join(", ")}.`;

export const openaiTranscribe: Transcriber = async (audio, filename) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY não configurada");
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const safeExt = ALLOWED.includes(ext) ? ext : "m4a";
  const form = new FormData();
  form.append("model", process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe");
  form.append("language", "pt");
  form.append("prompt", HINT);
  form.append("response_format", "json");
  form.append("file", new Blob([new Uint8Array(audio)], { type: MIME[safeExt] }), `voice.${safeExt}`);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j: any = await res.json();
  return String(j.text ?? "").trim();
};
