/** Contato de suporte. Defina no .env do app: EXPO_PUBLIC_SUPPORT_WHATSAPP=5511999999999 e/ou EXPO_PUBLIC_SUPPORT_EMAIL=suporte@seudominio.com.br */
export const SUPPORT_WHATSAPP = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP?.replace(/\D/g, "") || "";
export const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || "";
export const APP_VERSION = "1.0.0";
