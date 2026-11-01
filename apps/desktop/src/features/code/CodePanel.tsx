import { invoke, isTauri } from "@tauri-apps/api/core";
import { useI18n } from "@xiaoban/i18n/react";
import type { DirEntry, Workspace } from "@xiaoban/protocol";
import { type MouseEvent, useEffect, useState } from "react";
import { useContextMenu } from "../menu/ContextMenu.tsx";
import { DiffView } from "./DiffView.tsx";
import { FileTree, SideIcon } from "./FileTree.tsx";
import { FileView } from "./FileView.tsx";
import { Terminal } from "./Terminal.tsx";
import { nameOf, useChanges, useGit } from "./useCode.ts";

const SHOW_EVENT = "xiaoban:code-show";
const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function showCode(tab: "changes" | "terminal") {
  window.dispatchEvent(new CustomEvent(SHOW_EVENT, { detail: tab }));
}

type Tab = { kind: "changes" } | { kind: "terminal" } | { kind: "file"; path: string };

function OutIcon() {
  return (
    <svg className="code-side-icon" aria-hidden="true" viewBox="0 0 24 24">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
    </svg>
  );
}

export function CodePanel({
  threadId,
  workspace,
  onQuote,
  onAsk,
}: {
  threadId: string;
  workspace: Workspace;
  onQuote: (text: string, focus: boolean) => void;
  onAsk: (text: string) => void;
}) {
  const { t } = useI18n();
  const openMenu = useContextMenu();
  const git = useGit(workspace);
  const { files, revert } = useChanges(threadId, workspace);
  const [tab, setTab] = useState<Tab>({ kind: "changes" });
  const [opened, setOpened] = useState<string[]>([]);
  const [treeOpen, setTreeOpen] = useState(true);

  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<"changes" | "terminal">).detail;
      setTab({ kind: detail });
    };
    window.addEventListener(SHOW_EVENT, show);
    return () => window.removeEventListener(SHOW_EVENT, show);
  }, []);

  const openFile = (path: string) => {
    setOpened((current) => (current.includes(path) ? current : [...current, path]));
    setTab({ kind: "file", path });
  };
  const closeFile = (path: string) => {
    setOpened((current) => current.filter((item) => item !== path));
    if (tab.kind === "file" && tab.path === path) setTab({ kind: "changes" });
  };
  const absolute = (path: string) => `${workspace.path}/${path}`;
  const native = (command: string, path: string) => {
    if (isTauri()) void invoke(command, { path }).catch(() => undefined);
  };
  const entryMenu = (event: MouseEvent, entry: DirEntry) =>
    openMenu(event, [
      ...(entry.dir
        ? []
        : [{ label: t("code-open"), shortcut: "↩", onSelect: () => openFile(entry.path) }]),
      {
        label: t("code-open-editor"),
        onSelect: () => native("open_in_editor", absolute(entry.path)),
      },
      {
        label: MAC ? t("file-menu-reveal-mac") : t("file-menu-reveal-windows"),
        shortcut: MAC ? "⌘⇧R" : "Ctrl+Shift+R",
        onSelect: () => native("file_reveal", absolute(entry.path)),
      },
      {
        label: t("code-copy-path"),
        shortcut: MAC ? "⌥⌘C" : "Ctrl+Alt+C",
        onSelect: () => void navigator.clipboard.writeText(entry.path),
      },
      "separator",
      { label: t("code-look"), onSelect: () => onAsk(t("code-look-text", { path: entry.path })) },
      { label: t("code-add-input"), onSelect: () => onQuote(entry.path, false) },
    ]);

  const active = tab.kind === "file" ? tab.path : null;
  const changedCount = git?.repository ? git.changed.length : files.length;

  return (
    <section className="code-panel" aria-label={t("code-panel")}>
      <div className="code-panel__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className="code-tab"
          aria-selected={tab.kind === "changes"}
          onClick={() => setTab({ kind: "changes" })}
        >
          {t("code-tab-changes")}
          {files.length > 0 && <span className="code-tab__count">{files.length}</span>}
        </button>
        <button
          type="button"
          role="tab"
          className="code-tab"
          aria-selected={tab.kind === "terminal"}
          onClick={() => setTab({ kind: "terminal" })}
        >
          {t("code-tab-terminal")}
        </button>
        {opened.length > 0 && <span className="code-panel__divider" />}
        {opened.map((path) => (
          <span
            key={path}
            className="code-tab"
            data-selected={active === path || undefined}
            data-file
          >
            <button
              type="button"
              role="tab"
              aria-selected={active === path}
              onClick={() => setTab({ kind: "file", path })}
            >
              {nameOf(path)}
            </button>
            <button
              type="button"
              className="code-tab__close"
              aria-label={t("code-close-tab", { name: nameOf(path) })}
              onClick={() => closeFile(path)}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path d="M7 7l10 10M17 7L7 17" />
              </svg>
            </button>
          </span>
        ))}
        <span className="code-panel__spacer" />
        <button
          type="button"
          className="code-icon-button code-icon-button--line"
          aria-label={t("code-open-editor")}
          title={t("code-open-editor")}
          onClick={() => native("open_in_editor", active ? absolute(active) : workspace.path)}
        >
          <OutIcon />
        </button>
      </div>
      <div className="code-panel__body">
        {treeOpen ? (
          <FileTree
            workspace={workspace}
            changes={files}
            active={active}
            onOpen={openFile}
            onMenu={entryMenu}
            onCollapse={() => setTreeOpen(false)}
          />
        ) : (
          <button
            type="button"
            className="code-tree-rail"
            aria-label={t("code-files-expand")}
            title={t("code-files-expand")}
            onClick={() => setTreeOpen(true)}
          >
            <SideIcon />
          </button>
        )}
        <div className="code-panel__content">
          {tab.kind === "changes" && <DiffView files={files} onOpen={openFile} onRevert={revert} />}
          {tab.kind === "terminal" && <Terminal workspace={workspace} />}
          {tab.kind === "file" && (
            <FileView
              key={tab.path}
              workspace={workspace}
              path={tab.path}
              diff={files.find((file) => file.path === tab.path) ?? null}
              onSeeChanges={() => setTab({ kind: "changes" })}
              onQuote={onQuote}
            />
          )}
        </div>
      </div>
      <div className="code-panel__status">
        <span>
          {!git?.repository
            ? t("code-status-no-git")
            : changedCount > 0
              ? t("code-status-uncommitted", { count: changedCount })
              : t("code-status-clean")}
        </span>
        {git?.repository && git.ahead > 0 && git.upstream && (
          <span>{t("code-status-ahead", { count: git.ahead, upstream: git.upstream })}</span>
        )}
      </div>
    </section>
  );
}
