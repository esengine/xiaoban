import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon.tsx";

export type Tab = "chats" | "daily" | "skills" | "me";

const TABS: {
  id: Tab;
  icon: IconName;
  label: "tab-chats" | "tab-daily" | "tab-skills" | "tab-me";
}[] = [
  { id: "chats", icon: "chat", label: "tab-chats" },
  { id: "daily", icon: "sun", label: "tab-daily" },
  { id: "skills", icon: "grid", label: "tab-skills" },
  { id: "me", icon: "person", label: "tab-me" },
];

export function TabBar({ current, onChange }: { current: Tab; onChange: (tab: Tab) => void }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}
      accessibilityRole="tablist"
    >
      {TABS.map((tab) => {
        const active = tab.id === current;
        const tint = active ? color.accent : color.faint;
        return (
          <Pressable
            key={tab.id}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab.id)}
          >
            <Icon name={tab.icon} color={tint} />
            <Text style={[styles.label, { color: tint }, active && styles.active]}>
              {t(tab.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
    paddingTop: 8,
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  label: {
    fontSize: 11,
  },
  active: {
    fontWeight: "500",
  },
});
