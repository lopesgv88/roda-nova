import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { ImageProvider } from "../src/providers/types.js";
import { EditDriftError, editWheelsOnly } from "../src/wheelEdit.js";

/** Foto de teste com blocos aleatórios grandes (tem "estrutura", como um carro numa loja). */
async function photo(w = 400, h = 300): Promise<{ data: Buffer; mime: string }> {
  const bw = 20, bh = 15, raw = Buffer.alloc(bw * bh * 3);
  let seed = 7;
  for (let i = 0; i < raw.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; raw[i] = (seed >> 8) & 255; }
  const data = await sharp(raw, { raw: { width: bw, height: bh, channels: 3 } }).resize(w, h, { kernel: "nearest" }).jpeg({ quality: 95 }).toBuffer();
  return { data, mime: "image/jpeg" };
}

const wheels: [number, number, number, number][] = [[0.55, 0.12, 0.95, 0.42], [0.55, 0.58, 0.95, 0.88]];
const provider = (edit: ImageProvider["edit"]): ImageProvider => ({ name: "teste", classify: async () => ({ ok: true } as any), edit });

describe("editWheelsOnly: só a roda pode mudar", () => {
  it("aceita quando a IA devolve o mesmo enquadramento (só muda a cor da roda)", async () => {
    const img = await photo();
    const calls: number[] = [];
    const p = provider(async (i) => {
      calls.push(1);
      // mesma foto, com um retângulo vermelho em cima de uma roda
      const red = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#d00" } }).png().toBuffer();
      const m = await sharp(i.data).metadata();
      return { data: await sharp(i.data).composite([{ input: red, left: Math.round(m.width! * 0.2), top: Math.round(m.height! * 0.7) }]).jpeg().toBuffer(), mime: "image/jpeg" };
    });
    const out = await editWheelsOnly(p, img, "pinte", wheels);
    expect(out.mime).toBe("image/jpeg");
    expect(calls).toHaveLength(1); // passou de primeira
  });

  it("recusa (e tenta 2 vezes) quando a IA muda o carro fora da roda", async () => {
    const img = await photo();
    let calls = 0;
    // devolve a foto espelhada: mesmo formato, mas o carro mudou de lugar
    const p = provider(async (i) => {
      calls++;
      return { data: await sharp(i.data).flop().flip().jpeg().toBuffer(), mime: "image/jpeg" };
    });
    await expect(editWheelsOnly(p, img, "pinte", wheels)).rejects.toBeInstanceOf(EditDriftError);
    expect(calls).toBe(2);
  });

  it("recusa quando a IA muda o formato do recorte", async () => {
    const img = await photo();
    let calls = 0;
    const p = provider(async (i) => {
      calls++;
      const m = await sharp(i.data).metadata();
      return { data: await sharp(i.data).resize(m.width!, Math.round(m.height! * 0.6), { fit: "fill" }).jpeg().toBuffer(), mime: "image/jpeg" };
    });
    await expect(editWheelsOnly(p, img, "pinte", wheels)).rejects.toBeInstanceOf(EditDriftError);
    expect(calls).toBe(2);
  });

  it("amplia recorte pequeno antes de mandar para a IA", async () => {
    const img = await photo(160, 120);
    let sentSide = 0;
    const p = provider(async (i) => {
      const m = await sharp(i.data).metadata();
      sentSide = Math.max(m.width!, m.height!);
      return { data: i.data, mime: "image/jpeg" };
    });
    await editWheelsOnly(p, img, "pinte", wheels);
    expect(sentSide).toBeGreaterThanOrEqual(768);
  });
});
