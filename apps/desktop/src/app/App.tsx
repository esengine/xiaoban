import { useHubState } from "@xiaoban/client/react";
import { useEffect, useState } from "react";
import { ChatPane } from "../features/chat/ChatPane.tsx";
import { ThreadList } from "../features/chat/ThreadList.tsx";
import { useHub } from "./hub.tsx";

export function App() {
  const store = useHub();
  const { threads, status } = useHubState(store);
  const [selected, setSelected] = useState<string | null>(null);
  const activeId = selected ?? threads[0]?.id ?? null;

  useEffect(() => {
    if (activeId && status === "open") void store.loadMessages(activeId);
  }, [activeId, status, store]);

  const startThread = async () => {
    const thread = await store.createThread();
    setSelected(thread.id);
  };

  return (
    <div className="shell">
      <nav className="rail" aria-label="主导航">
        <div className="rail__logo" />
      </nav>
      <ThreadList
        threads={threads}
        activeId={activeId}
        status={status}
        onSelect={setSelected}
        onCreate={startThread}
      />
      {activeId ? (
        <ChatPane threadId={activeId} />
      ) : (
        <main className="empty">
          <p>还没有对话</p>
          <button type="button" className="button button--primary" onClick={startThread}>
            和小伴聊聊
          </button>
        </main>
      )}
    </div>
  );
}
