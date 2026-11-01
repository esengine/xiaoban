import { lastText, scheduleLine, sortedSchedules } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Schedule } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router, Stack } from "expo-router";
import { useEffect } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHubStore } from "../src/hub/HubProvider.tsx";
import { openScene } from "../src/life/LifeUI.tsx";
import { Icon } from "../src/ui/Icon.tsx";

function Toggle({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      hitSlop={8}
      style={[styles.toggle, on && styles.toggleOn]}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={onPress}
    >
      <View style={[styles.knob, on && styles.knobOn]} />
    </Pressable>
  );
}

function Item({ schedule, first }: { schedule: Schedule; first: boolean }) {
  const { t } = useI18n();
  const store = useHubStore();
  const on = schedule.state === "active";
  const live = on || schedule.state === "paused";
  const target = schedule.threadId;
  const flip = () =>
    void store
      .setScheduleActive(schedule.id, !on)
      .catch(() => Alert.alert(t("schedule-start-failed")));
  return (
    <View style={[styles.item, !first && styles.divided]}>
      <Pressable
        style={styles.itemText}
        accessibilityRole="button"
        disabled={!target}
        onPress={() => {
          if (target) openScene(target);
        }}
      >
        <Text style={styles.name} numberOfLines={1}>
          {schedule.title}
        </Text>
        <Text style={styles.line}>{scheduleLine(t, schedule)}</Text>
        {schedule.last ? (
          <Text style={[styles.last, !schedule.last.ok && styles.lastFailed]}>
            {lastText(t, schedule.last)}
          </Text>
        ) : null}
      </Pressable>
      {live ? (
        <Toggle on={on} label={t("schedule-toggle", { title: schedule.title })} onPress={flip} />
      ) : null}
    </View>
  );
}

export default function SchedulesScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const store = useHubStore();
  const { schedules, status } = useHubState(store);

  useEffect(() => {
    if (status === "open") void store.listSchedules().catch(() => undefined);
  }, [status, store]);

  const items = sortedSchedules(schedules);
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("chat-back")}
        >
          <Icon name="back" color={color.ink} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {t("schedules-title")}
        </Text>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 24 + insets.bottom }]}>
        {items.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.empty}>{t("schedules-empty")}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            {items.map((schedule, index) => (
              <Item key={schedule.id} schedule={schedule} first={index === 0} />
            ))}
          </View>
        )}
        <Text style={styles.hint}>{t("schedules-hint")}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 4,
    gap: 4,
  },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: {
    flex: 1,
    textAlign: "center",
    marginRight: 48,
    fontSize: 16,
    fontWeight: "700",
    color: color.ink,
  },
  body: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  card: { backgroundColor: color.surface, borderRadius: 16, paddingHorizontal: 14 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  divided: { borderTopWidth: 1, borderTopColor: color.lineSoft },
  itemText: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 14, fontWeight: "700", color: color.ink },
  line: { fontSize: 12, color: color.muted },
  last: { fontSize: 12, color: color.success },
  lastFailed: { color: color.dangerInk },
  empty: { fontSize: 13, color: color.muted, paddingVertical: 16 },
  hint: { fontSize: 12, lineHeight: 18, color: color.muted, paddingHorizontal: 4 },
  toggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.lineStrong,
    padding: 2,
    justifyContent: "center",
  },
  toggleOn: { backgroundColor: color.accent },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: color.surface },
  knobOn: { alignSelf: "flex-end" },
});
