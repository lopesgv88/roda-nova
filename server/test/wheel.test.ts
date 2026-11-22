import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { editWheelsOnly, type WheelEditInfo } from "../src/wheelEdit.js";
import type { ImageData, ImageProvider, WheelBox } from "../src/providers/types.js";

const solid = (w: number, h: number, c: { r: number; g: number; b: number }) =>
  sharp({ create: { width: w, height: h, channels: 3, background: c } }).jpeg({ quality: 95 }).toBuffer();

async function pixel(buf: Buffer, x: number, y: number) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

// duas rodas de uma foto 1200x800: caixas [ymin, xmin, ymax, xmax] de 0 a 1
const WHEELS: WheelBox[] = [
  [0.55, 0.15, 0.85, 0.35],
  [0.55, 0.65, 0.85, 0.85],
];

describe("pintar só a roda (recorta, pinta e cola de volta)", () => {
  it("troca a cor só dentro das rodas e deixa o resto da foto idêntico", async () => {
    const orig = await solid(1200, 800, { r: 200, g: 200, b: 200 });
    const seen: Array<{ w: number; h: number }> = [];
    const prov: ImageProvider = {
      name: "fake",
      classify: async () => ({ isCar: true, wheelsVisible: true, requestAboutWheelPaint: true }),
      edit: async (i: ImageData) => {
        const m = await sharp(i.data).metadata();
        seen.push({ w: m.width!, h: m.height! });
        return { data: await solid(m.width!, m.height!, { r: 0, g: 0, b: 255 }), mime: "image/jpeg" }; // a "IA" pinta TUDO de azul
      },
    };
    let info: WheelEditInfo | undefined;
    const out = await editWheelsOnly(prov, { data: orig, mime: "image/jpeg" }, "azul", WHEELS, (i) => (info = i));

    expect(info?.mode).toBe("crop");
    // a IA recebeu só um recorte, menor que a foto inteira
    expect(seen).toHaveLength(1);
    expect(seen[0].w * seen[0].h).toBeLessThan(1200 * 800 * 0.62);

    // a imagem final tem o mesmo tamanho da original
    const meta = await sharp(out.data).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 800]);

    // centro das rodas: azul
    for (const [x, y] of [[300, 560], [900, 560]]) {
      const p = await pixel(out.data, x, y);
      expect(p.b).toBeGreaterThan(200);
      expect(p.r).toBeLessThan(60);
    }
    // fora das rodas (canto, céu, entre as rodas, mesmo dentro do recorte): continua cinza original
    for (const [x, y] of [[10, 10], [600, 100], [600, 560], [1190, 790]]) {
      const p = await pixel(out.data, x, y);
      expect(Math.abs(p.r - 200)).toBeLessThan(6);
      expect(Math.abs(p.b - 200)).toBeLessThan(6);
    }
  });

  it("sem caixas de roda, cai no modo antigo e edita a foto inteira", async () => {
    const orig = await solid(1200, 800, { r: 200, g: 200, b: 200 });
    let size: { w: number; h: number } | null = null;
    const prov: ImageProvider = {
      name: "fake",
      classify: async () => ({ isCar: true, wheelsVisible: true, requestAboutWheelPaint: true }),
      edit: async (i) => {
        const m = await sharp(i.data).metadata();
        size = { w: m.width!, h: m.height! };
        return i;
      },
    };
    let info: WheelEditInfo | undefined;
    await editWheelsOnly(prov, { data: orig, mime: "image/jpeg" }, "azul", undefined, (i) => (info = i));
    expect(info?.mode).toBe("full");
    expect(size).toEqual({ w: 1200, h: 800 });
  });

  it("se a IA devolver o recorte em outro formato, tenta o recorte de novo (nunca cola desalinhado nem refaz a foto inteira)", async () => {
    const orig = await solid(1200, 800, { r: 200, g: 200, b: 200 });
    let calls = 0;
    const prov: ImageProvider = {
      name: "fake",
      classify: async () => ({ isCar: true, wheelsVisible: true, requestAboutWheelPaint: true }),
      edit: async (i) => {
        calls++;
        if (calls === 1) return { data: await solid(800, 800, { r: 0, g: 0, b: 255 }), mime: "image/jpeg" }; // quadrado: formato errado
        return i;
      },
    };
    let info: WheelEditInfo | undefined;
    await editWheelsOnly(prov, { data: orig, mime: "image/jpeg" }, "azul", WHEELS, (i) => (info = i));
    expect(calls).toBe(2);
    expect(info?.mode).toBe("crop"); // a segunda tentativa veio certa e foi colada só nas rodas
  });

  it("roda que ocupa a foto toda (roda solta): não recorta, mas só a roda muda e o tamanho original é mantido", async () => {
    const orig = await solid(1200, 800, { r: 200, g: 200, b: 200 });
    const prov: ImageProvider = {
      name: "fake",
      classify: async () => ({ isCar: true, wheelsVisible: true, requestAboutWheelPaint: true }),
      // a "IA" devolve a foto menor (como o Gemini fez) e toda azul
      edit: async () => ({ data: await solid(900, 600, { r: 0, g: 0, b: 255 }), mime: "image/jpeg" }),
    };
    let info: WheelEditInfo | undefined;
    const out = await editWheelsOnly(prov, { data: orig, mime: "image/jpeg" }, "azul", [[0.02, 0.02, 0.98, 0.8]], (i) => (info = i));
    expect(info?.mode).toBe("whole");
    const meta = await sharp(out.data).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 800]); // tamanho original, não o da IA
    const inside = await pixel(out.data, 480, 400); // centro da roda
    expect(inside.b).toBeGreaterThan(200);
    const outside = await pixel(out.data, 1150, 400); // fundo, fora da roda
    expect(Math.abs(outside.r - 200)).toBeLessThan(6);
  });
});
