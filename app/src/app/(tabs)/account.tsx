import { router } from "expo-router";
import { useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";
import { Btn, Input, Notice } from "../../components/ui";
import { API_URL, api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { APP_VERSION, SUPPORT_EMAIL, SUPPORT_WHATSAPP } from "../../lib/config";
import { C } from "../../lib/theme";

const PLAN_NAME: Record<string, string> = { free: "Teste grátis", basico: "Básico", pro: "Pro", estudio: "Estúdio" };

export default function Account() {
  const { email, me, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const contact = () => {
    const url = SUPPORT_WHATSAPP
      ? `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent("Olá! Preciso de ajuda com o Roda Nova.")}`
      : `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Ajuda com o Roda Nova")}`;
    Linking.openURL(url).catch(() => Alert.alert("Não foi possível abrir o contato."));
  };

  const confirmDelete = () =>
    Alert.alert("Excluir sua conta?", "Isso apaga sua conta, biblioteca, histórico e todas as fotos. Não dá para desfazer.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir tudo",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          setErr("");
          try {
            await api.deleteAccount(password);
            await signOut();
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 50 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
    >
      <Text style={{ color: C.muted }}>Conectado como</Text>
      <Text style={{ color: C.text, fontSize: 18, fontWeight: "700" }}>{email}</Text>

      <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 16, marginTop: 10, borderWidth: 1, borderColor: C.border }}>
        <Text style={{ color: C.muted }}>Seu plano</Text>
        <Text style={{ color: C.text, fontSize: 22, fontWeight: "800", marginTop: 2 }}>{me ? PLAN_NAME[me.plan] ?? me.plan : "…"}</Text>
        <Text style={{ color: C.accent, fontSize: 16, fontWeight: "700", marginTop: 8 }}>
          {me ? `${me.credits} ${me.credits === 1 ? "roda restante" : "rodas restantes"}` : ""}
        </Text>
        {me?.subscriptionUntil ? (
          <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Vale até {new Date(me.subscriptionUntil).toLocaleDateString("pt-BR")}</Text>
        ) : null}
        <View style={{ marginTop: 14 }}>
          <Btn label="Ver planos" onPress={() => router.push("/plans")} />
        </View>
      </View>

      {SUPPORT_WHATSAPP || SUPPORT_EMAIL ? <Btn kind="ghost" label="Falar com a gente" onPress={contact} /> : null}
      <Btn kind="ghost" label="Termos de Uso" onPress={() => router.push("/legal/terms")} />
      <Btn kind="ghost" label="Política de Privacidade" onPress={() => router.push("/legal/privacy")} />
      <Btn kind="ghost" label="Sair" onPress={signOut} style={{ marginTop: 8 }} />

      <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 18 }}>
        {!deleting ? (
          <Btn kind="danger" label="Excluir minha conta" onPress={() => setDeleting(true)} />
        ) : (
          <View>
            <Text style={{ color: C.text, lineHeight: 21, marginBottom: 12 }}>
              Para excluir, digite sua senha. Isso apaga sua conta, biblioteca, histórico e fotos para sempre.
            </Text>
            <Input value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder="Sua senha" />
            {err ? <Notice text={err} /> : null}
            <View style={{ gap: 10 }}>
              <Btn kind="danger" label="Excluir definitivamente" onPress={confirmDelete} loading={busy} disabled={!password} />
              <Btn kind="ghost" label="Cancelar" onPress={() => { setDeleting(false); setPassword(""); setErr(""); }} />
            </View>
          </View>
        )}
      </View>

      <Text style={{ color: C.muted, fontSize: 11, marginTop: 14 }}>Roda Nova {APP_VERSION} · Servidor: {API_URL}</Text>
    </ScrollView>
  );
}
