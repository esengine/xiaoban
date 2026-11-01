import { keyLabel, remarkInlineTags } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import { color, dark } from "@xiaoban/tokens";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { memo, type ReactNode, useDeferredValue, useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, type TextStyle, View } from "react-native";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { Icon } from "../ui/Icon.tsx";
import { keepHtml, looksLikeHtml } from "./htmlPages.ts";

interface Node {
  type: string;
  value?: string;
  url?: string;
  alt?: string;
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  lang?: string | null;
  identifier?: string;
  label?: string;
  data?: { hName?: string };
  children?: Node[];
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkInlineTags);

function parse(text: string): Node {
  return parser.runSync(parser.parse(text)) as unknown as Node;
}

type Tone = "light" | "dark";

function plain(node: Node): string {
  if (node.value) return node.value;
  return (node.children ?? []).map(plain).join("");
}

function Inline({ nodes, tone, style }: { nodes: Node[]; tone: Tone; style?: TextStyle }) {
  return <>{nodes.map((node, index) => inline(node, `${index}`, tone, style))}</>;
}

function inline(node: Node, key: string, tone: Tone, style?: TextStyle): ReactNode {
  const kids = node.children ?? [];
  const nested = (extra: TextStyle) => (
    <Text key={key} style={[style, extra]}>
      <Inline nodes={kids} tone={tone} />
    </Text>
  );
  switch (node.type) {
    case "text":
      return node.value;
    case "strong":
      return nested(styles.strong);
    case "emphasis":
      return nested(styles.em);
    case "delete":
      return nested(styles.del);
    case "break":
      return "\n";
    case "inlineCode":
      return (
        <Text key={key} style={[styles.code, tone === "dark" && styles.codeDark]}>
          {node.value}
        </Text>
      );
    case "link":
      return (
        <Text
          key={key}
          style={[styles.link, tone === "dark" && styles.linkDark]}
          onPress={() => {
            if (node.url) void Linking.openURL(node.url);
          }}
        >
          <Inline nodes={kids} tone={tone} />
        </Text>
      );
    case "image":
      return (
        <Text
          key={key}
          style={[styles.link, tone === "dark" && styles.linkDark]}
          onPress={() => {
            if (node.url) void Linking.openURL(node.url);
          }}
        >
          {node.alt || node.url}
        </Text>
      );
    case "footnoteReference":
      return (
        <Text key={key} style={styles.sup}>
          {`[${node.label ?? node.identifier ?? ""}]`}
        </Text>
      );
    case "inlineTag": {
      const tag = node.data?.hName;
      if (tag === "kbd") {
        return (
          <Text key={key} style={[styles.code, tone === "dark" && styles.codeDark]}>
            {keyLabel(plain(node))}
          </Text>
        );
      }
      if (tag === "mark") return nested(styles.mark);
      if (tag === "u" || tag === "ins") return nested(styles.underline);
      if (tag === "del") return nested(styles.del);
      if (tag === "sup" || tag === "sub") return nested(styles.sup);
      return nested({});
    }
    default:
      return kids.length > 0 ? nested({}) : (node.value ?? null);
  }
}

function CodeBlock({ node }: { node: Node }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void Clipboard.setStringAsync(node.value ?? "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <View style={styles.pre}>
      <Text style={styles.preText} selectable>
        {node.value}
      </Text>
      <Pressable
        style={styles.copy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t(copied ? "rich-copied" : "rich-copy")}
        onPress={copy}
      >
        <Icon name={copied ? "check" : "copy"} size={14} color={dark.textMuted} />
      </Pressable>
      {looksLikeHtml(node.lang, node.value ?? "") ? (
        <Pressable
          style={styles.preview}
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: "/html/[id]", params: { id: keepHtml(node.value ?? "") } })
          }
        >
          <Text style={styles.previewText}>{t("html-view-open")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Table({ node, tone }: { node: Node; tone: Tone }) {
  const rows = node.children ?? [];
  return (
    <View style={styles.table}>
      {rows.map((row, r) => (
        <View key={`r${r}`} style={[styles.tr, r === 0 && styles.th]}>
          {(row.children ?? []).map((cell, c) => (
            <View key={`c${c}`} style={[styles.td, c === 0 && styles.tdFirst]}>
              <Text
                style={[styles.cell, tone === "dark" && styles.baseDark, r === 0 && styles.strong]}
              >
                <Inline nodes={cell.children ?? []} tone={tone} />
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Blocks({ nodes, tone }: { nodes: Node[]; tone: Tone }) {
  return <>{nodes.map((node, index) => block(node, `${index}`, tone))}</>;
}

function block(node: Node, key: string, tone: Tone): ReactNode {
  const base = [styles.base, tone === "dark" && styles.baseDark];
  const kids = node.children ?? [];
  switch (node.type) {
    case "paragraph":
      return (
        <Text key={key} style={base}>
          <Inline nodes={kids} tone={tone} />
        </Text>
      );
    case "heading":
      return (
        <Text key={key} style={[...base, styles.heading]}>
          <Inline nodes={kids} tone={tone} />
        </Text>
      );
    case "code":
      return <CodeBlock key={key} node={node} />;
    case "blockquote":
      return (
        <View key={key} style={[styles.quote, tone === "dark" && styles.quoteDark]}>
          <Blocks nodes={kids} tone={tone} />
        </View>
      );
    case "list":
      return (
        <View key={key} style={styles.list}>
          {kids.map((item, index) => (
            <View key={`i${index}`} style={styles.item}>
              {item.checked === true || item.checked === false ? (
                <View style={[styles.box, item.checked && styles.boxOn]}>
                  {item.checked ? <Icon name="check" size={10} color={color.surface} /> : null}
                </View>
              ) : node.ordered ? (
                <Text style={[...base, styles.number]}>{`${(node.start ?? 1) + index}.`}</Text>
              ) : (
                <View style={[styles.dot, tone === "dark" && styles.dotDark]} />
              )}
              <View style={styles.itemBody}>
                <Blocks nodes={item.children ?? []} tone={tone} />
              </View>
            </View>
          ))}
        </View>
      );
    case "table":
      return <Table key={key} node={node} tone={tone} />;
    case "thematicBreak":
      return <View key={key} style={styles.rule} />;
    case "footnoteDefinition":
      return (
        <View key={key} style={styles.footnote}>
          <Text style={[...base, styles.small]}>{`[${node.label ?? node.identifier ?? ""}]`}</Text>
          <View style={styles.itemBody}>
            <Blocks nodes={kids} tone={tone} />
          </View>
        </View>
      );
    case "html":
      return (
        <Text key={key} style={base}>
          {node.value}
        </Text>
      );
    default:
      return kids.length > 0 ? <Blocks key={key} nodes={kids} tone={tone} /> : null;
  }
}

export const Markdown = memo(function Markdown({
  text,
  tone = "light",
}: {
  text: string;
  tone?: Tone;
}) {
  const settled = useDeferredValue(text);
  const tree = useMemo(() => parse(settled), [settled]);
  return (
    <View style={styles.root}>
      <Blocks nodes={tree.children ?? []} tone={tone} />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: 8 },
  base: { fontSize: 15, lineHeight: 23, color: color.ink },
  baseDark: { color: color.surface },
  heading: { fontSize: 16, fontWeight: "700" },
  strong: { fontWeight: "700" },
  em: { fontStyle: "italic" },
  del: { textDecorationLine: "line-through" },
  underline: { textDecorationLine: "underline" },
  mark: { backgroundColor: color.attentionSoft },
  sup: { fontSize: 11 },
  small: { fontSize: 12 },
  code: {
    fontFamily: "monospace",
    fontSize: 13,
    backgroundColor: color.ground,
    color: color.inkSoft,
  },
  codeDark: { backgroundColor: dark.raised, color: color.surface },
  link: { color: color.accent, textDecorationLine: "underline" },
  linkDark: { color: color.surface },
  pre: {
    backgroundColor: color.ink,
    borderRadius: 10,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 34,
  },
  preText: { fontFamily: "monospace", fontSize: 12.5, lineHeight: 19, color: color.surface },
  copy: { position: "absolute", top: 8, right: 8 },
  preview: {
    alignSelf: "flex-start",
    marginTop: 8,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.surface,
    justifyContent: "center",
  },
  previewText: { fontSize: 13, fontWeight: "500", color: color.ink },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: color.line,
    paddingLeft: 10,
    gap: 6,
  },
  quoteDark: { borderLeftColor: dark.glass },
  list: { gap: 4 },
  item: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  itemBody: { flex: 1, minWidth: 0, gap: 4 },
  number: { minWidth: 18 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: color.inkMid, marginTop: 9 },
  dotDark: { backgroundColor: color.surface },
  box: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: color.lineStrong,
    marginTop: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: { backgroundColor: color.accent, borderColor: color.accent },
  table: {
    alignSelf: "stretch",
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 8,
    overflow: "hidden",
  },
  tr: { flexDirection: "row", borderTopWidth: 1, borderColor: color.lineSoft },
  th: { backgroundColor: color.ground },
  td: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderLeftWidth: 1,
    borderColor: color.lineSoft,
  },
  tdFirst: { borderLeftWidth: 0 },
  cell: { fontSize: 13, lineHeight: 19, color: color.ink },
  rule: { height: 1, backgroundColor: color.line, marginVertical: 4 },
  footnote: { flexDirection: "row", gap: 6 },
});
