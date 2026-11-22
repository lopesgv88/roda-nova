import { Alert, Platform, type AlertButton } from "react-native";

/**
 * No navegador o Alert.alert do React Native não faz nada (nenhum aviso aparece e quem espera a resposta trava).
 * Aqui ele passa a usar as caixas do navegador. No celular (Android/iPhone) continua o Alert normal.
 * - 0 ou 1 botão: caixa de aviso, depois chama o botão.
 * - 2+ botões: caixa de confirmação; OK chama o primeiro botão que não é "cancelar", Cancelar chama o de cancelar.
 */
if (Platform.OS === "web") {
  (Alert as unknown as { alert: typeof Alert.alert }).alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join("\n\n");
    if (!buttons || buttons.length <= 1) {
      window.alert(text);
      buttons?.[0]?.onPress?.();
      return;
    }
    const cancel = buttons.find((b) => b.style === "cancel");
    const action = buttons.find((b) => b !== cancel);
    if (window.confirm(text)) action?.onPress?.();
    else cancel?.onPress?.();
  };
}
