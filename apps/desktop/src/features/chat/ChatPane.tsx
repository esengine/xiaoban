import { draftsForThread, useHubState } from "@xiaoban/client/react";
import { useHub } from "../../app/hub.tsx";
import { Composer } from "./Composer.tsx";
import { DraftBubble } from "./DraftBubble.tsx";

export function ChatPane({ threadId }: { threadId: string }) {
  const store = useHub();
  const state = useHubState(store);
  const messages = state.messages[threadId] ?? [];
  const drafts = draftsForThread(state, threadId);
  const title = state.threads.find((thread) => thread.id === threadId)?.title ?? "";
  const running = drafts.find((draft) => !draft.failure);

  return (
    <main className="chat">
      <header className="chat__header">
        <h2>{title}</h2>
      </header>
      <ol className="chat__messages">
        {messages.map((message) => (
          <li key={message.id} className={`bubble bubble--${message.role}`}>
            {message.text}
          </li>
        ))}
        {drafts.map((draft) => (
          <DraftBubble key={draft.turnId} draft={draft} />
        ))}
      </ol>
      <Composer
        busy={Boolean(running)}
        onSend={(text) => store.send(threadId, text)}
        onStop={() => (running ? store.cancel(running.turnId) : Promise.resolve())}
      />
    </main>
  );
}
