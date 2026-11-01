import { activeModelName, type HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { AutonomyLevel, Memory } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useEffect } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useHubContext } from "../hub/HubProvider.tsx";
import { firstChar } from "../ui/format.ts";
import { Icon } from "../ui/Icon.tsx";

const DAY = 86_400_000;
const CHIPS = 8;

const LEVELS: {
  level: AutonomyLevel;
  name: PlainMessageKey;
  desc: PlainMessageKey;
  bg: string;
  fg: string;
}[] = [
  {
    level: "cautious",
    name: "trust-cautious-name",
    desc: "trust-cautious-desc",
    bg: color.attentionSoft,
    fg: color.attentionInk,
  },
  {
    level: "balanced",
    name: "trust-balanced-name",
    desc: "trust-balanced-desc",
    bg: color.accentSoft,
    fg: color.accentStrong,
  },
  {
    level: "hands_off",
    name: "trust-hands-off-name",
    desc: "trust-hands-off-desc",
    bg: color.successSoft,
    fg: color.success,
  },
];

export function MeTab({ store }: { store: HubStore }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { unpair, paired, onComputer } = useHubContext();
  const { memories, preferences, threads, devices, hub, status, model } = useHubState(store);

  useEffect(() => {
    if (status !== "open") return;
    void store.refreshMemories().catch(() => undefined);
    void store.refreshDevices().catch(() => undefined);
    void store.refreshModel().catch(() => undefined);
  }, [store, status]);

  const name = memories.find(
    (memory) => memory.subject === t("memory-topic-preferred-name"),
  )?.value;
  const since = threads.reduce((min, thread) => Math.min(min, thread.createdAt), Date.now());
  const days = Math.max(1, Math.ceil((Date.now() - since) / DAY));
  const shown = [...memories]
    .filter((memory) => memory.subject !== t("memory-topic-preferred-name"))
    .sort((a, b) => b.importance - a.importance)
    .slice(0, CHIPS);
  const autonomy = preferences?.autonomy ?? "balanced";

  const edit = (memory: Memory) =>
    Alert.alert(memory.subject, memory.value, [
      {
        text: t("me-forget"),
        style: "destructive",
        onPress: () => void store.forgetMemory(memory.subject).catch(() => undefined),
      },
      { text: t("dialog-cancel"), style: "cancel" },
    ]);

  const leave = () =>
    Alert.alert(t("me-unpair-title"), t("me-unpair-body"), [
      { text: t("dialog-cancel"), style: "cancel" },
      {
        text: t("me-unpair"),
        style: "destructive",
        onPress: () => {
          void unpair().then(() => router.replace("/"));
        },
      },
    ]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.body, { paddingTop: insets.top + 16 }]}
    >
      <View style={styles.header}>
        <View style={styles.avatar}>
          {name ? (
            <Text style={styles.avatarText}>{firstChar(name)}</Text>
          ) : (
            <Icon name="person" color={color.inkSoft} size={26} />
          )}
        </View>
        <View style={styles.flex}>
          <Text style={styles.name}>{name ?? t("me-you")}</Text>
          <Text style={styles.sub}>{t("me-days", { days })}</Text>
        </View>
      </View>

      <Pressable
        style={[styles.card, styles.modelRow]}
        onPress={() => router.push("/models")}
        accessibilityRole="button"
      >
        <Text style={styles.cardTitle}>{t("me-model")}</Text>
        <Text style={styles.modelName} numberOfLines={1}>
          {model ? activeModelName(model) : t("model-not-connected")}
        </Text>
        <Svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color.faint}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M9 6l6 6-6 6" />
        </Svg>
      </Pressable>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{t("me-memories")}</Text>
          <Text style={styles.link}>{t("me-memories-count", { count: memories.length })}</Text>
        </View>
        <View style={styles.chips}>
          {shown.map((memory) => (
            <Pressable key={memory.id} style={styles.chip} onPress={() => edit(memory)}>
              <Text style={styles.chipText} numberOfLines={1}>
                {memory.value}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>{t("me-memories-hint")}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("me-autonomy")}</Text>
        {LEVELS.map((item) => {
          const active = item.level === autonomy;
          return (
            <Pressable
              key={item.level}
              style={styles.level}
              onPress={() => void store.setAutonomy(item.level).catch(() => undefined)}
              accessibilityState={{ selected: active }}
            >
              <View style={styles.flex}>
                <Text style={styles.levelName}>{t(item.name)}</Text>
                <Text style={styles.sub}>{t(item.desc)}</Text>
              </View>
              {active ? (
                <Text style={[styles.levelTag, { backgroundColor: item.bg, color: item.fg }]}>
                  {t("me-autonomy-current")}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        <Text style={styles.hint}>{t("trust-red-lines")}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("me-connected")}</Text>
        {paired ? (
          <>
            <View style={styles.device}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: onComputer ? color.tripGreen : color.attention },
                ]}
              />
              <View style={styles.flex}>
                <Text style={styles.levelName}>
                  {onComputer ? (hub?.name ?? t("me-computer")) : t("me-computer")}
                </Text>
                <Text style={styles.sub}>
                  {onComputer ? t("me-computer-online") : t("connection-waiting-for-hub")}
                </Text>
              </View>
            </View>
            {onComputer &&
              devices
                .filter((device) => device.platform !== "desktop")
                .map((device) => (
                  <View key={device.id} style={styles.device}>
                    <View style={[styles.dot, { backgroundColor: color.lineStrong }]} />
                    <Text style={styles.levelName}>{device.name}</Text>
                  </View>
                ))}
            <Pressable onPress={leave}>
              <Text style={styles.danger}>{t("me-unpair")}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={() => router.push("/scan")} accessibilityRole="button">
            <Text style={styles.link}>{t("me-connect-computer")}</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  body: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: color.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 20, fontWeight: "700", color: color.inkSoft },
  name: { fontSize: 18, fontWeight: "700", color: color.ink },
  sub: { fontSize: 12, color: color.muted, marginTop: 2 },
  card: {
    backgroundColor: color.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: color.ink },
  modelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  modelName: { flex: 1, textAlign: "right", fontSize: 13, color: color.muted },
  link: { fontSize: 13, color: color.accent },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: color.ground,
    maxWidth: "100%",
  },
  chipText: { fontSize: 13, color: color.ink },
  hint: { fontSize: 12, color: color.muted, lineHeight: 18 },
  level: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  levelName: { fontSize: 14, color: color.ink },
  levelTag: {
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
  },
  device: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  danger: { fontSize: 13, color: color.dangerInk, paddingTop: 4 },
});
