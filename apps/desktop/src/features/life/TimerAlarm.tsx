import { isTauri } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useEffect, useRef } from "react";
import { useHub } from "../../app/hub.tsx";

const BEEP_EVERY_MS = 1600;

function beep(context: AudioContext) {
  const now = context.currentTime;
  for (const offset of [0, 0.25, 0.5]) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
    osc.connect(gain).connect(context.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.2);
  }
}

async function notify(title: string, body: string) {
  if (!isTauri()) return;
  let granted = await isPermissionGranted().catch(() => false);
  if (!granted) granted = (await requestPermission().catch(() => "denied")) === "granted";
  if (granted) sendNotification({ title, body });
}

export function TimerAlarm() {
  const { t } = useI18n();
  const store = useHub();
  const { kitchen } = useHubState(store);
  const ringing = (kitchen?.timers ?? []).filter((timer) => timer.fired);
  const audio = useRef<AudioContext | null>(null);

  useEffect(
    () =>
      store.client.onEvent((event) => {
        if (event.type !== "notify") return;
        const { notice } = event;
        if (notice.level !== "now") return;
        if (notice.category !== "remind" && document.hasFocus()) return;
        void notify(notice.title, notice.body);
      }),
    [store],
  );

  const active = ringing.length > 0;
  useEffect(() => {
    if (!active) return;
    audio.current ??= new AudioContext();
    const context = audio.current;
    void context.resume();
    beep(context);
    const loop = window.setInterval(() => beep(context), BEEP_EVERY_MS);
    return () => window.clearInterval(loop);
  }, [active]);

  if (!active) return null;
  return (
    <div className="timer-alarm" role="alert">
      {ringing.map((timer) => (
        <button
          key={timer.id}
          type="button"
          className="timer-alarm__item"
          title={t("timer-ok")}
          onClick={() => void store.dismissTimer(timer.id).catch(() => undefined)}
        >
          {t("timer-done-banner", { label: timer.label })}
          {timer.after && t("timer-then", { after: timer.after })}
        </button>
      ))}
    </div>
  );
}
