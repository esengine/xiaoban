interface MdNode {
  type: string;
  value?: string;
  url?: string;
  children?: MdNode[];
  data?: { hName?: string; hProperties?: Record<string, string> };
}

const NUMBER = /(^|[^\w&/#\]])#(\d{1,7})\b/g;
const LINK = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:pull|issues)\/(\d+)(?:[/?#].*)?$/;
const SKIP = new Set(["code", "inlineCode", "link", "linkReference", "image", "html"]);

const ref = (number: string, original: string): MdNode => ({
  type: "githubRef",
  data: { hName: "gh-ref", hProperties: { number, original } },
  children: [{ type: "text", value: original }],
});

function split(value: string): MdNode[] {
  const out: MdNode[] = [];
  let last = 0;
  for (const match of value.matchAll(NUMBER)) {
    const lead = match[1] ?? "";
    const start = match.index + lead.length;
    if (start > last) out.push({ type: "text", value: value.slice(last, start) });
    out.push(ref(match[2] ?? "", `#${match[2]}`));
    last = match.index + match[0].length;
  }
  if (last === 0) return [{ type: "text", value }];
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

function visit(node: MdNode): MdNode[] {
  if (node.type === "text") return split(node.value ?? "");
  if (node.type === "link") {
    const match = LINK.exec(node.url ?? "");
    if (match?.[2]) return [ref(match[2], node.url ?? "")];
    return [node];
  }
  if (SKIP.has(node.type) || !node.children) return [node];
  return [{ ...node, children: node.children.flatMap(visit) }];
}

export function remarkGithubRefs() {
  return (tree: MdNode) => {
    tree.children = (tree.children ?? []).flatMap(visit);
  };
}

export function refsIn(text: string): {
  numbers: number[];
  links: { repo: string; number: number }[];
} {
  const numbers = new Set<number>();
  for (const match of text.matchAll(NUMBER)) numbers.add(Number(match[2]));
  const links: { repo: string; number: number }[] = [];
  for (const match of text.matchAll(
    /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(?:pull|issues)\/(\d+)/g,
  )) {
    links.push({ repo: match[1] ?? "", number: Number(match[2]) });
  }
  return { numbers: [...numbers], links };
}
