import { useI18n } from "@xiaoban/i18n/react";
import type { ChangedFile } from "@xiaoban/protocol";
import { useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { BranchMenu } from "./BranchMenu.tsx";
import { showCode } from "./CodePanel.tsx";
import { CommitDialog } from "./CommitDialog.tsx";
import { FileIcon } from "./FileTree.tsx";
import { useChanges, useGit, useWorkspaceOf } from "./useCode.ts";

export function BranchIcon() {
  return (
    <svg className="code-side-icon" aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="8" r="2" />
      <path d="M6 7v10M18 10c0 4-6 3-12 7" />
    </svg>
  );
}

export function BranchBar({ threadId }: { threadId: string }) {
  const { t } = useI18n();
  const workspace = useWorkspaceOf(threadId);
  const git = useGit(workspace);
  const { files } = useChanges(threadId, workspace);
  const store = useHub();
  const [menu, setMenu] = useState(false);
  const [committing, setCommitting] = useState(false);
  const afterCommit = useRef<(() => void) | null>(null);
  if (!workspace) return null;
  const repo = git?.repository ?? false;
  const changed = repo ? (git?.changed ?? []) : files;
  const added = changed.reduce((sum, file) => sum + file.added, 0);
  const removed = changed.reduce((sum, file) => sum + file.removed, 0);
  return (
    <div className="branch-bar">
      {repo && git?.branch && (
        <span className="branch-bar__anchor">
          <button
            type="button"
            className="branch-bar__branch"
            aria-haspopup="dialog"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            <BranchIcon />
            <span className="branch-bar__name">{git.branch}</span>
            <svg className="branch-bar__more" aria-hidden="true" viewBox="0 0 16 16">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
          {menu && git && (
            <BranchMenu
              workspace={workspace}
              git={git}
              onCommit={(after) => {
                afterCommit.current = after;
                setCommitting(true);
              }}
              onClose={() => setMenu(false)}
            />
          )}
        </span>
      )}
      {repo && git?.stash && (
        <>
          <span className="branch-bar__dot" aria-hidden="true" />
          <span>{t("branch-stashed")}</span>
          <button
            type="button"
            className="code-link"
            onClick={() => void store.restoreStash(workspace.id).catch(() => undefined)}
          >
            {t("branch-restore")}
          </button>
        </>
      )}
      {changed.length > 0 && (
        <>
          {repo && git?.branch && <span className="branch-bar__dot" aria-hidden="true" />}
          <span>
            {repo
              ? t("code-branch-changes", { count: changed.length })
              : t("code-changed-count", { count: changed.length })}
          </span>
          <span className="branch-bar__added">{t("code-added", { count: added })}</span>
          <span className="branch-bar__removed">{t("code-removed", { count: removed })}</span>
          <button type="button" className="code-link" onClick={() => showCode("changes")}>
            {t("code-view")}
          </button>
        </>
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
    </div>
  );
}

export function ChangeCard({ threadId, files }: { threadId: string; files: ChangedFile[] }) {
  const { t } = useI18n();
  const store = useHub();
  const [reverted, setReverted] = useState<Set<string>>(new Set());
  const revertAll = () => {
    for (const file of files) {
      void store
        .revertChange(threadId, file.path, null)
        .then(() => setReverted((current) => new Set([...current, file.path])))
        .catch(() => undefined);
    }
  };
  return (
    <div className="change-card">
      <div className="change-card__head">
        <b>{t("code-card-title", { count: files.length })}</b>
        <span className="code-file__spacer" />
        <button type="button" className="code-link" onClick={() => showCode("changes")}>
          {t("code-card-view")}
        </button>
        <button
          type="button"
          className="code-link"
          disabled={reverted.size === files.length}
          onClick={revertAll}
        >
          {t("code-card-revert-all")}
        </button>
      </div>
      <ul className="change-card__list">
        {files.map((file) => (
          <li key={file.path} data-reverted={reverted.has(file.path) || undefined}>
            <FileIcon />
            <span className="change-card__path">{file.path}</span>
            {file.status === "added" && (
              <span className="diff-file__tag">{t("code-mark-added")}</span>
            )}
            {reverted.has(file.path) && (
              <span className="change-card__reverted">{t("code-card-reverted")}</span>
            )}
            <span className="code-file__spacer" />
            <span className="diff-file__added">{t("code-added", { count: file.added })}</span>
            <span className="diff-file__removed">{t("code-removed", { count: file.removed })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
