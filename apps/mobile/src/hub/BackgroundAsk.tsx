import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Sheet } from "../life/LifeUI.tsx";
import { markAsked, openBackgroundSetting, shouldAskBeforeBackground } from "./background.ts";

export function useBackgroundAsk(run: (turnId: string) => void) {
  const { t } = useI18n();
  const [pending, setPending] = useState<string | null>(null);

  const request = useCallback(
    (turnId: string) => {
      void shouldAskBeforeBackground().then((ask) => {
        if (ask) setPending(turnId);
        else run(turnId);
      });
    },
    [run],
  );

  const finish = (fix: boolean) => {
    const turnId = pending;
    setPending(null);
    void markAsked();
    if (fix) openBackgroundSetting("battery");
    if (turnId) run(turnId);
  };

  const sheet = (
    <Sheet open={pending !== null} onClose={() => finish(false)}>
      <Text style={styles.title}>{t("background-ask-title")}</Text>
      <Text style={styles.body}>{t("background-ask-body")}</Text>
      <View style={styles.buttons}>
        <Pressable style={styles.button} accessibilityRole="button" onPress={() => finish(false)}>
          <Text style={styles.buttonText}>{t("background-ask-later")}</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.primary]}
          accessibilityRole="button"
          onPress={() => finish(true)}
        >
          <Text style={styles.primaryText}>{t("background-ask-fix")}</Text>
        </Pressable>
      </View>
      <Text style={styles.foot}>{t("background-ask-foot")}</Text>
    </Sheet>
  );

  return { request, sheet };
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "700", color: color.ink },
  body: { fontSize: 13, lineHeight: 21, color: color.inkMid, marginTop: 10 },
  buttons: { flexDirection: "row", gap: 8, marginTop: 16 },
  button: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 14, color: color.ink },
  primary: { backgroundColor: color.ink, borderColor: color.ink },
  primaryText: { fontSize: 14, fontWeight: "600", color: color.surface },
  foot: { fontSize: 11, color: color.muted, textAlign: "center", marginTop: 10 },
});
