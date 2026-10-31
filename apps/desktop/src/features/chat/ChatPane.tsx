import { connectionKey, providerKey, type Settled } from "@xiaoban/client";
import { draftsForThread, useHubState } from "@xiaoban/client/react";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { ContextNote, Message } from "@xiaoban/protocol";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { type MenuEntry, useContextMenu } from "../menu/ContextMenu.tsx";
import { Composer } from "./Composer.tsx";
import { DraftBubble } from "./DraftBubble.tsx";
import { flyToMe } from "./flyToMe.ts";
import { PanelToggle } from "./PanelToggle.tsx";
import { plain } from "./plain.ts";
import { RichText } from "./RichText.tsx";
import { MemoryChips, TraceSummary } from "./Trace.tsx";

const SUGGESTIONS: readonly PlainMessageKey[] = [
  "home-suggestion-umbrella",
  "home-suggestion-expense",
  "home-suggestion-weekend",
];

interface Props {
  threadId: string;
  primary: boolean;
  listOpen: boolean;
  workspaceOpen: boolean;
  onToggleList: () => void;
  onToggleWorkspace: () => void;
  quote: string | null;
  onQuote: (text: string | null) => void;
  onNewThreadWith: (text: string) => void;
}

function selectionWithin(element: Element): string {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return "";
  const range = selection.getRangeAt(0);
  return element.contains(range.commonAncestorContainer) ? selection.toString().trim() : "";
}

function ReplyFooter({ message, settled }: { message: Message; settled: Settled | undefined }) {
  const { t, locale } = useI18n();
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(message.createdAt);
  return (
    <span className={settled ? "reply-meta reply-meta--fresh" : "reply-meta"}>
      {settled
        ? t("reply-meta", { time, seconds: (settled.durationMs / 1000).toFixed(1) })
        : t("reply-time", { time })}
    </span>
  );
}

export function ChatPane(props: Props) {
  const { threadId, primary, quote, onQuote } = props;
  const { t, locale } = useI18n();
  const store = useHub();
  const state = useHubState(store);
  const openMenu = useContextMenu();
  const messages = state.messages[threadId] ?? [];
  const drafts = draftsForThread(state, threadId);
  const thread = state.threads.find((candidate) => candidate.id === threadId);
  const title = primary ? t("app-name") : (thread?.title ?? t("thread-untitled"));
  const running = drafts.find((draft) => !draft.failure);
  const end = useRef<HTMLLIElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const flown = useRef(new Set<string>());
  const [speaking, setSpeaking] = useState(false);
  const fresh = primary && drafts.length === 0 && messages.every((m) => m.role === "assistant");
  const lastAssistant = messages.findLast((message) => message.role === "assistant");
  const lastUser = messages.findLast((message) => message.role === "user");
  const delivered =
    running && running.text === "" && running.tools.length === 0 && lastUser ? lastUser.id : null;

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

  const send = (text: string, context: ContextNote[] = []) => store.send(threadId, text, context);
  const retry = (turnId: string) => {
    store.dropDraft(turnId);
    void store.retry(threadId);
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

  const menuFor = (event: MouseEvent<HTMLLIElement>, message: Message) => {
    const selected = selectionWithin(event.currentTarget);
    const copy = (text: string) => void navigator.clipboard.writeText(text);
    let entries: MenuEntry[];
    if (selected) {
      entries = [
        { label: t("menu-copy"), shortcut: "⌘C", onSelect: () => copy(selected) },
        { label: t("menu-quote-selection"), onSelect: () => onQuote(selected) },
        { label: t("menu-new-thread-with"), onSelect: () => props.onNewThreadWith(selected) },
        "separator",
        {
          label: t("menu-look-up"),
          disabled: Boolean(running),
          onSelect: () => void send(t("look-up-prompt", { text: selected })),
        },
      ];
    } else if (message.role === "assistant") {
      entries = [
        { label: t("menu-copy"), shortcut: "⌘C", onSelect: () => copy(message.text) },
        { label: t("menu-quote"), shortcut: "⌘R", onSelect: () => onQuote(message.text) },
        "separator",
        {
          label: speaking ? t("menu-stop-reading") : t("menu-read-aloud"),
          onSelect: () => speak(message.text),
        },
        {
          label: t("menu-regenerate"),
          shortcut: message.id === lastAssistant?.id ? undefined : t("menu-regenerate-last-only"),
          disabled: message.id !== lastAssistant?.id || Boolean(running),
          onSelect: () => void store.retry(threadId),
        },
      ];
    } else {
      entries = [
        { label: t("menu-copy"), shortcut: "⌘C", onSelect: () => copy(message.text) },
        { label: t("menu-quote"), onSelect: () => onQuote(message.text) },
      ];
    }
    openMenu(event, entries);
  };

  return (
    <main className="chat">
      <header className="chat__header">
        <PanelToggle side="list" open={props.listOpen} onToggle={props.onToggleList} />
        <div className="chat__heading">
          <h1 className="chat__title">{title}</h1>
          <p className="chat__subtitle">{subtitle}</p>
        </div>
        <PanelToggle
          side="workspace"
          open={props.workspaceOpen}
          onToggle={props.onToggleWorkspace}
        />
      </header>
      <ol ref={list} className="chat__messages" aria-live="polite">
        {messages.map((message) => {
          const settled = state.settled[message.id];
          const showFooter =
            message.role === "assistant" &&
            (settled !== undefined || message.id === lastAssistant?.id);
          return (
            <MessageItem
              key={message.id}
              message={message}
              settled={settled}
              footer={showFooter}
              delivered={message.id === delivered}
              onContextMenu={(event) => menuFor(event, message)}
            />
          );
        })}
        {drafts.map((draft) => (
          <DraftItem key={draft.turnId} draft={draft} onRetry={() => retry(draft.turnId)} />
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
        quote={quote}
        onClearQuote={() => onQuote(null)}
        onSend={(text) =>
          send(text, quote ? [{ label: t("quote-label"), body: quote }] : []).then(() =>
            onQuote(null),
          )
        }
        onStop={() => (running ? store.cancel(running.turnId) : Promise.resolve())}
      />
    </main>
  );
}

function MessageItem({
  message,
  settled,
  footer,
  delivered,
  onContextMenu,
}: {
  message: Message;
  settled: Settled | undefined;
  footer: boolean;
  delivered: boolean;
  onContextMenu: (event: MouseEvent<HTMLLIElement>) => void;
}) {
  const { t } = useI18n();
  if (message.role === "user") {
    return (
      <>
        <li className="bubble bubble--user" onContextMenu={onContextMenu}>
          {message.text}
        </li>
        {delivered && <li className="delivered">{t("delivered")}</li>}
      </>
    );
  }
  return (
    <>
      {settled && <TraceSummary trace={settled} />}
      <li
        className={
          settled ? "bubble bubble--assistant bubble--settled" : "bubble bubble--assistant"
        }
        onContextMenu={onContextMenu}
      >
        <RichText text={message.text} />
        {settled && <span className="caret caret--done" aria-hidden="true" />}
        {footer && <ReplyFooter message={message} settled={settled} />}
      </li>
      {settled && <MemoryChips memories={settled.memories} />}
    </>
  );
}

function DraftItem({
  draft,
  onRetry,
}: {
  draft: import("@xiaoban/client").Draft;
  onRetry: () => void;
}) {
  return (
    <>
      {draft.tools.length > 0 && draft.text !== "" && <TraceSummary trace={draft} />}
      <DraftBubble draft={draft} onRetry={onRetry} />
      <MemoryChips memories={draft.memories} />
    </>
  );
}
