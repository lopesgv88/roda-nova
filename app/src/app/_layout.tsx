import { Redirect, Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Intro } from "../components/Intro";
import { AuthProvider, useAuth } from "../lib/auth";
import { C } from "../lib/theme";

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
    <Stack screenOptions={{ headerStyle: { backgroundColor: C.bg }, headerTintColor: C.text, contentStyle: { backgroundColor: C.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="forgot" options={{ title: "Recuperar senha" }} />
      <Stack.Screen name="consent" options={{ title: "Termos e privacidade", headerBackVisible: false, gestureEnabled: false }} />
      <Stack.Screen name="legal/[doc]" options={{ title: "Documento" }} />
      <Stack.Screen name="result" options={{ title: "Imagem gerada" }} />
      <Stack.Screen name="plans" options={{ title: "Planos", headerBackVisible: !onboarding, gestureEnabled: !onboarding }} />
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
