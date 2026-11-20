import { File, Paths } from "expo-file-system";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";
import { fileUrl } from "./api";

async function download(url: string): Promise<File> {
  const ext = url.split(".").pop()?.split("?")[0] || "jpg";
  return File.downloadFileAsync(fileUrl(url), new File(Paths.cache, `rodanova-${Date.now()}.${ext}`));
}

/** Salva a imagem na galeria do celular. */
export async function saveToGallery(url: string) {
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
  try {
    const f = await download(url);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri);
  } catch {
    Alert.alert("Não foi possível compartilhar a imagem.");
  }
}
