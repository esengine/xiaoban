import { useHubState } from "@xiaoban/client/react";
import { useEffect, useState } from "react";
import { ChatPane } from "../features/chat/ChatPane.tsx";
import { ThreadList } from "../features/chat/ThreadList.tsx";
import { Onboarding } from "../features/onboarding/Onboarding.tsx";
import { Rail } from "../features/shell/Rail.tsx";
import { Workspace } from "../features/workspace/Workspace.tsx";
import { useHub } from "./hub.tsx";

export function App() {
  const store = useHub();
  const { threads, status, model, modelLoaded, preferences } = useHubState(store);
  const [selected, setSelected] = useState<string | null>(null);
  const primaryId = preferences?.primaryThreadId ?? null;
  const activeId = selected ?? primaryId ?? threads[0]?.id ?? null;

  useEffect(() => {
    if (activeId && status === "open") void store.loadMessages(activeId);
  }, [activeId, status, store]);

  if (!modelLoaded || !preferences) return <main className="splash" aria-busy="true" />;
  if (!preferences.onboarded) {
    return <Onboarding startAt={model ? 1 : 0} onFinish={() => setSelected(null)} />;
  }

  return (
    <div className="shell">
      <Rail />
      <ThreadList
        threads={threads}
        primaryId={primaryId}
        activeId={activeId}
        onSelect={setSelected}
      />
      {activeId ? (
        <ChatPane threadId={activeId} primary={activeId === primaryId} />
      ) : (
        <main className="chat" aria-busy="true" />
      )}
      <Workspace />
    </div>
  );
}
