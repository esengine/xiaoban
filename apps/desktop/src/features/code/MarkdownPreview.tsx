import { useI18n } from "@xiaoban/i18n/react";
import type { Workspace } from "@xiaoban/protocol";
import { memo, useEffect, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { useHub } from "../../app/hub.tsx";
import { openExternal } from "../../lib/external.ts";

const ALERTS = ["note", "tip", "important", "warning", "caution"] as const;
type Alert = (typeof ALERTS)[number];

const schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "picture",
    "source",
    "details",
    "summary",
    "kbd",
    "sub",
    "sup",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "align"],
    img: [...(defaultSchema.attributes?.img ?? []), "width", "height", "align"],
    source: ["srcSet", "media", "type"],
    div: [...(defaultSchema.attributes?.div ?? []), ["className", /^md-alert/]],
    p: [...(defaultSchema.attributes?.p ?? []), ["className", /^md-alert/]],
  },
};

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

function remarkAlerts() {
  const visit = (node: MdNode) => {
    for (const child of node.children ?? []) visit(child);
    if (node.type !== "blockquote") return;
    const first = node.children?.[0];
    const text = first?.type === "paragraph" ? first.children?.[0] : undefined;
    const match = text?.type === "text" ? /^\[!(\w+)\]\s*/.exec(text.value ?? "") : null;
    const kind = match?.[1]?.toLowerCase() as Alert | undefined;
    if (!match || !kind || !ALERTS.includes(kind) || !text) return;
    text.value = (text.value ?? "").slice(match[0].length);
    node.data = { hName: "div", hProperties: { className: ["md-alert", `md-alert--${kind}`] } };
    node.children = [
      {
        type: "paragraph",
        data: { hName: "p", hProperties: { className: ["md-alert__title"] } },
        children: [{ type: "text", value: kind }],
      },
      ...(node.children ?? []),
    ];
  };
  return (tree: MdNode) => visit(tree);
}

export function joinPath(base: string, relative: string): string {
  const parts = base.split("/").slice(0, -1);
  for (const part of relative.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

const external = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href);

function LocalImage({
  workspace,
  path,
  alt,
  width,
  height,
}: {
  workspace: Workspace;
  path: string;
  alt: string;
  width?: string | number | undefined;
  height?: string | number | undefined;
}) {
  const store = useHub();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void store
      .workspaceImage(workspace.id, path)
      .then((image) => live && setUrl(image.url))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, workspace.id, path]);
  if (!url) return <span className="md-image-missing">{alt}</span>;
  return <img src={url} alt={alt} width={width} height={height} />;
}

export const MarkdownPreview = memo(function MarkdownPreview({
  workspace,
  path,
  text,
  onOpenFile,
}: {
  workspace: Workspace;
  path: string;
  text: string;
  onOpenFile: (path: string) => void;
}) {
  const { t } = useI18n();
  const components: Components = {
    a: ({ href, children }) => (
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault();
          if (!href || href.startsWith("#")) return;
          if (external(href)) void openExternal(href);
          else onOpenFile(joinPath(path, decodeURI(href.split("#")[0] ?? "")));
        }}
      >
        {children}
      </a>
    ),
    img: ({ src, alt, width, height }) => {
      const source = typeof src === "string" ? src : "";
      if (!source) return null;
      if (external(source)) {
        return (
          <img
            src={source}
            alt={alt ?? ""}
            width={width}
            height={height}
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        );
      }
      return (
        <LocalImage
          workspace={workspace}
          path={joinPath(path, decodeURI(source))}
          alt={alt ?? ""}
          width={width}
          height={height}
        />
      );
    },
    p: ({ node, children, ...rest }) => {
      const title = (rest as { className?: string }).className?.includes("md-alert__title");
      if (title) {
        const kind = String(Array.isArray(children) ? children[0] : children) as Alert;
        return (
          <p className="md-alert__title">
            {ALERTS.includes(kind) ? t(`md-alert-${kind}`) : children}
          </p>
        );
      }
      return <p {...rest}>{children}</p>;
    },
  };
  return (
    <div className="md-preview">
      <Markdown
        remarkPlugins={[remarkGfm, remarkAlerts]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        components={components}
      >
        {text}
      </Markdown>
    </div>
  );
});
