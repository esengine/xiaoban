import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Thread } from "@xiaoban/protocol";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { ConfirmDialog } from "../dialog/ConfirmDialog.tsx";
import { useContextMenu } from "../menu/ContextMenu.tsx";
import { plain } from "./plain.ts";
import { firstGrapheme, orderThreads, toneOf } from "./threads.ts";
import { recency } from "./time.ts";

interface Props {
  threads: Thread[];
  primaryId: string | null;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

const UNREAD_KEY = "xiaoban.unread";

function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function useUnread(threads: Thread[], activeId: string | null) {
  const [unread, setUnread] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem(UNREAD_KEY) ?? "[]") as string[]),
  );
  const seen = useRef(new Map<string, number>());

  useEffect(() => {
    localStorage.setItem(UNREAD_KEY, JSON.stringify([...unread]));
  }, [unread]);

  useEffect(() => {
    const changed: string[] = [];
    for (const thread of threads) {
      const before = seen.current.get(thread.id);
      if (before !== undefined && thread.updatedAt > before && thread.id !== activeId) {
        changed.push(thread.id);
      }
      seen.current.set(thread.id, thread.updatedAt);
    }
    if (changed.length > 0) setUnread((current) => new Set([...current, ...changed]));
  }, [threads, activeId]);

  useEffect(() => {
    if (!activeId) return;
    setUnread((current) => {
      if (!current.has(activeId)) return current;
      const next = new Set(current);
      next.delete(activeId);
      return next;
    });
  }, [activeId]);

  const mark = (id: string) => setUnread((current) => new Set([...current, id]));
  return { unread, mark };
}

export function ThreadList({ threads, primaryId, activeId, onSelect, onNew }: Props) {
  const { t, locale } = useI18n();
  const store = useHub();
  const openMenu = useContextMenu();
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Thread | null>(null);
  const { unread, mark } = useUnread(threads, activeId);
  const now = useMinute();

  const titleOf = (thread: Thread) =>
    thread.id === primaryId ? t("app-name") : (thread.title ?? t("thread-untitled"));
  const when = (time: number) => {
    const value = recency(time, now, locale);
    switch (value.kind) {
      case "now":
        return t("time-just-now");
      case "yesterday":
        return t("time-yesterday");
      default:
        return value.text;
    }
  };

  const needle = query.trim().toLocaleLowerCase(locale);
  const visible = orderThreads(threads, primaryId).filter(
    (thread) =>
      !needle ||
      [titleOf(thread), thread.lastMessage ?? ""].some((text) =>
        text.toLocaleLowerCase(locale).includes(needle),
      ),
  );

  const { drafts, confirms } = useHubState(store);
  const statusOf = (id: string): "need" | "running" | "done" =>
    confirms.some((confirm) => confirm.threadId === id)
      ? "need"
      : Object.values(drafts).some((draft) => draft.threadId === id && !draft.failure)
        ? "running"
        : "done";
  const known = new Set(threads.map((thread) => thread.id));
  const nested = visible
    .filter((thread) => !thread.parentId || !known.has(thread.parentId))
    .flatMap((thread) => [
      { thread, child: false },
      ...threads
        .filter((candidate) => candidate.parentId === thread.id)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((candidate) => ({ thread: candidate, child: true })),
    ]);

  const finishRename = (thread: Thread, value: string) => {
    setRenaming(null);
    const title = value.trim();
    if (title && title !== titleOf(thread)) void store.renameThread(thread.id, title);
  };
  const renameKeys = (event: KeyboardEvent<HTMLInputElement>, thread: Thread) => {
    if (event.key === "Enter") finishRename(thread, event.currentTarget.value);
    if (event.key === "Escape") setRenaming(null);
  };

  return (
    <aside className="threads">
      <div className="threads__search">
        <label className="search">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="visually-hidden">{t("search-label")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search-placeholder")}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className="threads__new"
          aria-label={t("thread-new")}
          title={t("thread-new-shortcut")}
          onClick={onNew}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      <ul className="threads__list">
        {nested.map(({ thread, child }) => {
          const primary = thread.id === primaryId;
          const status = child ? statusOf(thread.id) : null;
          const title = titleOf(thread);
          const isUnread = unread.has(thread.id) && thread.id !== activeId;
          return (
            <li key={thread.id} data-child={child || undefined}>
              <button
                type="button"
                className="thread-row"
                aria-current={thread.id === activeId}
                data-unread={isUnread || undefined}
                onClick={() => onSelect(thread.id)}
                onContextMenu={(event) =>
                  openMenu(event, [
                    { label: t("menu-open"), shortcut: "↩", onSelect: () => onSelect(thread.id) },
                    {
                      label: t("menu-rename"),
                      disabled: primary,
                      onSelect: () => setRenaming(thread.id),
                    },
                    {
                      label: t("menu-mark-unread"),
                      disabled: isUnread || thread.id === activeId,
                      onSelect: () => mark(thread.id),
                    },
                    "separator",
                    {
                      label: t("menu-delete-thread"),
                      danger: true,
                      disabled: primary,
                      onSelect: () => setDeleting(thread),
                    },
                  ])
                }
              >
                <span
                  className={`thread-row__mark thread-row__mark--${primary ? "primary" : toneOf(thread.id)}`}
                  aria-hidden="true"
                >
                  {primary ? t("app-mark") : firstGrapheme(title)}
                </span>
                <span className="thread-row__body">
                  <span className="thread-row__top">
                    {renaming === thread.id ? (
                      <input
                        className="thread-row__rename"
                        defaultValue={title}
                        aria-label={t("menu-rename")}
                        onClick={(event) => event.stopPropagation()}
                        onBlur={(event) => finishRename(thread, event.currentTarget.value)}
                        onKeyDown={(event) => renameKeys(event, thread)}
                        ref={(field) => field?.select()}
                      />
                    ) : (
                      <span className="thread-row__title">{title}</span>
                    )}
                    <time
                      className="thread-row__time"
                      dateTime={new Date(thread.updatedAt).toISOString()}
                    >
                      {when(thread.updatedAt)}
                    </time>
                  </span>
                  <span className="thread-row__bottom">
                    {status && (
                      <span className="thread-row__status" data-status={status}>
                        {t(`thread-status-${status}`)}
                      </span>
                    )}
                    {thread.lastMessage && (
                      <span className="thread-row__last">{plain(thread.lastMessage)}</span>
                    )}
                    {isUnread && (
                      <span className="thread-row__unread">
                        <span className="visually-hidden">{t("thread-unread")}</span>
                      </span>
                    )}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!needle && threads.length <= 1 && <p className="threads__hint">{t("thread-list-hint")}</p>}
      {deleting && (
        <ConfirmDialog
          title={t("delete-thread-title", { title: titleOf(deleting) })}
          body={t("delete-thread-body")}
          confirm={t("delete-thread-confirm")}
          onConfirm={() => void store.deleteThread(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </aside>
  );
}
