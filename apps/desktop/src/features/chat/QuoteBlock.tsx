import { useI18n } from "@xiaoban/i18n/react";
import type { Message, Quote } from "@xiaoban/protocol";
import { memo, type ReactNode, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { keyLabel, remarkInlineTags } from "./inlineTags.ts";

const HIGHLIGHT = "quote-source";
const GONE_MS = 2_000;

const bold = ({ children }: { children?: ReactNode }) => <strong>{children}</strong>;

function QuoteText({ text }: { text: string }) {
  const { t } = useI18n();
  const components: Components = {
    h1: bold,
    h2: bold,
    h3: bold,
    h4: bold,
    h5: bold,
    h6: bold,
    a: ({ children }) => <span>{children}</span>,
    img: () => <span>{t("quote-image")}</span>,
    table: () => <span>{t("quote-table")}</span>,
    pre: ({ children }) => <span className="quote-block__pre">{children}</span>,
    kbd: ({ children }) => (
      <kbd className="rich__kbd">
        {typeof children === "string" ? keyLabel(children) : children}
      </kbd>
    ),
  };
  return (
    <Markdown remarkPlugins={[remarkGfm, remarkInlineTags]} components={components}>
      {text}
    </Markdown>
  );
}

export const QuoteBlock = memo(function QuoteBlock({
  quote,
  tone,
  onRemove,
  onOpen,
}: {
  quote: Quote;
  tone: "light" | "blue";
  onRemove?: () => void;
  onOpen?: () => boolean;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);
  const who =
    quote.from === "assistant"
      ? t("quote-from-assistant")
      : quote.from === "user"
        ? t("quote-from-user")
        : t("quote-label");
  const when =
    quote.at === null
      ? null
      : new Intl.DateTimeFormat(locale, {
          ...(new Date(quote.at).toDateString() === new Date().toDateString()
            ? {}
            : { month: "numeric", day: "numeric" }),
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(quote.at);
  const body = (
    <>
      <span className="quote-block__head">
        {gone ? t("quote-gone") : when ? `${who} · ${when}` : who}
      </span>
      <span className="quote-block__body" data-open={open || undefined}>
        <QuoteText text={quote.text} />
      </span>
    </>
  );
  return (
    <div className="quote-block" data-tone={tone}>
      <span className="quote-block__bar" aria-hidden="true" />
      {onOpen ? (
        <button
          type="button"
          className="quote-block__main"
          onClick={(event) => {
            event.stopPropagation();
            if (onOpen()) return;
            setGone(true);
            window.setTimeout(() => setGone(false), GONE_MS);
          }}
        >
          {body}
        </button>
      ) : (
        <span className="quote-block__main">{body}</span>
      )}
      {onRemove && (
        <span className="quote-block__actions">
          <button
            type="button"
            className="quote-block__action"
            aria-label={t("quote-remove")}
            onClick={onRemove}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <button
            type="button"
            className="quote-block__action"
            aria-label={open ? t("quote-collapse") : t("quote-expand")}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" data-open={open || undefined}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </span>
      )}
    </div>
  );
});

export function quoteOf(message: Message, text: string): Quote {
  return { text, from: message.role, at: message.createdAt, messageId: message.id };
}

function markdownOf(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (!(node instanceof Element || node instanceof DocumentFragment)) return "";
  const inner = Array.from(node.childNodes).map(markdownOf).join("");
  if (!(node instanceof Element)) return inner;
  switch (node.tagName.toLowerCase()) {
    case "strong":
    case "b":
      return inner.trim() ? `**${inner}**` : inner;
    case "em":
    case "i":
      return inner.trim() ? `*${inner}*` : inner;
    case "code":
      return node.closest("pre") ? inner : `\`${inner}\``;
    case "pre":
      return `\n\`\`\`\n${inner.replace(/\n$/, "")}\n\`\`\`\n`;
    case "li":
      return `\n- ${inner.trim()}`;
    case "br":
      return "\n";
    case "p":
    case "div":
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return `\n${inner}\n`;
    case "sup":
    case "sub":
    case "kbd":
    case "mark":
    case "u":
    case "del":
    case "ins": {
      const tag = node.tagName.toLowerCase();
      return `<${tag}>${inner}</${tag}>`;
    }
    case "button":
      return "";
    default:
      return inner;
  }
}

export function selectedMarkdown(element: Element): { text: string; range: Range } | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) return null;
  const text = markdownOf(range.cloneContents())
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? { text, range: range.cloneRange() } : null;
}

export function highlightSource(range: Range | null) {
  const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  const Highlight = (window as unknown as { Highlight?: new (range: Range) => unknown }).Highlight;
  if (!highlights || !Highlight) return;
  if (range) highlights.set(HIGHLIGHT, new Highlight(range));
  else highlights.delete(HIGHLIGHT);
}

export function jumpTo(messageId: string | null | undefined): boolean {
  if (!messageId) return false;
  const target = document.querySelector<HTMLElement>(
    `[data-message-id="${CSS.escape(messageId)}"]`,
  );
  if (!target) return false;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.remove("bubble--flash");
  void target.offsetWidth;
  target.classList.add("bubble--flash");
  return true;
}
