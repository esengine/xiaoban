import { extensionOfName, type Token, type TokenKind, tokenize } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { keepHtml, keepMarkdown } from "../../src/chat/htmlPages.ts";
import { Icon } from "../../src/ui/Icon.tsx";
import { shareExport } from "../../src/workspace/transfer.ts";
import {
  IMAGE_EXTENSIONS,
  NOTE_EXTENSIONS,
  PAGE_EXTENSIONS,
  useWorkspaceStore,
} from "../../src/workspace/useWorkspaceStore.ts";

const MAX_LINES = 4000;

const COLORS: Record<TokenKind, string> = {
  plain: color.inkSoft,
  comment: color.faint,
  string: color.dangerInk,
  keyword: color.accentStrong,
  tag: color.accentStrong,
  number: color.attentionInk,
};

type Loaded =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "binary" }
  | { kind: "image"; url: string }
  | { kind: "text"; lines: string[]; truncated: boolean; size: number };

/** One file of a workspace: its text with a little colour, and a preview for pages and notes. */
export default function WorkspaceFileScreen() {
  const { id, path } = useLocalSearchParams<{ id: string; path: string; hub?: string }>();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const store = useWorkspaceStore();
  const name = path.split("/").pop() ?? path;
  const extension = extensionOfName(name);
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        if (IMAGE_EXTENSIONS.includes(extension)) {
          const { url } = await store.workspaceImage(id, path);
          if (live) setLoaded({ kind: "image", url });
          return;
        }
        const file = await store.readWorkspaceFile(id, path);
        if (!live) return;
        if (file.binary) {
          setLoaded({ kind: "binary" });
          return;
        }
        const all = file.text.split("\n");
        setLoaded({
          kind: "text",
          lines: all.slice(0, MAX_LINES),
          truncated: file.truncated || all.length > MAX_LINES,
          size: file.text.length,
        });
      } catch {
        if (live) setLoaded({ kind: "failed" });
      }
    })();
    return () => {
      live = false;
    };
  }, [extension, id, path, store]);

  const previewable = PAGE_EXTENSIONS.includes(extension) || NOTE_EXTENSIONS.includes(extension);
  const preview = async () => {
    if (busy) return;
    setBusy(true);
    setPreviewFailed(false);
    try {
      if (PAGE_EXTENSIONS.includes(extension)) {
        const html = await store.bundleWorkspacePage(id, path);
        router.push({ pathname: "/html/[id]", params: { id: keepHtml(html), title: name } });
      } else if (loaded.kind === "text") {
        router.push({
          pathname: "/md/[id]",
          params: { id: keepMarkdown(loaded.lines.join("\n")), title: name },
        });
      }
    } catch {
      setPreviewFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const exportFile = async () => {
    if (sending) return;
    setSending(true);
    try {
      await shareExport(await store.exportWorkspace(id, path));
    } catch {
      setPreviewFailed(true);
    } finally {
      setSending(false);
    }
  };

  const rows = useMemo(
    () =>
      loaded.kind === "text"
        ? loaded.lines.map((line, index) => ({
            number: index + 1,
            tokens: tokenize(line, extension),
          }))
        : [],
    [loaded, extension],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false, title: name }} />
      <View style={styles.header}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("chat-back")}
        >
          <Icon name="back" color={color.ink} />
        </Pressable>
        <View style={styles.heading}>
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          {loaded.kind === "text" ? (
            <Text style={styles.sub}>{t("ws-file-size", { lines: rows.length })}</Text>
          ) : null}
        </View>
        {previewable && loaded.kind === "text" ? (
          <Pressable
            style={[styles.preview, busy && styles.previewBusy]}
            onPress={() => void preview()}
            accessibilityRole="button"
          >
            <Text style={styles.previewText}>{t("ws-file-preview")}</Text>
          </Pressable>
        ) : null}
        {loaded.kind === "text" || loaded.kind === "image" || loaded.kind === "binary" ? (
          <Pressable
            style={[styles.back, sending && styles.previewBusy]}
            onPress={() => void exportFile()}
            accessibilityRole="button"
            accessibilityLabel={t("ws-export-file")}
          >
            <Text style={styles.exportText}>{t("ws-export-file")}</Text>
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
      </View>
      {previewFailed ? <Text style={styles.problem}>{t("ws-file-preview-failed")}</Text> : null}
      {loaded.kind === "loading" ? <Text style={styles.note}>{t("ws-file-loading")}</Text> : null}
      {loaded.kind === "failed" ? <Text style={styles.note}>{t("ws-file-failed")}</Text> : null}
      {loaded.kind === "binary" ? <Text style={styles.note}>{t("ws-file-binary")}</Text> : null}
      {loaded.kind === "image" ? (
        <Image source={{ uri: loaded.url }} style={styles.image} resizeMode="contain" />
      ) : null}
      {loaded.kind === "text" ? (
        <FlatList
          data={rows}
          keyExtractor={(row) => String(row.number)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 12 }}
          initialNumToRender={40}
          ListFooterComponent={
            loaded.truncated ? <Text style={styles.note}>{t("ws-file-truncated")}</Text> : undefined
          }
          renderItem={({ item }) => (
            <View style={styles.line}>
              <Text style={styles.number}>{item.number}</Text>
              <Text style={styles.code}>
                {item.tokens.length === 0
                  ? " "
                  : item.tokens.map((token: Token, index: number) => (
                      <Text key={index} style={{ color: COLORS[token.kind] }}>
                        {token.text}
                      </Text>
                    ))}
              </Text>
            </View>
          )}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  back: { minWidth: 44, height: 44, alignItems: "center", justifyContent: "center" },
  heading: { flex: 1, alignItems: "center" },
  title: { fontSize: 14, fontWeight: "700", color: color.ink, fontFamily: "monospace" },
  sub: { fontSize: 11, color: color.muted, marginTop: 1 },
  preview: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  previewBusy: { opacity: 0.6 },
  exportText: { fontSize: 13, fontWeight: "600", color: color.accentStrong },
  previewText: { fontSize: 13, fontWeight: "600", color: color.surface },
  problem: { fontSize: 12, color: color.dangerInk, textAlign: "center", paddingTop: 8 },
  note: { fontSize: 13, color: color.muted, textAlign: "center", padding: 24 },
  image: { flex: 1, margin: 12 },
  line: { flexDirection: "row", gap: 10, paddingVertical: 1 },
  number: {
    width: 30,
    textAlign: "right",
    fontSize: 11.5,
    lineHeight: 19,
    color: color.faint,
    fontFamily: "monospace",
  },
  code: { flex: 1, fontSize: 11.5, lineHeight: 19, fontFamily: "monospace" },
});
