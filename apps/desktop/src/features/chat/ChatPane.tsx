import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  connectionKey,
  type Draft,
  providerKey,
  runFailed,
  type Settled,
  scheduleOfThread,
} from "@xiaoban/client";
import { draftsForThread, useHubState } from "@xiaoban/client/react";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { FileInfo, Message, Quote, Thinking } from "@xiaoban/protocol";
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useHub } from "../../app/hub.tsx";
import { DropZone, SentFiles } from "../attach/Attachments.tsx";
import { useAttachments } from "../attach/useAttachments.ts";
import { BranchBar, ChangeCard } from "../code/ChatBits.tsx";
import { refsIn } from "../code/githubRefs.ts";
import { Pins } from "../code/Pins.tsx";
import { RefsContext, type RefsValue } from "../code/RefChip.tsx";
import { useWorkspaceOf } from "../code/useCode.ts";
import { DocCard, WritingDocs } from "../doc/DocCard.tsx";
import { FloorCard } from "../floor/FloorCard.tsx";
import { RecipeCard } from "../life/RecipeCard.tsx";
import { MailCard, DraftCard as MailDraftCard } from "../mail/MailCards.tsx";
import { type MenuEntry, useContextMenu } from "../menu/ContextMenu.tsx";
import { ConfirmCard } from "../operate/ConfirmCard.tsx";
import { PlanCard } from "../plan/PlanCard.tsx";
import { usePlanDock } from "../plan/usePlanDock.ts";
import { FailedCard, RunMarker, ScheduleBar, ScheduleCard } from "../schedule/ScheduleCard.tsx";
import { SheetCard } from "../sheet/SheetCard.tsx";
import { DeckCard, WritingDecks } from "../slides/DeckCard.tsx";
import { EventCard } from "../trip/EventCard.tsx";
import { SearchCard, SearchDialog } from "../trip/SearchCard.tsx";
import { TripCard } from "../trip/TripCard.tsx";
import { CompactStatus, SummaryNote } from "./CompactStatus.tsx";
import { Composer } from "./Composer.tsx";
import { ContextMeter } from "./ContextMeter.tsx";
import { BackgroundCard, DraftBubble } from "./DraftBubble.tsx";
import { flyToMe } from "./flyToMe.ts";
import { InlineText } from "./InlineText.tsx";
import { ModelMenu } from "./ModelMenu.tsx";
import { PanelToggle } from "./PanelToggle.tsx";
import { plain } from "./plain.ts";
import {
  findAndJump,
  highlightSource,
  QuoteBlock,
  quoteOf,
  selectedMarkdown,
} from "./QuoteBlock.tsx";
import { RichText } from "./RichText.tsx";
import { SubthreadCards } from "./SubthreadCards.tsx";
import { overSidebar } from "./ThreadList.tsx";
import { MemoryChips, TraceSummary } from "./Trace.tsx";
import { type Row, toRows } from "./versions.ts";

const SUGGESTIONS: readonly PlainMessageKey[] = [
  "home-suggestion-umbrella",
  "home-suggestion-expense",
  "home-suggestion-weekend",
];

export interface SideLabels {
  title: string;
  note: string;
  hint: string;
  placeholder: string;
}

interface Props {
  threadId: string;
  primary: boolean;
  side?: { labels: SideLabels; extra?: ReactNode };
  listOpen?: boolean;
  workspaceOpen?: boolean;
  onToggleList?: () => void;
  onToggleWorkspace?: () => void;
  quote?: Quote | null;
  onQuote?: (quote: Quote | null) => void;
  onNewThreadWith?: (quote: Quote) => void;
  onOpenTrip?: (tripId: string, version: number | null) => void;
  onOpenDoc?: (docId: string, print?: boolean) => void;
  onOpenSheet?: (sheetId: string) => void;
  onOpenDeck?: (deckId: string, action?: "present" | "pptx" | "pdf") => void;
  onOpenThread?: (threadId: string) => void;
  onCook?: () => void;
  onOpenFloor?: (planId: string, check: boolean) => void;
}

const nothing = () => undefined;

interface Queued {
  id: number;
  threadId: string;
  text: string;
  quote: Quote | null;
  files: string[];
  threads: string[];
}

const OLDER_THRESHOLD = 240;

let counter = 0;

function isCancel(text: string, words: string): boolean {
  const cleaned = text.trim().replace(/[\s\p{P}]+$/u, "");
  return words.split("|").some((word) => word && cleaned.toLowerCase() === word.toLowerCase());
}

interface Regenerating {
  root: string;
  turnId: string | null;
}

function Versions({
  index,
  count,
  onPick,
}: {
  index: number;
  count: number;
  onPick: (index: number) => void;
}) {
  const { t } = useI18n();
  return (
    <span className="versions">
      <button
        type="button"
        className="versions__step"
        aria-label={t("versions-previous")}
        disabled={index === 0}
        onClick={() => onPick(index - 1)}
      >
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24">
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </button>
      <span className="versions__count">
        {t("versions-count", { current: index + 1, total: count })}
      </span>
      <button
        type="button"
        className="versions__step"
        aria-label={t("versions-next")}
        disabled={index === count - 1}
        onClick={() => onPick(index + 1)}
      >
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </span>
  );
}

function rowTime(row: Row): number {
  return row.kind === "user" ? row.message.createdAt : (row.versions[0]?.createdAt ?? 0);
}

function ThoughtToggle({ thinking }: { thinking: Thinking }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="reply-meta__thought"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {thinking.effort
          ? t("reply-thought-effort", {
              seconds: thinking.seconds,
              effort: t(`thinking-${thinking.effort}`),
            })
          : t("reply-thought", { seconds: thinking.seconds })}
        {open ? " ⌃" : " ⌄"}
      </button>
      {open && (
        <div className="reply-meta__reasoning">
          <RichText text={thinking.text} />
        </div>
      )}
    </>
  );
}

function ReplyFooter({
  message,
  settled,
  versions,
}: {
  message: Message;
  settled: Settled | undefined;
  versions: { index: number; count: number; onPick: (index: number) => void } | null;
}) {
  const { t, locale } = useI18n();
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(message.createdAt);
  return (
    <span className={settled ? "reply-meta reply-meta--fresh" : "reply-meta"}>
      <span>
        {settled
          ? t("reply-meta", { time, seconds: (settled.durationMs / 1000).toFixed(1) })
          : t("reply-time", { time })}
      </span>
      {message.thinking && <ThoughtToggle thinking={message.thinking} />}
      {versions && <Versions {...versions} />}
    </span>
  );
}

export function ChatPane(full: Props) {
  const props = {
    listOpen: false,
    workspaceOpen: false,
    onToggleList: nothing,
    onToggleWorkspace: nothing,
    onNewThreadWith: nothing,
    onOpenTrip: nothing,
    onOpenDoc: nothing,
    onOpenSheet: nothing,
    onOpenDeck: nothing,
    onOpenThread: nothing,
    onCook: nothing,
    onOpenFloor: nothing,
    ...full,
  };
  const { threadId, primary, side } = props;
  const [ownQuote, setOwnQuote] = useState<Quote | null>(null);
  const quote = props.onQuote ? (props.quote ?? null) : ownQuote;
  const onQuote = props.onQuote ?? setOwnQuote;
  const { t, locale } = useI18n();
  const store = useHub();
  const state = useHubState(store);
  const openMenu = useContextMenu();
  const messages = state.messages[threadId] ?? [];
  const rows = toRows(messages);
  const drafts = draftsForThread(state, threadId);
  const thread = state.threads.find((candidate) => candidate.id === threadId);
  const title = primary ? t("app-name") : (thread?.title ?? t("thread-untitled"));
  const running = drafts.find((draft) => !draft.failure && !draft.background);
  const [queued, setQueued] = useState<Queued[]>([]);
  const workspace = useWorkspaceOf(threadId);
  const [pins, setPins] = useState<{ pinned: number[]; hidden: number[] }>({
    pinned: [],
    hidden: [],
  });
  useEffect(() => {
    if (!workspace) return;
    void store
      .threadPins(threadId)
      .then(setPins)
      .catch(() => undefined);
  }, [store, threadId, workspace]);
  const refsValue = useMemo<RefsValue | null>(
    () =>
      workspace
        ? {
            workspaceId: workspace.id,
            threadId,
            pinned: pins.pinned,
            onPin: (number, on) =>
              void store
                .pinRef(threadId, number, on)
                .then(setPins)
                .catch(() => undefined),
            onAsk: (text) => void store.send(threadId, text).catch(() => undefined),
          }
        : null,
    [workspace, threadId, pins.pinned, store],
  );
  const pinItems = useMemo(() => {
    if (!workspace) return [];
    const seen = new Map<number, string | null>();
    for (const number of pins.pinned) seen.set(number, null);
    for (const message of messages) {
      for (const link of refsIn(message.text).links) {
        if (!seen.has(link.number)) seen.set(link.number, link.repo);
      }
    }
    return [...seen.entries()]
      .filter(([number]) => !pins.hidden.includes(number))
      .map(([number, repo]) => ({ number, repo }));
  }, [workspace, pins, messages]);
  const waitingHere = queued.filter((item) => item.threadId === threadId);
  const nextQueued = waitingHere[0];
  const holding = state.compacting[threadId]?.kind === "started";
  const plan = state.plans[threadId] ?? null;
  const schedule = scheduleOfThread(state.schedules, threadId);
  const schedulesLoaded = state.schedulesLoaded;
  useEffect(() => {
    if (state.status === "open" && !schedulesLoaded)
      void store.listSchedules().catch(() => undefined);
  }, [state.status, schedulesLoaded, store]);
  const [planDocked, setPlanDocked] = usePlanDock(threadId);
  useEffect(() => {
    if (state.status === "open" && !side) void store.loadPlan(threadId).catch(() => undefined);
  }, [store, threadId, state.status, side]);
  useEffect(() => {
    if (running || holding || !nextQueued) return;
    setQueued((list) => list.filter((item) => item.id !== nextQueued.id));
    void store.send(nextQueued.threadId, nextQueued.text, {
      quote: nextQueued.quote,
      files: nextQueued.files,
      threads: nextQueued.threads,
    });
  }, [running, holding, nextQueued, store]);
  const end = useRef<HTMLLIElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const flown = useRef(new Set<string>());
  const [speaking, setSpeaking] = useState(false);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [regenerating, setRegenerating] = useState<Regenerating | null>(null);
  const [searchDialog, setSearchDialog] = useState(false);
  const fresh = primary && drafts.length === 0 && messages.every((m) => m.role === "assistant");
  const lastRow = rows.at(-1);
  const lastAnswer = lastRow?.kind === "answer" ? lastRow : null;
  const lastUser = messages.findLast((message) => message.role === "user");

  const inPlace = (draft: Draft) =>
    regenerating !== null &&
    (regenerating.turnId === draft.turnId || (regenerating.turnId === null && !draft.failure));
  const placed = drafts.find(inPlace) ?? null;
  const trailing = drafts.filter((draft) => draft !== placed);
  const questionFor = (draft: Draft) =>
    messages
      .filter((message) => message.role === "user" && message.createdAt <= draft.hubStartedAt)
      .at(-1)?.text ?? "";
  const delivered =
    running && running !== placed && running.text === "" && running.tools.length === 0 && lastUser
      ? lastUser.id
      : null;

  useEffect(() => {
    if (!regenerating?.turnId) return;
    if (!drafts.some((draft) => draft.turnId === regenerating.turnId)) setRegenerating(null);
  }, [drafts, regenerating]);

  const model = state.model
    ? (state.model.label ?? `${t(providerKey(state.model.provider))} · ${state.model.model}`)
    : t("model-not-connected");
  const subtitle =
    state.status === "open"
      ? primary
        ? t("chat-subtitle-primary", { model })
        : model
      : t(connectionKey(state.status));

  const anchor = useRef<{ height: number; top: number } | null>(null);
  const loadingOlder = useRef(false);
  const [showLoading, setShowLoading] = useState(false);
  const hasOlder = state.olderMessages[threadId] ?? false;
  const archived = state.archived[threadId];
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [unfolded, setUnfolded] = useState<Record<string, boolean>>({});
  const folded = Boolean(archived) && !unfolded[threadId];
  const loadOlder = () => {
    const node = list.current;
    if (!node || !hasOlder || loadingOlder.current) return;
    loadingOlder.current = true;
    setShowLoading(true);
    anchor.current = { height: node.scrollHeight, top: node.scrollTop };
    void store
      .loadOlderMessages(threadId)
      .catch(() => {
        anchor.current = null;
      })
      .finally(() => {
        loadingOlder.current = false;
        setShowLoading(false);
      });
  };
  const unfold = (open: boolean) => {
    setUnfolded((current) => ({ ...current, [threadId]: open }));
    if (open && !rows.some((row) => archived && rowTime(row) < archived.before)) loadOlder();
  };
  const onScroll = () => {
    const node = list.current;
    if (!node || node.scrollTop > OLDER_THRESHOLD) return;
    if (folded) unfold(true);
    else loadOlder();
  };
  const firstMessage = messages[0]?.id;
  useLayoutEffect(() => {
    const node = list.current;
    const saved = anchor.current;
    if (!node || !saved || firstMessage === undefined) return;
    node.scrollTop = node.scrollHeight - saved.height + saved.top;
    anchor.current = null;
  }, [firstMessage]);

  const lastMessage = messages.at(-1)?.id;
  const lastDraft = drafts.at(-1);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [threadId, lastMessage, lastDraft?.text, lastDraft?.tools.length, lastDraft?.memories.length]);

  useEffect(() => {
    for (const memory of lastDraft?.memories ?? []) {
      if (flown.current.has(memory.id)) continue;
      flown.current.add(memory.id);
      const chip = list.current?.querySelector<HTMLElement>(`[data-memory="${memory.id}"]`);
      if (chip) flyToMe(chip);
    }
  }, [lastDraft?.memories]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const attachments = useAttachments();
  const [dragging, setDragging] = useState(0);
  const { addPaths } = attachments;
  useEffect(() => {
    if (!isTauri()) return;
    const stop = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === "enter") setDragging(Math.max(1, payload.paths.length));
      else if (payload.type === "leave") setDragging(0);
      else if (payload.type === "drop") {
        setDragging(0);
        if (!overSidebar(payload.position)) void addPaths(payload.paths);
      }
    });
    return () => void stop.then((unlisten) => unlisten());
  }, [addPaths]);
  const send = (
    text: string,
    sentQuote: Quote | null = null,
    files: string[] = [],
    threads: string[] = [],
  ) => store.send(threadId, text, { quote: sentQuote, files, threads });
  const quoteWith = (quote: Quote | null, range: Range | null = null) => {
    highlightSource(quote ? range : null);
    onQuote(quote);
  };
  const retry = (turnId: string) => {
    store.dropDraft(turnId);
    void store.retry(threadId);
  };
  const regenerate = async (root: string) => {
    setPicked(({ [root]: _shown, ...rest }) => rest);
    setRegenerating({ root, turnId: null });
    try {
      const turnId = await store.retry(threadId);
      setRegenerating({ root, turnId });
    } catch {
      setRegenerating(null);
    }
  };
  const speak = (text: string) => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(plain(text));
    utterance.lang = locale;
    utterance.onend = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  };

  const menuFor = (event: MouseEvent<HTMLLIElement>, message: Message, root: string | null) => {
    const picked = selectedMarkdown(event.currentTarget);
    const plainSelection = window.getSelection()?.toString().trim() ?? "";
    const copy = (text: string) => void navigator.clipboard.writeText(text);
    let entries: MenuEntry[];
    if (picked) {
      const quote = quoteOf(message, picked.text);
      entries = [
        { label: t("menu-copy"), shortcut: "⌘C", onSelect: () => copy(plainSelection) },
        { label: t("menu-quote-selection"), onSelect: () => quoteWith(quote, picked.range) },
        { label: t("menu-new-thread-with"), onSelect: () => props.onNewThreadWith(quote) },
        "separator",
        {
          label: t("menu-look-up"),
          disabled: Boolean(running),
          onSelect: () => void send(t("look-up-message"), quote),
        },
      ];
    } else if (root) {
      const latest = root === lastAnswer?.root;
      entries = [
        { label: t("menu-copy"), shortcut: "⌘C", onSelect: () => copy(message.text) },
        {
          label: t("menu-quote"),
          shortcut: "⌘R",
          onSelect: () => quoteWith(quoteOf(message, message.text)),
        },
        "separator",
        {
          label: speaking ? t("menu-stop-reading") : t("menu-read-aloud"),
          onSelect: () => speak(message.text),
        },
        {
          label: t("menu-regenerate"),
          shortcut: latest ? undefined : t("menu-regenerate-last-only"),
          disabled: !latest || Boolean(running),
          onSelect: () => void regenerate(root),
        },
      ];
    } else {
      entries = [
        { label: t("menu-copy"), shortcut: "⌘C", onSelect: () => copy(message.text) },
        { label: t("menu-quote"), onSelect: () => quoteWith(quoteOf(message, message.text)) },
      ];
    }
    openMenu(event, entries);
  };

  const openThreadFromCard = (target: string) => props.onOpenThread?.(target);

  const attachmentFor = (message: Message): ReactNode => {
    const attachment = message.attachment;
    if (attachment?.kind === "trip") {
      return (
        <TripCard
          tripId={attachment.tripId}
          version={attachment.version}
          actions={{
            onOpen: props.onOpenTrip,
            onRevise: (text) => quoteWith({ text, from: null, at: null, messageId: null }),
            onConnectSearch: () => setSearchDialog(true),
          }}
        />
      );
    }
    if (attachment?.kind === "event") {
      return <EventCard event={attachment.event} />;
    }
    if (attachment?.kind === "schedule") {
      return <ScheduleCard scheduleId={attachment.scheduleId} onOpenThread={props.onOpenThread} />;
    }
    if (attachment?.kind === "schedule_failed") {
      return <FailedCard scheduleId={attachment.scheduleId} reason={attachment.reason} />;
    }
    if (attachment?.kind === "deck") {
      return <DeckCard deckId={attachment.deckId} onOpen={props.onOpenDeck} />;
    }
    if (attachment?.kind === "sheet") {
      return <SheetCard sheetId={attachment.sheetId} onOpen={props.onOpenSheet} />;
    }
    if (attachment?.kind === "doc") {
      return <DocCard docId={attachment.docId} onOpen={props.onOpenDoc} />;
    }
    if (attachment?.kind === "recipe") {
      return <RecipeCard recipeId={attachment.recipeId} onCook={props.onCook} />;
    }
    if (attachment?.kind === "floor_plan") {
      return <FloorCard planId={attachment.planId} onOpen={props.onOpenFloor} />;
    }
    if (attachment?.kind === "subthreads") {
      return <SubthreadCards threadIds={attachment.threadIds} onOpen={props.onOpenThread} />;
    }
    if (attachment?.kind === "changes") {
      return <ChangeCard threadId={threadId} files={attachment.files} />;
    }
    if (attachment?.kind === "service_needed") {
      return <SearchCard threadId={threadId} answered={messages.at(-1)?.id !== message.id} />;
    }
    if (attachment?.kind === "mail") {
      return <MailCard mail={attachment.mail} onOpenThread={openThreadFromCard} />;
    }
    if (attachment?.kind === "mail_draft") {
      return <MailDraftCard draft={attachment.draft} />;
    }
    return null;
  };

  const renderRow = (row: Row) => {
    if (row.kind === "user") {
      const message = row.message;
      const run = message.attachment;
      if (run?.kind === "schedule_run") {
        return (
          <RunMarker
            key={message.id}
            mark={run.mark}
            dueAt={run.dueAt}
            failed={runFailed(messages, messages.indexOf(message))}
          />
        );
      }
      return (
        <UserItem
          key={message.id}
          message={message}
          delivered={message.id === delivered}
          onContextMenu={(event) => menuFor(event, message, null)}
          onOpenSheet={(file) =>
            void store
              .importSheet(threadId, file.id, file.name)
              .then((book) => props.onOpenSheet(book.id))
              .catch(() => undefined)
          }
          onLookAgain={
            running
              ? undefined
              : (file, path) => void send(t("file-look-again", { name: file.name }), null, [path])
          }
        />
      );
    }
    if (placed && regenerating?.root === row.root) {
      return (
        <DraftItem
          key={row.root}
          draft={placed}
          question={questionFor(placed)}
          onRetry={() => retry(placed.turnId)}
        />
      );
    }
    const count = row.versions.length;
    const index = Math.min(picked[row.root] ?? count - 1, count - 1);
    const message = row.versions[index] ?? row.versions[0];
    if (!message) return null;
    const settled = state.settled[message.id];
    const footer =
      settled !== undefined || row === lastAnswer || count > 1 || Boolean(message.thinking);
    return (
      <AnswerItem
        key={row.root}
        message={message}
        settled={settled}
        footer={footer}
        attachment={attachmentFor(message)}
        versions={
          count > 1
            ? {
                index,
                count,
                onPick: (next) => setPicked((current) => ({ ...current, [row.root]: next })),
              }
            : null
        }
        onContextMenu={(event) => menuFor(event, message, row.root)}
      />
    );
  };

  return (
    <RefsContext value={refsValue}>
      <main className="chat" data-side={side ? true : undefined} aria-label={side?.labels.title}>
        {side ? (
          <header className="chat__side-head">
            <b>{side.labels.title}</b>
            <span>{side.labels.note}</span>
          </header>
        ) : (
          <header className="chat__header">
            <PanelToggle side="list" open={props.listOpen} onToggle={props.onToggleList} />
            <div className="chat__heading">
              <h1 className="chat__title">{title}</h1>
              {state.status !== "open" ? (
                <p className="chat__subtitle">{subtitle}</p>
              ) : (
                primary && <p className="chat__subtitle">{t("chat-subtitle-lead")}</p>
              )}
            </div>
            <PanelToggle
              side="workspace"
              open={props.workspaceOpen}
              onToggle={props.onToggleWorkspace}
            />
          </header>
        )}
        {!side && plan && !planDocked && (
          <div className="chat__plan">
            <PlanCard
              plan={plan}
              openers={{
                onOpenDoc: (id) => props.onOpenDoc(id),
                onOpenSheet: props.onOpenSheet,
                onOpenDeck: (id) => props.onOpenDeck(id),
              }}
              onDock={setPlanDocked}
              onAsk={() =>
                document.querySelector<HTMLInputElement>(".composer__field input")?.focus()
              }
            />
          </div>
        )}
        {!side && schedule && (
          <div className="chat__plan">
            <ScheduleBar schedule={schedule} />
          </div>
        )}
        {!side && <Pins items={pinItems} />}
        <ol ref={list} className="chat__messages" aria-live="polite" onScroll={onScroll}>
          {showLoading && (
            <li className="older-loading" aria-live="polite">
              <span className="older-loading__dot" aria-hidden="true" />
              {t("archive-loading")}
            </li>
          )}
          {archived && folded && (
            <li className="archive-divider">
              <span>{t("archive-folded", { count: archived.count })}</span>
              <button type="button" onClick={() => setSummaryOpen(!summaryOpen)}>
                {t("archive-summary")}
              </button>
              <button type="button" onClick={() => unfold(true)}>
                {t("archive-expand")}
              </button>
            </li>
          )}
          {archived && summaryOpen && (
            <SummaryNote threadId={threadId} onClose={() => setSummaryOpen(false)} />
          )}
          {archived && !folded && (
            <li className="archived-block">
              <ol className="archived-block__list">
                {rows.filter((row) => rowTime(row) < archived.before).map(renderRow)}
              </ol>
            </li>
          )}
          {archived && !folded && (
            <li className="archive-divider">
              <span>{t("archive-above")}</span>
              <button type="button" onClick={() => unfold(false)}>
                {t("archive-collapse")}
              </button>
            </li>
          )}
          {rows.filter((row) => !archived || rowTime(row) >= archived.before).map(renderRow)}
          {trailing.map((draft) => (
            <DraftItem
              key={draft.turnId}
              draft={draft}
              question={questionFor(draft)}
              onRetry={() => retry(draft.turnId)}
            />
          ))}
          {running && <WritingDocs threadId={threadId} onOpen={props.onOpenDoc} />}
          {running && <WritingDecks threadId={threadId} onOpen={props.onOpenDeck} />}
          {waitingHere.map((item) => (
            <li key={item.id} className="bubble bubble--user bubble--queued">
              <InlineText text={item.text} />
              <span className="bubble__queued">{t("composer-queued")}</span>
            </li>
          ))}
          {state.confirms
            .filter(
              (confirm) => confirm.threadId === threadId && confirm.kind.kind !== "permissions",
            )
            .map((confirm) => (
              <li key={confirm.id} className="bubble bubble--assistant bubble--confirm">
                <ConfirmCard confirm={confirm} />
              </li>
            ))}
          {side && messages.length === 0 && trailing.length === 0 && (
            <li className="chat__side-hint">{side.labels.hint}</li>
          )}
          {side?.extra && <li className="chat__side-extra">{side.extra}</li>}
          {!side && fresh && messages.length > 0 && (
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
          <CompactStatus threadId={threadId} />
          <li ref={end} className="chat__end" aria-hidden="true" />
        </ol>
        {!side && <BranchBar threadId={threadId} />}
        <Composer
          busy={Boolean(running) || holding}
          placeholder={
            side?.labels.placeholder ?? (schedule ? t("schedule-composer-hint") : undefined)
          }
          quote={quote}
          onClearQuote={() => quoteWith(null)}
          attachments={attachments}
          threadId={threadId}
          onSend={async (text, threadRefs) => {
            const files = attachments.ready.map((file) => file.path);
            if (running || holding) {
              if (running && isCancel(text, t("composer-cancel-words"))) {
                await store.cancel(running.turnId);
                return;
              }
              counter += 1;
              setQueued((list) => [
                ...list,
                { id: counter, threadId, text, quote, files, threads: threadRefs },
              ]);
            } else {
              await send(text, quote, files, threadRefs);
            }
            quoteWith(null);
            attachments.clear();
          }}
          onStop={() => (running ? store.cancel(running.turnId) : Promise.resolve())}
          footer={
            state.status === "open" && (
              <>
                <ModelMenu threadId={threadId} />
                <ContextMeter threadId={threadId} />
              </>
            )
          }
        />
        {dragging > 0 && <DropZone count={dragging} />}
        {searchDialog && (
          <SearchDialog threadId={threadId} onClose={() => setSearchDialog(false)} />
        )}
      </main>
    </RefsContext>
  );
}

function UserItem({
  message,
  delivered,
  onContextMenu,
  onLookAgain,
  onOpenSheet,
}: {
  message: Message;
  delivered: boolean;
  onContextMenu: (event: MouseEvent<HTMLLIElement>) => void;
  onLookAgain: ((file: FileInfo, path: string) => void) | undefined;
  onOpenSheet: (file: FileInfo) => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  if (message.attachment?.kind === "report") {
    return (
      <li className="report" data-message-id={message.id} onContextMenu={onContextMenu}>
        <b className="report__title">
          {t("subthread-report-title", { title: message.attachment.title })}
        </b>
        <RichText text={message.text} />
      </li>
    );
  }
  return (
    <>
      {message.files.length > 0 && (
        <li className="sent-files-row">
          <SentFiles files={message.files} onLookAgain={onLookAgain} onOpenSheet={onOpenSheet} />
        </li>
      )}
      <li
        className="bubble bubble--user"
        data-message-id={message.id}
        onContextMenu={onContextMenu}
      >
        {message.quote && (
          <QuoteBlock
            quote={message.quote}
            tone="blue"
            onOpen={() => findAndJump(store, message.threadId, message.quote?.messageId)}
          />
        )}
        <InlineText text={message.text} />
      </li>
      {delivered && <li className="delivered">{t("delivered")}</li>}
    </>
  );
}

function AnswerItem({
  message,
  settled,
  footer,
  attachment,
  versions,
  onContextMenu,
}: {
  message: Message;
  settled: Settled | undefined;
  footer: boolean;
  attachment: ReactNode;
  versions: { index: number; count: number; onPick: (index: number) => void } | null;
  onContextMenu: (event: MouseEvent<HTMLLIElement>) => void;
}) {
  return (
    <>
      {settled && <TraceSummary trace={settled} />}
      <li
        className={
          settled ? "bubble bubble--assistant bubble--settled" : "bubble bubble--assistant"
        }
        data-message-id={message.id}
        onContextMenu={onContextMenu}
      >
        <RichText text={message.text} />
        {settled && <span className="caret caret--done" aria-hidden="true" />}
        {attachment}
        {footer && <ReplyFooter message={message} settled={settled} versions={versions} />}
      </li>
      {settled && <MemoryChips memories={settled.memories} />}
    </>
  );
}

function DraftItem({
  draft,
  question,
  onRetry,
}: {
  draft: Draft;
  question: string;
  onRetry: () => void;
}) {
  const store = useHub();
  if (draft.background && !draft.failure) return <BackgroundCard draft={draft} title={question} />;
  return (
    <>
      {draft.tools.length > 0 && draft.text !== "" && <TraceSummary trace={draft} />}
      <DraftBubble
        draft={draft}
        onRetry={onRetry}
        onBackground={() => void store.background(draft.turnId)}
      />
      <MemoryChips memories={draft.memories} />
    </>
  );
}
