import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { Btn } from "../../components/ui";
import { api, fileUrl, type Entry, type Parsed } from "../../lib/api";
import { C } from "../../lib/theme";
import { useVoice } from "../../lib/useVoice";

const DOT: Record<string, string> = {
  preto: "#111", cinza: "#7a7d82", prata: "#c0c3c8", branco: "#f5f5f5", vermelho: "#d11f2a", azul: "#1f5fd1",
  verde: "#1f8a4c", amarelo: "#e6c619", laranja: "#f0711f", dourado: "#d4a634", bronze: "#8c5a2b", rosa: "#e86aa6",
  roxo: "#7a3fd1", marrom: "#6b4226", bege: "#d9c7a3", champagne: "#e8d9b5", cobre: "#b87333",
};

export default function Library() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Entry[] | null>(null);
  const [parsed, setParsed] = useState<Parsed>({});
  const [err, setErr] = useState("");
  const seq = useRef(0);

  const load = useCallback(async (query: string) => {
    const my = ++seq.current;
    try {
      const r = await api.entries(query);
      if (my === seq.current) {
        setItems(r);
        setErr("");
      }
    } catch (e: any) {
      if (my === seq.current) setErr(e.message);
    }
  }, []);

  useFocusEffect(useCallback(() => void load(q), [load, q]));
  useEffect(() => {
    const t = setTimeout(() => {
      void load(q);
      // o que a IA entendeu da frase: carro, ano e cor selecionados
      if (q.trim()) api.parse(q).then(setParsed).catch(() => setParsed({}));
      else setParsed({});
    }, 250);
    return () => clearTimeout(t);
  }, [q, load]);

  // "corolla roda preta" -> filtra Toyota Corolla com roda preta
  const voice = useVoice(useCallback((r) => setQ(r.text.replace(/[.!?]+$/, "")), []));

  const removeChip = (key: "car" | "year" | "color") => {
    const p = { ...parsed };
    if (key === "car") { delete p.make; delete p.model; }
    else delete p[key];
    setQ([p.make, p.model, p.year, p.color && `roda ${p.color}`].filter(Boolean).join(" "));
  };

  const chips: Array<{ key: "car" | "year" | "color"; label: string; dot?: string }> = [];
  if (parsed.model || parsed.make) chips.push({ key: "car", label: [parsed.make, parsed.model].filter(Boolean).join(" ") });
  if (parsed.year) chips.push({ key: "year", label: String(parsed.year) });
  if (parsed.color) chips.push({ key: "color", label: `Roda ${parsed.color}`, dot: DOT[parsed.color] });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 }}>
          <Ionicons name="search" size={18} color={C.muted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder='Ex.: "Opala roda cinza" ou "Civic 2018"'
            placeholderTextColor={C.muted}
            style={{ flex: 1, color: C.text, fontSize: 16, paddingVertical: 14, paddingHorizontal: 8 }}
            returnKeyType="search"
          />
          {q ? <Ionicons name="close-circle" size={20} color={C.muted} onPress={() => setQ("")} /> : null}
        </View>

        {chips.length > 0 ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {chips.map((c) => (
              <Pressable key={c.key} onPress={() => removeChip(c.key)} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#2a1710", borderWidth: 1, borderColor: C.accent }}>
                {c.dot ? <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c.dot, borderWidth: 1, borderColor: "#ffffff66" }} /> : null}
                <Text style={{ color: C.accent, fontWeight: "600" }}>{c.label}</Text>
                <Ionicons name="close" size={14} color={C.accent} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {voice.listening ? <Text style={{ color: C.accent, marginTop: 10 }}>Ouvindo… diga o carro e a cor da roda (para sozinho quando você terminar)</Text> : null}
        {voice.processing ? <Text style={{ color: C.muted, marginTop: 10 }}>Entendendo o que você disse…</Text> : null}
        {voice.error ? <Text style={{ color: C.danger, marginTop: 10 }}>{voice.error}</Text> : null}
      </View>

      {items === null && !err ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : null}
      {err ? <Text style={{ color: C.danger, padding: 16 }}>{err}</Text> : null}

      <FlatList
        data={items ?? []}
        numColumns={2}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 170, flexGrow: 1 }}
        columnWrapperStyle={{ gap: 12 }}
        ListEmptyComponent={
          items ? (
            <Text style={{ color: C.muted, textAlign: "center", marginTop: 50, lineHeight: 22 }}>
              {q ? `Nada encontrado para "${q}".` : "Sua biblioteca está vazia.\nAdicione as rodas que você já fez."}
            </Text>
          ) : (
            <View />
          )
        }
        renderItem={({ item }) => {
          const cover = item.photos.find((p) => p.kind === "after") ?? item.photos[0];
          return (
            <Pressable onPress={() => router.push(`/entry/${item.id}`)} style={{ flex: 1, marginBottom: 12, backgroundColor: C.card, borderRadius: 14, overflow: "hidden" }}>
              {cover ? <Image source={{ uri: fileUrl(cover.url) }} style={{ aspectRatio: 1 }} contentFit="cover" /> : null}
              <View style={{ padding: 10 }}>
                <Text style={{ color: C.text, fontWeight: "700" }} numberOfLines={1}>{item.make} {item.model}</Text>
                <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{[item.year, item.color].filter(Boolean).join(" · ")}</Text>
              </View>
            </Pressable>
          );
        }}
      />

      {/* Microfone flutuante, acima do botão de adicionar */}
      <Pressable
        onPress={voice.listening ? voice.stop : voice.start}
        disabled={voice.processing}
        accessibilityLabel="Buscar por voz"
        style={{
          position: "absolute", right: 20, bottom: 94, width: 62, height: 62, borderRadius: 31,
          alignItems: "center", justifyContent: "center",
          backgroundColor: voice.listening ? C.danger : C.accent, opacity: voice.processing ? 0.6 : 1,
          elevation: 8, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
        }}
      >
        {voice.processing ? <ActivityIndicator color="#fff" /> : <Ionicons name={voice.listening ? "stop" : "mic"} size={28} color="#fff" />}
      </Pressable>
      <View style={{ position: "absolute", left: 16, right: 16, bottom: 16 }}>
        <Btn label="+ Adicionar roda feita" onPress={() => router.push("/add")} />
      </View>
    </View>
  );
}
