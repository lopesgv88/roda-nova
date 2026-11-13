import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { api, fileUrl, type HistoryItem } from "../../lib/api";
import { C } from "../../lib/theme";

/** Últimas imagens geradas (mesmo as que não foram salvas na biblioteca). */
export default function History() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [err, setErr] = useState("");

  useFocusEffect(
    useCallback(() => {
      api.history().then((r) => { setItems(r); setErr(""); }).catch((e) => setErr(e.message));
    }, []),
  );

  return (
    <View style={{ flex: 1 }}>
      {items === null && !err ? <ActivityIndicator color={C.accent} style={{ marginTop: 40 }} /> : null}
      {err ? <Text style={{ color: C.danger, padding: 16 }}>{err}</Text> : null}
      <FlatList
        data={items ?? []}
        numColumns={2}
        keyExtractor={(g) => String(g.id)}
        contentContainerStyle={{ padding: 12, paddingBottom: 40, flexGrow: 1 }}
        columnWrapperStyle={{ gap: 12 }}
        ListEmptyComponent={
          items ? (
            <Text style={{ color: C.muted, textAlign: "center", marginTop: 60, lineHeight: 22 }}>
              Nenhuma imagem ainda.{"\n"}As rodas que você gerar no Estúdio aparecem aqui.
            </Text>
          ) : (
            <View />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/result",
                params: { id: String(item.id), beforeUrl: item.beforeUrl, afterUrl: item.afterUrl, beforeFile: item.beforeFile, afterFile: item.afterFile, color: [item.color, item.finish].filter(Boolean).join(" ") },
              })
            }
            style={{ flex: 1, marginBottom: 12, backgroundColor: C.card, borderRadius: 14, overflow: "hidden" }}
          >
            <Image source={{ uri: fileUrl(item.afterUrl) }} style={{ aspectRatio: 1 }} contentFit="cover" />
            <View style={{ padding: 10 }}>
              <Text style={{ color: C.text, fontWeight: "700" }} numberOfLines={1}>{[item.color, item.finish].filter(Boolean).join(" · ") || "Roda"}</Text>
              <Text style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{new Date(item.createdAt.replace(" ", "T") + "Z").toLocaleDateString("pt-BR")}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
