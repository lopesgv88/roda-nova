import { Ionicons } from "@expo/vector-icons";
import { Redirect, Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import "../lib/webAlert";
import { Intro } from "../components/Intro";
import { AuthProvider, useAuth } from "../lib/auth";
import { C } from "../lib/theme";

/**
 * Seta de voltar para a versão WEB. No navegador o botão padrão some quando a pessoa abre a tela direto
 * ou recarrega (não há histórico); esta seta volta se der, senão vai para o início. No app nativo não é usada.
 */
const WebBack = ({ tintColor }: { tintColor?: string | null }) => (
  <Pressable
    onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    hitSlop={12}
    accessibilityLabel="Voltar"
    style={{ paddingHorizontal: 12, paddingVertical: 6 }}
  >
    <Ionicons name="arrow-back" size={26} color={typeof tintColor === "string" ? tintColor : C.text} />
  </Pressable>
);
const webBack = Platform.OS === "web" ? (p: { tintColor?: unknown }) => <WebBack tintColor={typeof p.tintColor === "string" ? p.tintColor : undefined} /> : undefined;
const noBack = Platform.OS === "web" ? () => null : undefined;

function Gate() {
  const { ready, signedIn, onboarding, me } = useAuth();
  const segments = useSegments();
  if (!ready)
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center" }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  const onLogin = segments[0] === "login";
  const onPlans = segments[0] === "plans";
  const publicRoute = onLogin || segments[0] === "forgot" || segments[0] === "legal";
  if (!signedIn && !publicRoute) return <Redirect href="/login" />;
  // conta antiga que ainda não aceitou os Termos/Privacidade
  if (signedIn && me && !me.termsAccepted && segments[0] !== "consent" && segments[0] !== "legal") return <Redirect href="/consent" />;
  // conta recém-criada: vai direto para a escolha de plano
  if (signedIn && onboarding && !onPlans) return <Redirect href="/plans" />;
  if (signedIn && onLogin) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text, contentStyle: { backgroundColor: C.bg }, headerLeft: webBack }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="forgot" options={{ title: "Recuperar senha" }} />
      <Stack.Screen name="consent" options={{ title: "Termos e privacidade", headerBackVisible: false, gestureEnabled: false, headerLeft: noBack }} />
      <Stack.Screen name="legal/[doc]" options={{ title: "Documento" }} />
      <Stack.Screen name="result" options={{ title: "Imagem gerada" }} />
      <Stack.Screen name="plans" options={{ title: "Planos", headerBackVisible: !onboarding, gestureEnabled: !onboarding, headerLeft: onboarding ? noBack : webBack }} />
      <Stack.Screen name="add" options={{ title: "Adicionar roda feita", presentation: "modal" }} />
      <Stack.Screen name="entry/[id]" options={{ title: "Carro" }} />
    </Stack>
  );
}

/** Mostra a abertura animada por cima do app até ele estar pronto (sessão lida). */
function Shell() {
  const { ready } = useAuth();
  const [intro, setIntro] = useState(true);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Gate />
      {intro ? <Intro ready={ready} onFinish={() => setIntro(false)} /> : null}
    </View>
  );
}

export default function Root() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Shell />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
