interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string };
}

const PAIRED = new Set(["sup", "sub", "kbd", "mark", "u", "ins", "del"]);
const OPEN = /^<([a-z]+)>$/i;
const CLOSE = /^<\/([a-z]+)>$/i;
const BREAK = /^<br\s*\/?>$/i;

const text = (value: string): MdNode => ({ type: "text", value });

function rebuild(children: MdNode[]): MdNode[] {
  const root: MdNode = { type: "root", children: [] };
  const stack: { node: MdNode; tag: string }[] = [{ node: root, tag: "" }];
  const top = () => stack[stack.length - 1] as { node: MdNode; tag: string };
  for (const child of children) {
    if (child.type !== "html") {
      top().node.children?.push(transform(child));
      continue;
    }
    const raw = (child.value ?? "").trim();
    const open = OPEN.exec(raw)?.[1]?.toLowerCase();
    const close = CLOSE.exec(raw)?.[1]?.toLowerCase();
    if (BREAK.test(raw)) {
      top().node.children?.push({ type: "break" });
    } else if (open && PAIRED.has(open)) {
      const node: MdNode = { type: "inlineTag", data: { hName: open }, children: [] };
      top().node.children?.push(node);
      stack.push({ node, tag: open });
    } else if (close && PAIRED.has(close) && stack.some((entry) => entry.tag === close)) {
      while (stack.length > 1 && top().tag !== close) stack.pop();
      stack.pop();
    } else {
      top().node.children?.push(text(child.value ?? ""));
    }
  }
  return root.children ?? [];
}

function transform(node: MdNode): MdNode {
  if (node.type === "html") return { type: "paragraph", children: [text(node.value ?? "")] };
  if (!node.children) return node;
  return { ...node, children: rebuild(node.children) };
}

export function remarkInlineTags() {
  return (tree: MdNode) => {
    tree.children = rebuild(tree.children ?? []).map((child) =>
      ["text", "inlineTag", "break"].includes(child.type)
        ? { type: "paragraph", children: [child] }
        : child,
    );
  };
}

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const KEYS: Record<string, { mac: string; other: string }> = {
  cmd: { mac: "⌘ Cmd", other: "Ctrl" },
  command: { mac: "⌘ Cmd", other: "Ctrl" },
  ctrl: { mac: "⌃ Ctrl", other: "Ctrl" },
  control: { mac: "⌃ Ctrl", other: "Ctrl" },
  shift: { mac: "⇧ Shift", other: "Shift" },
  alt: { mac: "⌥ Option", other: "Alt" },
  option: { mac: "⌥ Option", other: "Alt" },
  opt: { mac: "⌥ Option", other: "Alt" },
};

export function keyLabel(raw: string): string {
  const known = KEYS[raw.trim().toLowerCase()];
  if (!known) return raw;
  return MAC ? known.mac : known.other;
}
