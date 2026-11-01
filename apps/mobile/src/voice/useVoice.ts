import { useI18n } from "@xiaoban/i18n/react";
import * as Haptics from "expo-haptics";
import {
  type ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard } from "react-native";
import { useReduceMotion } from "../ui/useReduceMotion.ts";

export type VoicePhase = "idle" | "holding" | "cancel" | "finishing";

export const WAVE_BARS = 14;
const CANCEL_DISTANCE = 64;
const FINISH_WAIT = 15000;
const NOTE_TIME = 2400;
const QUIET = Array.from({ length: WAVE_BARS }, () => 0);
const RESTING = Array.from({ length: WAVE_BARS }, (_, index) => 0.25 + ((index * 7) % 5) * 0.12);

let owner: symbol | null = null;

function recognitionAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
}

function levelOf(value: number): number {
  return Math.max(0, Math.min(1, value / 10));
}

export type Voice = ReturnType<typeof useVoice>;

export function useVoice(onText: (text: string) => void) {
  const { t, locale } = useI18n();
  const reduced = useReduceMotion();
  const [available] = useState(recognitionAvailable);
  const [mode, setMode] = useState<"typing" | "voice">("typing");
  const [phase, setPhaseState] = useState<VoicePhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [levels, setLevels] = useState<number[]>(QUIET);
  const [note, setNote] = useState<string | null>(null);
  const [fixable, setFixable] = useState(false);
  const id = useRef(Symbol("voice")).current;
  const phaseRef = useRef<VoicePhase>("idle");
  const committed = useRef("");
  const partial = useRef("");
  const ended = useRef(false);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deliverRef = useRef(onText);
  deliverRef.current = onText;

  const setPhase = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const flash = useCallback((text: string, fix = false) => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    setNote(text);
    setFixable(fix);
    noteTimer.current = setTimeout(
      () => {
        setNote(null);
        setFixable(false);
      },
      fix ? NOTE_TIME * 4 : NOTE_TIME,
    );
  }, []);

  const reset = useCallback(() => {
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = null;
    if (owner === id) owner = null;
    committed.current = "";
    partial.current = "";
    ended.current = false;
    setTranscript("");
    setLevels(QUIET);
    setPhase("idle");
  }, [id, setPhase]);

  const deliver = useCallback(() => {
    const text = `${committed.current}${partial.current}`.trim();
    reset();
    if (text) deliverRef.current(text);
    else flash(t("voice-empty"));
  }, [flash, reset, t]);

  useEffect(() => {
    if (!available) return;
    const mine = () => owner === id && phaseRef.current !== "idle";
    const subscriptions = [
      ExpoSpeechRecognitionModule.addListener(
        "result",
        (event: ExpoSpeechRecognitionResultEvent) => {
          if (!mine()) return;
          const text = event.results[0]?.transcript ?? "";
          if (event.isFinal) {
            committed.current = `${committed.current}${text}`;
            partial.current = "";
          } else {
            partial.current = text;
          }
          setTranscript(`${committed.current}${partial.current}`);
          if (event.isFinal && phaseRef.current === "finishing") deliver();
        },
      ),
      ExpoSpeechRecognitionModule.addListener("start", () => {
        if (!mine()) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      }),
      ExpoSpeechRecognitionModule.addListener("volumechange", (event: { value: number }) => {
        if (!mine() || phaseRef.current === "finishing") return;
        setLevels((previous) => [...previous.slice(1), levelOf(event.value)]);
      }),
      ExpoSpeechRecognitionModule.addListener("end", () => {
        if (!mine()) return;
        ended.current = true;
        if (phaseRef.current === "finishing") deliver();
      }),
      ExpoSpeechRecognitionModule.addListener("error", (event: ExpoSpeechRecognitionErrorEvent) => {
        if (!mine() || event.error === "aborted") return;
        if (event.error === "service-not-allowed") {
          reset();
          setMode("typing");
          flash(t("voice-service-mic"), true);
          return;
        }
        if (event.error === "not-allowed") {
          reset();
          setMode("typing");
          flash(t("voice-denied-microphone"));
          return;
        }
        ended.current = true;
        if (phaseRef.current === "finishing") deliver();
      }),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
    };
  }, [available, deliver, flash, id, reset, t]);

  useEffect(
    () => () => {
      if (noteTimer.current) clearTimeout(noteTimer.current);
      if (finishTimer.current) clearTimeout(finishTimer.current);
      if (owner === id) {
        owner = null;
        ExpoSpeechRecognitionModule.abort();
      }
    },
    [id],
  );

  const enterVoice = useCallback(async () => {
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        flash(t("voice-denied-microphone"));
        return;
      }
    } catch {
      flash(t("voice-denied-microphone"));
      return;
    }
    Keyboard.dismiss();
    setNote(null);
    setMode("voice");
  }, [flash, t]);

  const enterTyping = useCallback(() => {
    if (phaseRef.current !== "idle") return;
    setMode("typing");
  }, []);

  const begin = useCallback(() => {
    if (phaseRef.current !== "idle" || (owner !== null && owner !== id)) return;
    owner = id;
    committed.current = "";
    partial.current = "";
    ended.current = false;
    setTranscript("");
    setLevels(QUIET);
    setNote(null);
    setPhase("holding");
    try {
      ExpoSpeechRecognitionModule.start({
        lang: locale === "zh-CN" ? "zh-CN" : "en-US",
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
        volumeChangeEventOptions: { enabled: true, intervalMillis: 80 },
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 8000,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 8000,
        },
      });
    } catch {
      ended.current = true;
    }
  }, [id, locale, setPhase]);

  const move = useCallback(
    (dy: number) => {
      const current = phaseRef.current;
      if (current !== "holding" && current !== "cancel") return;
      const next = dy < -CANCEL_DISTANCE ? "cancel" : "holding";
      if (next !== current) setPhase(next);
    },
    [setPhase],
  );

  const release = useCallback(() => {
    const current = phaseRef.current;
    if (current === "cancel") {
      ExpoSpeechRecognitionModule.abort();
      reset();
      return;
    }
    if (current !== "holding") return;
    if (ended.current) {
      deliver();
      return;
    }
    setPhase("finishing");
    ExpoSpeechRecognitionModule.stop();
    finishTimer.current = setTimeout(deliver, FINISH_WAIT);
  }, [deliver, reset, setPhase]);

  const abandon = useCallback(() => {
    const current = phaseRef.current;
    if (current !== "holding" && current !== "cancel") return;
    ExpoSpeechRecognitionModule.abort();
    reset();
  }, [reset]);

  return {
    available,
    mode,
    phase,
    transcript,
    levels: reduced ? RESTING : levels,
    note,
    fixable,
    enterVoice,
    enterTyping,
    begin,
    move,
    release,
    abandon,
  };
}
