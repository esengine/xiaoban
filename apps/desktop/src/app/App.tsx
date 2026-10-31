import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Quote } from "@xiaoban/protocol";
import { useEffect, useState } from "react";
import { ChatPane } from "../features/chat/ChatPane.tsx";
import { ThreadList } from "../features/chat/ThreadList.tsx";
import { ContextMenuProvider } from "../features/menu/ContextMenu.tsx";
import { Onboarding } from "../features/onboarding/Onboarding.tsx";
import { OperateConsent } from "../features/operate/OperateConsent.tsx";
import { Rail } from "../features/shell/Rail.tsx";
import { TripWorkbench } from "../features/trip/TripWorkbench.tsx";
import { Workspace } from "../features/workspace/Workspace.tsx";
import { useHub } from "./hub.tsx";
import { usePanels } from "./usePanels.ts";

interface OpenTrip {
  tripId: string;
  version: number | null;
  threadId: string;
}

function Home() {
  const { t } = useI18n();
  const store = useHub();
  const { threads, status, preferences, confirms } = useHubState(store);
  const consent = confirms.find((confirm) => confirm.kind.kind === "permissions");
  const panels = usePanels();
  const [selected, setSelected] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [trip, setTrip] = useState<OpenTrip | null>(null);
  const primaryId = preferences?.primaryThreadId ?? null;
  const exists = (id: string | null) => id !== null && threads.some((thread) => thread.id === id);
  const activeId = exists(selected) ? selected : (primaryId ?? threads[0]?.id ?? null);

  useEffect(() => {
    if (activeId && status === "open") void store.loadMessages(activeId);
  }, [activeId, status, store]);

  useEffect(() => {
    if (!isTauri()) return;
    const stop = listen<string>("main://open-thread", ({ payload }) => {
      setTrip(null);
      setSelected(payload);
    });
    return () => void stop.then((unlisten) => unlisten());
  }, []);

  const setQuote = (threadId: string, quote: Quote | null) =>
    setQuotes(({ [threadId]: _old, ...rest }) => (quote ? { ...rest, [threadId]: quote } : rest));

  const newThreadWith = async (quote: Quote) => {
    const thread = await store.createThread();
    setQuote(thread.id, quote);
    setSelected(thread.id);
  };

  const openTrip = (tripId: string, version: number | null) =>
    activeId && setTrip({ tripId, version, threadId: activeId });

  if (trip) {
    const thread = threads.find((candidate) => candidate.id === trip.threadId);
    return (
      <div className="shell">
        <Rail />
        <TripWorkbench
          key={`${trip.tripId}@${trip.version ?? "latest"}`}
          tripId={trip.tripId}
          version={trip.version}
          threadId={trip.threadId}
          threadTitle={
            trip.threadId === primaryId ? t("app-name") : (thread?.title ?? t("thread-untitled"))
          }
          onBack={() => setTrip(null)}
          onLatest={() => setTrip({ ...trip, version: null })}
        />
        {consent && <OperateConsent key={consent.id} confirm={consent} />}
      </div>
    );
  }

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
          onQuote={(quote) => setQuote(activeId, quote)}
          onNewThreadWith={(quote) => void newThreadWith(quote)}
          onOpenTrip={openTrip}
        />
      ) : (
        <main className="chat" aria-busy="true" />
      )}
      <div className="panel panel--workspace" data-open={panels.workspace}>
        <Workspace threadId={activeId} onOpenTrip={openTrip} />
      </div>
      {consent && <OperateConsent key={consent.id} confirm={consent} />}
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
