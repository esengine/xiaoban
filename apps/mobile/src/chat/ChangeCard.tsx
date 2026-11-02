import { extensionOfName } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { ChangedFile } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";
import { NOTE_EXTENSIONS, PAGE_EXTENSIONS } from "../workspace/useWorkspaceStore.ts";
import { keepHtml, keepMarkdown } from "./htmlPages.ts";

/** What this reply changed in the workspace, with a way to put it all back. */
export function ChangeCard({ threadId, files }: { threadId: string; files: ChangedFile[] }) {
  const { t } = useI18n();
  const store = useHubStore();
  const workspaceId = useHubState(store).threads.find(
    (thread) => thread.id === threadId,
  )?.workspaceId;
  const [opening, setOpening] = useState<string | null>(null);
  const [reverted, setReverted] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState(false);
  const left = files.filter((file) => !reverted.has(file.path));

  const revert = async (paths: string[]) => {
    setFailed(false);
    for (const path of paths) {
      try {
        await store.revertChange(threadId, path, null);
        setReverted((current) => new Set([...current, path]));
      } catch {
        setFailed(true);
      }
    }
  };

  const openable = (path: string) => {
    const extension = extensionOfName(path);
    return PAGE_EXTENSIONS.includes(extension) || NOTE_EXTENSIONS.includes(extension);
  };

  const open = async (path: string) => {
    if (!workspaceId || opening) return;
    setOpening(path);
    setFailed(false);
    try {
      const name = path.split("/").pop() ?? path;
      if (PAGE_EXTENSIONS.includes(extensionOfName(path))) {
        const html = await store.bundleWorkspacePage(workspaceId, path);
        router.push({ pathname: "/html/[id]", params: { id: keepHtml(html), title: name } });
      } else {
        const file = await store.readWorkspaceFile(workspaceId, path);
        router.push({ pathname: "/md/[id]", params: { id: keepMarkdown(file.text), title: name } });
      }
    } catch {
      setFailed(true);
    } finally {
      setOpening(null);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t("code-card-title", { count: files.length })}</Text>
        <Pressable
          disabled={left.length === 0}
          accessibilityRole="button"
          onPress={() => void revert(left.map((file) => file.path))}
        >
          <Text style={[styles.link, left.length === 0 && styles.linkOff]}>
            {left.length === 0 ? t("code-card-reverted") : t("code-card-revert-all")}
          </Text>
        </Pressable>
      </View>
      {files.map((file) => {
        const gone = reverted.has(file.path);
        return (
          <View key={file.path} style={styles.row}>
            <Text style={[styles.path, gone && styles.struck]} numberOfLines={1}>
              {file.path}
            </Text>
            {file.status === "added" && <Text style={styles.tag}>{t("code-mark-added")}</Text>}
            {gone ? (
              <Text style={styles.done}>{t("code-card-reverted")}</Text>
            ) : (
              <>
                <Text style={styles.plus}>{`+${file.added}`}</Text>
                <Text style={styles.minus}>{`−${file.removed}`}</Text>
              </>
            )}
            {!gone && file.status !== "deleted" && openable(file.path) ? (
              <Pressable
                style={[styles.play, opening === file.path && styles.playBusy]}
                accessibilityRole="button"
                onPress={() => void open(file.path)}
              >
                <Text style={styles.playText}>{t("html-card-open")}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {failed ? <Text style={styles.failed}>{t("code-card-revert-failed")}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "flex-start",
    width: "92%",
    backgroundColor: color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 14, fontWeight: "700", color: color.ink },
  link: { fontSize: 13, color: color.accent },
  linkOff: { color: color.faint },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
  },
  path: { flex: 1, fontSize: 13, color: color.ink, fontFamily: "monospace" },
  struck: { color: color.faint, textDecorationLine: "line-through" },
  tag: {
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: color.successSoft,
    color: color.success,
  },
  plus: { fontSize: 13, color: color.success },
  minus: { fontSize: 13, color: color.dangerInk },
  done: { fontSize: 12, color: color.faint },
  play: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  playBusy: { opacity: 0.6 },
  playText: { fontSize: 12, fontWeight: "600", color: color.surface },
  failed: { fontSize: 12, color: color.dangerInk, marginTop: 6 },
});
