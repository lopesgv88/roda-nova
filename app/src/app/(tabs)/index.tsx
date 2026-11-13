import { Image } from "expo-image";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, type ScrollViewInstance, Text, View } from "react-native";
import { BeforeAfter } from "../../components/BeforeAfter";
import { Btn, Chip, Input, Label, Notice } from "../../components/ui";
import { ApiError, api, fileUrl, type LocalImage, type PaintResult } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { chooseSource } from "../../lib/pick";
import { saveToGallery, shareImage } from "../../lib/share";
import { C } from "../../lib/theme";

const COLORS: Array<[string, string]> = [
  ["Preto", "#111"], ["Grafite", "#4a4d52"], ["Prata", "#c0c3c8"], ["Branco", "#f5f5f5"],
  ["Vermelho", "#d11f2a"], ["Azul", "#1f5fd1"], ["Dourado", "#d4a634"], ["Bronze", "#8c5a2b"],
  ["Verde", "#1f8a4c"], ["Laranja", "#f0711f"],
];
const FINISHES = ["Brilhante", "Fosco", "Acetinado", "Metálico", "Cromado", "Diamantado", "Dois tons", "Aro polido"];

export default function Studio() {
  const [photo, setPhoto] = useState<LocalImage | null>(null);
  const [previewRatio, setPreviewRatio] = useState(4 / 3);
  const scroll = useRef<ScrollViewInstance>(null);
  const [color, setColor] = useState("");
  const [finish, setFinish] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const { me, refresh } = useAuth();
  const [err, setErr] = useState<{ text: string; refused: boolean; noCredits?: boolean } | null>(null);
  const noCredits = me !== null && me.credits < 1;
  const [result, setResult] = useState<PaintResult | null>(null);

  const pick = async () => {
    const p = await chooseSource();
    if (p) {
      setPhoto(p);
      setResult(null);
      setErr(null);
    }
  };

  const generate = async () => {
    if (!photo || !color.trim()) return;
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      setResult(await api.paintWheels(photo, { color: color.trim(), finish, details: details.trim() }));
    } catch (e) {
      const a = e as ApiError;
      if (a.code === "terms_required") router.push("/consent");
      setErr({ text: a.message, refused: a.status === 422, noCredits: a.code === "no_credits" });
    } finally {
      void refresh(); // atualiza o saldo (desconta 1 se gerou, devolve se falhou)
      setBusy(false);
    }
  };

  const save = () =>
    result &&
    router.push({
      pathname: "/add",
      params: { beforeFile: result.beforeFile, afterFile: result.afterFile, beforeUrl: result.beforeUrl, afterUrl: result.afterUrl, color: [color, finish].filter(Boolean).join(" ") },
    });

  return (
    <ScrollView
      ref={scroll}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled" // tocar fora do campo fecha o teclado e tudo volta ao normal
      keyboardDismissMode="on-drag" // arrastar a tela também fecha o teclado
      automaticallyAdjustKeyboardInsets // iPhone: a tela sobe sozinha para o campo ficar acima do teclado
    >
      {me ? (
        <Pressable onPress={() => router.push("/plans")} style={{ alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.card, borderColor: noCredits ? C.danger : C.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 12 }}>
          <Text style={{ color: noCredits ? C.danger : C.accent, fontWeight: "800" }}>
            {me.credits} {me.credits === 1 ? "roda" : "rodas"}
          </Text>
          <Text style={{ color: C.muted, fontSize: 12 }}>Planos ›</Text>
        </Pressable>
      ) : null}
      {result ? (
        <View style={{ gap: 12 }}>
          {/* sangra até as bordas da tela para a demonstração ficar bem maior */}
          <View style={{ marginHorizontal: -16 }}>
            <BeforeAfter before={fileUrl(result.beforeUrl)} after={fileUrl(result.afterUrl)} rounded={false} />
          </View>
          <Text style={{ color: C.muted, textAlign: "center" }}>Arraste a barra para comparar</Text>
          <Btn label="Salvar na biblioteca" onPress={save} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Btn kind="ghost" label="Salvar na galeria" onPress={() => saveToGallery(result.afterUrl)} style={{ flex: 1 }} />
            <Btn kind="ghost" label="Compartilhar" onPress={() => shareImage(result.afterUrl)} style={{ flex: 1 }} />
          </View>
          <Btn kind="ghost" label="Refazer com outra cor" onPress={() => setResult(null)} />
        </View>
      ) : (
        <>
          <Pressable onPress={pick} style={{ aspectRatio: photo ? previewRatio : 4 / 3, borderRadius: 16, overflow: "hidden", backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderStyle: "dashed", justifyContent: "center", alignItems: "center" }}>
            {photo ? (
              <Image
                source={{ uri: photo.uri }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                onLoad={(e) => {
                  const { width, height } = e.source;
                  if (width && height) setPreviewRatio(Math.min(1.8, Math.max(0.6, width / height))); // mostra a foto inteira, sem cortar
                }}
              />
            ) : (
              <>
                <Text style={{ fontSize: 40 }}>📷</Text>
                <Text style={{ color: C.text, fontWeight: "700", marginTop: 8 }}>Toque para enviar a foto do carro ou da roda</Text>
                <Text style={{ color: C.muted, marginTop: 4, fontSize: 13 }}>Pode ser em pé ou deitada. A roda bem visível.</Text>
              </>
            )}
          </Pressable>

          <View style={{ marginTop: 20 }}>
            <Label>Cor da roda</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {COLORS.map(([n, hex]) => (
                <Chip key={n} label={n} dot={hex} active={color === n} onPress={() => setColor(n)} />
              ))}
            </View>
            <Input value={color} onChangeText={setColor} placeholder="Ou descreva: azul petróleo, #ff0066…" />

            <Label>Acabamento</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
              {FINISHES.map((f) => (
                <Chip key={f} label={f} active={finish === f} onPress={() => setFinish(finish === f ? "" : f)} />
              ))}
            </View>

            <Input
              label="Detalhes (opcional)"
              value={details}
              onChangeText={setDetails}
              placeholder="Ex.: borda do aro vermelha, miolo preto"
              multiline
              style={{ minHeight: 96, textAlignVertical: "top" }}
              onFocus={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 350)} // garante que o texto fique visível acima do teclado
            />
          </View>

          {err ? <Notice text={err.refused ? `🚫 ${err.text}` : err.text} kind={err.refused ? "info" : "error"} /> : null}
          {noCredits ? (
            <Btn label="Seus créditos acabaram · Ver planos" onPress={() => router.push("/plans")} style={{ marginTop: 8 }} />
          ) : (
            <Btn label={busy ? "Pintando as rodas…" : "Gerar rodas pintadas"} onPress={generate} loading={busy} disabled={!photo || !color.trim()} style={{ marginTop: 8 }} />
          )}
          {busy ? <Text style={{ color: C.muted, textAlign: "center", marginTop: 10 }}>Isso pode levar até 1 minuto.</Text> : null}
        </>
      )}
    </ScrollView>
  );
}
