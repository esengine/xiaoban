import { useI18n } from "@xiaoban/i18n/react";
import type { DiffHunk, DiffLine, FileDiff } from "@xiaoban/protocol";
import { memo, useMemo, useState } from "react";
import { Chevron } from "../chat/ThreadList.tsx";
import { highlightLine } from "./highlight.ts";

type Mode = "unified" | "split";

const OPEN_BUDGET = 600;
const BIG_FILE = 400;

export function linesOf(file: FileDiff): number {
  return file.hunks.reduce((sum, hunk) => sum + hunk.lines.length, 0);
}

export function openByDefault(files: FileDiff[]): Set<string> {
  const open = new Set<string>();
  let used = 0;
  for (const file of files) {
    const lines = linesOf(file);
    if (file.binary || lines > BIG_FILE || used + lines > OPEN_BUDGET) continue;
    used += lines;
    open.add(file.path);
  }
  return open;
}

export function useOpenFiles(files: FileDiff[]) {
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const defaults = useMemo(() => openByDefault(files), [files]);
  const isOpen = (path: string) => defaults.has(path) !== toggled.has(path);
  const toggle = (path: string) =>
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  return { isOpen, toggle };
}

const Painted = memo(function Painted({ text, path }: { text: string; path: string }) {
  return (
    <span
      className="diff-line__text"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js escapes the source text
      dangerouslySetInnerHTML={{ __html: highlightLine(text, path) }}
    />
  );
});

function Line({ line, path }: { line: DiffLine; path: string }) {
  const sign = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : "";
  return (
    <div className="diff-line" data-kind={line.kind}>
      <span className="diff-line__no">{line.old ?? ""}</span>
      <span className="diff-line__no">{line.new ?? ""}</span>
      <span className="diff-line__sign">{sign}</span>
      <Painted text={line.text} path={path} />
    </div>
  );
}

function Side({ line, side, path }: { line: DiffLine | null; side: "old" | "new"; path: string }) {
  if (!line) return <div className="diff-line" data-kind="empty" />;
  const kind = line.kind === "same" ? "same" : side === "old" ? "removed" : "added";
  return (
    <div className="diff-line" data-kind={kind}>
      <span className="diff-line__no">{side === "old" ? line.old : line.new}</span>
      <Painted text={line.text} path={path} />
    </div>
  );
}

function pairs(hunk: DiffHunk): [DiffLine | null, DiffLine | null][] {
  const out: [DiffLine | null, DiffLine | null][] = [];
  let removed: DiffLine[] = [];
  let added: DiffLine[] = [];
  const flush = () => {
    const count = Math.max(removed.length, added.length);
    for (let index = 0; index < count; index += 1) {
      out.push([removed[index] ?? null, added[index] ?? null]);
    }
    removed = [];
    added = [];
  };
  for (const line of hunk.lines) {
    if (line.kind === "removed") removed.push(line);
    else if (line.kind === "added") added.push(line);
    else {
      flush();
      out.push([line, line]);
    }
  }
  flush();
  return out;
}

export const HunkView = memo(function HunkView({
  hunk,
  path,
  mode,
  action,
}: {
  hunk: DiffHunk;
  path: string;
  mode: Mode;
  action: { label: string; onClick: () => void } | null;
}) {
  const { t } = useI18n();
  return (
    <div className="diff-hunk">
      <div className="diff-hunk__head">
        <span>{t("code-hunk-near", { line: hunk.newStart })}</span>
        {action && (
          <button type="button" className="code-link" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
      {mode === "unified" ? (
        hunk.lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no identity of their own
          <Line key={index} line={line} path={path} />
        ))
      ) : (
        <div className="diff-split">
          {pairs(hunk).map(([left, right], index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no identity of their own
            <div key={index} className="diff-split__row">
              <Side line={left} side="old" path={path} />
              <Side line={right} side="new" path={path} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export function FileHead({
  file,
  open,
  onToggle,
  onOpen,
  onRevert,
}: {
  file: FileDiff;
  open: boolean;
  onToggle: () => void;
  onOpen: (() => void) | null;
  onRevert: (() => void) | null;
}) {
  const { t } = useI18n();
  return (
    <div className="diff-file__head">
      <button type="button" className="diff-file__toggle" aria-expanded={open} onClick={onToggle}>
        <Chevron open={open} />
        <span className="diff-file__path">{file.path}</span>
        <span className="diff-file__added">{t("code-added", { count: file.added })}</span>
        <span className="diff-file__removed">{t("code-removed", { count: file.removed })}</span>
        {file.status === "added" && <span className="diff-file__tag">{t("code-new-file")}</span>}
        {file.status === "deleted" && (
          <span className="diff-file__tag" data-tone="removed">
            {t("code-deleted-file")}
          </span>
        )}
      </button>
      {onOpen && (
        <button type="button" className="code-link" onClick={onOpen}>
          {t("code-open")}
        </button>
      )}
      {onRevert && (
        <button type="button" className="code-link" onClick={onRevert}>
          {t("code-revert-file")}
        </button>
      )}
    </div>
  );
}

function Undone({
  path,
  whole,
  onRestore,
}: {
  path: string;
  whole: boolean;
  onRestore: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="diff-undone">
      {whole && <span className="diff-file__path">{path}</span>}
      <span>{t(whole ? "code-undone-file" : "code-undone-block")}</span>
      <button type="button" className="code-link" onClick={onRestore}>
        {t("code-restore")}
      </button>
    </div>
  );
}

export function DiffView({
  files,
  undone = [],
  onOpen,
  onRevert,
  onRestore,
}: {
  files: FileDiff[];
  undone?: string[];
  onOpen: (path: string) => void;
  onRevert: (path: string, hunk: number | null) => void;
  onRestore?: (path: string) => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("unified");
  const { isOpen, toggle } = useOpenFiles(files);
  const gone = undone.filter((path) => !files.some((file) => file.path === path));
  if (files.length === 0 && gone.length === 0) {
    return <p className="code-empty">{t("code-no-changes")}</p>;
  }
  return (
    <div className="diff">
      <div className="diff__bar">
        <span>{t("code-changes-head", { count: files.length })}</span>
        <span className="code-segment">
          {(["unified", "split"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {t(value === "unified" ? "code-diff-unified" : "code-diff-split")}
            </button>
          ))}
        </span>
      </div>
      <div className="diff__files">
        {gone.map((path) => (
          <Undone key={path} path={path} whole onRestore={() => onRestore?.(path)} />
        ))}
        {files.map((file) => {
          const open = isOpen(file.path);
          return (
            <section key={file.path} className="diff-file">
              <FileHead
                file={file}
                open={open}
                onToggle={() => toggle(file.path)}
                onOpen={file.status === "deleted" ? null : () => onOpen(file.path)}
                onRevert={() => onRevert(file.path, null)}
              />
              {undone.includes(file.path) && (
                <Undone path={file.path} whole={false} onRestore={() => onRestore?.(file.path)} />
              )}
              {open &&
                (file.binary ? (
                  <p className="code-empty">{t("code-binary")}</p>
                ) : (
                  file.hunks.map((hunk, index) => (
                    <HunkView
                      key={`${hunk.oldStart}-${hunk.newStart}`}
                      hunk={hunk}
                      path={file.path}
                      mode={mode}
                      action={{
                        label: t("code-revert-hunk"),
                        onClick: () => onRevert(file.path, index),
                      }}
                    />
                  ))
                ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
