import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { DirEntry, FileDiff, Workspace } from "@xiaoban/protocol";
import { type MouseEvent, useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { Chevron, FolderIcon } from "../chat/ThreadList.tsx";

interface Props {
  workspace: Workspace;
  changes: FileDiff[];
  active: string | null;
  onOpen: (path: string) => void;
  onMenu: (event: MouseEvent, entry: DirEntry) => void;
  onCollapse: () => void;
}

export function FileIcon() {
  return (
    <svg className="folder-icon" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v4h4" />
    </svg>
  );
}

export function SideIcon() {
  return (
    <svg className="code-side-icon" aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

export function FileTree({ workspace, changes, active, onOpen, onMenu, onCollapse }: Props) {
  const { t } = useI18n();
  const store = useHub();
  const { filesVersion } = useHubState(store);
  const version = filesVersion[workspace.id] ?? 0;
  const [dirs, setDirs] = useState<Record<string, DirEntry[]>>({});
  const [open, setOpen] = useState<Set<string>>(new Set(["."]));
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    void version;
    for (const path of open) {
      store
        .listDir(workspace.id, path)
        .then((entries) => live && setDirs((current) => ({ ...current, [path]: entries })))
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [store, workspace.id, open, version]);

  const marks = new Map<string, "changed" | "added">();
  for (const file of changes) {
    if (file.status === "deleted") continue;
    marks.set(file.path, file.status === "added" ? "added" : "changed");
  }
  const needle = query.trim().toLowerCase();

  const toggle = (path: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const rows: { entry: DirEntry; depth: number }[] = [];
  const walk = (path: string, depth: number) => {
    for (const entry of dirs[path] ?? []) {
      const matches = !needle || entry.dir || entry.name.toLowerCase().includes(needle);
      if (matches) rows.push({ entry, depth });
      if (entry.dir && open.has(entry.path)) walk(entry.path, depth + 1);
    }
  };
  walk(".", 0);

  return (
    <nav className="code-tree" aria-label={t("code-files")}>
      <div className="code-tree__head">
        <span>{t("code-files")}</span>
        <button
          type="button"
          className="code-icon-button"
          aria-label={t("code-files-collapse")}
          title={t("code-files-collapse")}
          onClick={onCollapse}
        >
          <SideIcon />
        </button>
      </div>
      <label className="code-tree__search">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4-4" />
        </svg>
        <span className="visually-hidden">{t("code-files-search")}</span>
        <input
          type="search"
          value={query}
          placeholder={t("code-files-search")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <ul className="code-tree__list">
        {rows.map(({ entry, depth }) => {
          const mark = marks.get(entry.path);
          return (
            <li key={entry.path}>
              <button
                type="button"
                className="code-tree__row"
                style={{ paddingLeft: 8 + depth * 14 }}
                aria-current={entry.path === active || undefined}
                aria-expanded={entry.dir ? open.has(entry.path) : undefined}
                data-mark={mark}
                onClick={() => (entry.dir ? toggle(entry.path) : onOpen(entry.path))}
                onContextMenu={(event) => onMenu(event, entry)}
              >
                <Chevron open={open.has(entry.path)} hidden={!entry.dir} />
                {entry.dir ? <FolderIcon open={open.has(entry.path)} /> : <FileIcon />}
                <span className="code-tree__name">{entry.name}</span>
                {mark && (
                  <span className="code-tree__mark">
                    {t(mark === "added" ? "code-mark-added" : "code-mark-changed")}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
