import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * Guarda a sessão (login) no aparelho.
 * - Celular (Android/iPhone): cofre seguro do sistema (expo-secure-store).
 * - Navegador: o expo-secure-store não existe na web, então usa o localStorage do próprio navegador.
 */
const web = Platform.OS === "web";

export const storage = {
  async get(key: string): Promise<string | null> {
    if (web) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null; // navegação privada / armazenamento bloqueado
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (web) {
      try {
        window.localStorage.setItem(key, value);
      } catch {}
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (web) {
      try {
        window.localStorage.removeItem(key);
      } catch {}
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};
