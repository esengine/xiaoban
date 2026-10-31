import { connectionKey, providerKey } from "@xiaoban/client";
import { draftsForThread, useHubState } from "@xiaoban/client/react";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import { useEffect, useRef } from "react";
import { useHub } from "../../app/hub.tsx";
import { Composer } from "./Composer.tsx";
import { DraftBubble } from "./DraftBubble.tsx";

const SUGGESTIONS: readonly PlainMessageKey[] = [
  "home-suggestion-umbrella",
  "home-suggestion-expense",
  "home-suggestion-weekend",
];

export function ChatPane({ threadId, primary }: { threadId: string; primary: boolean }) {
  const { t } = useI18n();
  const store = useHub();
  const state = useHubState(store);
  const messages = state.messages[threadId] ?? [];
  const drafts = draftsForThread(state, threadId);
  const thread = state.threads.find((candidate) => candidate.id === threadId);
  const title = primary ? t("app-name") : (thread?.title ?? t("thread-untitled"));
  const running = drafts.find((draft) => !draft.failure);
  const end = useRef<HTMLLIElement>(null);
  const fresh = primary && drafts.length === 0 && messages.every((m) => m.role === "assistant");

  const model = state.model
    ? (state.model.label ?? `${t(providerKey(state.model.provider))} · ${state.model.model}`)
    : t("model-not-connected");
  const subtitle =
    state.status === "open"
      ? primary
        ? t("chat-subtitle-primary", { model })
        : model
      : t(connectionKey(state.status));

  const lastMessage = messages.at(-1)?.id;
  const lastDraft = drafts.at(-1)?.text;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [threadId, lastMessage, lastDraft]);

  const send = (text: string) => store.send(threadId, text);

  return (
    <main className="chat">
      <header className="chat__header">
        <div>
          <h1 className="chat__title">{title}</h1>
          <p className="chat__subtitle">{subtitle}</p>
        </div>
      </header>
      <ol className="chat__messages" aria-live="polite">
        {messages.map((message) => (
          <li key={message.id} className={`bubble bubble--${message.role}`}>
            {message.text}
          </li>
        ))}
        {drafts.map((draft) => (
          <DraftBubble key={draft.turnId} draft={draft} />
        ))}
        {fresh && messages.length > 0 && (
          <li className="suggestions">
            {SUGGESTIONS.map((key) => (
              <button
                key={key}
                type="button"
                className="suggestion"
                onClick={() => void send(t(key))}
              >
                {t(key)}
              </button>
            ))}
          </li>
        )}
        <li ref={end} className="chat__end" aria-hidden="true" />
      </ol>
      <Composer
        busy={Boolean(running)}
        onSend={send}
        onStop={() => (running ? store.cancel(running.turnId) : Promise.resolve())}
      />
    </main>
  );
}
