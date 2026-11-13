import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioRecorder } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Voice } from "./api";

const POLL_MS = 120;
const CALIBRATE_MS = 400; // mede o ruído de fundo antes de começar a detectar a fala
const SPEECH_DB = 9; // fala = ruído de fundo + 9 dB
const SILENCE_AFTER_SPEECH_MS = 1200; // parou de falar -> busca sozinha
const NO_SPEECH_MS = 5000; // ninguém falou -> cancela
const MAX_MS = 10000; // limite de segurança

const OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };
const START_SOUND_MS = 360; // espera o "ding" acabar para o microfone não gravar o som

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Voz por gravação: grava, detecta o silêncio e para sozinho, manda para o servidor transcrever
 * e devolve texto + carro/ano/cor. Funciona no Expo Go.
 * Se o aparelho não informar o volume (metering), só vale o limite de tempo.
 */
export function useVoice(onResult: (r: Voice) => void) {
  const recorder = useAudioRecorder(OPTIONS);
  const startSound = useAudioPlayer(require("../../assets/sounds/start.wav"));
  const doneSound = useAudioPlayer(require("../../assets/sounds/done.wav"));
  const ding = (p: typeof startSound) => {
    try {
      p.seekTo(0);
      p.play();
    } catch {}
  };
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const active = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const clear = () => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  };

  /** send=false descarta a gravação (ninguém falou). */
  const finish = useCallback(
    async (send = true) => {
      if (!active.current) return;
      active.current = false;
      clear();
      setListening(false);
      try {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false });
        if (!send) return setError("Não ouvi nada. Toque no microfone e fale o carro e a cor da roda.");
        ding(doneSound); // "entendi, estou buscando"
        const uri = recorder.uri;
        if (!uri) throw new Error("Não consegui gravar. Tente de novo.");
        setProcessing(true);
        onResultRef.current(await api.transcribe(uri));
      } catch (e: any) {
        setError(e?.message ?? "Não consegui entender. Tente de novo.");
      } finally {
        setProcessing(false);
      }
    },
    [recorder, doneSound],
  );

  const start = useCallback(async () => {
    setError(null);
    try {
      const p = await requestRecordingPermissionsAsync();
      if (!p.granted) return setError("Permita o microfone nas configurações do celular.");
      // som de "pode falar" antes de abrir o microfone (toca mesmo com o celular no silencioso)
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      ding(startSound);
      await sleep(START_SOUND_MS);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      active.current = true;
      setListening(true);

      const t0 = Date.now();
      let noise: number[] = [];
      let floor = -50; // dB de ruído de fundo (calibrado nos primeiros 400ms)
      let heardMeter = false;
      let spoke = false;
      let lastLoud = t0;

      poll.current = setInterval(() => {
        const now = Date.now();
        const elapsed = now - t0;
        if (elapsed >= MAX_MS) return void finish(true);
        const m = recorder.getStatus().metering;
        if (typeof m !== "number") return;
        heardMeter = true;
        if (elapsed < CALIBRATE_MS) {
          noise.push(m);
          if (elapsed + POLL_MS >= CALIBRATE_MS && noise.length) floor = noise.reduce((a, b) => a + b, 0) / noise.length;
          return;
        }
        if (m > floor + SPEECH_DB) {
          spoke = true;
          lastLoud = now;
        }
        if (spoke && now - lastLoud >= SILENCE_AFTER_SPEECH_MS) void finish(true);
        else if (!spoke && heardMeter && elapsed >= NO_SPEECH_MS) void finish(false);
      }, POLL_MS);
    } catch {
      active.current = false;
      clear();
      setError("Não consegui usar o microfone.");
    }
  }, [recorder, finish, startSound]);

  useEffect(() => clear, []);

  return { listening, processing, error, start, stop: () => finish(true) };
}
