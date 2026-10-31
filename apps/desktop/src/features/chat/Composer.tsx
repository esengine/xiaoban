import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { Quote } from "@xiaoban/protocol";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { openExternal } from "../../lib/external.ts";
import { AttachRow, useVisionChoice, VisionNotice } from "../attach/Attachments.tsx";
import type { AttachmentsState } from "../attach/useAttachments.ts";
import { COMPOSE_EVENT } from "../memory/MemorySkyView.tsx";
import { useContextMenu } from "../menu/ContextMenu.tsx";
import { useVoice, type VoiceBlock, type VoiceState } from "../voice/useVoice.ts";
import { QuoteBlock } from "./QuoteBlock.tsx";

interface Props {
  busy: boolean;
  attachments: AttachmentsState;
  quote: Quote | null;
  onClearQuote: () => void;
  onSend: (text: string) => Promise<unknown>;
  onStop: () => Promise<unknown>;
}

const PRIVACY = "x-apple.systempreferences:com.apple.preference.security";

const BLOCKS: Record<VoiceBlock, { message: PlainMessageKey; settings: string | null }> = {
  microphone: { message: "voice-denied-microphone", settings: `${PRIVACY}?Privacy_Microphone` },
  speech: { message: "voice-denied-speech", settings: `${PRIVACY}?Privacy_SpeechRecognition` },
  dictation: {
    message: "voice-dictation-off",
    settings: "x-apple.systempreferences:com.apple.Keyboard-Settings.extension",
  },
  unavailable: { message: "voice-unavailable", settings: null },
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

export function Composer({ busy, attachments, quote, onClearQuote, onSend, onStop }: Props) {
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

  useEffect(() => {
    const compose = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail !== "string") return;
      setText(detail);
      requestAnimationFrame(() => {
        const field = input.current;
        field?.focus();
        field?.setSelectionRange(detail.length, detail.length);
      });
    };
    window.addEventListener(COMPOSE_EVENT, compose);
    return () => window.removeEventListener(COMPOSE_EVENT, compose);
  }, []);

  const vision = useVisionChoice();
  const [visionAccepted, setVisionAccepted] = useState(false);
  const files = attachments.files;
  useEffect(() => {
    if (files.length === 0) setVisionAccepted(false);
  }, [files.length]);
  const waitingVision = attachments.hasImages && vision === "ask" && !visionAccepted;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value && attachments.ready.length === 0) return;
    if (attachments.blocked || waitingVision) return;
    setText("");
    await onSend(value);
  };
  const pick = async () => {
    const chosen = await openDialog({ multiple: true, directory: false });
    if (!chosen) return;
    await attachments.addPaths(Array.isArray(chosen) ? chosen : [chosen]);
  };
  const pasteFiles = (event: React.ClipboardEvent) => {
    const blobs = Array.from(event.clipboardData.files);
    if (blobs.length === 0) return;
    event.preventDefault();
    void attachments.addBlobs(blobs);
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
          {block.settings && (
            <button
              type="button"
              className="voice-alert__action"
              onClick={() => void openExternal(block.settings ?? "")}
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
        <form className="composer__box" onSubmit={submit}>
          {quote && (
            <QuoteBlock key={quote.text} quote={quote} tone="light" onRemove={onClearQuote} />
          )}
          <AttachRow files={files} onRemove={attachments.remove} />
          {attachments.hasImages && (
            <VisionNotice
              choice={vision}
              accepted={visionAccepted}
              onAccept={() => setVisionAccepted(true)}
              onTextOnly={attachments.dropImages}
            />
          )}
          <div className="composer__line">
            <button
              type="button"
              className="composer__icon"
              aria-label={t("attach-add")}
              title={t("attach-add")}
              onClick={() => void pick()}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <label className="composer__field" onContextMenu={inputMenu}>
              <span className="visually-hidden">{t("composer-label")}</span>
              <input
                ref={input}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onPaste={pasteFiles}
                placeholder={busy ? t("composer-placeholder-busy") : t("composer-placeholder")}
                autoComplete="off"
              />
            </label>
            {voice.available && (
              <button
                type="button"
                className="composer__icon"
                aria-label={t("voice-start", { shortcut: t("voice-shortcut") })}
                title={t("voice-start", { shortcut: t("voice-shortcut") })}
                disabled={state.phase === "starting" || voice.blocked !== null}
                onClick={() => void start()}
              >
                <MicIcon size={20} />
              </button>
            )}
            {busy ? (
              <button
                type="button"
                className="composer__stop"
                aria-label={t("composer-stop")}
                title={t("composer-stop")}
                onClick={() => void onStop()}
              >
                <span aria-hidden="true" />
              </button>
            ) : (
              (text.trim() || attachments.ready.length > 0) && (
                <button
                  type="submit"
                  className="composer__send"
                  aria-label={t("composer-send")}
                  title={t("composer-send")}
                  disabled={attachments.blocked || waitingVision}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M12 19V5M6 11l6-6 6 6" />
                  </svg>
                </button>
              )
            )}
          </div>
        </form>
      )}
    </div>
  );
}
