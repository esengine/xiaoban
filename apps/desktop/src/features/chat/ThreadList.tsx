import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Thread, Workspace } from "@xiaoban/protocol";
import {
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
  onNew: (workspaceId?: string) => void;
  onAddWorkspace: () => void;
}

const COLLAPSED_KEY = "xiaoban.workspaces.collapsed";
const GROUP_SHOWN = 5;

const UNREAD_KEY = "xiaoban.unread";
const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function tilde(path: string): string {
  const home = /^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/.exec(path)?.[0];
  return home ? `~${path.slice(home.length)}` : path;
}

export function overSidebar(position: { x: number; y: number }): boolean {
  const ratio = window.devicePixelRatio || 1;
  const element = document.elementFromPoint(position.x / ratio, position.y / ratio);
  return Boolean(element?.closest(".threads"));
}

function useFolderDrop(onFolders: (paths: string[]) => void) {
  const [over, setOver] = useState<string | null>(null);
  const paths = useRef<string[]>([]);
  useEffect(() => {
    if (!isTauri()) return;
    const stop = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === "enter") paths.current = payload.paths;
      if (payload.type === "enter" || payload.type === "over") {
        const name = paths.current[0]?.split(/[\\/]/).filter(Boolean).pop() ?? "";
        setOver(overSidebar(payload.position) ? name : null);
      } else if (payload.type === "leave") {
        setOver(null);
      } else if (payload.type === "drop") {
        setOver(null);
        if (overSidebar(payload.position)) onFolders(payload.paths);
      }
    });
    return () => void stop.then((unlisten) => unlisten());
  }, [onFolders]);
  return over;
}

export function Chevron({ open, hidden = false }: { open: boolean; hidden?: boolean }) {
  return (
    <svg
      className="chevron"
      data-open={open || undefined}
      data-hidden={hidden || undefined}
      aria-hidden="true"
      viewBox="0 0 16 16"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

export function FolderIcon({ open = false }: { open?: boolean }) {
  if (open) {
    return (
      <svg className="folder-icon" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M3 19V6h6l2 2h8v3" />
        <path d="M3 19l3-8h16l-3 8z" />
      </svg>
    );
  }
  return (
    <svg className="folder-icon" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M3 6h6l2 2h10v11H3z" />
    </svg>
  );
}

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

export function ThreadList({
  threads,
  primaryId,
  activeId,
  onSelect,
  onNew,
  onAddWorkspace,
}: Props) {
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

  const { drafts, confirms, workspaces } = useHubState(store);
  const dropping = useFolderDrop(
    useCallback(
      (paths: string[]) => {
        for (const path of paths) void store.createWorkspace(path).catch(() => undefined);
      },
      [store],
    ),
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? "[]") as string[]),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renamingWorkspace, setRenamingWorkspace] = useState<string | null>(null);
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  }, [collapsed]);
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };
  const statusOf = (id: string): "need" | "running" | "done" =>
    confirms.some((confirm) => confirm.threadId === id)
      ? "need"
      : Object.values(drafts).some((draft) => draft.threadId === id && !draft.failure)
        ? "running"
        : "done";
  const known = new Set(threads.map((thread) => thread.id));
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const shown = visible.filter(
    (thread) =>
      thread.id === primaryId || thread.id === activeId || thread.lastMessage !== null || needle,
  );
  const withChildren = (list: Thread[]) =>
    list
      .filter((thread) => !thread.parentId || !known.has(thread.parentId))
      .flatMap((thread) => [
        { thread, child: false },
        ...threads
          .filter((candidate) => candidate.parentId === thread.id)
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((candidate) => ({ thread: candidate, child: true })),
      ]);
  const inGroup = (thread: Thread) =>
    thread.workspaceId !== null && workspaceIds.has(thread.workspaceId) && thread.id !== primaryId;
  const primaryRows = shown.filter((thread) => thread.id === primaryId);
  const otherRows = withChildren(
    shown.filter((thread) => thread.id !== primaryId && !inGroup(thread)),
  );
  const groups = workspaces.map((workspace) => {
    const own = shown.filter((thread) => inGroup(thread) && thread.workspaceId === workspace.id);
    return {
      workspace,
      rows: withChildren(own),
      count: own.filter((thread) => !thread.parentId).length,
    };
  });
  const groupBusy = (workspace: Workspace) =>
    threads.some(
      (thread) =>
        thread.workspaceId === workspace.id &&
        ((unread.has(thread.id) && thread.id !== activeId) || statusOf(thread.id) !== "done"),
    );

  const finishRename = (thread: Thread, value: string) => {
    setRenaming(null);
    const title = value.trim();
    if (title && title !== titleOf(thread)) void store.renameThread(thread.id, title);
  };
  const renameKeys = (event: KeyboardEvent<HTMLInputElement>, thread: Thread) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") finishRename(thread, event.currentTarget.value);
    if (event.key === "Escape") setRenaming(null);
  };

  const newMenu = (event: MouseEvent) =>
    openMenu(event, [
      { label: t("thread-new"), shortcut: "⌘N", onSelect: () => onNew() },
      {
        label: t("workspace-new-thread-in"),
        shortcut: "⌘⇧N",
        disabled: workspaces.length === 0,
        onSelect: () => pickWorkspace(event),
      },
      "separator",
      { label: t("workspace-add"), onSelect: onAddWorkspace },
    ]);
  const pickWorkspace = (event: MouseEvent) =>
    openMenu(
      event,
      workspaces.map((workspace) => ({
        label: workspace.name,
        onSelect: () => onNew(workspace.id),
      })),
    );
  const native = (command: string, path: string) => {
    if (isTauri()) void invoke(command, { path }).catch(() => undefined);
  };
  const workspaceMenu = (event: MouseEvent, workspace: Workspace) =>
    openMenu(event, [
      { label: t("workspace-new-thread"), shortcut: "⌘⇧N", onSelect: () => onNew(workspace.id) },
      {
        label: MAC ? t("file-menu-reveal-mac") : t("file-menu-reveal-windows"),
        onSelect: () => native("file_reveal", workspace.path),
      },
      { label: t("code-open-editor"), onSelect: () => native("open_in_editor", workspace.path) },
      "separator",
      { label: t("menu-rename"), onSelect: () => setRenamingWorkspace(workspace.id) },
      { label: t("workspace-remove"), onSelect: () => void store.removeWorkspace(workspace.id) },
    ]);
  const finishWorkspaceRename = (workspace: Workspace, value: string) => {
    setRenamingWorkspace(null);
    const name = value.trim();
    if (name && name !== workspace.name) void store.renameWorkspace(workspace.id, name);
  };

  const row = ({ thread, child }: { thread: Thread; child: boolean }, grouped = false) => {
    const primary = thread.id === primaryId;
    const status = child ? statusOf(thread.id) : null;
    const title = titleOf(thread);
    const isUnread = unread.has(thread.id) && thread.id !== activeId;
    return (
      <li key={thread.id} data-child={child || undefined} data-grouped={grouped || undefined}>
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
                  // biome-ignore lint/a11y/noAutofocus: renaming starts from an explicit menu choice
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
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
  };

  return (
    <aside className="threads" data-dropping={dropping !== null || undefined}>
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
          onClick={(event) => newMenu(event)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      <div className="threads__scroll">
        {dropping !== null && (
          <p className="threads__drop">{t("workspace-drop", { name: dropping })}</p>
        )}
        <ul className="threads__list">
          {primaryRows.map((thread) => row({ thread, child: false }))}
        </ul>
        {groups.length > 0 && (
          <>
            <p className="threads__section">{t("workspace-section")}</p>
            {groups.map(({ workspace, rows, count }) => {
              const open = !collapsed.has(workspace.id) || Boolean(needle);
              const more = expanded.has(workspace.id) ? 0 : Math.max(0, count - GROUP_SHOWN);
              let parents = 0;
              const visibleRows = rows.filter(({ child }) => {
                if (!child) parents += 1;
                return more === 0 || parents <= GROUP_SHOWN;
              });
              return (
                <section key={workspace.id} className="workspace-group" aria-label={workspace.name}>
                  {/* biome-ignore lint/a11y/noStaticElementInteractions: the right-click menu repeats the ⋯ button */}
                  <div
                    className="workspace-group__head"
                    onContextMenu={(event) => workspaceMenu(event, workspace)}
                  >
                    {renamingWorkspace === workspace.id ? (
                      <div className="workspace-group__toggle" data-renaming>
                        <Chevron open={open} />
                        <FolderIcon />
                        <input
                          className="workspace-group__rename"
                          defaultValue={workspace.name}
                          aria-label={t("menu-rename")}
                          // biome-ignore lint/a11y/noAutofocus: renaming starts from an explicit menu choice
                          autoFocus
                          onFocus={(event) => event.currentTarget.select()}
                          onBlur={(event) =>
                            finishWorkspaceRename(workspace, event.currentTarget.value)
                          }
                          onKeyDown={(event) => {
                            if (event.nativeEvent.isComposing) return;
                            if (event.key === "Enter") event.currentTarget.blur();
                            if (event.key === "Escape") {
                              event.currentTarget.value = workspace.name;
                              event.currentTarget.blur();
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="workspace-group__toggle"
                        aria-expanded={open}
                        onClick={() => setCollapsed((current) => toggle(current, workspace.id))}
                        onDoubleClick={() => setRenamingWorkspace(workspace.id)}
                      >
                        <Chevron open={open} />
                        <FolderIcon />
                        <span className="workspace-group__name">{workspace.name}</span>
                        <span className="workspace-group__path">{tilde(workspace.path)}</span>
                      </button>
                    )}
                    <span className="workspace-group__meta">
                      {groupBusy(workspace) && <span className="workspace-group__dot" />}
                      <span>{count}</span>
                    </span>
                    <span className="workspace-group__actions">
                      <button
                        type="button"
                        aria-label={t("workspace-new-thread")}
                        title={t("workspace-new-thread")}
                        onClick={() => onNew(workspace.id)}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        aria-label={t("workspace-more")}
                        onClick={(event) => workspaceMenu(event, workspace)}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <circle cx="6" cy="12" r="1.3" />
                          <circle cx="12" cy="12" r="1.3" />
                          <circle cx="18" cy="12" r="1.3" />
                        </svg>
                      </button>
                    </span>
                  </div>
                  {open && (
                    <ul className="threads__list">
                      {visibleRows.map((item) => row(item, true))}
                      {more > 0 && (
                        <li>
                          <button
                            type="button"
                            className="workspace-group__more"
                            onClick={() => setExpanded((current) => toggle(current, workspace.id))}
                          >
                            {t("workspace-more-threads", { count: more })}
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </section>
              );
            })}
            {otherRows.length > 0 && (
              <p className="threads__section">{t("thread-section-other")}</p>
            )}
          </>
        )}
        <ul className="threads__list">{otherRows.map((item) => row(item))}</ul>
      </div>
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
