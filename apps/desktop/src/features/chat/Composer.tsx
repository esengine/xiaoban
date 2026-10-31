import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { openExternal } from "../../lib/external.ts";
import { useContextMenu } from "../menu/ContextMenu.tsx";
import { useVoice, type VoiceBlock, type VoiceState } from "../voice/useVoice.ts";

interface Props {
  busy: boolean;
  quote: string | null;
  onClearQuote: () => void;
  onSend: (text: string) => Promise<unknown>;
  onStop: () => Promise<unknown>;
}

const SETTINGS = "x-apple.systempreferences:com.apple.preference.security";

const BLOCKS: Record<VoiceBlock, { message: PlainMessageKey; pane: string | null }> = {
  microphone: { message: "voice-denied-microphone", pane: "Privacy_Microphone" },
  speech: { message: "voice-denied-speech", pane: "Privacy_SpeechRecognition" },
  unavailable: { message: "voice-unavailable", pane: null },
};

function MicIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className="mic-icon">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </svg>
  );
}

function useClock(since: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [since]);
  const seconds = since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Listening({
  state,
  onCancel,
  onDone,
}: {
  state: Extract<VoiceState, { phase: "listening" | "finishing" }>;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const clock = useClock(state.startedAt);
  return (
    <div className="voice-panel" role="status" aria-label={t("voice-listening")}>
      <div className="voice-panel__top">
        <span className="voice-panel__mic">
          <MicIcon size={18} />
        </span>
        <span className="voice-panel__wave" aria-hidden="true">
          {state.levels.map((level, position) => (
            <span key={position} style={{ transform: `scaleY(${0.15 + level * 0.85})` }} />
          ))}
        </span>
        <span className="voice-panel__clock">{clock}</span>
      </div>
      <p className="voice-panel__text">
        {state.text}
        <span className="caret" aria-hidden="true" />
      </p>
      <div className="voice-panel__actions">
        <span className="voice-panel__hint">
          {t("voice-hint", { shortcut: t("voice-shortcut") })}
        </span>
        <button type="button" className="voice-panel__cancel" onClick={onCancel}>
          {t("voice-cancel")}
          <kbd>{t("voice-cancel-key")}</kbd>
        </button>
        <button
          type="button"
          className="voice-panel__done"
          onClick={onDone}
          disabled={state.phase === "finishing"}
        >
          {t("voice-done")}
        </button>
      </div>
    </div>
  );
}

export function Composer({ busy, quote, onClearQuote, onSend, onStop }: Props) {
  const { t, locale } = useI18n();
  const openMenu = useContextMenu();
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const holding = useRef(false);
  const voice = useVoice(locale, (spoken) => {
    setText((current) => (current.trim() ? `${current.trimEnd()} ${spoken}` : spoken));
    requestAnimationFrame(() => input.current?.focus());
  });
  const { state, start, finish, cancel } = voice;
  const active = state.phase === "listening" || state.phase === "finishing";

  useEffect(() => {
    if (!voice.available) return;
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space" && event.altKey && !event.repeat && state.phase === "idle") {
        event.preventDefault();
        holding.current = true;
        void start();
      } else if (event.key === "Escape" && active) {
        event.preventDefault();
        holding.current = false;
        cancel();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space" && holding.current) {
        event.preventDefault();
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
  }, [voice.available, state.phase, active, start, finish, cancel]);

  useEffect(() => {
    if (quote) input.current?.focus();
  }, [quote]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setText("");
    await onSend(value);
  };

  const edit = (command: "cut" | "copy") => {
    input.current?.focus();
    document.execCommand(command);
  };
  const paste = async () => {
    const field = input.current;
    if (!field) return;
    const pasted = await navigator.clipboard.readText();
    const start = field.selectionStart ?? text.length;
    const end = field.selectionEnd ?? text.length;
    setText(text.slice(0, start) + pasted + text.slice(end));
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + pasted.length, start + pasted.length);
    });
  };
  const inputMenu = (event: React.MouseEvent) => {
    const field = input.current;
    const selected = field ? (field.selectionEnd ?? 0) > (field.selectionStart ?? 0) : false;
    openMenu(event, [
      { label: t("menu-cut"), shortcut: "⌘X", disabled: !selected, onSelect: () => edit("cut") },
      { label: t("menu-copy"), shortcut: "⌘C", disabled: !selected, onSelect: () => edit("copy") },
      { label: t("menu-paste"), shortcut: "⌘V", onSelect: () => void paste() },
      {
        label: t("menu-select-all"),
        shortcut: "⌘A",
        disabled: !text,
        onSelect: () => {
          field?.focus();
          field?.select();
        },
      },
      "separator",
      {
        label: t("menu-voice"),
        shortcut: t("voice-shortcut"),
        disabled: !voice.available || state.phase !== "idle",
        onSelect: () => void start(),
      },
    ]);
  };

  const block = voice.blocked ? BLOCKS[voice.blocked] : null;

  return (
    <div className="composer">
      {block && (
        <div role="alert" className="voice-alert">
          <MicIcon size={16} />
          <span className="voice-alert__text">{t(block.message)}</span>
          {block.pane && (
            <button
              type="button"
              className="voice-alert__action"
              onClick={() => void openExternal(`${SETTINGS}?${block.pane}`)}
            >
              {t("voice-open-settings")}
            </button>
          )}
          <button
            type="button"
            className="voice-alert__close"
            aria-label={t("dialog-close")}
            onClick={voice.dismiss}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
      {quote && !active && (
        <div className="quote-chip">
          <span className="quote-chip__label">{t("quote-label")}</span>
          <span className="quote-chip__text">{quote}</span>
          <button
            type="button"
            className="voice-alert__close"
            aria-label={t("quote-remove")}
            onClick={onClearQuote}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
      {active ? (
        <Listening
          state={state}
          onCancel={cancel}
          onDone={() => {
            holding.current = false;
            finish();
          }}
        />
      ) : (
        <form className="composer__row" onSubmit={submit}>
          {voice.available && (
            <button
              type="button"
              className="composer__mic"
              aria-label={t("voice-start", { shortcut: t("voice-shortcut") })}
              title={t("voice-start", { shortcut: t("voice-shortcut") })}
              disabled={state.phase === "starting" || voice.blocked !== null}
              onClick={() => void start()}
            >
              <MicIcon size={22} />
            </button>
          )}
          <label className="composer__field" onContextMenu={inputMenu}>
            <span className="visually-hidden">{t("composer-label")}</span>
            <input
              ref={input}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t("composer-placeholder")}
              autoComplete="off"
            />
          </label>
          {busy ? (
            <button type="button" className="button button--stop" onClick={() => void onStop()}>
              {t("composer-stop")}
            </button>
          ) : (
            <button type="submit" className="button button--primary">
              {t("composer-send")}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
