import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { router, Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { ChoiceList, deniedAlert, useSourceName } from "../src/calendar/CalendarPicker.tsx";
import {
  allowed,
  askAccess,
  type CalendarChoice,
  choose,
  savedCalendar,
} from "../src/calendar/device.ts";

export default function CalendarSettingsScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [granted, setGranted] = useState(false);
  const [choice, setChoice] = useState<CalendarChoice>("mine");
  const source = useSourceName(granted);

  const refresh = useCallback(() => {
    void allowed().then(setGranted);
    void savedCalendar().then((saved) => {
      if (saved) setChoice(saved.choice);
    });
  }, []);

  useEffect(() => {
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const ask = async () => {
    if (await askAccess()) {
      setGranted(true);
      await choose(choice, t("calendar-xiaoban")).catch(() => null);
    } else {
      deniedAlert(t);
    }
  };

  const pick = async (next: CalendarChoice) => {
    setChoice(next);
    if (granted) await choose(next, t("calendar-xiaoban")).catch(() => null);
  };

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
          {t("calendar-settings-title")}
        </Text>
      </View>
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 24 + insets.bottom }]}>
        <View style={[styles.card, styles.row]}>
          <View style={styles.flex}>
            <Text style={styles.name}>{t("calendar-settings-access")}</Text>
            <Text style={styles.sub}>
              {t(granted ? "calendar-access-on" : "calendar-access-off")}
            </Text>
          </View>
          {granted ? null : (
            <Pressable style={styles.allow} accessibilityRole="button" onPress={() => void ask()}>
              <Text style={styles.allowText}>{t("calendar-access-ask")}</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>{t("calendar-settings-target")}</Text>
          <ChoiceList choice={choice} source={source} onPick={(next) => void pick(next)} />
        </View>
        <Text style={styles.hint}>{t("calendar-settings-note")}</Text>
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
  body: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  card: {
    backgroundColor: color.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { fontSize: 14, fontWeight: "600", color: color.ink },
  sub: { fontSize: 12, color: color.muted, marginTop: 2 },
  allow: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  allowText: { fontSize: 13, fontWeight: "600", color: color.surface },
  label: { fontSize: 13, color: color.muted, marginBottom: 8 },
  hint: { fontSize: 12, lineHeight: 18, color: color.muted, paddingHorizontal: 4 },
});
