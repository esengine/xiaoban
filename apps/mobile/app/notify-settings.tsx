import { useHubState } from "@xiaoban/client/react";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type {
  NotifyCategory,
  NotifyLevel,
  NotifyLevels,
  NotifyScene,
  NotifySettings,
} from "@xiaoban/protocol";
import { color, motion } from "@xiaoban/tokens";
import { router, Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import { springEasing } from "../src/chat/Motion.tsx";
import { useHubContext, useHubStore } from "../src/hub/HubProvider.tsx";
import { CATEGORY_KEY } from "../src/hub/noticeText.ts";
import { useReduceMotion } from "../src/ui/useReduceMotion.ts";

const CATEGORIES: NotifyCategory[] = [
  "confirm",
  "remind",
  "error",
  "morning",
  "done",
  "idea",
  "report",
  "family",
];

const ORDER: NotifyLevel[] = ["now", "daily", "mute"];

const LEVELS: Record<
  NotifyLevel,
  {
    name: PlainMessageKey;
    desc: PlainMessageKey;
    dot: string;
    bg: string;
    fg: string;
    line: string;
  }
> = {
  now: {
    name: "notify-level-now",
    desc: "notify-level-now-desc",
    dot: color.attention,
    bg: color.attentionSoft,
    fg: color.attentionInk,
    line: color.attentionLine,
  },
  daily: {
    name: "notify-level-daily",
    desc: "notify-level-daily-desc",
    dot: color.accent,
    bg: color.accentSoft,
    fg: color.accentStrong,
    line: color.accentLine,
  },
  mute: {
    name: "notify-level-mute",
    desc: "notify-level-mute-desc",
    dot: color.faded,
    bg: color.ground,
    fg: color.inkMid,
    line: color.line,
  },
};

const SCENES: { scene: NotifyScene; label: PlainMessageKey; note: PlainMessageKey }[] = [
  { scene: "normal", label: "notify-scene-normal", note: "notify-scene-normal-note" },
  { scene: "kid", label: "notify-scene-kid", note: "notify-scene-kid-note" },
  { scene: "work", label: "notify-scene-work", note: "notify-scene-work-note" },
  { scene: "trip", label: "notify-scene-trip", note: "notify-scene-trip-note" },
];

type Adjustable = Exclude<NotifyCategory, "confirm">;

function levelOf(levels: NotifyLevels, category: NotifyCategory): NotifyLevel {
  return category === "confirm" ? "now" : levels[category];
}

function clock(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${hour}:${minute.toString().padStart(2, "0")}`;
}

function Chip({
  label,
  level,
  locked,
  lockLabel,
  onPress,
}: {
  label: string;
  level: NotifyLevel;
  locked: boolean;
  lockLabel: string;
  onPress: () => void;
}) {
  const reduced = useReduceMotion();
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, {
      toValue: 1,
      duration: motion.standard,
      easing: springEasing,
      useNativeDriver: true,
    }).start();
  }, [enter, reduced]);
  const tone = LEVELS[level];
  const scale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  return (
    <Animated.View style={{ opacity: enter, transform: [{ scale }] }}>
      <Pressable
        style={[styles.chip, { backgroundColor: tone.bg, borderColor: tone.line }]}
        disabled={locked}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ disabled: locked }}
      >
        {locked ? (
          <Svg
            width={11}
            height={11}
            viewBox="0 0 24 24"
            fill="none"
            stroke={tone.fg}
            strokeWidth={2.4}
            strokeLinecap="round"
            accessibilityLabel={lockLabel}
            accessibilityRole="image"
          >
            <Rect x={5} y={11} width={14} height={10} rx={2} />
            <Path d="M8 11V8a4 4 0 018 0v3" />
          </Svg>
        ) : null}
        <Text style={[styles.chipText, { color: tone.fg }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  const reduced = useReduceMotion();
  const knob = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      knob.setValue(on ? 1 : 0);
      return;
    }
    Animated.timing(knob, {
      toValue: on ? 1 : 0,
      duration: motion.standard,
      easing: springEasing,
      useNativeDriver: true,
    }).start();
  }, [knob, on, reduced]);
  const translateX = knob.interpolate({ inputRange: [0, 1], outputRange: [0, 20] });
  return (
    <Pressable
      style={[styles.switch, { backgroundColor: on ? color.accent : color.checkOff }]}
      onPress={() => onChange(!on)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.knob, { transform: [{ translateX }] }]} />
    </Pressable>
  );
}

export default function NotifySettingsScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const store = useHubStore();
  const { local } = useHubContext();
  const { status } = useHubState(store);
  const [settings, setSettings] = useState<NotifySettings | null>(null);

  useEffect(() => {
    if (status !== "open") return;
    let live = true;
    void store
      .notifySettings()
      .then((loaded) => {
        if (live) setSettings(loaded);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, status]);

  const update = (next: NotifySettings) => {
    setSettings(next);
    void store
      .setNotifySettings(next)
      .then(setSettings)
      .catch(() => undefined);
    if (local && local !== store) void local.setNotifySettings(next).catch(() => undefined);
  };

  const cycle = (category: NotifyCategory) => {
    if (!settings || category === "confirm") return;
    const current = settings.levels[category as Adjustable];
    const following = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? "now";
    update({ ...settings, levels: { ...settings.levels, [category]: following } });
  };

  const scene = SCENES.find((item) => item.scene === settings?.scene) ?? SCENES[0];

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
          {t("notify-settings-title")}
        </Text>
      </View>
      {settings ? (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 24 + insets.bottom }]}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t("notify-scene-label")}</Text>
            <View style={styles.scenes}>
              {SCENES.map((item) => {
                const on = item.scene === settings.scene;
                return (
                  <Pressable
                    key={item.scene}
                    style={[styles.scene, on && styles.sceneOn]}
                    onPress={() => update({ ...settings, scene: item.scene })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.sceneText, on && styles.sceneTextOn]}>
                      {t(item.label)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {scene ? <Text style={styles.note}>{t(scene.note)}</Text> : null}
          </View>

          <Text style={styles.hint}>{t("notify-cycle-hint")}</Text>

          {ORDER.map((level) => {
            const tone = LEVELS[level];
            const items = CATEGORIES.filter(
              (category) => levelOf(settings.levels, category) === level,
            );
            return (
              <View key={level} style={styles.card}>
                <View style={styles.levelHead}>
                  <View style={[styles.dot, { backgroundColor: tone.dot }]} />
                  <Text style={styles.levelName}>{t(tone.name)}</Text>
                  <Text style={styles.levelDesc}>{t(tone.desc)}</Text>
                </View>
                <View style={styles.chips}>
                  {items.map((category) => (
                    <Chip
                      key={`${category}-${level}`}
                      label={t(CATEGORY_KEY[category])}
                      level={level}
                      locked={category === "confirm"}
                      lockLabel={t("notify-locked")}
                      onPress={() => cycle(category)}
                    />
                  ))}
                </View>
              </View>
            );
          })}

          <View style={[styles.card, styles.toggles]}>
            <View style={[styles.toggleRow, styles.toggleDivider]}>
              <View style={styles.flex}>
                <Text style={styles.toggleTitle}>{t("notify-quiet")}</Text>
                <Text style={styles.toggleDesc}>
                  {t("notify-quiet-desc", {
                    start: clock(settings.quietStart),
                    end: clock(settings.quietEnd),
                  })}
                </Text>
              </View>
              <Toggle
                on={settings.quiet}
                label={t("notify-quiet")}
                onChange={(quiet) => update({ ...settings, quiet })}
              />
            </View>
            <View style={styles.toggleRow}>
              <View style={styles.flex}>
                <Text style={styles.toggleTitle}>{t("notify-one-device")}</Text>
                <Text style={styles.toggleDesc}>{t("notify-one-device-desc")}</Text>
              </View>
              <Toggle
                on={settings.oneDevice}
                label={t("notify-one-device")}
                onChange={(oneDevice) => update({ ...settings, oneDevice })}
              />
            </View>
          </View>
        </ScrollView>
      ) : null}
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
  body: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  card: {
    backgroundColor: color.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardLabel: { fontSize: 13, color: color.muted, marginBottom: 8 },
  scenes: { flexDirection: "row", gap: 6 },
  scene: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  sceneOn: { backgroundColor: color.ink, borderColor: color.ink },
  sceneText: { fontSize: 12, color: color.ink },
  sceneTextOn: { color: color.surface },
  note: { fontSize: 12, color: color.inkMid, marginTop: 8, lineHeight: 19 },
  hint: { fontSize: 12, color: color.muted, paddingHorizontal: 4 },
  levelHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  levelName: { fontSize: 14, fontWeight: "700", color: color.ink },
  levelDesc: { flex: 1, fontSize: 12, color: color.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, minHeight: 32 },
  chip: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chipText: { fontSize: 12 },
  toggles: { paddingVertical: 4 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  toggleDivider: { borderBottomWidth: 1, borderBottomColor: color.lineSoft },
  toggleTitle: { fontSize: 14, color: color.ink },
  toggleDesc: { fontSize: 12, color: color.muted, marginTop: 2, lineHeight: 18 },
  switch: { width: 50, height: 30, borderRadius: 15, flex: 0 },
  knob: {
    position: "absolute",
    top: 3,
    left: 3,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.surface,
  },
});
