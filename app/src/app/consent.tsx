import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Btn, Notice } from "../components/ui";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { C } from "../lib/theme";

/** Para quem criou a conta antes dos Termos existirem: precisa aceitar para continuar. */
export default function Consent() {
  const { refresh, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const accept = async () => {
    setBusy(true);
    setErr("");
    try {
      await api.acceptTerms();
      await refresh();
      router.replace("/");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
      <Text style={{ color: C.text, fontSize: 26, fontWeight: "900" }}>Antes de continuar</Text>
      <Text style={{ color: C.muted, fontSize: 15, lineHeight: 23, marginTop: 10 }}>
        Para gerar imagens, o Roda Nova envia suas fotos para serviços de inteligência artificial. Leia como tratamos seus dados e aceite para continuar.
      </Text>
      <View style={{ gap: 10, marginTop: 20 }}>
        <Btn kind="ghost" label="Ler os Termos de Uso" onPress={() => router.push("/legal/terms")} />
        <Btn kind="ghost" label="Ler a Política de Privacidade" onPress={() => router.push("/legal/privacy")} />
      </View>
      <Text style={{ color: C.text, fontSize: 14, lineHeight: 21, marginTop: 20 }}>
        Ao aceitar, você concorda com os Termos de Uso e com a Política de Privacidade e autoriza o envio das suas fotos aos provedores de IA para gerar as imagens.
      </Text>
      {err ? <Notice text={err} /> : null}
      <View style={{ gap: 10, marginTop: 20 }}>
        <Btn label="Li e aceito" onPress={accept} loading={busy} />
        <Btn kind="danger" label="Não aceito (sair)" onPress={signOut} />
      </View>
    </ScrollView>
  );
}
