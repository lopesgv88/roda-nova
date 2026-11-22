import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, Text, View } from "react-native";
import { Btn, Notice } from "../components/ui";
import { ApiError, api, type Plan } from "../lib/api";
import { useAuth } from "../lib/auth";
import { billingAvailable, buy, startBilling } from "../lib/billing";
import { C } from "../lib/theme";

const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

/** Tela de planos. Aparece logo depois do cadastro e pode ser reaberta pela aba Conta. */
export default function Plans() {
  const { me, onboarding, finishOnboarding, refresh } = useAuth();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // Versão web: o servidor diz se já dá para cobrar pelo Stripe. O app do Android nunca usa isso (segue pela Google Play).
  const [webCheckout, setWebCheckout] = useState(false);
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();

  useEffect(() => {
    api.plans().then((r) => { setPlans(r.plans); setWebCheckout(Platform.OS === "web" && !!r.webCheckout); }).catch((e) => setErr(e.message));
    void refresh();
  }, [refresh]);

  // Volta do pagamento (web): confere se o plano já foi ativado (o Stripe avisa o servidor em alguns segundos).
  useEffect(() => {
    if (Platform.OS !== "web" || checkout !== "success") return;
    let on = true;
    (async () => {
      for (let i = 0; i < 10 && on; i++) {
        const m = await api.me().catch(() => null);
        if (m && m.plan !== "free") {
          await refresh();
          if (on) Alert.alert("Plano ativado!", "Pagamento confirmado. Suas rodas já estão na sua conta.", [{ text: "Começar", onPress: () => { finishOnboarding(); router.replace("/"); } }]);
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (on) Alert.alert("Pagamento recebido", "Suas rodas chegam em instantes. Se não aparecerem em alguns minutos, fale com a gente.");
    })();
    return () => { on = false; };
  }, [checkout, refresh, finishOnboarding]);

  const leave = () => {
    finishOnboarding();
    router.replace("/");
  };

  const choose = async (p: Plan) => {
    if (p.id === "free") return leave();
    // Versão web: abre a página segura de pagamento do Stripe (cartão / Apple Pay) e volta para cá.
    if (webCheckout) {
      setBusy(p.id);
      try {
        window.location.href = (await api.stripeCheckout(p.id)).url;
      } catch (e) {
        setBusy(null);
        Alert.alert("Não foi possível", (e as ApiError).message);
      }
      return;
    }
    setBusy(p.id);
    try {
      // Versão instalada pela loja: compra de verdade (Google Play / App Store) pelo RevenueCat.
      if (billingAvailable() && p.productId && me) {
        if (!(await startBilling(me.id))) throw new Error("Não foi possível abrir a compra agora. Tente novamente.");
        if ((await buy(p.productId)) === "cancelled") return;
        // O servidor credita as rodas quando o RevenueCat avisa que o pagamento passou (leva alguns segundos).
        let done = false;
        for (let i = 0; i < 8 && !done; i++) {
          done = (await api.me().catch(() => null))?.plan === p.id;
          if (!done) await new Promise((r) => setTimeout(r, 2000));
        }
        await refresh();
        Alert.alert(
          done ? "Plano ativado!" : "Pagamento recebido",
          done ? `Você ganhou ${p.credits} novas rodas no plano ${p.name}.` : "Suas rodas chegam em instantes. Se não aparecerem em alguns minutos, fale com a gente.",
          [{ text: "Começar", onPress: leave }],
        );
        return;
      }
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

      {webCheckout ? (
        <Text style={{ color: C.muted, textAlign: "center", marginTop: 18, fontSize: 13, lineHeight: 19 }}>
          Pagamento seguro pelo Stripe, no cartão ou Apple Pay. Renova todo mês e você cancela quando quiser, na aba Conta.
        </Text>
      ) : null}
      {onboarding ? (
        <Text style={{ color: C.muted, textAlign: "center", marginTop: 18, fontSize: 13 }}>Você pode ver os planos de novo quando quiser, na aba Conta.</Text>
      ) : null}
    </ScrollView>
  );
}
