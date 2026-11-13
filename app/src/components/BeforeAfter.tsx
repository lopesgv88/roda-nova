import { Image } from "expo-image";
import { useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import { C } from "../lib/theme";

/**
 * Slider antes/depois: arraste a barra para comparar.
 * - Ocupa a largura toda (o pai pode "sangrar" até as bordas da tela com marginHorizontal negativa).
 * - O formato segue a própria imagem (sem cortar); enquanto carrega, usa 4:3.
 */
export function BeforeAfter({ before, after, ratio = 4 / 3, rounded = true }: { before: string; after: string; ratio?: number; rounded?: boolean }) {
  const [w, setW] = useState(0);
  const [x, setX] = useState(0.5);
  const [real, setReal] = useState<number | null>(null);
  const wRef = useRef(0);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => wRef.current && setX(clamp(e.nativeEvent.locationX / wRef.current)),
      onPanResponderMove: (e) => wRef.current && setX(clamp(e.nativeEvent.locationX / wRef.current)),
    }),
  ).current;

  // limita para não ficar altíssima nem achatada demais
  const aspect = Math.min(1.8, Math.max(0.6, real ?? ratio)); // aceita foto em pé (3:4) sem cortar

  return (
    <View
      style={[s.box, { aspectRatio: aspect }, !rounded && { borderRadius: 0 }]}
      onLayout={(e) => {
        wRef.current = e.nativeEvent.layout.width;
        setW(e.nativeEvent.layout.width);
      }}
      {...pan.panHandlers}
    >
      <Image
        source={{ uri: after }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        pointerEvents="none"
        onLoad={(e) => {
          const { width, height } = e.source;
          if (width && height) setReal(width / height);
        }}
      />
      <View style={[StyleSheet.absoluteFill, { width: w * x, overflow: "hidden" }]} pointerEvents="none">
        <Image source={{ uri: before }} style={{ width: w, height: "100%" }} contentFit="cover" />
      </View>
      <View style={[s.bar, { left: w * x - 1 }]} pointerEvents="none">
        <View style={s.knob}><Text style={{ color: "#000", fontWeight: "800" }}>⇆</Text></View>
      </View>
      <Text style={[s.tag, { left: 10 }]}>ANTES</Text>
      <Text style={[s.tag, { right: 10 }]}>DEPOIS</Text>
    </View>
  );
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

const s = StyleSheet.create({
  box: { width: "100%", borderRadius: 16, overflow: "hidden", backgroundColor: C.card },
  bar: { position: "absolute", top: 0, bottom: 0, width: 2, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" },
  knob: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  tag: { position: "absolute", top: 12, backgroundColor: "#000a", color: "#fff", fontSize: 12, fontWeight: "700", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, overflow: "hidden" },
});
