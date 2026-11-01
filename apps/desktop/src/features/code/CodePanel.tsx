import { invoke, isTauri } from "@tauri-apps/api/core";
import { useI18n } from "@xiaoban/i18n/react";
import type { DirEntry, Workspace } from "@xiaoban/protocol";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { openExternal } from "../../lib/external.ts";
import { ConfirmDialog } from "../dialog/ConfirmDialog.tsx";
import { useContextMenu } from "../menu/ContextMenu.tsx";
import { CommitDialog } from "./CommitDialog.tsx";
import { ConflictView } from "./ConflictView.tsx";
import { DiffView } from "./DiffView.tsx";
import { FileTree, SideIcon } from "./FileTree.tsx";
import { FileView } from "./FileView.tsx";
import { GitTab } from "./GitTab.tsx";
import { Terminal } from "./Terminal.tsx";
import { nameOf, useChanges, useGit } from "./useCode.ts";

const SHOW_EVENT = "xiaoban:code-show";
const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function showCode(tab: "changes" | "terminal") {
  window.dispatchEvent(new CustomEvent(SHOW_EVENT, { detail: tab }));
}

type Tab =
  | { kind: "conflict" }
  | { kind: "changes" }
  | { kind: "git" }
  | { kind: "terminal" }
  | { kind: "file"; path: string };

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
  const { files, revert, restore, undone } = useChanges(threadId, workspace);
  const [tab, setTab] = useState<Tab>({ kind: "changes" });
  const [opened, setOpened] = useState<string[]>([]);
  const [treeOpen, setTreeOpen] = useState(true);
  const store = useHub();
  const [committing, setCommitting] = useState(false);
  const afterCommit = useRef<(() => void) | null>(null);
  const [opening, setOpening] = useState(false);
  const [prFailure, setPrFailure] = useState<string | null>(null);
  const startCommit = (after?: () => void) => {
    afterCommit.current = after ?? null;
    setCommitting(true);
  };
  const openPullRequest = async () => {
    setOpening(true);
    setPrFailure(null);
    try {
      const url = await store.createPullRequest(workspace.id);
      const number = Number(/\/pull\/(\d+)/.exec(url)?.[1]);
      if (number) void store.pinRef(threadId, number, true).catch(() => undefined);
      void openExternal(url);
    } catch (error) {
      setPrFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setOpening(false);
    }
  };

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
  const conflictCount = git?.conflicts.length ?? 0;
  const merging = Boolean(git?.operation);
  const [aborting, setAborting] = useState(false);
  const [mergeFailure, setMergeFailure] = useState<string | null>(null);
  const hadConflicts = useRef(false);
  useEffect(() => {
    if (conflictCount > 0 && !hadConflicts.current) setTab({ kind: "conflict" });
    if (conflictCount === 0 && hadConflicts.current) {
      setTab((current) => (current.kind === "conflict" ? { kind: "changes" } : current));
    }
    hadConflicts.current = conflictCount > 0;
  }, [conflictCount]);
  const finishMerge = () => {
    setMergeFailure(null);
    void store
      .finishMerge(workspace.id)
      .catch((error: unknown) =>
        setMergeFailure(error instanceof Error ? error.message : String(error)),
      );
  };

  return (
    <section className="code-panel" aria-label={t("code-panel")}>
      <div className="code-panel__tabs" role="tablist">
        {conflictCount > 0 && (
          <button
            type="button"
            role="tab"
            className="code-tab"
            data-danger
            aria-selected={tab.kind === "conflict"}
            onClick={() => setTab({ kind: "conflict" })}
          >
            {t("conflict-tab")}
            <span className="code-tab__count">{conflictCount}</span>
          </button>
        )}
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
        {git?.installed && (
          <button
            type="button"
            role="tab"
            className="code-tab"
            aria-selected={tab.kind === "git"}
            onClick={() => setTab({ kind: "git" })}
          >
            {t("code-tab-git")}
          </button>
        )}
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
            conflicts={git?.conflicts ?? []}
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
          {tab.kind === "changes" && (
            <DiffView
              files={files}
              undone={undone}
              onOpen={openFile}
              onRevert={revert}
              onRestore={restore}
            />
          )}
          {tab.kind === "terminal" && <Terminal workspace={workspace} />}
          {tab.kind === "conflict" && git && (
            <ConflictView workspace={workspace} git={git} onAsk={onAsk} />
          )}
          {tab.kind === "git" && (
            <GitTab workspace={workspace} git={git} onAsk={onAsk} onCommit={startCommit} />
          )}
          {tab.kind === "file" && (
            <FileView
              key={tab.path}
              workspace={workspace}
              path={tab.path}
              diff={files.find((file) => file.path === tab.path) ?? null}
              onSeeChanges={() => setTab({ kind: "changes" })}
              onQuote={onQuote}
              onOpenFile={openFile}
            />
          )}
        </div>
      </div>
      {merging && git ? (
        <div className="code-panel__status">
          <span className="code-panel__conflicts" data-done={conflictCount === 0 || undefined}>
            {conflictCount > 0
              ? t("conflict-left", { count: conflictCount })
              : t("conflict-all-done")}
          </span>
          <span className="code-panel__spacer" />
          {mergeFailure && <span className="code-panel__failure">{mergeFailure}</span>}
          <button type="button" className="code-status-button" onClick={() => setAborting(true)}>
            {t("conflict-abort")}
          </button>
          <button
            type="button"
            className="code-status-button"
            data-dark
            disabled={conflictCount > 0}
            onClick={finishMerge}
          >
            {t("conflict-finish")}
          </button>
        </div>
      ) : (
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
          <span className="code-panel__spacer" />
          {prFailure && <span className="code-panel__failure">{prFailure}</span>}
          {git?.repository && changedCount > 0 && (
            <button type="button" className="code-status-button" onClick={() => startCommit()}>
              {t("git-commit-open")}
            </button>
          )}
          {git?.repository && git.branch && (
            <button
              type="button"
              className="code-status-button"
              data-primary
              disabled={opening}
              onClick={() => void openPullRequest()}
            >
              {opening ? t("git-pr-opening") : t("git-pr")}
            </button>
          )}
        </div>
      )}
      {aborting && (
        <ConfirmDialog
          title={t("conflict-abort-title")}
          body={t("conflict-abort-body")}
          confirm={t("conflict-abort")}
          onConfirm={() => void store.abortMerge(workspace.id).catch(() => undefined)}
          onClose={() => setAborting(false)}
        />
      )}
      {committing && git && (
        <CommitDialog
          workspace={workspace}
          git={git}
          onDone={() => afterCommit.current?.()}
          onClose={() => {
            afterCommit.current = null;
            setCommitting(false);
          }}
        />
      )}
    </section>
  );
}
