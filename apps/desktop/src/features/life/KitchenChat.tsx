import { draftsForThread, useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { MicIcon } from "../chat/Composer.tsx";
import { RichText } from "../chat/RichText.tsx";
import { useVoice } from "../voice/useVoice.ts";

export type ChatLabels = {
  title: string;
  note: string;
  hint: string;
  placeholder: string;
};

export function KitchenChat({
  threadId,
  labels,
  extra,
}: {
  threadId: string;
  labels?: ChatLabels;
  extra?: React.ReactNode;
}) {
  const { t } = useI18n();
  const store = useHub();
  const state = useHubState(store);
  const messages = state.messages[threadId] ?? [];
  const drafts = draftsForThread(state, threadId);
  const running = drafts.find((draft) => !draft.failure);
  const text = labels ?? {
    title: t("kitchen-chat"),
    note: t("kitchen-chat-note"),
    hint: t("kitchen-chat-hint"),
    placeholder: t("kitchen-chat-placeholder"),
  };
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const holding = useRef(false);
  const { locale } = useI18n();
  const voice = useVoice(locale, (spoken) => {
    setDraft((current) => (current.trim() ? `${current.trimEnd()} ${spoken}` : spoken));
  });
  const { state: listen, start, finish, cancel } = voice;
  const listening = listen.phase === "listening" || listen.phase === "finishing";

  useEffect(() => {
    if (!voice.available) return;
    const down = (event: KeyboardEvent) => {
      if (event.code === "Space" && event.altKey && !event.repeat && listen.phase === "idle") {
        event.preventDefault();
        holding.current = true;
        void start();
      } else if (event.key === "Escape" && listening) {
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
  }, [voice.available, listen.phase, listening, start, finish, cancel]);

  useEffect(() => {
    if (state.status === "open") void store.loadMessages(threadId).catch(() => undefined);
  }, [store, threadId, state.status]);

  const lastDraftText = running?.text ?? "";
  useEffect(() => {
    void lastDraftText;
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastDraftText]);

  const send = () => {
    const value = draft.trim();
    if (!value || running) return;
    setDraft("");
    void store.send(threadId, value).catch(() => undefined);
  };

  return (
    <aside className="kitchen-chat" aria-label={text.title}>
      <div className="kitchen-chat__head">
        <b>{text.title}</b>
        <span>{text.note}</span>
      </div>
      <div className="kitchen-chat__list">
        {messages.length === 0 && !running && <p className="kitchen-chat__hint">{text.hint}</p>}
        {messages.map((message) => (
          <div key={message.id} className="kitchen-chat__bubble" data-role={message.role}>
            {message.role === "assistant" ? <RichText text={message.text} /> : message.text}
          </div>
        ))}
        {running && (
          <div className="kitchen-chat__bubble" data-role="assistant" data-pending>
            {running.text ? <RichText text={running.text} /> : t("kitchen-thinking")}
          </div>
        )}
        {extra}
        <div ref={end} />
      </div>
      <div className="kitchen-chat__bar">
        <label className="kitchen-chat__input">
          <span className="visually-hidden">{text.title}</span>
          <input
            value={listening && "text" in listen && listen.text ? listen.text : draft}
            placeholder={listening ? t("kitchen-listening") : text.placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) send();
            }}
          />
        </label>
        {voice.available && (
          <button
            type="button"
            className="kitchen-chat__mic"
            data-listening={listening || undefined}
            aria-label={t("voice-start", { shortcut: t("voice-shortcut") })}
            title={t("voice-start", { shortcut: t("voice-shortcut") })}
            disabled={listen.phase === "starting" || voice.blocked !== null}
            onClick={() => (listening ? finish() : void start())}
          >
            <MicIcon size={18} />
          </button>
        )}
      </div>
    </aside>
  );
}
