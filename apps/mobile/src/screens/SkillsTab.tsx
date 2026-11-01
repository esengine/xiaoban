import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import { color, dark } from "@xiaoban/tokens";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../ui/Icon.tsx";
import { openThread } from "./ChatsTab.tsx";

type Item = { title: PlainMessageKey; example: PlainMessageKey };
type Scene = { name: PlainMessageKey; items: Item[] };

const SCENES: Scene[] = [
  {
    name: "skills-scene-life",
    items: [
      { title: "skills-ledger", example: "skills-ledger-example" },
      { title: "skills-weather", example: "skills-weather-example" },
      { title: "skills-plan", example: "skills-plan-example" },
    ],
  },
  {
    name: "skills-scene-trip",
    items: [
      { title: "skills-trip", example: "skills-trip-example" },
      { title: "skills-trip-change", example: "skills-trip-change-example" },
    ],
  },
  {
    name: "skills-scene-cook",
    items: [
      { title: "skills-tonight", example: "skills-tonight-example" },
      { title: "skills-week", example: "skills-week-example" },
      { title: "skills-cook", example: "skills-cook-example" },
    ],
  },
  {
    name: "skills-scene-docs",
    items: [
      { title: "skills-slides", example: "skills-slides-example" },
      { title: "skills-doc", example: "skills-doc-example" },
      { title: "skills-sheet", example: "skills-sheet-example" },
    ],
  },
  {
    name: "skills-scene-computer",
    items: [
      { title: "skills-operate", example: "skills-operate-example" },
      { title: "skills-code", example: "skills-code-example" },
    ],
  },
];

export function SkillsTab({ store }: { store: HubStore }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { preferences } = useHubState(store);
  const [scene, setScene] = useState(0);
  const [query, setQuery] = useState("");
  const [tray, setTray] = useState<Item | null>(null);
  const primaryId = preferences?.primaryThreadId ?? null;
  const items = SCENES[scene]?.items ?? [];

  const tell = (text: string) => {
    if (!primaryId || !text.trim()) return;
    void store.send(primaryId, text.trim()).catch(() => undefined);
    openThread(primaryId);
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title} accessibilityRole="header">
          {t("tab-skills")}
        </Text>
        <View style={styles.search}>
          <Icon name="search" color={color.faint} size={18} />
          <TextInput
            style={styles.searchInput}
            placeholder={t("skills-search")}
            placeholderTextColor={color.faint}
            value={query}
            onChangeText={setQuery}
            returnKeyType="send"
            onSubmitEditing={() => {
              tell(query);
              setQuery("");
            }}
          />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("skills-can-do")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scenes}
          >
            {SCENES.map((item, index) => {
              const active = index === scene;
              return (
                <Pressable
                  key={item.name}
                  style={[styles.scene, active && styles.sceneActive]}
                  onPress={() => setScene(index)}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.sceneText, active && styles.sceneTextActive]}>
                    {t(item.name)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {items.map((item) => (
            <Pressable
              key={item.title}
              style={[styles.item, tray?.title === item.title && styles.itemActive]}
              onPress={() => setTray(item)}
            >
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{t(item.title)}</Text>
                <Text style={styles.itemExample}>
                  {t("skills-quote", { text: t(item.example) })}
                </Text>
              </View>
              <Text style={styles.try}>{t("skills-try")}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      {tray && (
        <View style={styles.tray}>
          <Text style={styles.trayLabel}>{t("skills-tray", { title: t(tray.title) })}</Text>
          <Text style={styles.trayText}>{t(tray.example)}</Text>
          <View style={styles.trayActions}>
            <Pressable style={[styles.trayButton, styles.trayCancel]} onPress={() => setTray(null)}>
              <Text style={styles.trayCancelText}>{t("skills-tray-cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.trayButton, styles.traySend]}
              onPress={() => {
                tell(t(tray.example));
                setTray(null);
              }}
            >
              <Text style={styles.traySendText}>{t("skills-tray-send")}</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  flex: { flex: 1, minWidth: 0 },
  header: { paddingHorizontal: 20, paddingBottom: 10, gap: 10 },
  title: { fontSize: 22, fontWeight: "700", color: color.ink },
  search: {
    height: 42,
    backgroundColor: color.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: color.ink },
  body: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  card: { backgroundColor: color.surface, borderRadius: 16, padding: 14, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: color.ink },
  scenes: { gap: 6, paddingBottom: 6 },
  scene: {
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor: color.ground,
    alignItems: "center",
    justifyContent: "center",
  },
  sceneActive: { backgroundColor: color.ink },
  sceneText: { fontSize: 12, color: color.inkMid },
  sceneTextActive: { color: color.surface, fontWeight: "500" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  itemActive: { backgroundColor: color.accentWash },
  itemTitle: { fontSize: 14, fontWeight: "500", color: color.ink },
  itemExample: { fontSize: 12, color: color.inkMid, marginTop: 2 },
  try: { fontSize: 12, color: color.accent },
  tray: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: color.ink,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  trayLabel: { fontSize: 12, color: dark.textMuted },
  trayText: {
    backgroundColor: dark.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 22,
    color: color.surface,
  },
  trayActions: { flexDirection: "row", gap: 8 },
  trayButton: {
    flex: 1,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  trayCancel: { backgroundColor: dark.line },
  trayCancelText: { fontSize: 13, color: color.surface },
  traySend: { backgroundColor: color.surface },
  traySendText: { fontSize: 13, fontWeight: "500", color: color.ink },
});
