import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Easing, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { ART_CAN, ART_PAINTED_WHEEL, ART_STEEL_WHEEL } from "./art";

const { width: SW, height: SH } = Dimensions.get("window");
const MIN_MS = 2800; // tempo mínimo da abertura
const BAR_W = Math.min(SW * 0.72, 320);

// Cena: lata de spray à esquerda, roda à direita sendo pintada da esquerda para a direita.
const SCENE_W = Math.min(SW - 32, 380);
const D = Math.min(SCENE_W * 0.6, 216); // diâmetro da roda
const SCENE_H = D + 36;
const WHEEL_L = SCENE_W - D - 6;
const WHEEL_T = 18;
const CAN_H = 118;
const CAN_W = CAN_H * (200 / 480);
const CAN_CX = 40;
const CAN_CY = WHEEL_T + D / 2 + 4;
const TIP_X = CAN_CX + (CAN_H / 2 - (46 / 480) * CAN_H); // ponta do bico (lata girada ~90°)
const TIP_Y = CAN_CY;

const SHADES = ["#ffb066", "#ff8a3d", "#ff6a1f", "#ff5a14", "#e04a00"];
const MIST = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="m"><stop offset="0" stop-color="#ff8a3d" stop-opacity="0.85"/><stop offset="1" stop-color="#ff6a1f" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#m)"/></svg>`;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type P = { size: number; delay: number; dur: number; dx: number; dy: number; arc: number; color: string };

/** Uma gota/pó de tinta: sai do bico, voa até a roda e "espalha" ao bater. */
function Particle({ p }: { p: P }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(p.delay),
        Animated.timing(t, { toValue: 1, duration: p.dur, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [p, t]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: TIP_X - p.size / 2,
        top: TIP_Y - p.size / 2,
        width: p.size,
        height: p.size,
        borderRadius: p.size / 2,
        backgroundColor: p.color,
        opacity: t.interpolate({ inputRange: [0, 0.06, 0.78, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
          { translateY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, p.dy * 0.5 + p.arc, p.dy] }) },
          { scale: t.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0.4, 1, 1, 2.1] }) }, // vira "respingo" ao bater
        ],
      }}
    />
  );
}

/**
 * Abertura do app: uma lata de spray pinta a roda com pó de tinta laranja enquanto a barra carrega.
 * Fundo cinza em degradê que se move, barra laranja brilhante. Some sozinha quando o app está pronto.
 */
export function Intro({ ready, onFinish }: { ready: boolean; onFinish: () => void }) {
  const drift = useRef(new Animated.Value(0)).current; // fundo em movimento
  const warm = useRef(new Animated.Value(0)).current; // brilho quente pulsando
  const spin = useRef(new Animated.Value(0)).current; // roda girando devagar
  const shake = useRef(new Animated.Value(0)).current; // lata balançando
  const puff = useRef(new Animated.Value(0)).current; // nuvem no bico
  const appear = useRef(new Animated.Value(0)).current; // entrada
  const progress = useRef(new Animated.Value(0)).current; // tinta/barra 0..1
  const shine = useRef(new Animated.Value(0)).current; // reflexo na barra
  const fade = useRef(new Animated.Value(1)).current; // saída
  const [minElapsed, setMinElapsed] = useState(false);
  const finished = useRef(false);

  const particles = useMemo<P[]>(() => {
    const r = rng(23);
    return Array.from({ length: 34 }, (_, i) => ({
      size: 3 + r() * 8,
      delay: r() * 900,
      dur: 480 + r() * 520,
      dx: WHEEL_L + D * (0.04 + r() * 0.92) - TIP_X,
      dy: WHEEL_T + D * (0.08 + r() * 0.84) - TIP_Y,
      arc: (r() - 0.5) * 36,
      color: SHADES[i % SHADES.length],
    }));
  }, []);

  useEffect(() => {
    const loop = (v: Animated.Value, ms: number, easing = Easing.linear) =>
      Animated.loop(Animated.timing(v, { toValue: 1, duration: ms, easing, useNativeDriver: true })).start();
    loop(drift, 9000);
    loop(spin, 9000);
    loop(shine, 1300, Easing.inOut(Easing.quad));
    Animated.loop(
      Animated.sequence([
        Animated.timing(warm, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(warm, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 90, useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(puff, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(puff, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
    Animated.timing(appear, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // a tinta sobe rápido no começo e desacelera, até ~92%
    Animated.timing(progress, { toValue: 0.92, duration: MIN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    const t = setTimeout(() => setMinElapsed(true), MIN_MS);
    return () => clearTimeout(t);
  }, [drift, spin, shine, warm, shake, puff, appear, progress]);

  useEffect(() => {
    if (!ready || !minElapsed || finished.current) return;
    finished.current = true;
    Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.delay(160),
      Animated.timing(fade, { toValue: 0, duration: 380, useNativeDriver: true }),
    ]).start(() => onFinish());
  }, [ready, minElapsed, progress, fade, onFinish]);

  const bgX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -SW] });
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const revealW = progress.interpolate({ inputRange: [0, 1], outputRange: [0, D] });
  const frontL = progress.interpolate({ inputRange: [0, 1], outputRange: [WHEEL_L - 18, WHEEL_L + D - 18] });
  const frontOpacity = progress.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0] });
  const barWidth = progress.interpolate({ inputRange: [0, 1], outputRange: [0, BAR_W] });
  const shineX = shine.interpolate({ inputRange: [0, 1], outputRange: [-70, BAR_W] });
  const canRot = shake.interpolate({ inputRange: [0, 1], outputRange: ["86deg", "93deg"] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, s.root, { opacity: fade }]} pointerEvents="auto">
      {/* Fundo cinza em degradê que desliza (período = SW, então o laço é contínuo) */}
      <Animated.View style={[s.bgMove, { transform: [{ translateX: bgX }] }]}>
        <LinearGradient
          colors={["#1c1c21", "#44444d", "#1c1c21", "#44444d", "#1c1c21", "#44444d", "#1c1c21"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <LinearGradient colors={["rgba(10,10,13,0.15)", "rgba(10,10,13,0.55)", "rgba(10,10,13,0.92)"]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: warm.interpolate({ inputRange: [0, 1], outputRange: [0, 0.55] }) }]} pointerEvents="none">
        <LinearGradient colors={["rgba(255,106,31,0)", "rgba(255,106,31,0.16)"]} start={{ x: 0.5, y: 0.35 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <View style={s.center}>
        {/* Cena: lata + jato + roda sendo pintada */}
        <Animated.View style={{ width: SCENE_W, height: SCENE_H, opacity: appear, transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }}>
          {/* roda de aço (embaixo) */}
          <Animated.View style={{ position: "absolute", left: WHEEL_L, top: WHEEL_T, width: D, height: D, transform: [{ rotate }] }}>
            <SvgXml xml={ART_STEEL_WHEEL} width={D} height={D} />
          </Animated.View>
          {/* roda pintada de laranja, revelada da esquerda para a direita */}
          <Animated.View style={{ position: "absolute", left: WHEEL_L, top: WHEEL_T, width: revealW, height: D, overflow: "hidden" }}>
            <Animated.View style={{ position: "absolute", left: 0, top: 0, width: D, height: D, transform: [{ rotate }] }}>
              <SvgXml xml={ART_PAINTED_WHEEL} width={D} height={D} />
            </Animated.View>
          </Animated.View>
          {/* brilho da tinta fresca na frente da pintura */}
          <Animated.View pointerEvents="none" style={{ position: "absolute", top: WHEEL_T, width: 36, height: D, left: frontL, opacity: frontOpacity }}>
            <LinearGradient colors={["rgba(255,138,61,0)", "rgba(255,176,102,0.6)", "rgba(255,138,61,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>

          {/* pó de tinta voando do bico até a roda */}
          {particles.map((p, i) => (
            <Particle key={i} p={p} />
          ))}

          {/* nuvem de tinta saindo do bico */}
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute", left: TIP_X - 6, top: TIP_Y - 24, width: 56, height: 48,
              opacity: puff.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.95] }),
              transform: [{ scale: puff.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.25] }) }],
            }}
          >
            <SvgXml xml={MIST} width={56} height={48} />
          </Animated.View>

          {/* lata de spray (balança de leve) */}
          <Animated.View style={{ position: "absolute", left: CAN_CX - CAN_W / 2, top: CAN_CY - CAN_H / 2, width: CAN_W, height: CAN_H, transform: [{ rotate: canRot }] }}>
            <SvgXml xml={ART_CAN} width={CAN_W} height={CAN_H} />
          </Animated.View>
        </Animated.View>

        <Animated.View style={{ opacity: appear, alignItems: "center", marginTop: 14 }}>
          <Text style={s.title}>
            Roda <Text style={s.titleOrange}>Nova</Text>
          </Text>
          <Text style={s.tag}>Sua roda transformada na hora</Text>
        </Animated.View>
      </View>

      {/* Barra de carregamento laranja brilhante */}
      <View style={s.barWrap}>
        <View style={[s.track, { width: BAR_W }]}>
          <Animated.View style={[s.glow, { width: barWidth, height: 30, top: -10, borderRadius: 15, opacity: 0.14 }]} />
          <Animated.View style={[s.glow, { width: barWidth, height: 20, top: -5, borderRadius: 10, opacity: 0.22 }]} />
          <Animated.View style={[s.fillClip, { width: barWidth }]}>
            <LinearGradient colors={["#ffb066", "#ff6a1f", "#ff4d00"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <Animated.View style={[s.shine, { transform: [{ translateX: shineX }] }]}>
              <LinearGradient colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.65)", "rgba(255,255,255,0)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          </Animated.View>
        </View>
        <Text style={s.loading}>Pintando…</Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: { backgroundColor: "#16161b", zIndex: 100, elevation: 100 },
  bgMove: { position: "absolute", top: 0, left: 0, width: SW * 3, height: SH },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 90 },
  title: { color: "#f3f3f6", fontSize: 42, fontWeight: "900", letterSpacing: -1 },
  titleOrange: { color: "#ff6a1f" },
  tag: { color: "#a4a4b2", fontSize: 16, marginTop: 6, letterSpacing: 0.3 },
  barWrap: { position: "absolute", left: 0, right: 0, bottom: Math.max(64, SH * 0.09), alignItems: "center" },
  track: { height: 10, borderRadius: 5, backgroundColor: "rgba(255,255,255,0.12)", justifyContent: "center" },
  glow: { position: "absolute", left: 0, backgroundColor: "#ff6a1f" },
  fillClip: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 5, overflow: "hidden" },
  shine: { position: "absolute", top: 0, bottom: 0, width: 70 },
  loading: { color: "#8d8da0", fontSize: 13, marginTop: 16, letterSpacing: 0.5 },
});
