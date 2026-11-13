import sharp from "sharp";

/**
 * Prepara a foto do cliente antes de mandar para a IA: aplica a rotação do celular (EXIF),
 * reduz o lado maior (mais rápido e mais barato) e converte para JPEG.
 * Se algo falhar, usa a imagem original.
 */
export async function prepareImage(buf: Buffer, mime: string): Promise<{ data: Buffer; mime: string }> {
  const max = Number(process.env.MAX_IMAGE_SIDE ?? 1536);
  try {
    const data = await sharp(buf, { failOn: "none" })
      .rotate()
      .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    return { data, mime: "image/jpeg" };
  } catch {
    return { data: buf, mime };
  }
}
