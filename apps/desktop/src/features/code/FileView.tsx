import { invoke, isTauri } from "@tauri-apps/api/core";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { FileDiff, Workspace } from "@xiaoban/protocol";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { RichText } from "../chat/RichText.tsx";
import { useImageViewer } from "../viewer/ImageViewer.tsx";
import { highlightLines } from "./highlight.ts";

interface Picked {
  from: number;
  to: number;
  text: string;
  top: number;
  left: number;
}

type Mode = "preview" | "source";

const MODE_KEY = "xiaoban.code.markdown";
const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const IMAGE = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i;
const MARKDOWN = /\.(md|markdown|mdx)$/i;
const MD_IMAGE = /!\[([^\]]*)\]\(<?([^)\s>]+)>?(\s+"[^"]*")?\)/g;

export const isImage = (path: string) => IMAGE.test(path);
export const isMarkdown = (path: string) => MARKDOWN.test(path);

function lineOf(node: Node | null): number | null {
  const element = node instanceof Element ? node : node?.parentElement;
  const row = element?.closest<HTMLElement>("[data-line]");
  return row ? Number(row.dataset.line) : null;
}

function size(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function joinPath(base: string, relative: string): string {
  const parts = base.split("/").slice(0, -1);
  for (const part of relative.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

function useFile(workspace: Workspace, path: string) {
  const store = useHub();
  const { filesVersion } = useHubState(store);
  const version = filesVersion[workspace.id] ?? 0;
  const [file, setFile] = useState<{ text: string; truncated: boolean; binary: boolean } | null>(
    null,
  );
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
  return file;
}

function native(command: string, path: string) {
  if (isTauri()) void invoke(command, { path }).catch(() => undefined);
}

function Bar({
  workspace,
  path,
  children,
  extra,
}: {
  workspace: Workspace;
  path: string;
  children?: ReactNode;
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="code-file__bar">
      <span className="code-file__path">{path.split("/").join(" / ")}</span>
      {children}
      <span className="code-file__spacer" />
      {extra}
      <button
        type="button"
        className="code-link"
        onClick={() => native("open_in_editor", `${workspace.path}/${path}`)}
      >
        {t("code-open-editor")}
      </button>
    </div>
  );
}

function ImageView({ workspace, path }: { workspace: Workspace; path: string }) {
  const { t } = useI18n();
  const store = useHub();
  const show = useImageViewer();
  const { filesVersion } = useHubState(store);
  const version = filesVersion[workspace.id] ?? 0;
  const [image, setImage] = useState<{ url: string; bytes: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const name = path.split("/").pop() ?? path;

  useEffect(() => {
    let live = true;
    void version;
    store
      .workspaceImage(workspace.id, path)
      .then((loaded) => live && setImage(loaded))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [store, workspace.id, path, version]);

  const open = () => {
    if (image) show([{ src: image.url, name, source: image.url }], 0, button.current);
  };

  return (
    <div className="code-file">
      <Bar
        workspace={workspace}
        path={path}
        extra={
          <button
            type="button"
            className="code-link"
            onClick={() => native("file_reveal", `${workspace.path}/${path}`)}
          >
            {MAC ? t("file-menu-reveal-mac") : t("file-menu-reveal-windows")}
          </button>
        }
      >
        {natural && image && (
          <span className="code-file__meta">
            {t("code-image-size", { width: natural.w, height: natural.h, size: size(image.bytes) })}
          </span>
        )}
      </Bar>
      <div className="code-image">
        {failed ? (
          <p className="code-empty">{t("code-image-failed")}</p>
        ) : (
          image && (
            <>
              <button
                ref={button}
                type="button"
                className="code-image__button"
                aria-label={t("viewer-open", { name })}
                onClick={open}
                onKeyDown={(event) => {
                  if (event.key === " ") {
                    event.preventDefault();
                    open();
                  }
                }}
              >
                <img
                  src={image.url}
                  alt={name}
                  onLoad={(event) =>
                    setNatural({
                      w: event.currentTarget.naturalWidth,
                      h: event.currentTarget.naturalHeight,
                    })
                  }
                />
              </button>
              <span className="code-image__hint">{t("code-image-hint")}</span>
            </>
          )
        )}
      </div>
    </div>
  );
}

function useMarkdownImages(workspace: Workspace, path: string, text: string): string {
  const store = useHub();
  const [resolved, setResolved] = useState(text);
  useEffect(() => {
    let live = true;
    const wanted = [...text.matchAll(MD_IMAGE)]
      .map((match) => match[2] ?? "")
      .filter((src) => src && !/^[a-z]+:/i.test(src) && !src.startsWith("/"));
    setResolved(text);
    if (wanted.length === 0) return;
    void Promise.all(
      [...new Set(wanted)].map((src) =>
        store
          .workspaceImage(workspace.id, joinPath(path, decodeURI(src)))
          .then((image) => [src, image.url] as const)
          .catch(() => [src, null] as const),
      ),
    ).then((pairs) => {
      if (!live) return;
      const urls = new Map(
        pairs.filter((pair): pair is readonly [string, string] => pair[1] !== null),
      );
      setResolved(
        text.replace(MD_IMAGE, (whole, alt: string, src: string) => {
          const url = urls.get(src);
          return url ? `![${alt}](${url})` : whole;
        }),
      );
    });
    return () => {
      live = false;
    };
  }, [store, workspace.id, path, text]);
  return resolved;
}

function TextView({
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
  const file = useFile(workspace, path);
  const markdown = isMarkdown(path);
  const [mode, setMode] = useState<Mode>(() =>
    localStorage.getItem(MODE_KEY) === "source" ? "source" : "preview",
  );
  const preview = markdown && mode === "preview";
  const [picked, setPicked] = useState<Picked | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const resolved = useMarkdownImages(workspace, path, markdown ? (file?.text ?? "") : "");

  const pickMode = (next: Mode) => {
    setMode(next);
    setPicked(null);
    localStorage.setItem(MODE_KEY, next);
  };

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
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const frame = box.current.getBoundingClientRect();
    const place = {
      top: rect.top - frame.top + box.current.scrollTop - 40,
      left: Math.max(8, rect.left - frame.left),
    };
    if (preview) {
      const text = selection.toString().trim();
      setPicked(text ? { from: 0, to: 0, text, ...place } : null);
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
    setPicked({ from, to, text: lines.slice(from - 1, to).join("\n"), ...place });
  };

  const quote = () => {
    if (!picked) return;
    onQuote(
      preview
        ? `${path}\n> ${picked.text.split("\n").join("\n> ")}`
        : `${t("code-quote", { path, from: picked.from, to: picked.to })}\n\`\`\`\n${picked.text}\n\`\`\``,
      true,
    );
    setPicked(null);
    window.getSelection()?.removeAllRanges();
  };

  return (
    <div className="code-file">
      <Bar
        workspace={workspace}
        path={path}
        extra={
          <>
            {diff && (
              <button type="button" className="code-link" onClick={onSeeChanges}>
                {t("code-see-changes")}
              </button>
            )}
            {markdown && (
              <span className="code-segment">
                {(["preview", "source"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={mode === value}
                    onClick={() => pickMode(value)}
                  >
                    {t(value === "preview" ? "code-preview" : "code-source")}
                  </button>
                ))}
              </span>
            )}
          </>
        }
      >
        {diff && <span className="code-file__tag">{t("code-file-changed")}</span>}
      </Bar>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: text selection on a read-only view */}
      <div
        className="code-file__body"
        data-preview={preview || undefined}
        ref={box}
        onMouseUp={select}
      >
        {file?.binary ? (
          <div className="code-empty">
            {t("code-file-binary")}{" "}
            <button
              type="button"
              className="code-link"
              onClick={() => native("file_reveal", `${workspace.path}/${path}`)}
            >
              {MAC ? t("file-menu-reveal-mac") : t("file-menu-reveal-windows")}
            </button>
          </div>
        ) : preview ? (
          <div className="code-markdown">
            <RichText text={resolved} />
          </div>
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
            <button type="button" onClick={quote}>
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

export function FileView(props: {
  workspace: Workspace;
  path: string;
  diff: FileDiff | null;
  onSeeChanges: () => void;
  onQuote: (text: string, focus: boolean) => void;
}) {
  if (isImage(props.path)) return <ImageView workspace={props.workspace} path={props.path} />;
  return <TextView {...props} />;
}
