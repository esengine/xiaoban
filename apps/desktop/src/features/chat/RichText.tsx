import { useI18n } from "@xiaoban/i18n/react";
import { type ComponentProps, memo, type ReactNode, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { openExternal } from "../../lib/external.ts";

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
  img: ({ alt }) => <span>{alt}</span>,
};

export const RichText = memo(function RichText({ text }: { text: string }) {
  return (
    <div className="rich">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </Markdown>
    </div>
  );
});
