import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { C } from "../lib/theme";

export function Btn({ label, onPress, kind = "primary", loading, disabled, style }: {
  label: string; onPress: () => void; kind?: "primary" | "ghost" | "danger";
  loading?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const bg = kind === "primary" ? C.accent : kind === "danger" ? "transparent" : C.card2;
  const color = kind === "danger" ? C.danger : "#fff";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }, kind === "danger" && { borderWidth: 1, borderColor: C.danger }, style]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={[s.btnText, { color }]}>{label}</Text>}
    </Pressable>
  );
}

export function Chip({ label, active, onPress, dot }: { label: string; active?: boolean; onPress: () => void; dot?: string }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { borderColor: C.accent, backgroundColor: "#2a1710" }]}>
      {dot ? <View style={[s.dot, { backgroundColor: dot }]} /> : null}
      <Text style={{ color: active ? C.accent : C.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={C.muted} {...rest} style={[s.input, style]} />
    </View>
  );
}

export function Label({ children }: { children: string }) {
  return <Text style={s.label}>{children}</Text>;
}

export function Notice({ text, kind = "error" }: { text: string; kind?: "error" | "info" }) {
  return (
    <View style={[s.notice, { borderColor: kind === "error" ? C.danger : C.accent }]}>
      <Text style={{ color: C.text, lineHeight: 20 }}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  btn: { minHeight: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  btnText: { fontSize: 16, fontWeight: "700" },
  chip: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: "#ffffff55" },
  label: { color: C.muted, fontSize: 13, marginBottom: 6, fontWeight: "600" },
  input: { backgroundColor: C.card, borderColor: C.border, borderWidth: 1, borderRadius: 12, color: C.text, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  notice: { borderWidth: 1, borderRadius: 12, padding: 14, backgroundColor: C.card, marginVertical: 10 },
});
