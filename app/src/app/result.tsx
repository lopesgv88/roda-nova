import { router, useLocalSearchParams } from "expo-router";
import { Alert, ScrollView, Text, View } from "react-native";
import { BeforeAfter } from "../components/BeforeAfter";
import { Btn } from "../components/ui";
import { api, fileUrl } from "../lib/api";
import { saveToGallery, shareImage } from "../lib/share";
import { C } from "../lib/theme";

/** Detalhe de uma imagem do histórico: compara antes/depois, salva, compartilha ou apaga. */
export default function Result() {
  const p = useLocalSearchParams<{ id: string; beforeUrl: string; afterUrl: string; beforeFile: string; afterFile: string; color?: string }>();

  const remove = () =>
    Alert.alert("Apagar do histórico", "Essa imagem será apagada. Se ela estiver na sua biblioteca, continua lá.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Apagar", style: "destructive", onPress: () => api.deleteHistory(Number(p.id)).then(() => router.back()).catch((e) => Alert.alert(e.message)) },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
      <View style={{ marginHorizontal: -16 }}>
        <BeforeAfter before={fileUrl(p.beforeUrl)} after={fileUrl(p.afterUrl)} rounded={false} />
      </View>
      <Text style={{ color: C.muted, textAlign: "center" }}>{p.color ? `Roda ${p.color} · ` : ""}arraste a barra para comparar</Text>
      <Btn
        label="Salvar na biblioteca"
        onPress={() => router.push({ pathname: "/add", params: { beforeFile: p.beforeFile, afterFile: p.afterFile, beforeUrl: p.beforeUrl, afterUrl: p.afterUrl, color: p.color ?? "" } })}
      />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Btn kind="ghost" label="Salvar na galeria" onPress={() => saveToGallery(p.afterUrl)} style={{ flex: 1 }} />
        <Btn kind="ghost" label="Compartilhar" onPress={() => shareImage(p.afterUrl)} style={{ flex: 1 }} />
      </View>
      <Btn kind="danger" label="Apagar do histórico" onPress={remove} style={{ marginTop: 6 }} />
    </ScrollView>
  );
}
