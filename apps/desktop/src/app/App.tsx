import { useHubState } from "@xiaoban/client/react";
import { useEffect, useState } from "react";
import { ChatPane } from "../features/chat/ChatPane.tsx";
import { ThreadList } from "../features/chat/ThreadList.tsx";
import { ContextMenuProvider } from "../features/menu/ContextMenu.tsx";
import { Onboarding } from "../features/onboarding/Onboarding.tsx";
import { Rail } from "../features/shell/Rail.tsx";
import { Workspace } from "../features/workspace/Workspace.tsx";
import { useHub } from "./hub.tsx";
import { usePanels } from "./usePanels.ts";

function Home() {
  const store = useHub();
  const { threads, status, preferences } = useHubState(store);
  const panels = usePanels();
  const [selected, setSelected] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Record<string, string>>({});
  const primaryId = preferences?.primaryThreadId ?? null;
  const exists = (id: string | null) => id !== null && threads.some((thread) => thread.id === id);
  const activeId = exists(selected) ? selected : (primaryId ?? threads[0]?.id ?? null);

  useEffect(() => {
    if (activeId && status === "open") void store.loadMessages(activeId);
  }, [activeId, status, store]);

  const setQuote = (threadId: string, text: string | null) =>
    setQuotes(({ [threadId]: _old, ...rest }) => (text ? { ...rest, [threadId]: text } : rest));

  const newThreadWith = async (text: string) => {
    const thread = await store.createThread();
    setQuote(thread.id, text);
    setSelected(thread.id);
  };

  return (
    <div className="shell">
      <Rail />
      <div className="panel panel--list" data-open={panels.list}>
        <ThreadList
          threads={threads}
          primaryId={primaryId}
          activeId={activeId}
          onSelect={setSelected}
        />
      </div>
      {activeId ? (
        <ChatPane
          key={activeId}
          threadId={activeId}
          primary={activeId === primaryId}
          listOpen={panels.list}
          workspaceOpen={panels.workspace}
          onToggleList={() => panels.toggle("list")}
          onToggleWorkspace={() => panels.toggle("workspace")}
          quote={quotes[activeId] ?? null}
          onQuote={(text) => setQuote(activeId, text)}
          onNewThreadWith={(text) => void newThreadWith(text)}
        />
      ) : (
        <main className="chat" aria-busy="true" />
      )}
      <div className="panel panel--workspace" data-open={panels.workspace}>
        <Workspace />
      </div>
    </div>
  );
}

export function App() {
  const store = useHub();
  const { model, modelLoaded, preferences } = useHubState(store);

  if (!modelLoaded || !preferences) return <main className="splash" aria-busy="true" />;
  return (
    <ContextMenuProvider>
      {preferences.onboarded ? (
        <Home />
      ) : (
        <Onboarding startAt={model ? 1 : 0} onFinish={() => {}} />
      )}
    </ContextMenuProvider>
  );
}
