import sharp from "sharp";
import type { ImageData, ImageProvider, WheelBox } from "./providers/types.js";

/**
 * Pinta SÓ a roda: recorta a região das rodas, manda esse recorte para a IA e cola o resultado de volta
 * na foto original, apenas dentro do contorno de cada roda. O resto da foto (carro, fundo, enquadramento,
 * formato) fica idêntico ao original, e a IA não gasta processamento redesenhando o que não muda.
 * Se não der para recortar com segurança, cai no modo antigo (edita a foto inteira).
 */
export interface WheelEditInfo {
  /** crop = só o recorte das rodas; whole = foto inteira com colagem só nas rodas; full = modo antigo (sem máscara) */
  mode: "crop" | "whole" | "full";
  reason?: string;
  crop?: { left: number; top: number; width: number; height: number };
}

const PAD = 0.18; // folga ao redor das rodas no recorte
const MASK_SCALE = 1.04; // a máscara cobre a caixa toda da roda (para não sobrar borda do aro sem pintar); a borda é suave
const MAX_CROP_SIDE = 1280; // recorte enviado à IA (lado maior)
const MIN_SEND_SIDE = 768; // recorte pequeno é ampliado até aqui: com poucos pixels a IA "reinventa" o enquadramento
const MAX_CROP_AREA = 0.62; // se o recorte cobrir mais que isso da foto, não compensa recortar
/** Diferença média (0-255) permitida FORA das rodas entre a foto original e o resultado da IA. Acima disso o carro mudou. */
const DRIFT_MAX = Number(process.env.WHEEL_DRIFT_MAX ?? 18);
const ATTEMPTS = 2;

/** A IA devolveu o carro alterado (tamanho da roda, para-choque, enquadramento) e não foi possível corrigir. */
export class EditDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditDriftError";
  }
}

/**
 * Compara a foto original e o resultado só FORA das rodas (onde nada deveria mudar). Devolve a diferença média
 * (0 = idêntico). Brilho geral é compensado, porque a IA pode clarear/escurecer a foto toda de leve.
 */
async function driftScore(orig: Buffer, patch: Buffer, alpha: Buffer, w: number, h: number): Promise<number> {
  const S = 64, SH = Math.max(16, Math.round((S * h) / w));
  const small = (b: Buffer) => sharp(b).resize(S, SH, { fit: "fill" }).greyscale().raw().toBuffer();
  const [a, b] = await Promise.all([small(orig), small(patch)]);
  const m = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).resize(S, SH, { fit: "fill" }).greyscale().raw().toBuffer();
  const n = Math.min(a.length, b.length, m.length);
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (m[i] < 25) idx.push(i); // fora das rodas
  if (idx.length < 50) return 0;
  const ma = idx.reduce((s, i) => s + a[i], 0) / idx.length;
  const mb = idx.reduce((s, i) => s + b[i], 0) / idx.length;
  const score = idx.reduce((s, i) => s + Math.abs(a[i] - ma - (b[i] - mb)), 0) / idx.length;
  // se algo deu errado na conta, trata como "alterado" (melhor recusar do que entregar o carro deformado)
  return Number.isFinite(score) ? score : Infinity;
}

export async function editWheelsOnly(
  provider: ImageProvider,
  image: ImageData,
  prompt: string,
  wheels: WheelBox[] | undefined,
  onInfo?: (i: WheelEditInfo) => void,
): Promise<ImageData> {
  const full = async (reason: string) => {
    onInfo?.({ mode: "full", reason });
    return provider.edit(image, prompt);
  };
  if (process.env.WHEEL_CROP === "false") return full("desligado");
  if (!wheels?.length) return full("sem caixas de roda");

  const meta = await sharp(image.data).metadata();
  const W = meta.width ?? 0, H = meta.height ?? 0;
  if (!W || !H) return full("sem dimensões");

  // caixas em pixels, descartando as que não parecem uma roda
  const boxes = wheels
    .map(([y0, x0, y1, x1]) => ({ x0: x0 * W, y0: y0 * H, x1: x1 * W, y1: y1 * H }))
    .map((b) => ({ ...b, w: b.x1 - b.x0, h: b.y1 - b.y0 }))
    .filter((b) => b.w >= W * 0.03 && b.h >= H * 0.03 && b.w / b.h > 0.2 && b.w / b.h < 5);
  if (!boxes.length) return full("caixas inválidas");

  // recorte = união das rodas + folga
  const ux0 = Math.min(...boxes.map((b) => b.x0)), uy0 = Math.min(...boxes.map((b) => b.y0));
  const ux1 = Math.max(...boxes.map((b) => b.x1)), uy1 = Math.max(...boxes.map((b) => b.y1));
  const padX = Math.max(24, (ux1 - ux0) * PAD), padY = Math.max(24, (uy1 - uy0) * PAD);
  let left = Math.max(0, Math.floor(ux0 - padX)), top = Math.max(0, Math.floor(uy0 - padY));
  let width = Math.min(W, Math.ceil(ux1 + padX)) - left, height = Math.min(H, Math.ceil(uy1 + padY)) - top;
  if (width < 64 || height < 64) return full("recorte pequeno demais");
  // rodas ocupando quase a foto toda (ex.: roda solta numa loja): não compensa recortar,
  // mas a colagem na máscara continua valendo (o resto da foto e o tamanho original ficam intactos)
  const whole = (width * height) / (W * H) > MAX_CROP_AREA;
  if (whole) { left = 0; top = 0; width = W; height = H; }

  const crop = { left, top, width, height };
  const cropBuf = await sharp(image.data).extract(crop).jpeg({ quality: 92 }).toBuffer();
  // recorte pequeno é ampliado (a IA devolve imagens grandes; com poucos pixels ela muda o enquadramento);
  // recorte grande é reduzido
  const longSide = Math.max(width, height);
  const target = longSide < MIN_SEND_SIDE ? MIN_SEND_SIDE : Math.min(longSide, MAX_CROP_SIDE);
  const toSend = await sharp(cropBuf).resize({ width: target, height: target, fit: "inside", kernel: "lanczos3" }).jpeg({ quality: 92 }).toBuffer();
  const sm = await sharp(toSend).metadata();
  const sentAspect = sm.width! / sm.height!;

  // máscara: elipses das rodas, com borda suave
  const ell = boxes
    .map((b) => {
      const cx = (b.x0 + b.x1) / 2 - left, cy = (b.y0 + b.y1) / 2 - top;
      return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${((b.w / 2) * MASK_SCALE).toFixed(1)}" ry="${((b.h / 2) * MASK_SCALE).toFixed(1)}" fill="#fff"/>`;
    })
    .join("");
  const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#000"/>${ell}</svg>`;
  const sigma = Math.max(2, Math.min(width, height) * 0.012);
  const alpha = await sharp(Buffer.from(maskSvg)).blur(sigma).greyscale().raw().toBuffer({ resolveWithObject: true });

  // A IA precisa devolver o MESMO enquadramento (só a roda muda). Se vier com outro formato ou o carro mudou
  // fora das rodas (roda menor, para-choque duplicado...), tenta de novo; se ainda vier torto, falha (o crédito volta).
  let lastReason = "";
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const edited = await provider.edit({ data: toSend, mime: "image/jpeg" }, prompt);
    const em = await sharp(edited.data).metadata();
    if (!em.width || !em.height) { lastReason = "resposta sem dimensões"; continue; }
    if (Math.abs(em.width / em.height / sentAspect - 1) > 0.06) { lastReason = "a IA mudou o formato do recorte"; continue; }

    // devolve o recorte editado ao tamanho original do recorte
    const patch = await sharp(edited.data).resize(width, height, { fit: "fill" }).removeAlpha().toBuffer();
    const drift = await driftScore(cropBuf, patch, alpha.data, alpha.info.width, alpha.info.height);
    if (drift > DRIFT_MAX) { lastReason = `a IA alterou o carro fora da roda (diferença ${drift.toFixed(1)})`; continue; }

    const patchRgba = await sharp(patch)
      .joinChannel(alpha.data, { raw: { width: alpha.info.width, height: alpha.info.height, channels: 1 } })
      .png()
      .toBuffer();
    const merged = await sharp(cropBuf).composite([{ input: patchRgba }]).jpeg({ quality: 93 }).toBuffer();
    const out = await sharp(image.data).composite([{ input: merged, left, top }]).jpeg({ quality: 93 }).toBuffer();
    onInfo?.({ mode: whole ? "whole" : "crop", reason: `diferença ${drift.toFixed(1)}, tentativa ${attempt}`, crop });
    return { data: out, mime: "image/jpeg" };
  }
  onInfo?.({ mode: "full", reason: `recusado: ${lastReason}` });
  throw new EditDriftError(lastReason);
}
