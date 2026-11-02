import { invoke } from "@tauri-apps/api/core";
import {
  htmlFileName,
  htmlLines,
  htmlTitle,
  isHtmlBlock,
  keyLabel,
  pageHash,
  remarkInlineTags,
} from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { PageCheck } from "@xiaoban/protocol";
import { type ComponentProps, memo, type ReactNode, useEffect, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { useHub } from "../../app/hub.tsx";
import { openExternal } from "../../lib/external.ts";
import { remarkGithubRefs } from "../code/githubRefs.ts";
import { RefChip } from "../code/RefChip.tsx";
import { PageViewer } from "../pages/PageViewer.tsx";
import { useImageViewer } from "../viewer/ImageViewer.tsx";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function blockLanguage(children: ReactNode): string | null {
  const child = Array.isArray(children) ? children[0] : children;
  if (!child || typeof child !== "object" || !("props" in child)) return null;
  const name = (child.props as { className?: string }).className ?? "";
  return /language-([\w-]+)/.exec(name)?.[1] ?? null;
}

function useCheck(code: string): PageCheck | null {
  const store = useHub();
  const [check, setCheck] = useState<PageCheck | null>(null);
  useEffect(() => {
    let live = true;
    void store
      .pageCheck(pageHash(code))
      .then((found) => {
        if (live) setCheck(found);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, code]);
  return check;
}

function HtmlCard({ code }: { code: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [viewing, setViewing] = useState(false);
  const check = useCheck(code);
  const title = htmlTitle(code) ?? t("html-card-untitled");
  const name = htmlFileName(htmlTitle(code));
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="html-card">
      <div className="html-card__head">
        <span className="html-card__tile">{t("html-card-icon")}</span>
        <b className="html-card__title">{title}</b>
        <button type="button" className="html-card__copy" onClick={() => void copy()}>
          {copied ? t("rich-copied") : t("rich-copy")}
        </button>
      </div>
      {check ? (
        <span className="html-card__check" data-ok={check.ok || undefined}>
          {check.ok
            ? t("html-card-checked")
            : t("html-card-problems", { count: check.errors.length + (check.overflow ? 1 : 0) })}
        </span>
      ) : null}
      <span className="html-card__meta">{t("html-card-meta", { lines: htmlLines(code) })}</span>
      <div className="html-card__actions">
        <button type="button" className="button button--primary" onClick={() => setViewing(true)}>
          {t("html-card-open")}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => void invoke("text_save_as", { text: code, name }).catch(() => undefined)}
        >
          {t("html-card-save")}
        </button>
      </div>
      {viewing ? (
        <PageViewer code={code} title={title} name={name} onClose={() => setViewing(false)} />
      ) : null}
    </div>
  );
}

function CodeBlock({ children }: ComponentProps<"pre">) {
  const code = textOf(children).replace(/\n$/, "");
  if (isHtmlBlock(blockLanguage(children), code)) return <HtmlCard code={code} />;
  return <PlainCode>{children}</PlainCode>;
}

function PlainCode({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(textOf(children).replace(/\n$/, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rich__code-block">
      <pre>{children}</pre>
      <button type="button" className="rich__copy" onClick={() => void copy()}>
        {copied ? t("rich-copied") : t("rich-copy")}
      </button>
    </div>
  );
}

function ReplyImage({ src, alt }: { src: string; alt: string }) {
  const { t } = useI18n();
  const show = useImageViewer();
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [copied, setCopied] = useState(false);
  if (src.startsWith("data:image/")) {
    return (
      <span className="rich__image">
        <button
          type="button"
          className="rich__image-button"
          data-state="ready"
          aria-label={t("viewer-open", { name: alt })}
          onClick={(event) => show([{ src, name: alt, source: src }], 0, event.currentTarget)}
        >
          <img src={src} alt={alt} />
        </button>
      </span>
    );
  }
  if (!src.startsWith("https://")) return <span>{alt}</span>;
  let site = "";
  try {
    site = new URL(src).hostname.replace(/^www\./, "");
  } catch {
    return <span>{alt}</span>;
  }
  if (state === "failed") {
    return (
      <span className="rich__image-failed">
        {t("rich-image-failed")}
        <a
          href={src}
          onClick={(event) => {
            event.preventDefault();
            void openExternal(src);
          }}
        >
          {t("rich-image-open")}
        </a>
      </span>
    );
  }
  return (
    <span className="rich__image">
      <button
        type="button"
        className="rich__image-button"
        data-state={state}
        aria-label={t("viewer-open", { name: alt || site })}
        onClick={(event) => {
          const root = event.currentTarget.closest(".rich");
          const nodes = Array.from(
            root?.querySelectorAll<HTMLImageElement>(
              ".rich__image-button[data-state='ready'] img",
            ) ?? [],
          );
          const images = nodes.map((node) => ({
            src: node.src,
            name: node.alt || site,
            source: node.src,
          }));
          const index = nodes.findIndex((node) => node.src === src);
          show(images, Math.max(0, index), event.currentTarget);
        }}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
        />
      </button>
      <span className="rich__image-caption">
        {alt && <span>{alt}</span>}
        <a
          className="rich__image-link"
          href={src}
          title={src}
          onClick={(event) => {
            event.preventDefault();
            void openExternal(src);
          }}
        >
          {src}
        </a>
        <button
          type="button"
          className="rich__image-copy"
          onClick={() => {
            void navigator.clipboard.writeText(src).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? t("rich-copied") : t("rich-image-copy-link")}
        </button>
      </span>
    </span>
  );
}

const heading = ({ children }: { children?: ReactNode }) => (
  <h3 className="rich__heading">{children}</h3>
);

const components: Components = {
  h1: heading,
  h2: heading,
  h3: heading,
  h4: heading,
  h5: heading,
  h6: heading,
  pre: CodeBlock,
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        if (href) void openExternal(href);
      }}
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="rich__table">
      <table>{children}</table>
    </div>
  ),
  img: ({ src, alt }) => <ReplyImage src={typeof src === "string" ? src : ""} alt={alt ?? ""} />,
  ...({
    "gh-ref": ({
      number,
      original,
      children,
    }: {
      number?: string;
      original?: string;
      children?: ReactNode;
    }) => (
      <RefChip number={number ?? ""} original={original ?? ""}>
        {children}
      </RefChip>
    ),
  } as Components),
  kbd: ({ children }) => (
    <kbd className="rich__kbd">{typeof children === "string" ? keyLabel(children) : children}</kbd>
  ),
};

export const RichText = memo(function RichText({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <div className="rich">
      <Markdown
        remarkPlugins={[
          remarkGfm,
          remarkInlineTags,
          [remarkGithubRefs, { headers: t("ref-table-headers") }],
        ]}
        remarkRehypeOptions={{
          footnoteLabel: t("rich-footnotes"),
          footnoteBackLabel: t("rich-footnote-back"),
        }}
        components={components}
      >
        {text}
      </Markdown>
    </div>
  );
});
