import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text } from "react-native";
import { api, type LegalDoc } from "../../lib/api";
import { C } from "../../lib/theme";

/** Mostra a Política de Privacidade (doc=privacy) ou os Termos de Uso (doc=terms) vindos do servidor. */
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const [d, setD] = useState<LegalDoc | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.legal(String(doc)).then(setD).catch((e) => setErr(e.message));
  }, [doc]);

  return (
    <>
      <Stack.Screen options={{ title: d?.title ?? (doc === "terms" ? "Termos de Uso" : "Política de Privacidade") }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        {err ? <Text style={{ color: C.danger }}>{err}</Text> : null}
        {!d && !err ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : null}
        {d ? <Text style={{ color: C.text, fontSize: 15, lineHeight: 23 }}>{d.body}</Text> : null}
      </ScrollView>
    </>
  );
}
