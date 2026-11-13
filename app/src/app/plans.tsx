import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { Btn, Notice } from "../components/ui";
import { ApiError, api, type Plan } from "../lib/api";
import { useAuth } from "../lib/auth";
import { C } from "../lib/theme";

const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

/** Tela de planos. Aparece logo depois do cadastro e pode ser reaberta pela aba Conta. */
export default function Plans() {
  const { me, onboarding, finishOnboarding, refresh } = useAuth();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.plans().then((r) => setPlans(r.plans)).catch((e) => setErr(e.message));
    void refresh();
  }, [refresh]);

  const leave = () => {
    finishOnboarding();
    router.replace("/");
  };

  const choose = async (p: Plan) => {
    if (p.id === "free") return leave();
    setBusy(p.id);
    try {
      await api.selectPlan(p.id);
      await refresh();
      Alert.alert("Plano ativado!", `Você ganhou ${p.credits} novas rodas no plano ${p.name}.`, [{ text: "Começar", onPress: leave }]);
    } catch (e) {
      const a = e as ApiError;
      if (a.code === "payment_unavailable") {
        Alert.alert(
          "Assinatura em breve",
          `Ainda estamos liberando as assinaturas.${me ? ` Enquanto isso, você tem ${me.credits} ${me.credits === 1 ? "roda" : "rodas"} para pintar.` : ""}`,
          [{ text: "Entendi", onPress: onboarding ? leave : undefined }],
        );
      } else Alert.alert("Não foi possível", a.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={{ color: C.text, fontSize: 26, fontWeight: "900" }}>{onboarding ? "Conta criada! 🎉" : "Planos"}</Text>
      <Text style={{ color: C.muted, fontSize: 15, marginTop: 4, lineHeight: 22 }}>
        {onboarding ? "Escolha como começar. Cada roda nova que você pinta usa 1 crédito." : "Cada roda nova que você pinta usa 1 crédito."}
      </Text>

      {me ? (
        <View style={{ backgroundColor: C.card, borderRadius: 14, padding: 14, marginTop: 16, borderWidth: 1, borderColor: C.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: C.muted }}>Seu saldo agora</Text>
          <Text style={{ color: C.accent, fontSize: 20, fontWeight: "900" }}>{me.credits} {me.credits === 1 ? "roda" : "rodas"}</Text>
        </View>
      ) : null}

      {err ? <Notice text={err} /> : null}
      {!plans && !err ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : null}

      <View style={{ gap: 14, marginTop: 18 }}>
        {plans?.map((p) => {
          const free = p.id === "free";
          const current = me?.plan === p.id && !free;
          return (
            <View key={p.id} style={{ backgroundColor: C.card, borderRadius: 18, padding: 18, borderWidth: p.popular ? 2 : 1, borderColor: p.popular ? C.accent : C.border }}>
              {p.popular ? (
                <View style={{ alignSelf: "flex-start", backgroundColor: C.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10 }}>
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>MAIS ESCOLHIDO</Text>
                </View>
              ) : null}
              <Text style={{ color: C.text, fontSize: 20, fontWeight: "800" }}>{p.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 6 }}>
                <Text style={{ color: C.text, fontSize: 32, fontWeight: "900" }}>{free ? "Grátis" : brl(p.priceBRL)}</Text>
                {!free ? <Text style={{ color: C.muted, fontSize: 15 }}> /mês</Text> : null}
              </View>
              <Text style={{ color: C.accent, fontWeight: "700", marginTop: 2 }}>
                {p.credits} novas rodas{free ? "" : " por mês"}
              </Text>
              <View style={{ marginTop: 12, gap: 6 }}>
                {p.perks.map((k) => (
                  <Text key={k} style={{ color: C.text, fontSize: 15 }}>✓  {k}</Text>
                ))}
              </View>
              <View style={{ marginTop: 16 }}>
                <Btn
                  kind={p.popular || free ? "primary" : "ghost"}
                  label={free ? (onboarding ? "Começar com 3 rodas grátis" : "Continuar") : current ? "Plano atual" : `Assinar ${p.name}`}
                  onPress={() => choose(p)}
                  loading={busy === p.id}
                  disabled={current}
                />
              </View>
            </View>
          );
        })}
      </View>

      {onboarding ? (
        <Text style={{ color: C.muted, textAlign: "center", marginTop: 18, fontSize: 13 }}>Você pode ver os planos de novo quando quiser, na aba Conta.</Text>
      ) : null}
    </ScrollView>
  );
}
