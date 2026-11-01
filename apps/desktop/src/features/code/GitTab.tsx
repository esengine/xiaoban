import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { CommitInfo, FileDiff, GitInfo, Workspace } from "@xiaoban/protocol";
import { useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { recency } from "../chat/time.ts";
import { BranchMenu } from "./BranchMenu.tsx";
import { BranchIcon } from "./ChatBits.tsx";
import { FileHead, HunkView } from "./DiffView.tsx";

const WORKING = "working";

function Files({ files }: { files: FileDiff[] }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  return (
    <>
      {files.map((file) => {
        const open = !closed.has(file.path);
        return (
          <section key={file.path} className="diff-file">
            <FileHead
              file={file}
              open={open}
              onToggle={() =>
                setClosed((current) => {
                  const next = new Set(current);
                  if (next.has(file.path)) next.delete(file.path);
                  else next.add(file.path);
                  return next;
                })
              }
              onOpen={null}
              onRevert={null}
            />
            {open &&
              file.hunks.map((hunk) => (
                <HunkView
                  key={`${hunk.oldStart}-${hunk.newStart}`}
                  hunk={hunk}
                  path={file.path}
                  mode="unified"
                  action={null}
                />
              ))}
          </section>
        );
      })}
    </>
  );
}

export function GitTab({
  workspace,
  git,
  onAsk,
  onCommit,
}: {
  workspace: Workspace;
  git: GitInfo | null;
  onAsk: (text: string) => void;
  onCommit: (after?: () => void) => void;
}) {
  const { t, locale } = useI18n();
  const store = useHub();
  const { filesVersion } = useHubState(store);
  const version = filesVersion[workspace.id] ?? 0;
  const [all, setAll] = useState(false);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [files, setFiles] = useState<FileDiff[]>([]);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [initFailed, setInitFailed] = useState<string | null>(null);
  const repo = git?.repository ?? false;
  const working = (git?.changed.length ?? 0) > 0;
  const selected = picked ?? (working ? WORKING : (commits[0]?.hash ?? null));

  useEffect(() => {
    if (!repo) return;
    let live = true;
    void version;
    store
      .gitLog(workspace.id, all)
      .then((list) => live && setCommits(list))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, workspace.id, all, repo, version]);

  useEffect(() => {
    if (!repo || !selected) {
      setFiles([]);
      return;
    }
    let live = true;
    void version;
    store
      .commitFiles(workspace.id, selected === WORKING ? null : selected)
      .then((list) => live && setFiles(list))
      .catch(() => live && setFiles([]));
    return () => {
      live = false;
    };
  }, [store, workspace.id, selected, repo, version]);

  if (!git) return null;
  if (!repo) {
    return (
      <div className="git-empty">
        <BranchIcon />
        <b>{t("git-not-repo")}</b>
        <p>{t("git-not-repo-hint")}</p>
        <button
          type="button"
          className="dialog__secondary"
          onClick={() =>
            void store
              .initGit(workspace.id)
              .catch((error: unknown) =>
                setInitFailed(error instanceof Error ? error.message : String(error)),
              )
          }
        >
          {t("git-init")}
        </button>
        {initFailed && <p className="commit-dialog__failure">{initFailed}</p>}
      </div>
    );
  }

  const when = (time: number) => {
    const value = recency(time, Date.now(), locale);
    return value.kind === "now"
      ? t("time-just-now")
      : value.kind === "yesterday"
        ? t("time-yesterday")
        : value.text;
  };
  const current = commits.find((commit) => commit.hash === selected) ?? null;

  return (
    <div className="git-tab">
      <div className="git-log">
        <div className="git-log__head">
          <span className="branch-bar__anchor">
            <button
              type="button"
              className="branch-bar__branch"
              aria-haspopup="dialog"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <BranchIcon />
              {git.branch ?? ""}
              <svg className="branch-bar__more" aria-hidden="true" viewBox="0 0 16 16">
                <path d="M4 6l4 4 4-4" />
              </svg>
            </button>
            {menu && (
              <BranchMenu
                workspace={workspace}
                git={git}
                below
                onCommit={onCommit}
                onClose={() => setMenu(false)}
              />
            )}
          </span>
          {git.upstream && (
            <span className="git-log__track">
              {t("git-ahead", { upstream: git.upstream, ahead: git.ahead, behind: git.behind })}
            </span>
          )}
        </div>
        <ul className="git-log__list">
          {working && (
            <li>
              <button
                type="button"
                className="git-log__row"
                data-working
                aria-current={selected === WORKING || undefined}
                onClick={() => setPicked(WORKING)}
              >
                <span className="git-log__dot" aria-hidden="true" />
                <span className="git-log__text">
                  <span className="git-log__subject">{t("git-working")}</span>
                  <span className="git-log__meta">
                    {t("git-working-files", { count: git.changed.length })}
                  </span>
                </span>
              </button>
            </li>
          )}
          {commits.map((commit) => (
            <li key={commit.hash}>
              <button
                type="button"
                className="git-log__row"
                aria-current={selected === commit.hash || undefined}
                data-merge={commit.merge || undefined}
                onClick={() => setPicked(commit.hash)}
              >
                <span className="git-log__dot" aria-hidden="true" />
                <span className="git-log__text">
                  <span className="git-log__subject">{commit.subject}</span>
                  <span className="git-log__meta">{commit.author}</span>
                </span>
                <span className="git-log__time">{when(commit.time)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="git-log__foot">
          <button
            type="button"
            className="code-link"
            aria-pressed={!all}
            onClick={() => setAll(false)}
          >
            {t("git-this-branch")}
          </button>
          <span aria-hidden="true" className="branch-bar__dot" />
          <button
            type="button"
            className="code-link"
            aria-pressed={all}
            onClick={() => setAll(true)}
          >
            {t("git-all-branches")}
          </button>
        </div>
      </div>
      <div className="git-detail">
        {selected === WORKING ? (
          <div className="git-detail__head">
            <b>{t("git-working")}</b>
            <span className="git-detail__meta">
              {t("git-working-files", { count: git.changed.length })}
            </span>
            <span className="git-detail__links">
              <button type="button" className="code-link" onClick={() => onCommit()}>
                {t("git-commit")}
              </button>
            </span>
          </div>
        ) : (
          current && (
            <div className="git-detail__head">
              <b>{current.subject}</b>
              <span className="git-detail__meta">
                {t("git-commit-meta", {
                  short: current.short,
                  author: current.author,
                  time: when(current.time),
                  count: files.length,
                })}
              </span>
              <span className="git-detail__links">
                <button
                  type="button"
                  className="code-link"
                  onClick={() => {
                    void navigator.clipboard.writeText(current.hash);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? t("rich-copied") : t("git-copy-hash")}
                </button>
                <button
                  type="button"
                  className="code-link"
                  onClick={() => onAsk(t("git-explain-text", { short: current.short }))}
                >
                  {t("git-explain")}
                </button>
              </span>
            </div>
          )
        )}
        <div className="git-detail__files">
          <Files files={files} />
        </div>
      </div>
    </div>
  );
}
