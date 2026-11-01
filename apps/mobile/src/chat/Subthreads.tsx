import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";
import { openScene } from "../life/LifeUI.tsx";
import { ChevronIcon } from "../trip/TripIcons.tsx";
import { plain } from "./plain.ts";

const DOT = { need: color.attention, running: color.accent, done: color.success } as const;

export function SubthreadCards({ threadIds }: { threadIds: string[] }) {
  const { t } = useI18n();
  const { threads, drafts, confirms } = useHubState(useHubStore());
  const items = threadIds.flatMap((id) => {
    const thread = threads.find((candidate) => candidate.id === id);
    return thread ? [thread] : [];
  });
  if (items.length === 0) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.hint}>{t("subthread-cards-hint")}</Text>
      {items.map((thread) => {
        const confirm = confirms.find((item) => item.threadId === thread.id);
        const draft = Object.values(drafts).find(
          (item) => item.threadId === thread.id && !item.failure,
        );
        const status = confirm ? "need" : draft ? "running" : "done";
        const line = confirm
          ? confirm.kind.kind === "action"
            ? confirm.kind.title
            : t("thread-status-need")
          : draft
            ? t("island-step-count", { n: draft.steps.length })
            : plain(thread.lastMessage ?? "");
        return (
          <Pressable
            key={thread.id}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            accessibilityRole="button"
            onPress={() => openScene(thread.id)}
          >
            <View style={[styles.dot, { backgroundColor: DOT[status] }]} />
            <View style={styles.text}>
              <Text style={styles.title} numberOfLines={1}>
                {thread.title ?? t("thread-untitled")}
              </Text>
              {line ? (
                <Text style={styles.line} numberOfLines={1}>
                  {line}
                </Text>
              ) : null}
            </View>
            <Text style={styles.state}>{t(`thread-status-${status}`)}</Text>
            <ChevronIcon color={color.faint} size={12} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function ReportTitle({ threadId, title }: { threadId: string; title: string }) {
  const { t } = useI18n();
  return (
    <Pressable
      style={styles.report}
      accessibilityRole="button"
      hitSlop={6}
      onPress={() => openScene(threadId)}
    >
      <Text style={styles.reportText} numberOfLines={1}>
        {t("subthread-report-title", { title })}
      </Text>
      <ChevronIcon color={color.accent} size={11} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 8,
    minWidth: 260,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    paddingVertical: 8,
    overflow: "hidden",
  },
  hint: { fontSize: 11, color: color.muted, paddingHorizontal: 14, paddingBottom: 4 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
  },
  pressed: { backgroundColor: color.ground },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 14, fontWeight: "500", color: color.ink },
  line: { fontSize: 12, color: color.faint },
  state: { fontSize: 12, color: color.inkMid },
  report: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
    alignSelf: "flex-start",
  },
  reportText: { fontSize: 12, fontWeight: "700", color: color.accent, flexShrink: 1 },
});
