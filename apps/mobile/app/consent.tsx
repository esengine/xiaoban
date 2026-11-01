import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import { color, dark, radius } from "@xiaoban/tokens";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { XiaobanHub } from "../modules/xiaoban-hub/index.ts";
import { useHubStore } from "../src/hub/HubProvider.tsx";

function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.number}>
        <Text style={styles.numberText}>{number}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

export default function ConsentScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const store = useHubStore();
  const { confirm } = useLocalSearchParams<{ confirm?: string }>();
  const [agreed, setAgreed] = useState(false);
  const answered = useRef(false);

  const answer = (choice: "yes" | "no") => {
    if (answered.current) return;
    answered.current = true;
    if (confirm) void store.answerConfirm(confirm, choice).catch(() => undefined);
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && XiaobanHub?.operatorReady()) answer("yes");
    });
    return () => subscription.remove();
  });

  const line = (key: PlainMessageKey) => (
    <Text key={key} style={styles.body}>
      {t("consent-bullet", { text: t(key) })}
    </Text>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          style={styles.close}
          onPress={() => answer("no")}
          accessibilityRole="button"
          accessibilityLabel={t("consent-close")}
        >
          <Svg
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color.ink}
            strokeWidth={2}
            strokeLinecap="round"
          >
            <Path d="M6 6l12 12M18 6L6 18" />
          </Svg>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.title} accessibilityRole="header">
            {t("consent-title")}
          </Text>
          <Text style={styles.lead}>{t("consent-lead")}</Text>
        </View>
        <Section number={1} title={t("consent-use-title")}>
          <Text style={styles.body}>{t("consent-use-lead")}</Text>
          {line("consent-use-1")}
          {line("consent-use-2")}
        </Section>
        <Section number={2} title={t("consent-see-title")}>
          <View style={styles.grid}>
            <View style={[styles.tile, styles.can]}>
              <Text style={[styles.tileTitle, styles.canText]}>{t("consent-can")}</Text>
              <Text style={[styles.tileText, styles.canText]}>{t("consent-can-body")}</Text>
            </View>
            <View style={[styles.tile, styles.cannot]}>
              <Text style={[styles.tileTitle, styles.cannotText]}>{t("consent-cannot")}</Text>
              <Text style={[styles.tileText, styles.cannotText]}>{t("consent-cannot-body")}</Text>
            </View>
          </View>
          <Text style={styles.note}>{t("consent-see-note")}</Text>
        </Section>
        <Section number={3} title={t("consent-off-title")}>
          {line("consent-off-1")}
          {line("consent-off-2")}
        </Section>
        <Pressable
          style={[styles.agree, agreed && styles.agreeOn]}
          onPress={() => setAgreed((value) => !value)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
        >
          <View style={[styles.tick, agreed && styles.tickOn]}>
            {agreed && (
              <Svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                stroke={color.surface}
                strokeWidth={3.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M5 12.5l4.5 4.5L19 7.5" />
              </Svg>
            )}
          </View>
          <Text style={[styles.flex, styles.agreeText]}>{t("consent-agree")}</Text>
        </Pressable>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 22 }]}>
        <Pressable
          style={[styles.open, agreed && styles.openOn]}
          disabled={!agreed}
          onPress={() => XiaobanHub?.openOperatorSettings()}
          accessibilityRole="button"
          accessibilityState={{ disabled: !agreed }}
        >
          <Text style={[styles.openText, agreed && styles.openTextOn]}>{t("consent-open")}</Text>
        </Pressable>
        <Text style={styles.openHint}>{t("consent-open-hint")}</Text>
        <Pressable onPress={() => answer("no")} accessibilityRole="button">
          <Text style={styles.later}>{t("consent-later")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  flex: { flex: 1, minWidth: 0 },
  header: { paddingHorizontal: 8, paddingTop: 4, paddingBottom: 4 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: 22, paddingBottom: 16, gap: 16 },
  title: { fontSize: 22, fontWeight: "700", lineHeight: 31, color: color.ink },
  lead: { marginTop: 6, fontSize: 13, lineHeight: 21, color: color.inkMid },
  section: { flexDirection: "row", gap: 12 },
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { fontSize: 12, fontWeight: "700", color: color.surface },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: color.ink, marginBottom: 4 },
  body: { fontSize: 13, lineHeight: 22, color: color.inkSoft },
  grid: { flexDirection: "row", gap: 8, marginTop: 4 },
  tile: { flex: 1, borderRadius: radius.md, padding: 10 },
  can: { backgroundColor: color.successSoft },
  cannot: { backgroundColor: color.attentionSoft },
  tileTitle: { fontSize: 12, fontWeight: "700", lineHeight: 20 },
  tileText: { fontSize: 12, lineHeight: 20 },
  canText: { color: color.success },
  cannotText: { color: color.attentionInk },
  note: { marginTop: 8, fontSize: 12, lineHeight: 19, color: color.inkMid },
  agree: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.ground,
    borderRadius: 14,
    padding: 12,
  },
  agreeOn: { backgroundColor: color.accentWash, borderColor: dark.link },
  tick: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  tickOn: { backgroundColor: color.accent, borderColor: color.accent },
  agreeText: { fontSize: 13, lineHeight: 21, color: color.ink },
  footer: {
    paddingTop: 12,
    paddingHorizontal: 22,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
  },
  open: {
    height: 50,
    borderRadius: radius.lg,
    backgroundColor: color.line,
    alignItems: "center",
    justifyContent: "center",
  },
  openOn: { backgroundColor: color.ink },
  openText: { fontSize: 15, fontWeight: "500", color: color.muted },
  openTextOn: { color: color.surface },
  later: { fontSize: 12, color: color.inkMid },
  openHint: { fontSize: 12, lineHeight: 18, color: color.muted, textAlign: "center" },
});
