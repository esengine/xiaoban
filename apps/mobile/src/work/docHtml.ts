import type { Doc, DocBlock } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inline(text: string) {
  return escapeHtml(text)
    .split("**")
    .map((part, index) => (index % 2 === 1 && part ? `<b>${part}</b>` : part))
    .join("");
}

function list(tag: "ul" | "ol", items: DocBlock[]) {
  return `<${tag}>${items.map((item) => `<li>${inline(item.text)}</li>`).join("")}</${tag}>`;
}

function body(doc: Doc) {
  const out: string[] = [];
  let index = 0;
  while (index < doc.blocks.length) {
    const block = doc.blocks[index];
    if (!block) break;
    if (block.kind === "bullet" || block.kind === "number") {
      const run: DocBlock[] = [];
      while (doc.blocks[index]?.kind === block.kind) {
        const item = doc.blocks[index];
        if (item) run.push(item);
        index += 1;
      }
      out.push(list(block.kind === "bullet" ? "ul" : "ol", run));
      continue;
    }
    const tag = block.kind === "quote" ? "blockquote" : block.kind;
    out.push(`<${tag}>${inline(block.text)}</${tag}>`);
    if (block.kind === "h1" && doc.subtitle && index === 0) {
      out.push(`<p class="sub">${inline(doc.subtitle)}</p>`);
    }
    index += 1;
  }
  return out.join("\n");
}

export function docHtml(doc: Doc) {
  const style = `
@page { margin: 22mm 20mm; }
body { font-family: -apple-system, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif; color: ${color.inkSoft}; font-size: 11pt; line-height: 1.8; margin: 0; }
h1 { font-size: 22pt; line-height: 1.35; color: ${color.ink}; margin: 0 0 6pt; }
h2 { font-size: 15pt; color: ${color.ink}; margin: 18pt 0 6pt; }
h3 { font-size: 12.5pt; color: ${color.ink}; margin: 14pt 0 4pt; }
p { margin: 0 0 8pt; }
.sub { color: ${color.muted}; font-size: 10pt; margin-bottom: 14pt; }
b { color: ${color.ink}; }
ul, ol { margin: 0 0 8pt; padding-left: 20pt; }
blockquote { margin: 0 0 8pt; padding-left: 12pt; border-left: 3pt solid ${color.line}; color: ${color.muted}; }
`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(doc.title)}</title><style>${style}</style></head><body>${body(doc)}</body></html>`;
}
