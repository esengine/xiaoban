import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { DoneItem, Insight, InsightPage } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { plain } from "../chat/plain.ts";
import { openThread } from "../screens/ChatsTab.tsx";
import { useWhen } from "../ui/useWhen.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const PAGES: Record<Exclude<InsightPage, "thread">, "/kitchen" | "/week" | "/ledger" | "/weather"> =
  {
    kitchen: "/kitchen",
    week: "/week",
    ledger: "/ledger",
    weather: "/weather",
  };

export function useAgo() {
  const { t } = useI18n();
  const when = useWhen();
  return (time: number) => {
    const gap = Date.now() - time;
    if (gap >= MINUTE && gap < HOUR) return t("time-minutes-ago", { count: Math.floor(gap / MINUTE) });
    if (gap >= HOUR && gap < 12 * HOUR) return t("time-hours-ago", { count: Math.floor(gap / HOUR) });
    return when(time);
  };
}

export function useInsightAct(store: HubStore) {
  const { preferences } = useHubState(store);
  const primary = preferences?.primaryThreadId ?? null;
  return (insight: Insight) => {
    void store.resolveInsight(insight.id, false).catch(() => undefined);
    const action = insight.action;
    if (action.kind === "say") {
      const target = action.threadId ?? primary;
      if (!target) return;
      void store.send(target, action.text).catch(() => undefined);
      openThread(target);
      return;
    }
    if (action.page === "thread") {
      if (action.threadId) openThread(action.threadId);
      return;
    }
    router.push(PAGES[action.page]);
  };
}

export function NoticedCard({ store, insight }: { store: HubStore; insight: Insight }) {
  const { t } = useI18n();
  const ago = useAgo();
  const act = useInsightAct(store);
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.tag}>{t("insight-tag")}</Text>
        <Text style={styles.time}>{ago(insight.at)}</Text>
      </View>
      <Text style={styles.text}>{insight.text}</Text>
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          accessibilityRole="button"
          onPress={() => act(insight)}
        >
          <Text style={styles.primaryText}>{insight.actionLabel}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.secondary, pressed && styles.pressedLight]}
          accessibilityRole="button"
          onPress={() => void store.resolveInsight(insight.id, true).catch(() => undefined)}
        >
          <Text style={styles.secondaryText}>{t("insight-mute-long")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DoneRow({ item }: { item: DoneItem }) {
  const { t } = useI18n();
  const when = useWhen();
  const running = item.status === "running";
  const summary = plain(item.summary);
  const body = (
    <>
      <Text style={styles.doneTime}>{when(item.at)}</Text>
      <View style={styles.doneText}>
        <Text style={styles.doneTitle} numberOfLines={1}>
          {item.title || t("thread-untitled")}
        </Text>
        {summary ? (
          <Text style={styles.doneSummary} numberOfLines={2}>
            {summary}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.doneState, running ? styles.doneRunning : styles.doneFinished]}>
        {running ? t("daily-done-running") : t("daily-done-finished")}
      </Text>
    </>
  );
  const threadId = item.threadId;
  if (!threadId) return <View style={styles.doneRow}>{body}</View>;
  return (
    <Pressable
      style={({ pressed }) => [styles.doneRow, pressed && styles.pressedLight]}
      accessibilityRole="button"
      onPress={() => openThread(threadId)}
    >
      {body}
    </Pressable>
  );
}

export function DoneCard({ items }: { items: DoneItem[] }) {
  const { t } = useI18n();
  return (
    <View style={styles.doneCard}>
      <View style={styles.doneHead}>
        <Text style={styles.doneHeading}>{t("daily-done")}</Text>
        <Text style={styles.time}>{t("daily-done-note")}</Text>
      </View>
      {items.map((item) => (
        <DoneRow key={item.id} item={item} />
      ))}
    </View>
  );
}

export function LedgerNoticed({ store, insight }: { store: HubStore; insight: Insight }) {
  const { t } = useI18n();
  const act = useInsightAct(store);
  return (
    <Pressable
      style={({ pressed }) => [styles.ledger, pressed && styles.pressedLight]}
      accessibilityRole="button"
      onPress={() => act(insight)}
    >
      <Text style={styles.ledgerTag}>{t("insight-tag")}</Text>
      <Text style={styles.ledgerText}>{insight.text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  tag: {
    fontSize: 11,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: color.attentionSoft,
    color: color.attentionInk,
  },
  time: { fontSize: 12, color: color.faint },
  text: { fontSize: 14, lineHeight: 22, color: color.ink },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  primary: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontSize: 13, color: color.surface },
  secondary: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { fontSize: 13, color: color.ink },
  pressed: { opacity: 0.85 },
  pressedLight: { backgroundColor: color.ground },
  doneCard: {
    backgroundColor: color.surface,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 4,
  },
  doneHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 6,
  },
  doneHeading: { fontSize: 15, fontWeight: "700", color: color.ink },
  doneRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
  },
  doneTime: { fontSize: 12, color: color.faint, width: 44, paddingTop: 2 },
  doneText: { flex: 1, minWidth: 0 },
  doneTitle: { fontSize: 14, color: color.ink },
  doneSummary: { fontSize: 12, color: color.muted, marginTop: 2, lineHeight: 18 },
  doneState: { alignSelf: "center", fontSize: 12 },
  doneRunning: { color: color.accent },
  doneFinished: { color: color.success },
  ledger: {
    backgroundColor: color.surface,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  ledgerTag: {
    fontSize: 11,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: color.accentSoft,
    color: color.accentStrong,
  },
  ledgerText: { flex: 1, fontSize: 12, lineHeight: 19, color: color.inkSoft },
});
