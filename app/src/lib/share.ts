import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";
import { fileUrl } from "./api";

async function download(url: string): Promise<File> {
  const ext = url.split(".").pop()?.split("?")[0] || "jpg";
  return File.downloadFileAsync(fileUrl(url), new File(Paths.cache, `rodanova-${Date.now()}.${ext}`));
}

/**
 * Navegador: abre o menu de compartilhar do aparelho (no iPhone tem "Salvar imagem", WhatsApp etc.).
 * Se o navegador não tiver esse menu, baixa o arquivo.
 */
async function webShare(url: string) {
  const res = await fetch(fileUrl(url));
  const blob = await res.blob();
  const name = `rodanova-${Date.now()}.${blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg"}`;
  const file = new window.File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "Roda Nova" });
    } catch (e: any) {
      if (e?.name !== "AbortError") throw e; // fechar o menu não é erro
    }
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Salva a imagem na galeria do celular. */
export async function saveToGallery(url: string) {
  if (Platform.OS === "web") {
    try {
      return await webShare(url);
    } catch {
      return Alert.alert("Não foi possível salvar", "Tente de novo em instantes.");
    }
  }
  try {
    const p = await MediaLibrary.requestPermissionsAsync(true); // só gravar, sem ler a galeria
    if (!p.granted) {
      // No Android o app não pede acesso à galeria: abre o menu de compartilhar, onde dá para salvar a imagem.
      if (Platform.OS === "android") return shareImage(url);
      return Alert.alert("Permissão necessária", "Permita salvar fotos nas configurações do celular.");
    }
    const f = await download(url);
    await MediaLibrary.saveToLibraryAsync(f.uri);
    Alert.alert("Salvo!", "A imagem foi salva na galeria do seu celular.");
  } catch {
    Alert.alert("Não foi possível salvar", "Tente de novo em instantes.");
  }
}

/** Abre o menu de compartilhar (WhatsApp, etc.). */
export async function shareImage(url: string) {
  if (Platform.OS === "web") {
    try {
      return await webShare(url);
    } catch {
      return Alert.alert("Não foi possível compartilhar a imagem.");
    }
  }
  try {
    const f = await download(url);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri);
  } catch {
    Alert.alert("Não foi possível compartilhar a imagem.");
  }
}
