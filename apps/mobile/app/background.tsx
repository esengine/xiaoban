import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { router, Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { XiaobanHub } from "../modules/xiaoban-hub/index.ts";
import { type BackgroundStatus, backgroundStatus } from "../src/hub/background.ts";

type State = "ok" | "bad" | "unknown";

interface Item {
  name: PlainMessageKey;
  desc: PlainMessageKey;
  state: State;
  setting?: string;
  action?: PlainMessageKey;
}

function items(status: BackgroundStatus, operator: boolean): Item[] {
  const list: Item[] = [
    {
      name: "background-notifications",
      desc: "background-notifications-desc",
      state: status.notifications ? "ok" : "bad",
      setting: "notifications",
      action: "background-open",
    },
    { name: "background-keep", desc: "background-keep-desc", state: "ok" },
  ];
  if (status.xiaomi) {
    list.push({
      name: "background-autostart",
      desc: "background-autostart-desc",
      state: "unknown",
      setting: "autostart",
      action: "background-open",
    });
  }
  list.push({
    name: "background-battery",
    desc: status.battery ? "background-battery-ok" : "background-battery-desc",
    state: status.battery ? "ok" : "bad",
    setting: "battery",
    action: "background-set",
  });
  list.push({
    name: "background-alarms",
    desc: "background-alarms-desc",
    state: status.exactAlarms ? "ok" : "bad",
    setting: "alarms",
    action: "background-open",
  });
  list.push({
    name: "background-operator",
    desc: "background-operator-desc",
    state: operator ? "ok" : "unknown",
  });
  return list;
}

function Mark({ state }: { state: State }) {
  if (state === "ok") {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path
          d="M5 12.5l4.5 4.5L19 7.5"
          stroke={color.success}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  }
  return (
    <View style={[styles.dot, state === "unknown" && styles.dotUnknown]}>
      <Text style={styles.dotText}>{state === "bad" ? "!" : "?"}</Text>
    </View>
  );
}

export default function BackgroundScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<BackgroundStatus | null>(null);
  const [operator, setOperator] = useState(false);

  const refresh = useCallback(() => {
    setStatus(backgroundStatus());
    setOperator(Boolean(XiaobanHub?.operatorReady()));
  }, []);

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const list = status ? items(status, operator) : [];
  const bad = list.filter((item) => item.state === "bad").length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("onboarding-back")}
        >
          <Svg
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color.ink}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M15 5l-7 7 7 7" />
          </Svg>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {t("background-title")}
        </Text>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 24 + insets.bottom }]}>
        <View style={[styles.card, styles.summary]}>
          <View style={[styles.count, bad === 0 && styles.countOk]}>
            <Text style={[styles.countText, bad === 0 && styles.countTextOk]}>{String(bad)}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.name}>
              {bad === 0 ? t("background-all-good") : t("background-issues", { count: bad })}
            </Text>
            <Text style={styles.sub}>
              {t(status?.xiaomi ? "background-xiaomi" : "background-general")}
            </Text>
          </View>
        </View>
        <View style={styles.list}>
          {list.map((item, index) => (
            <View key={item.name} style={[styles.row, index > 0 && styles.rowLine]}>
              <Mark state={item.state} />
              <View style={styles.flex}>
                <Text style={styles.rowName}>{t(item.name)}</Text>
                <Text style={styles.sub}>{t(item.desc)}</Text>
              </View>
              {item.setting && item.action && item.state !== "ok" ? (
                <Pressable
                  style={styles.go}
                  accessibilityRole="button"
                  onPress={() => XiaobanHub?.openBackgroundSetting?.(item.setting ?? "")}
                >
                  <Text style={styles.goText}>{t(item.action)}</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
        <Text style={styles.hint}>{t("background-hint")}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  flex: { flex: 1, minWidth: 0 },
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
  body: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  card: {
    backgroundColor: color.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summary: { flexDirection: "row", alignItems: "center", gap: 12 },
  count: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.attentionSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  countOk: { backgroundColor: color.diffAdded },
  countText: { fontSize: 15, fontWeight: "700", color: color.attentionInk },
  countTextOk: { color: color.success },
  name: { fontSize: 15, fontWeight: "600", color: color.ink },
  sub: { fontSize: 12, lineHeight: 18, color: color.muted, marginTop: 2 },
  list: { backgroundColor: color.surface, borderRadius: 16, paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowLine: { borderTopWidth: 1, borderTopColor: color.lineSoft },
  rowName: { fontSize: 14, color: color.ink },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: color.attention,
    alignItems: "center",
    justifyContent: "center",
  },
  dotUnknown: { backgroundColor: color.faint },
  dotText: { fontSize: 12, fontWeight: "700", color: color.surface },
  go: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: color.ink,
    justifyContent: "center",
  },
  goText: { fontSize: 12, color: color.surface, fontWeight: "500" },
  hint: { fontSize: 12, lineHeight: 19, color: color.muted, paddingHorizontal: 4 },
});
