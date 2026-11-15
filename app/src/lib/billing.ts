import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";

/**
 * Compra de assinatura pelo RevenueCat (Google Play / App Store).
 * - A chave PÚBLICA do SDK vem do .env do app: EXPO_PUBLIC_REVENUECAT_ANDROID_KEY (começa com "goog_")
 *   e EXPO_PUBLIC_REVENUECAT_IOS_KEY (começa com "appl_"). Nunca use a chave secreta aqui.
 * - No Expo Go não há compra (falta o código nativo): billingAvailable() é falso e o app só mostra "em breve".
 * - Quem credita as rodas é o servidor, pelo aviso do RevenueCat (POST /billing/revenuecat).
 */
const apiKey = Platform.OS === "android" ? process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY : process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

export const billingAvailable = () => !!apiKey && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let configured = false;
let loggedAs: string | null = null;

async function sdk() {
  return (await import("react-native-purchases")).default;
}

/** Liga o SDK ao usuário logado (o servidor reconhece o comprador pelo ID dele). */
export async function startBilling(userId: number): Promise<boolean> {
  if (!billingAvailable()) return false;
  try {
    const Purchases = await sdk();
    const id = String(userId);
    if (!configured) {
      Purchases.configure({ apiKey: apiKey!, appUserID: id });
      configured = true;
      loggedAs = id;
    } else if (loggedAs !== id) {
      await Purchases.logIn(id);
      loggedAs = id;
    }
    return true;
  } catch (e) {
    console.warn("[billing] não foi possível iniciar", e);
    return false;
  }
}

/** Esquece o usuário ao sair da conta (para a próxima pessoa não herdar a compra). */
export async function stopBilling() {
  if (!configured) return;
  try {
    await (await sdk()).logOut();
  } catch {
    // já estava sem login
  }
  loggedAs = null;
}

export type BuyResult = "ok" | "cancelled";

/** Abre a tela de compra da loja para o produto. Lança Error com mensagem em português se não der. */
export async function buy(productId: string): Promise<BuyResult> {
  const { default: Purchases, PRODUCT_CATEGORY } = await import("react-native-purchases");
  const products = await Purchases.getProducts([productId], PRODUCT_CATEGORY.SUBSCRIPTION);
  const product = products.find((p) => p.identifier === productId) ?? products[0];
  if (!product) throw new Error("Este plano ainda não está disponível na loja. Tente mais tarde.");
  try {
    await Purchases.purchaseStoreProduct(product);
    return "ok";
  } catch (e: any) {
    if (e?.userCancelled) return "cancelled";
    throw new Error("A compra não foi concluída. Se a loja chegou a cobrar, suas rodas aparecem em alguns minutos. Se não, tente de novo.");
  }
}
