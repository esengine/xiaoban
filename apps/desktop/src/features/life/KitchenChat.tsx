import { draftsForThread, useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { RichText } from "../chat/RichText.tsx";

export function KitchenChat({ threadId }: { threadId: string }) {
  const { t } = useI18n();
  const store = useHub();
  const state = useHubState(store);
  const messages = state.messages[threadId] ?? [];
  const drafts = draftsForThread(state, threadId);
  const running = drafts.find((draft) => !draft.failure);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "open") void store.loadMessages(threadId).catch(() => undefined);
  }, [store, threadId, state.status]);

  const lastDraftText = running?.text ?? "";
  useEffect(() => {
    void lastDraftText;
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, lastDraftText]);

  const send = () => {
    const value = text.trim();
    if (!value || running) return;
    setText("");
    void store.send(threadId, value).catch(() => undefined);
  };

  return (
    <aside className="kitchen-chat" aria-label={t("kitchen-chat")}>
      <div className="kitchen-chat__head">
        <b>{t("kitchen-chat")}</b>
        <span>{t("kitchen-chat-note")}</span>
      </div>
      <div className="kitchen-chat__list">
        {messages.length === 0 && !running && (
          <p className="kitchen-chat__hint">{t("kitchen-chat-hint")}</p>
        )}
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
        <div ref={end} />
      </div>
      <label className="kitchen-chat__input">
        <span className="visually-hidden">{t("kitchen-chat")}</span>
        <input
          value={text}
          placeholder={t("kitchen-chat-placeholder")}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) send();
          }}
        />
      </label>
    </aside>
  );
}
