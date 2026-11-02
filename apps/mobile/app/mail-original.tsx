import { dayKey, mailSender, monthDay } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { MailOriginal } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useHubStore } from "../src/hub/HubProvider.tsx";
import { MailScreen, mailStyles } from "../src/mail/MailScreen.tsx";

export default function MailOriginalScreen() {
  const { t } = useI18n();
  const store = useHubStore();
  const { status } = useHubState(store);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [original, setOriginal] = useState<MailOriginal | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (status !== "open" || !id) return;
    let live = true;
    setFailed(false);
    void store
      .mailOriginal(id)
      .then((found) => {
        if (live) setOriginal(found);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [store, status, id]);

  const item = original?.item;
  return (
    <MailScreen title={item?.subject || t("mail-original-title")}>
      {original && item ? (
        <View style={mailStyles.card}>
          <Text style={mailStyles.label}>
            {t("mail-original-from", {
              from: `${mailSender(item)} <${item.fromAddress}>`,
              date: monthDay(t, dayKey(item.at)),
            })}
          </Text>
          <Text selectable style={styles.text}>
            {original.text}
          </Text>
          {original.truncated && <Text style={mailStyles.label}>{t("mail-original-truncated")}</Text>}
        </View>
      ) : failed ? (
        <Text style={styles.hint}>{t("mail-original-failed")}</Text>
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={color.muted} />
          <Text style={styles.hint}>{t("mail-original-loading")}</Text>
        </View>
      )}
    </MailScreen>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 14, lineHeight: 22, color: color.ink },
  hint: { fontSize: 13, color: color.muted, textAlign: "center" },
  loading: { alignItems: "center", gap: 10, paddingTop: 40 },
});
