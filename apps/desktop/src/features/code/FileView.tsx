import { invoke, isTauri } from "@tauri-apps/api/core";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { FileDiff, Workspace } from "@xiaoban/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { highlightLines } from "./highlight.ts";

interface Picked {
  from: number;
  to: number;
  text: string;
  top: number;
  left: number;
}

function lineOf(node: Node | null): number | null {
  const element = node instanceof Element ? node : node?.parentElement;
  const row = element?.closest<HTMLElement>("[data-line]");
  return row ? Number(row.dataset.line) : null;
}

export function FileView({
  workspace,
  path,
  diff,
  onSeeChanges,
  onQuote,
}: {
  workspace: Workspace;
  path: string;
  diff: FileDiff | null;
  onSeeChanges: () => void;
  onQuote: (text: string, focus: boolean) => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const { filesVersion } = useHubState(store);
  const version = filesVersion[workspace.id] ?? 0;
  const [file, setFile] = useState<{ text: string; truncated: boolean; binary: boolean } | null>(
    null,
  );
  const [picked, setPicked] = useState<Picked | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void version;
    store
      .readWorkspaceFile(workspace.id, path)
      .then((loaded) => live && setFile(loaded))
      .catch(() => live && setFile(null));
    return () => {
      live = false;
    };
  }, [store, workspace.id, path, version]);

  const changed = new Set(
    (diff?.hunks ?? []).flatMap((hunk) =>
      hunk.lines.filter((line) => line.kind === "added").map((line) => line.new ?? 0),
    ),
  );
  const lines = file?.text.split("\n") ?? [];
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const painted = useMemo(() => highlightLines(file?.text ?? "", path), [file?.text, path]);

  const select = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !box.current) {
      setPicked(null);
      return;
    }
    const a = lineOf(selection.anchorNode);
    const b = lineOf(selection.focusNode);
    if (a === null || b === null) {
      setPicked(null);
      return;
    }
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const frame = box.current.getBoundingClientRect();
    setPicked({
      from,
      to,
      text: lines.slice(from - 1, to).join("\n"),
      top: rect.top - frame.top + box.current.scrollTop - 40,
      left: Math.max(8, rect.left - frame.left),
    });
  };

  const quote = (focus: boolean) => {
    if (!picked) return;
    onQuote(
      `${t("code-quote", { path, from: picked.from, to: picked.to })}\n\`\`\`\n${picked.text}\n\`\`\``,
      focus,
    );
    setPicked(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="code-file">
      <div className="code-file__bar">
        <span className="code-file__path">{path.split("/").join(" / ")}</span>
        {diff && <span className="code-file__tag">{t("code-file-changed")}</span>}
        <span className="code-file__spacer" />
        {diff && (
          <button type="button" className="code-link" onClick={onSeeChanges}>
            {t("code-see-changes")}
          </button>
        )}
        <button
          type="button"
          className="code-link"
          onClick={() => {
            if (isTauri())
              void invoke("open_in_editor", { path: `${workspace.path}/${path}` }).catch(
                () => undefined,
              );
          }}
        >
          {t("code-open-editor")}
        </button>
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: text selection on a read-only code view */}
      <div className="code-file__body" ref={box} onMouseUp={select}>
        {file?.binary ? (
          <p className="code-empty">{t("code-file-binary")}</p>
        ) : (
          <>
            {lines.map((text, index) => {
              const number = index + 1;
              const inPick = picked && number >= picked.from && number <= picked.to;
              return (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: line numbers are the identity
                  key={index}
                  className="code-line"
                  data-line={number}
                  data-changed={changed.has(number) || undefined}
                  data-picked={inPick || undefined}
                >
                  <span className="code-line__no">{number}</span>
                  <span
                    className="code-line__text"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js escapes the source text
                    dangerouslySetInnerHTML={{ __html: painted[index] || text || " " }}
                  />
                </div>
              );
            })}
            {file?.truncated && <p className="code-empty">{t("code-file-truncated")}</p>}
          </>
        )}
        {picked && (
          <div className="code-pick" style={{ top: picked.top, left: picked.left }}>
            <button type="button" onClick={() => quote(true)}>
              {t("code-ask")}
            </button>
            <button type="button" onClick={() => quote(false)}>
              {t("code-add-input")}
            </button>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(picked.text);
                setPicked(null);
              }}
            >
              {t("code-copy")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
