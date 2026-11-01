import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Quote } from "@xiaoban/protocol";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { ChatPane } from "../features/chat/ChatPane.tsx";
import { ThreadList } from "../features/chat/ThreadList.tsx";
import { CodePanel } from "../features/code/CodePanel.tsx";
import { NewWorkspace } from "../features/code/NewWorkspace.tsx";
import { useCodeWidth } from "../features/code/useCodeWidth.ts";
import { CookPage } from "../features/life/CookPage.tsx";
import { DailyPage } from "../features/life/DailyPage.tsx";
import { KitchenPage } from "../features/life/KitchenPage.tsx";
import { LedgerPage } from "../features/life/LedgerPage.tsx";
import { TimerAlarm } from "../features/life/TimerAlarm.tsx";
import { ContextMenuProvider } from "../features/menu/ContextMenu.tsx";
import { Onboarding } from "../features/onboarding/Onboarding.tsx";
import { OperateConsent } from "../features/operate/OperateConsent.tsx";
import { Rail, type View } from "../features/shell/Rail.tsx";
import { TripWorkbench } from "../features/trip/TripWorkbench.tsx";
import { ImageViewerProvider } from "../features/viewer/ImageViewer.tsx";
import { Workspace } from "../features/workspace/Workspace.tsx";
import { useHub } from "./hub.tsx";
import { useListWidth } from "./useListWidth.ts";
import { usePanels } from "./usePanels.ts";

interface OpenTrip {
  tripId: string;
  version: number | null;
  threadId: string;
}

function Home() {
  const { t } = useI18n();
  const store = useHub();
  const { threads, status, preferences, confirms, workspaces } = useHubState(store);
  const consent = confirms.find((confirm) => confirm.kind.kind === "permissions");
  const panels = usePanels();
  const [selected, setSelected] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [trip, setTrip] = useState<OpenTrip | null>(null);
  const [view, setView] = useState<"chat" | "daily" | "kitchen" | "week" | "cook" | "ledger">(
    "chat",
  );
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
      setView("chat");
      setSelected(payload);
    });
    return () => void stop.then((unlisten) => unlisten());
  }, []);

  const setQuote = (threadId: string, quote: Quote | null) =>
    setQuotes(({ [threadId]: _old, ...rest }) => (quote ? { ...rest, [threadId]: quote } : rest));

  const newThread = useCallback(
    async (workspaceId?: string) => {
      setTrip(null);
      const blank = threads.find(
        (thread) =>
          thread.id !== primaryId &&
          !thread.parentId &&
          thread.lastMessage === null &&
          (thread.workspaceId ?? undefined) === workspaceId,
      );
      if (blank) {
        setSelected(blank.id);
        return;
      }
      const thread = await store.createThread(undefined, workspaceId);
      setSelected(thread.id);
    },
    [store, threads, primaryId],
  );

  const [addingWorkspace, setAddingWorkspace] = useState(false);

  const activeWorkspace = threads.find((thread) => thread.id === activeId)?.workspaceId ?? null;
  const codeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspace) ?? null;
  const resizeLabel = useCallback((width: number) => t("code-resize-width", { width }), [t]);
  const list = useListWidth(resizeLabel);
  const code = useCodeWidth(panels.list ? list.width : 0, resizeLabel);
  const chatHidden = Boolean(codeWorkspace && panels.workspace && code.chatHidden);
  const workspaceForShortcut = activeWorkspace ?? workspaces[0]?.id;

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (event.shiftKey) {
          if (workspaceForShortcut) void newThread(workspaceForShortcut);
        } else {
          void newThread();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [newThread, workspaceForShortcut]);

  const newThreadWith = async (quote: Quote) => {
    const thread = await store.createThread();
    setQuote(thread.id, quote);
    setSelected(thread.id);
  };

  const openTrip = (tripId: string, version: number | null) =>
    activeId && setTrip({ tripId, version, threadId: activeId });

  const navigate = (next: View) => {
    setTrip(null);
    setView(next === "daily" ? "daily" : "chat");
  };

  if (view !== "chat" && !trip) {
    return (
      <div className="shell">
        <Rail current="daily" onNavigate={navigate} />
        {view === "cook" ? (
          <CookPage onBack={() => setView("kitchen")} />
        ) : view === "kitchen" || view === "week" ? (
          <KitchenPage
            key={view}
            initialTab={view === "week" ? "week" : "tonight"}
            onBack={() => setView("daily")}
            onCook={() => setView("cook")}
          />
        ) : view === "ledger" ? (
          <LedgerPage onBack={() => setView("daily")} onOpenWeek={() => setView("week")} />
        ) : (
          <DailyPage
            onOpenKitchen={() => setView("kitchen")}
            onOpenLedger={() => setView("ledger")}
            onTalk={() => {
              setView("chat");
              setSelected(primaryId);
            }}
          />
        )}
        {consent && <OperateConsent key={consent.id} confirm={consent} />}
      </div>
    );
  }

  if (trip) {
    const thread = threads.find((candidate) => candidate.id === trip.threadId);
    return (
      <div className="shell">
        <Rail onNavigate={navigate} />
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
    <div className="shell" data-chat-hidden={chatHidden || undefined}>
      <Rail onNavigate={navigate} />
      <div
        className="panel panel--list"
        data-open={panels.list}
        data-dragging={list.dragging || undefined}
        style={{ "--list-width": `${list.width}px` } as CSSProperties}
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only resize edge; the default width is one double-click away */}
        <div
          className="list-resize"
          title={t("code-resize")}
          onPointerDown={list.start}
          onDoubleClick={list.reset}
        >
          {list.dragging && (
            <span className="code-resize__label">
              {t("code-resize-width", { width: list.width })}
            </span>
          )}
        </div>
        <ThreadList
          threads={threads}
          primaryId={primaryId}
          activeId={activeId}
          onSelect={setSelected}
          onNew={(workspaceId) => void newThread(workspaceId)}
          onAddWorkspace={() => setAddingWorkspace(true)}
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
          onOpenThread={setSelected}
          onOpenTrip={openTrip}
        />
      ) : (
        <main className="chat" aria-busy="true" />
      )}
      {activeId && codeWorkspace ? (
        <div
          className="panel panel--code"
          data-open={panels.workspace}
          data-full={chatHidden || undefined}
          data-dragging={code.dragging || undefined}
          style={{ "--code-width": `${code.width}px` } as CSSProperties}
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only resize edge; the default width is one double-click away */}
          <div
            className="code-resize"
            title={t("code-resize")}
            onPointerDown={code.start}
            onDoubleClick={code.reset}
          >
            {code.dragging && (
              <span className="code-resize__label">
                {t("code-resize-width", { width: Math.round(code.width) })}
              </span>
            )}
          </div>
          <CodePanel
            key={codeWorkspace.id}
            threadId={activeId}
            workspace={codeWorkspace}
            onQuote={(text, focus) => {
              setQuote(activeId, { text, from: null, at: null, messageId: null });
              if (focus)
                document.querySelector<HTMLInputElement>(".composer__field input")?.focus();
            }}
            onAsk={(text) => void store.send(activeId, text).catch(() => undefined)}
          />
        </div>
      ) : (
        <div className="panel panel--workspace" data-open={panels.workspace}>
          <Workspace threadId={activeId} onOpenTrip={openTrip} />
        </div>
      )}
      {addingWorkspace && (
        <NewWorkspace
          onCreated={(workspaceId) => void newThread(workspaceId)}
          onClose={() => setAddingWorkspace(false)}
        />
      )}
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
      <ImageViewerProvider>
        {preferences.onboarded ? (
          <>
            <Home />
            <TimerAlarm />
          </>
        ) : (
          <Onboarding startAt={model ? 1 : 0} onFinish={() => {}} />
        )}
      </ImageViewerProvider>
    </ContextMenuProvider>
  );
}
