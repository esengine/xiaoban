import { useI18n } from "@xiaoban/i18n/react";
import type { MailCategory } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router, Stack } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../ui/Icon.tsx";

export function MailScreen({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
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
          <Icon name="back" color={color.ink} size={22} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

export const TAGS: Record<MailCategory, { bg: string; fg: string }> = {
  bill: { bg: color.attentionSoft, fg: color.attentionInk },
  trip: { bg: color.accentTint, fg: color.accent },
  parcel: { bg: color.successSoft, fg: color.success },
  reply: { bg: color.neutralTint, fg: color.muted },
  promo: { bg: color.neutralTint, fg: color.muted },
  other: { bg: color.neutralTint, fg: color.muted },
};

export const mailStyles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    padding: 14,
    gap: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: color.ink },
  body: { fontSize: 13, lineHeight: 21, color: color.muted },
  label: { fontSize: 12, color: color.faded },
  tag: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 6,
    fontSize: 11,
    overflow: "hidden",
  },
  meta: { fontSize: 11, color: color.faded },
  line: { fontSize: 14, color: color.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.lineStrong,
  },
  chipText: { fontSize: 12, color: color.ink },
  buttons: { flexDirection: "row", gap: 8 },
  button: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  buttonText: { fontSize: 13, color: color.ink },
  primary: { backgroundColor: color.ink, borderColor: color.ink },
  primaryText: { fontSize: 13, fontWeight: "600", color: color.surface },
  pressed: { opacity: 0.7 },
});

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
  body: { paddingHorizontal: 14, paddingTop: 4, gap: 12 },
});
