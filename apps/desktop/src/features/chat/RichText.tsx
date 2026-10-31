import { useI18n } from "@xiaoban/i18n/react";
import { type ComponentProps, memo, type ReactNode, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openExternal } from "../../lib/external.ts";
import { useImageViewer } from "../viewer/ImageViewer.tsx";
import { keyLabel, remarkInlineTags } from "./inlineTags.ts";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function CodeBlock({ children }: ComponentProps<"pre">) {
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
  kbd: ({ children }) => (
    <kbd className="rich__kbd">{typeof children === "string" ? keyLabel(children) : children}</kbd>
  ),
};

export const RichText = memo(function RichText({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <div className="rich">
      <Markdown
        remarkPlugins={[remarkGfm, remarkInlineTags]}
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
