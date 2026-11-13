import { router } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { Btn, Input, Notice } from "../components/ui";
import { api } from "../lib/api";
import { C } from "../lib/theme";

/** Recuperar a senha: 1) e-mail → recebe um código; 2) código + nova senha. */
export default function Forgot() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  const sendCode = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErr("Digite um e-mail válido.");
    setBusy(true);
    setErr("");
    try {
      const r = await api.forgot(email.trim().toLowerCase());
      setInfo(r.message);
      setStep(2);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!/^\d{6}$/.test(code.trim())) return setErr("O código tem 6 números.");
    if (password.length < 6) return setErr("A nova senha precisa ter pelo menos 6 caracteres.");
    setBusy(true);
    setErr("");
    try {
      await api.reset(email.trim().toLowerCase(), code.trim(), password);
      Alert.alert("Senha alterada!", "Agora entre com a nova senha.", [{ text: "Entrar", onPress: () => router.back() }]);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: C.text, fontSize: 24, fontWeight: "900" }}>Esqueci minha senha</Text>
        <Text style={{ color: C.muted, marginTop: 6, marginBottom: 20, lineHeight: 21 }}>
          {step === 1 ? "Digite seu e-mail e enviaremos um código para criar uma senha nova." : info}
        </Text>

        <Input label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" editable={step === 1} />
        {step === 2 ? (
          <>
            <Input label="Código de 6 números" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="000000" />
            <Input label="Nova senha" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder="Mínimo de 6 caracteres" />
          </>
        ) : null}
        {err ? <Notice text={err} /> : null}
        {step === 1 ? (
          <Btn label="Enviar código" onPress={sendCode} loading={busy} disabled={!email} />
        ) : (
          <>
            <Btn label="Salvar nova senha" onPress={reset} loading={busy} disabled={!code || !password} />
            <Btn kind="ghost" label="Não recebi o código" onPress={() => { setStep(1); setCode(""); setErr(""); }} style={{ marginTop: 10 }} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
