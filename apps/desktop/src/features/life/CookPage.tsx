import { invoke, isTauri } from "@tauri-apps/api/core";
import { draftsForThread, useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { CookTimer, Heat } from "@xiaoban/protocol";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { MicIcon } from "../chat/Composer.tsx";
import { RichText } from "../chat/RichText.tsx";
import { useVoice } from "../voice/useVoice.ts";

const FLAMES: Record<Heat, number> = { high: 3, medium: 2, low: 1, none: 0 };

function HeatTag({ heat }: { heat: Heat }) {
  const { t } = useI18n();
  return (
    <span className="heat" data-heat={heat}>
      {Array.from({ length: FLAMES[heat] }, (_, index) => (
        <span key={index} className="heat__bar" style={{ height: 6 + index * 3 }} />
      ))}
      <span>{t(`heat-${heat}`)}</span>
    </span>
  );
}

function clock(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, []);
  return now;
}

function TimerRow({ timer, now }: { timer: CookTimer; now: number }) {
  const { t } = useI18n();
  const store = useHub();
  const left = (timer.endsAt - now) / 1000;
  const share = timer.fired ? 100 : Math.max(0, Math.min(100, (left / timer.seconds) * 100));
  return (
    <div className="cook-timer" data-fired={timer.fired || undefined}>
      <span className="cook-timer__ring" style={{ "--share": `${share}%` } as React.CSSProperties}>
        <span>{timer.fired ? t("timer-done") : clock(left)}</span>
      </span>
      <span className="cook-timer__text">
        <b>{timer.label}</b>
        <span>
          {timer.after || (timer.step !== null ? t("cook-step-n", { n: timer.step + 1 }) : "")}
        </span>
      </span>
      {timer.fired ? (
        <button
          type="button"
          className="code-link"
          onClick={() => void store.dismissTimer(timer.id)}
        >
          {t("timer-ok")}
        </button>
      ) : (
        <button
          type="button"
          className="code-link"
          onClick={() => void store.extendTimer(timer.id, 30)}
        >
          {t("timer-extend")}
        </button>
      )}
    </div>
  );
}

function AddTimer() {
  const { t } = useI18n();
  const store = useHub();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState("5");
  const [label, setLabel] = useState("");
  if (!open) {
    return (
      <button type="button" className="code-link" onClick={() => setOpen(true)}>
        {t("timer-add")}
      </button>
    );
  }
  const start = () => {
    const value = Number(minutes);
    if (!(value > 0)) return;
    void store.startTimer(
      null,
      label.trim() || t("timer-default-label"),
      "",
      Math.round(value * 60),
    );
    setOpen(false);
    setLabel("");
  };
  return (
    <span className="cook-add">
      <input
        value={label}
        placeholder={t("timer-label")}
        onChange={(event) => setLabel(event.target.value)}
      />
      <input
        className="cook-add__minutes"
        value={minutes}
        inputMode="decimal"
        aria-label={t("timer-minutes")}
        onChange={(event) => setMinutes(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") start();
        }}
      />
      <span>{t("timer-minutes")}</span>
      <button type="button" className="code-link" onClick={start}>
        {t("timer-start-short")}
      </button>
    </span>
  );
}

function Ask({ threadId, since }: { threadId: string; since: number }) {
  const { t, locale } = useI18n();
  const store = useHub();
  const state = useHubState(store);
  const [text, setText] = useState("");
  const holding = useRef(false);
  const voice = useVoice(locale, (spoken) => {
    setText("");
    void store.send(threadId, spoken).catch(() => undefined);
  });
  const { state: listen, start, finish } = voice;
  const listening = listen.phase === "listening" || listen.phase === "finishing";
  const messages = (state.messages[threadId] ?? []).filter((message) => message.createdAt >= since);
  const lastQuestion = [...messages].reverse().find((message) => message.role === "user");
  const lastAnswer = [...messages].reverse().find((message) => message.role === "assistant");
  const running = draftsForThread(state, threadId).find((draft) => !draft.failure);

  useEffect(() => {
    if (!voice.available) return;
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space" && event.altKey && !event.repeat && listen.phase === "idle") {
        event.preventDefault();
        holding.current = true;
        void start();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space" && holding.current) {
        holding.current = false;
        finish();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [voice.available, listen.phase, start, finish]);

  const send = () => {
    const value = text.trim();
    if (!value || running) return;
    setText("");
    void store.send(threadId, value).catch(() => undefined);
  };

  return (
    <section className="life-card cook-ask">
      {lastQuestion && (
        <span className="cook-ask__q">{t("cook-you-asked", { text: lastQuestion.text })}</span>
      )}
      {running ? (
        <div className="cook-ask__a">
          {running.text ? <RichText text={running.text} /> : t("kitchen-thinking")}
        </div>
      ) : (
        lastAnswer &&
        lastQuestion &&
        lastAnswer.createdAt > lastQuestion.createdAt && (
          <div className="cook-ask__a">
            <RichText text={lastAnswer.text} />
          </div>
        )
      )}
      <div className="cook-ask__bar">
        <input
          value={listening && "text" in listen && listen.text ? listen.text : text}
          placeholder={listening ? t("kitchen-listening") : t("cook-ask-placeholder")}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter" && !event.nativeEvent.isComposing) send();
          }}
        />
        {voice.available && (
          <button
            type="button"
            className="cook-ask__mic"
            data-listening={listening || undefined}
            onClick={() => (listening ? finish() : void start())}
          >
            <MicIcon size={16} />
            {t("cook-talk")}
          </button>
        )}
      </div>
    </section>
  );
}

export function CookPage({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const { kitchen } = useHubState(store);
  const now = useNow();
  const cook = kitchen?.cook ?? null;
  const steps = cook?.steps ?? [];
  const current = cook ? Math.min(cook.current, Math.max(0, steps.length - 1)) : 0;
  const step = steps[current];
  const timers = kitchen?.timers ?? [];
  const threadId = kitchen?.threadId ?? null;
  const [since] = useState(() => Date.now());

  useEffect(() => {
    if (!isTauri()) return;
    void invoke("keep_awake", { on: true }).catch(() => undefined);
    return () => void invoke("keep_awake", { on: false }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (!cook || event.target instanceof HTMLInputElement) return;
      if (event.key === "ArrowRight") void store.cookGo(current + 1);
      if (event.key === "ArrowLeft") void store.cookGo(Math.max(0, current - 1));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [store, cook, current]);

  const finish = () => {
    if (threadId) void store.send(threadId, t("cook-finished-message")).catch(() => undefined);
    void store.finishCooking().then(onBack);
  };
  const stepTimer = timers.find((timer) => timer.step === current && !timer.fired);

  return (
    <main className="life-page cook">
      <header className="life-top">
        <button type="button" className="code-link life-top__back" onClick={onBack}>
          {t("cook-back")}
        </button>
        <b className="life-top__title">
          {cook ? cook.dishes.join(t("kitchen-plus")) : t("cook-title")}
        </b>
        {cook && (
          <span className="life-card__note">
            {t("cook-meta", { servings: cook.servings || 0, minutes: cook.minutes })}
          </span>
        )}
        <span className="life-card__spacer" />
        {cook && (
          <button type="button" className="code-status-button" onClick={finish}>
            {t("cook-done")}
          </button>
        )}
      </header>
      {!cook ? (
        <div className="cook__waiting">
          <span className="cook__pulse" aria-hidden="true" />
          <p>{t("cook-planning")}</p>
        </div>
      ) : (
        <div className="cook__body">
          <div className="cook-steps">
            <b className="cook-steps__head">
              {t("cook-steps-head", { count: cook.dishes.length })}
            </b>
            {steps.map((item, index) => (
              <button
                key={index}
                type="button"
                className="cook-step"
                data-state={index < current ? "done" : index === current ? "now" : undefined}
                onClick={() => void store.cookGo(index)}
              >
                <span className="cook-step__no">
                  {index < current ? t("cook-check") : index + 1}
                </span>
                <span className="cook-step__body">
                  <span className="cook-step__dish">{item.dish}</span>
                  <span>{item.text}</span>
                  <span className="cook-step__meta">
                    <HeatTag heat={item.heat} />
                    {item.seconds > 0 && <span>{clock(item.seconds)}</span>}
                    {timers.some((timer) => timer.step === index && !timer.fired) && (
                      <span className="cook-step__timing">{t("cook-timing")}</span>
                    )}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="cook-main">
            {step && (
              <section className="life-card cook-now">
                <div className="cook-now__top">
                  <span>
                    {t("cook-progress", { n: current + 1, total: steps.length, dish: step.dish })}
                  </span>
                  <span className="life-card__spacer" />
                  <HeatTag heat={step.heat} />
                </div>
                <p className="cook-now__text">{step.text}</p>
                {step.tip && <p className="cook-now__tip">{step.tip}</p>}
                <div className="cook-now__actions">
                  {step.seconds > 0 && (
                    <button
                      type="button"
                      className="cook-big"
                      data-primary
                      disabled={Boolean(stepTimer)}
                      onClick={() =>
                        void store.startTimer(
                          current,
                          t("cook-timer-label", { dish: step.dish, step: current + 1 }),
                          step.after,
                          step.seconds,
                        )
                      }
                    >
                      {stepTimer
                        ? t("cook-timer-running", { left: clock((stepTimer.endsAt - now) / 1000) })
                        : t("cook-start-timer", { time: clock(step.seconds) })}
                    </button>
                  )}
                  <button
                    type="button"
                    className="cook-big"
                    disabled={current === 0}
                    onClick={() => void store.cookGo(current - 1)}
                  >
                    {t("cook-prev")}
                  </button>
                  <button
                    type="button"
                    className="cook-big"
                    disabled={current >= steps.length - 1}
                    onClick={() => void store.cookGo(current + 1)}
                  >
                    {t("cook-next")}
                  </button>
                </div>
              </section>
            )}
            {threadId && <Ask threadId={threadId} since={since} />}
          </div>
          <div className="cook-timers">
            <div className="life-card__head">
              <b>{t("timer-head", { count: timers.length })}</b>
              <span className="life-card__spacer" />
              <AddTimer />
            </div>
            {timers.map((timer) => (
              <TimerRow key={timer.id} timer={timer} now={now} />
            ))}
            <p className="life-card__hint">{t("timer-hint")}</p>
          </div>
        </div>
      )}
    </main>
  );
}
