import { failedText, markText, ruleText, runsText, stateText } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { RunMark, Schedule } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";
import { ClockIcon, PairButtons, ScheduleEditor } from "./ScheduleCard.tsx";

export function ScheduleBar({ schedule }: { schedule: Schedule }) {
  const { t } = useI18n();
  const store = useHubStore();
  const [editing, setEditing] = useState(false);
  const live = schedule.state === "active" || schedule.state === "paused";
  const paused = schedule.state === "paused";
  const fail = () => Alert.alert(t("schedule-start-failed"));
  return (
    <View style={styles.bar}>
      <View style={styles.barRow}>
        <ClockIcon />
        <Pressable
          style={styles.barText}
          accessibilityRole="button"
          accessibilityLabel={t("schedule-edit")}
          onPress={() => setEditing((open) => !open)}
        >
          <Text style={styles.barTitle} numberOfLines={1}>
            {`${ruleText(t, schedule.rule)}${t("schedule-dot")}${stateText(t, schedule)}`}
          </Text>
          <Text style={styles.barSub} numberOfLines={1}>
            {runsText(t, schedule)}
          </Text>
        </Pressable>
        <Pressable
          hitSlop={6}
          accessibilityRole="button"
          onPress={() => void store.runSchedule(schedule.id).catch(fail)}
        >
          <Text style={styles.barLink}>{t("schedule-run-now")}</Text>
        </Pressable>
        {live ? (
          <Pressable
            hitSlop={6}
            accessibilityRole="button"
            onPress={() => void store.setScheduleActive(schedule.id, paused).catch(fail)}
          >
            <Text style={styles.barMuted}>{t(paused ? "schedule-resume" : "schedule-pause")}</Text>
          </Pressable>
        ) : null}
      </View>
      {editing ? (
        <View style={styles.editor}>
          <ScheduleEditor
            schedule={schedule}
            onCancel={() => setEditing(false)}
            onSaved={() => setEditing(false)}
          />
        </View>
      ) : null}
    </View>
  );
}

export function RunMarker({
  mark,
  dueAt,
  failed,
}: {
  mark: RunMark;
  dueAt: number;
  failed: boolean;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.markerShell}>
      <Text style={styles.marker}>{markText(t, mark, dueAt, failed)}</Text>
    </View>
  );
}

export function FailedCard({ scheduleId, reason }: { scheduleId: string; reason: string }) {
  const { t } = useI18n();
  const store = useHubStore();
  const { schedules } = useHubState(store);
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const retry = async () => {
    setBusy(true);
    try {
      await store.runSchedule(scheduleId);
      setClosed(true);
    } catch {
      Alert.alert(t("schedule-start-failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.failed}>
      <Text style={styles.failedTitle}>{t("schedule-failed-title")}</Text>
      <Text style={styles.failedBody}>{failedText(t, reason, schedules[scheduleId])}</Text>
      {closed ? null : (
        <PairButtons
          solid={t("schedule-retry")}
          line={t("schedule-skip")}
          busy={busy}
          onSolid={() => void retry()}
          onLine={() => setClosed(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: color.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  barText: { flex: 1, minWidth: 0 },
  barTitle: { fontSize: 13, fontWeight: "700", color: color.ink },
  barSub: { fontSize: 11, color: color.muted, marginTop: 2 },
  barLink: { fontSize: 12, color: color.accent },
  barMuted: { fontSize: 12, color: color.muted },
  editor: { gap: 9 },
  markerShell: { alignItems: "center" },
  marker: {
    fontSize: 11,
    color: color.faint,
    backgroundColor: color.chipSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: "hidden",
  },
  failed: {
    marginTop: 4,
    width: 320,
    maxWidth: "100%",
    backgroundColor: color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.attentionLine,
    padding: 12,
    gap: 8,
  },
  failedTitle: { fontSize: 14, fontWeight: "700", color: color.ink },
  failedBody: { fontSize: 13, lineHeight: 19, color: color.inkSoft },
});
