import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Btn, Chip, Input, Label, Notice } from "../components/ui";
import { api, fileUrl, type LocalImage } from "../lib/api";
import { fromCamera, fromGallery } from "../lib/pick";
import { C } from "../lib/theme";

/** Adiciona uma roda já feita na biblioteca. Também recebe o resultado da IA via params. */
export default function Add() {
  const p = useLocalSearchParams<{ beforeFile?: string; afterFile?: string; beforeUrl?: string; afterUrl?: string; color?: string }>();
  const [car, setCar] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState(p.color ?? "");
  const [notes, setNotes] = useState("");
  const [before, setBefore] = useState<LocalImage | null>(null);
  const [after, setAfter] = useState<LocalImage | null>(null);
  const [others, setOthers] = useState<LocalImage[]>([]);
  const [sugg, setSugg] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const fromAI = !!p.afterFile;

  useEffect(() => {
    if (make && `${make} ${model}` === car) return setSugg([]);
    if (car.trim().length < 2) return setSugg([]);
    const t = setTimeout(() => api.suggest(car).then((r) => setSugg(r.items)).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [car, make, model]);

  const choose = (s: string) => {
    const [mk, ...rest] = s.split(" ");
    // marcas com nome composto ("Mercedes-Benz") têm hífen, então o 1º token basta
    setMake(mk);
    setModel(rest.join(" "));
    setCar(s);
    setSugg([]);
  };

  const pickFor = async (set: (i: LocalImage) => void) => {
    const g = await fromGallery();
    if (g[0]) set(g[0]);
  };

  const hasPhoto = fromAI || before || after || others.length > 0;

  const save = async () => {
    setErr("");
    setBusy(true);
    try {
      let mk = make, md = model, y = year, col = color;
      if (!mk || !md) {
        // texto livre: tenta entender "civic 2018 preto"
        const parsed = await api.parse(car);
        mk = parsed.make ?? car.trim().split(" ")[0];
        md = parsed.model ?? car.trim().split(" ").slice(1).join(" ");
        if (!y && parsed.year) y = String(parsed.year);
        if (!col && parsed.color) col = parsed.color;
      }
      if (!mk || !md) throw new Error("Informe o modelo do carro (ex.: Honda Civic).");
      await api.saveEntry({
        make: mk, model: md, year: y, color: col, notes,
        before: before ?? undefined, after: after ?? undefined, others,
        beforeFile: p.beforeFile, afterFile: p.afterFile,
      });
      router.dismissTo("/library");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const Slot = ({ label, img, onPress }: { label: string; img: LocalImage | null; onPress: () => void }) => (
    <Pressable onPress={onPress} style={{ flex: 1, aspectRatio: 1, borderRadius: 14, overflow: "hidden", backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center" }}>
      {img ? <Image source={{ uri: img.uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <Text style={{ color: C.muted }}>+ {label}</Text>}
    </Pressable>
  );

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
    >
      {fromAI ? (
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          <Image source={{ uri: fileUrl(p.beforeUrl!) }} style={{ flex: 1, aspectRatio: 1, borderRadius: 14 }} contentFit="cover" />
          <Image source={{ uri: fileUrl(p.afterUrl!) }} style={{ flex: 1, aspectRatio: 1, borderRadius: 14 }} contentFit="cover" />
        </View>
      ) : (
        <>
          <Label>Fotos</Label>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
            <Slot label="Antes" img={before} onPress={() => pickFor(setBefore)} />
            <Slot label="Depois" img={after} onPress={() => pickFor(setAfter)} />
          </View>
          <Label>Outras fotos desse carro</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {others.map((o, i) => (
              <Pressable key={i} onPress={() => setOthers(others.filter((_, j) => j !== i))}>
                <Image source={{ uri: o.uri }} style={{ width: 72, height: 72, borderRadius: 10 }} />
              </Pressable>
            ))}
            <Pressable onPress={async () => setOthers([...others, ...(await fromGallery(true))])} style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: C.muted, fontSize: 26 }}>+</Text>
            </Pressable>
            <Pressable onPress={async () => { const c = await fromCamera(); if (c) setOthers([...others, c]); }} style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: C.card, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 22 }}>📷</Text>
            </Pressable>
          </View>
        </>
      )}

      <Input label="Qual é o carro? (modelo)" value={car} onChangeText={(t) => { setCar(t); setMake(""); setModel(""); }} placeholder="Ex.: Honda Civic" autoCapitalize="words" />
      {sugg.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: -6, marginBottom: 14 }}>
          {sugg.map((s) => <Chip key={s} label={s} onPress={() => choose(s)} />)}
        </View>
      ) : null}
      <Input label="Ano" value={year} onChangeText={setYear} keyboardType="number-pad" maxLength={4} placeholder="Ex.: 2018" />
      <Input label="Cor que a roda foi pintada" value={color} onChangeText={setColor} placeholder="Ex.: preto fosco" />
      <Input label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 90, textAlignVertical: "top" }} />

      {err ? <Notice text={err} /> : null}
      <Btn label="Salvar na biblioteca" onPress={save} loading={busy} disabled={!hasPhoto || !car.trim()} />
    </ScrollView>
  );
}
