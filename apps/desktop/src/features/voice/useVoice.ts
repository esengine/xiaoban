import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

const BARS = 24;
const FINAL_WAIT_MS = 3000;

type StartOutcome = "listening" | "microphone_denied" | "speech_denied" | "unavailable";

export type VoiceBlock = "microphone" | "speech" | "unavailable";

export type VoiceState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "listening"; text: string; levels: number[]; startedAt: number }
  | { phase: "finishing"; text: string; levels: number[]; startedAt: number };

interface Transcript {
  text: string;
  done: boolean;
}

const quiet = () => Array.from({ length: BARS }, () => 0);

export function useVoice(language: string, onText: (text: string) => void) {
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState<VoiceState>({ phase: "idle" });
  const [blocked, setBlocked] = useState<VoiceBlock | null>(null);
  const latest = useRef("");
  const cancelled = useRef(false);
  const attempt = useRef(0);
  const phase = useRef<VoiceState["phase"]>("idle");
  const deliver = useRef(onText);
  deliver.current = onText;
  phase.current = state.phase;

  useEffect(() => {
    if (!isTauri()) return;
    void invoke<boolean>("voice_available").then(setAvailable);
  }, []);

  const settle = useCallback(() => {
    const text = latest.current.trim();
    latest.current = "";
    setState({ phase: "idle" });
    if (!cancelled.current && text) deliver.current(text);
  }, []);

  useEffect(() => {
    if (!available) return;
    const subscriptions = [
      listen<number>("voice://level", ({ payload }) =>
        setState((current) =>
          current.phase === "listening" || current.phase === "finishing"
            ? { ...current, levels: [...current.levels.slice(1), payload] }
            : current,
        ),
      ),
      listen<Transcript>("voice://transcript", ({ payload }) => {
        latest.current = payload.text;
        setState((current) =>
          current.phase === "listening" || current.phase === "finishing"
            ? { ...current, text: payload.text }
            : current,
        );
      }),
      listen("voice://ended", settle),
    ];
    return () => {
      for (const subscription of subscriptions) void subscription.then((stop) => stop());
    };
  }, [available, settle]);

  const start = useCallback(async () => {
    if (state.phase !== "idle") return;
    cancelled.current = false;
    latest.current = "";
    setBlocked(null);
    setState({ phase: "starting" });
    const outcome = await invoke<StartOutcome>("voice_start", { language });
    if (outcome === "listening") {
      setState({ phase: "listening", text: "", levels: quiet(), startedAt: Date.now() });
      return;
    }
    setState({ phase: "idle" });
    setBlocked(
      outcome === "microphone_denied"
        ? "microphone"
        : outcome === "speech_denied"
          ? "speech"
          : "unavailable",
    );
  }, [language, state.phase]);

  const finish = useCallback(() => {
    setState((current) =>
      current.phase === "listening" ? { ...current, phase: "finishing" } : current,
    );
    void invoke("voice_stop");
    const session = ++attempt.current;
    window.setTimeout(() => {
      if (attempt.current !== session || phase.current !== "finishing") return;
      settle();
      void invoke("voice_cancel");
    }, FINAL_WAIT_MS);
  }, [settle]);

  const cancel = useCallback(() => {
    cancelled.current = true;
    attempt.current += 1;
    latest.current = "";
    setState({ phase: "idle" });
    void invoke("voice_cancel");
  }, []);

  return {
    available,
    state,
    blocked,
    dismiss: () => setBlocked(null),
    start,
    finish,
    cancel,
  };
}
