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
const MAX_CROP_AREA = 0.62; // se o recorte cobrir mais que isso da foto, não compensa recortar

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
  const toSend = await sharp(cropBuf).resize({ width: MAX_CROP_SIDE, height: MAX_CROP_SIDE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 92 }).toBuffer();

  const edited = await provider.edit({ data: toSend, mime: "image/jpeg" }, prompt);
  const em = await sharp(edited.data).metadata();
  if (!em.width || !em.height) return full("resposta sem dimensões");
  // a IA precisa devolver o mesmo enquadramento; senão a colagem ficaria desalinhada
  const sentAspect = (await sharp(toSend).metadata()).width! / (await sharp(toSend).metadata()).height!;
  if (Math.abs(em.width / em.height / sentAspect - 1) > 0.06) {
    if (whole) {
      onInfo?.({ mode: "full", reason: "a IA mudou o formato da foto" });
      return edited; // já é a foto inteira: usa como veio (não dá para colar alinhado)
    }
    return full("a IA mudou o formato do recorte"); // refaz com a foto inteira
  }

  // devolve o recorte editado ao tamanho original do recorte
  const patch = await sharp(edited.data).resize(width, height, { fit: "fill" }).removeAlpha().toBuffer();

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
  const patchRgba = await sharp(patch)
    .joinChannel(alpha.data, { raw: { width: alpha.info.width, height: alpha.info.height, channels: 1 } })
    .png()
    .toBuffer();

  const merged = await sharp(cropBuf).composite([{ input: patchRgba }]).jpeg({ quality: 93 }).toBuffer();
  const out = await sharp(image.data).composite([{ input: merged, left, top }]).jpeg({ quality: 93 }).toBuffer();
  onInfo?.({ mode: whole ? "whole" : "crop", crop });
  return { data: out, mime: "image/jpeg" };
}
