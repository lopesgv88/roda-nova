import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { C } from "../../lib/theme";

const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: ColorValue; size: number }) => (
  <Ionicons name={name} color={color as string} size={size} />
);

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.bg },
        headerTintColor: C.text,
        sceneStyle: { backgroundColor: C.bg },
        tabBarStyle: { backgroundColor: C.card, borderTopColor: C.border, height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.muted,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Estúdio", tabBarIcon: icon("color-palette") }} />
      <Tabs.Screen name="library" options={{ title: "Biblioteca", tabBarIcon: icon("images") }} />
      <Tabs.Screen name="history" options={{ title: "Histórico", tabBarIcon: icon("time") }} />
      <Tabs.Screen name="account" options={{ title: "Conta", tabBarIcon: icon("person") }} />
    </Tabs>
  );
}
