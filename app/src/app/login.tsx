import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PaintedLogo } from "../components/Logo";
import { Btn, Input, Notice } from "../components/ui";
import { useAuth } from "../lib/auth";
import { C } from "../lib/theme";

/** Primeira tela: criar a conta (e-mail e senha). Quem já tem conta alterna para "Entrar". */
export default function Login() {
  const { signIn } = useAuth();
  const insets = useSafeAreaInsets();
  const [register, setRegister] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const validate = (): string => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return "Digite um e-mail válido.";
    if (password.length < 6) return "A senha precisa ter pelo menos 6 caracteres.";
    if (register && password !== confirm) return "As senhas não são iguais.";
    if (register && !agree) return "Marque a caixa para aceitar os Termos e a Política de Privacidade.";
    return "";
  };

  const submit = async () => {
    const v = validate();
    if (v) return setErr(v);
    setBusy(true);
    setErr("");
    try {
      await signIn(email.trim().toLowerCase(), password, register);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setRegister(!register);
    setErr("");
    setConfirm("");
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 44, paddingBottom: 40, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "flex-start", marginBottom: 28 }}>
          <PaintedLogo size={104} />
          <Text style={{ color: C.text, fontSize: 40, fontWeight: "900", letterSpacing: -1, marginTop: 14 }}>
            Roda <Text style={{ color: C.accent }}>Nova</Text>
          </Text>
          <Text style={{ color: C.muted, fontSize: 16, marginTop: 6 }}>Veja sua roda pintada antes de pintar.</Text>
        </View>

        <Text style={{ color: C.text, fontSize: 22, fontWeight: "800", marginBottom: 4 }}>{register ? "Criar sua conta" : "Entrar na sua conta"}</Text>
        {register ? (
          <View style={{ backgroundColor: "#2a1710", borderColor: C.accent, borderWidth: 1, borderRadius: 12, padding: 12, marginVertical: 12 }}>
            <Text style={{ color: C.accent, fontWeight: "700" }}>🎁 Ganhe 3 rodas grátis para testar</Text>
            <Text style={{ color: C.muted, marginTop: 2 }}>Depois você escolhe o melhor plano para você.</Text>
          </View>
        ) : (
          <View style={{ height: 12 }} />
        )}

        <Input label="E-mail" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder="seuemail@exemplo.com" />
        <View>
          <Input
            label="Senha"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoComplete={register ? "new-password" : "password"}
            placeholder="Mínimo de 6 caracteres"
          />
          <Pressable onPress={() => setShow(!show)} style={{ position: "absolute", right: 14, top: 36 }} hitSlop={10}>
            <Text style={{ color: C.accent, fontWeight: "700" }}>{show ? "Ocultar" : "Mostrar"}</Text>
          </Pressable>
        </View>
        {register ? (
          <Input label="Repita a senha" value={confirm} onChangeText={setConfirm} secureTextEntry={!show} autoCapitalize="none" autoComplete="new-password" placeholder="Digite a senha de novo" />
        ) : (
          <Pressable onPress={() => router.push("/forgot")} hitSlop={8} style={{ alignSelf: "flex-end", marginTop: -6, marginBottom: 10 }}>
            <Text style={{ color: C.accent, fontWeight: "700" }}>Esqueci minha senha</Text>
          </Pressable>
        )}

        {register ? (
          <Pressable onPress={() => setAgree(!agree)} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 6 }}>
            <View style={{ width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: agree ? C.accent : C.border, backgroundColor: agree ? C.accent : "transparent", alignItems: "center", justifyContent: "center", marginTop: 1 }}>
              {agree ? <Text style={{ color: "#fff", fontWeight: "900" }}>✓</Text> : null}
            </View>
            <Text style={{ flex: 1, color: C.muted, lineHeight: 21 }}>
              Li e aceito os{" "}
              <Text style={{ color: C.accent, fontWeight: "700" }} onPress={() => router.push("/legal/terms")}>Termos de Uso</Text> e a{" "}
              <Text style={{ color: C.accent, fontWeight: "700" }} onPress={() => router.push("/legal/privacy")}>Política de Privacidade</Text>
              , e concordo que minhas fotos sejam enviadas a serviços de inteligência artificial para gerar as imagens.
            </Text>
          </Pressable>
        ) : null}

        {err ? <Notice text={err} /> : null}
        <View style={{ gap: 10, marginTop: 8 }}>
          <Btn label={register ? "Criar conta e ver os planos" : "Entrar"} onPress={submit} loading={busy} disabled={!email || !password} />
          <Btn kind="ghost" label={register ? "Já tenho conta" : "Criar uma conta nova"} onPress={switchMode} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
