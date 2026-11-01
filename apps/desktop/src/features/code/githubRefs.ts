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

const NAMED = /\b(PR|Issue|pull request)\s*#?(\d{2,7})\b/gi;

function textOf(node: MdNode): string {
  if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

function splitNamed(nodes: MdNode[]): MdNode[] {
  return nodes.flatMap((node) => {
    if (node.type !== "text") return [node];
    const value = node.value ?? "";
    const out: MdNode[] = [];
    let last = 0;
    for (const match of value.matchAll(NAMED)) {
      const number = match[2] ?? "";
      const start =
        match.index + match[0].length - number.length - (match[0].includes("#") ? 1 : 0);
      if (start > last) out.push({ type: "text", value: value.slice(last, start) });
      out.push(ref(number, `#${number}`));
      last = match.index + match[0].length;
    }
    if (last === 0) return [node];
    if (last < value.length) out.push({ type: "text", value: value.slice(last) });
    return out;
  });
}

function table(node: MdNode, headers: Set<string>): MdNode {
  const rows = node.children ?? [];
  const header = rows[0]?.children ?? [];
  const column = header.findIndex((cell) => headers.has(textOf(cell).trim().toLowerCase()));
  return {
    ...node,
    children: rows.map((row, index) => {
      const cells = (row.children ?? []).map((cell, at) => {
        const text = textOf(cell).trim();
        if (index > 0 && at === column && /^#?\d{1,7}$/.test(text)) {
          const number = text.replace("#", "");
          return { ...cell, children: [ref(number, `#${number}`)] };
        }
        return {
          ...cell,
          children: (cell.children ?? []).flatMap((child) => visit(child, headers)),
        };
      });
      return { ...row, children: cells };
    }),
  };
}

function visit(node: MdNode, headers: Set<string>): MdNode[] {
  if (node.type === "text") return splitNamed(split(node.value ?? ""));
  if (node.type === "table") return [table(node, headers)];
  if (node.type === "link") {
    const match = LINK.exec(node.url ?? "");
    if (match?.[2]) return [ref(match[2], node.url ?? "")];
    return [node];
  }
  if (SKIP.has(node.type) || !node.children) return [node];
  return [{ ...node, children: node.children.flatMap((child) => visit(child, headers)) }];
}

export function remarkGithubRefs(options: { headers?: string } = {}) {
  const headers = new Set(
    (options.headers ?? "#")
      .split(",")
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean),
  );
  return (tree: MdNode) => {
    tree.children = (tree.children ?? []).flatMap((child) => visit(child, headers));
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
