import { MAIL_SECRET, mailProvider } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useEffect } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useHubContext, useHubStore } from "../src/hub/HubProvider.tsx";
import { useAgo } from "../src/life/Noticed.tsx";
import { MailScreen, mailStyles } from "../src/mail/MailScreen.tsx";
import { Icon } from "../src/ui/Icon.tsx";

function Envelope() {
  return (
    <View style={styles.mark}>
      <Svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color.accentStrong}
        strokeWidth={1.8}
        strokeLinejoin="round"
      >
        <Rect x={3} y={5} width={18} height={14} rx={2} />
        <Path d="M3.5 6.5l8.5 6 8.5-6" />
      </Svg>
    </View>
  );
}

export default function ServicesScreen() {
  const { t } = useI18n();
  const store = useHubStore();
  const { namedSaved } = useHubContext();
  const { mailStatus, status } = useHubState(store);
  const ago = useAgo();

  useEffect(() => {
    if (status === "open") void store.loadMailStatus().catch(() => undefined);
  }, [store, status]);

  const connected = mailStatus?.connected === true;
  const line = !mailStatus?.connected
    ? t("services-mail-none")
    : mailStatus.syncing
      ? t("mail-status-syncing")
      : mailStatus.failure
        ? t("mail-status-failed")
        : mailStatus.checkedAt
          ? t("mail-status-synced", { count: mailStatus.total, when: ago(mailStatus.checkedAt) })
          : t("mail-status-never");

  const disconnect = () =>
    Alert.alert(t("mail-disconnect-title"), t("mail-disconnect-body"), [
      { text: t("dialog-cancel"), style: "cancel" },
      {
        text: t("mail-disconnect-ok"),
        style: "destructive",
        onPress: () => {
          void store
            .disconnectMail()
            .then(() => namedSaved(MAIL_SECRET, null))
            .catch(() => undefined);
        },
      },
    ]);

  return (
    <MailScreen title={t("services-title")}>
      <View style={[mailStyles.card, styles.card]}>
        <Pressable
          style={styles.row}
          accessibilityRole="button"
          onPress={() => router.push(connected ? "/mail" : "/mail-add")}
        >
          <Envelope />
          <View style={styles.flex}>
            <Text style={styles.name}>
              {connected
                ? `${t(mailProvider(mailStatus?.provider).name)} · ${mailStatus?.address ?? ""}`
                : t("services-mail")}
            </Text>
            <Text style={[styles.sub, mailStatus?.failure ? styles.warn : null]}>{line}</Text>
          </View>
          {connected ? (
            <Icon name="chevronRight" color={color.faded} size={16} />
          ) : (
            <Text style={styles.add}>{t("services-add")}</Text>
          )}
        </Pressable>
        {connected && (
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={() => router.push("/mail")}>
              <Text style={styles.link}>{t("mail-open-all")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={disconnect}>
              <Text style={styles.danger}>{t("mail-disconnect")}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </MailScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  card: { borderWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  mark: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: color.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 14, fontWeight: "600", color: color.ink },
  sub: { fontSize: 12, color: color.faded, marginTop: 2 },
  warn: { color: color.attentionInk },
  add: { fontSize: 13, color: color.accent },
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
    paddingTop: 10,
  },
  link: { fontSize: 13, color: color.accent },
  danger: { fontSize: 13, color: color.dangerInk },
});
