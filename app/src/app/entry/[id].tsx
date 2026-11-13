import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { BeforeAfter } from "../../components/BeforeAfter";
import { Btn } from "../../components/ui";
import { api, fileUrl, type Entry } from "../../lib/api";
import { C } from "../../lib/theme";

export default function EntryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [e, setE] = useState<Entry | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.entry(Number(id)).then(setE).catch((x) => setErr(x.message));
  }, [id]);

  if (err) return <Text style={{ color: C.danger, padding: 16 }}>{err}</Text>;
  if (!e) return <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} />;

  const before = e.photos.find((p) => p.kind === "before");
  const after = e.photos.find((p) => p.kind === "after");
  const others = e.photos.filter((p) => p.kind === "other" || (!(before && after) && p !== before && p !== after));
  const single = !(before && after) ? e.photos.slice(0, 1) : [];

  const remove = () =>
    Alert.alert("Excluir", "Apagar esse carro e as fotos da biblioteca?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => api.deleteEntry(e.id).then(() => router.back()).catch((x) => Alert.alert(x.message)) },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
      <View>
        <Text style={{ color: C.text, fontSize: 24, fontWeight: "800" }}>{e.make} {e.model}</Text>
        <Text style={{ color: C.muted, marginTop: 4 }}>{[e.year, e.color && `Roda ${e.color}`].filter(Boolean).join(" · ")}</Text>
      </View>
      {before && after ? (
        <View style={{ marginHorizontal: -16 }}>
          <BeforeAfter before={fileUrl(before.url)} after={fileUrl(after.url)} rounded={false} />
        </View>
      ) : null}
      {single.map((p) => <Image key={p.id} source={{ uri: fileUrl(p.url) }} style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 16 }} contentFit="cover" />)}
      {e.notes ? <Text style={{ color: C.text, lineHeight: 22 }}>{e.notes}</Text> : null}
      {others.filter((p) => !single.includes(p)).length > 0 ? (
        <>
          <Text style={{ color: C.muted, fontWeight: "600" }}>Outras fotos</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {others.filter((p) => !single.includes(p)).map((p) => (
              <Image key={p.id} source={{ uri: fileUrl(p.url) }} style={{ width: "48.5%", aspectRatio: 1, borderRadius: 12 }} contentFit="cover" />
            ))}
          </View>
        </>
      ) : null}
      <Btn kind="danger" label="Excluir" onPress={remove} style={{ marginTop: 10 }} />
    </ScrollView>
  );
}
