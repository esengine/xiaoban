import { useI18n } from "@xiaoban/i18n/react";
import type { DiffHunk, DiffLine, FileDiff } from "@xiaoban/protocol";
import { useState } from "react";

type Mode = "unified" | "split";

function Line({ line }: { line: DiffLine }) {
  const sign = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : "";
  return (
    <div className="diff-line" data-kind={line.kind}>
      <span className="diff-line__no">{line.old ?? ""}</span>
      <span className="diff-line__no">{line.new ?? ""}</span>
      <span className="diff-line__sign">{sign}</span>
      <span className="diff-line__text">{line.text}</span>
    </div>
  );
}

function Side({ line, side }: { line: DiffLine | null; side: "old" | "new" }) {
  if (!line) return <div className="diff-line" data-kind="empty" />;
  const kind = line.kind === "same" ? "same" : side === "old" ? "removed" : "added";
  return (
    <div className="diff-line" data-kind={kind}>
      <span className="diff-line__no">{side === "old" ? line.old : line.new}</span>
      <span className="diff-line__text">{line.text}</span>
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

export function HunkView({
  hunk,
  mode,
  action,
}: {
  hunk: DiffHunk;
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
          <Line key={index} line={line} />
        ))
      ) : (
        <div className="diff-split">
          {pairs(hunk).map(([left, right], index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no identity of their own
            <div key={index} className="diff-split__row">
              <Side line={left} side="old" />
              <Side line={right} side="new" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
        <span className="diff-file__arrow" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
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

export function DiffView({
  files,
  onOpen,
  onRevert,
}: {
  files: FileDiff[];
  onOpen: (path: string) => void;
  onRevert: (path: string, hunk: number | null) => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("unified");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  if (files.length === 0) return <p className="code-empty">{t("code-no-changes")}</p>;
  const toggle = (path: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
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
        {files.map((file) => {
          const open = !closed.has(file.path);
          return (
            <section key={file.path} className="diff-file">
              <FileHead
                file={file}
                open={open}
                onToggle={() => toggle(file.path)}
                onOpen={file.status === "deleted" ? null : () => onOpen(file.path)}
                onRevert={() => onRevert(file.path, null)}
              />
              {open &&
                (file.binary ? (
                  <p className="code-empty">{t("code-binary")}</p>
                ) : (
                  file.hunks.map((hunk, index) => (
                    <HunkView
                      key={`${hunk.oldStart}-${hunk.newStart}`}
                      hunk={hunk}
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
