import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";
import type { LocalImage } from "./api";

const base: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.9 };
/** Com crop=true abre a tela de corte em 4:3 (enquadra o carro e a roda, e a imagem gerada sai em 4:3). */
const opts = (crop: boolean): ImagePicker.ImagePickerOptions => (crop ? { ...base, allowsEditing: true, aspect: [4, 3] } : base);

const toLocal = (r: ImagePicker.ImagePickerResult): LocalImage[] =>
  r.canceled ? [] : r.assets.map((a) => ({ uri: a.uri, mime: a.mimeType }));

export async function fromCamera(crop = false): Promise<LocalImage | null> {
  const p = await ImagePicker.requestCameraPermissionsAsync();
  if (!p.granted) {
    Alert.alert("Câmera bloqueada", "Permita o uso da câmera nas configurações do celular.");
    return null;
  }
  return toLocal(await ImagePicker.launchCameraAsync(opts(crop)))[0] ?? null;
}

export async function fromGallery(multiple = false, crop = false): Promise<LocalImage[]> {
  return toLocal(await ImagePicker.launchImageLibraryAsync({ ...opts(crop), allowsMultipleSelection: multiple && !crop }));
}

/** Foto do carro ou da roda para o Estúdio: câmera ou galeria, sem cortar (a foto vai inteira, em pé ou deitada). */
export function chooseSource(): Promise<LocalImage | null> {
  // No navegador o próprio seletor do celular já oferece "Fototeca", "Tirar foto" e "Escolher arquivo".
  if (Platform.OS === "web") return fromGallery().then((r) => r[0] ?? null);
  return new Promise((resolve) => {
    Alert.alert("Foto do carro ou da roda", "De onde quer pegar a foto?", [
      { text: "Câmera", onPress: () => fromCamera().then(resolve) },
      { text: "Galeria", onPress: () => fromGallery().then((r) => resolve(r[0] ?? null)) },
      { text: "Cancelar", style: "cancel", onPress: () => resolve(null) },
    ]);
  });
}
