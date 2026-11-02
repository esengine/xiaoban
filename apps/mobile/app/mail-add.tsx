import { MAIL_PROVIDERS } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MailScreen, mailStyles } from "../src/mail/MailScreen.tsx";
import { Icon } from "../src/ui/Icon.tsx";

export default function MailAddScreen() {
  const { t } = useI18n();
  return (
    <MailScreen title={t("mail-add-title")}>
      <View style={mailStyles.card}>
        <Text style={mailStyles.cardTitle}>{t("mail-intro-title")}</Text>
        <Text style={mailStyles.body}>{t("mail-intro-body")}</Text>
      </View>
      <View style={styles.list}>
        {MAIL_PROVIDERS.map((provider) => (
          <Pressable
            key={provider.id}
            style={({ pressed }) => [styles.row, pressed && mailStyles.pressed]}
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: "/mail-connect", params: { provider: provider.id } })
            }
          >
            <View style={styles.mark} />
            <View style={styles.flex}>
              <Text style={styles.name}>{t(provider.name)}</Text>
              <Text style={styles.sub}>{t(provider.sub)}</Text>
            </View>
            <Icon name="chevronRight" color={color.faded} size={16} />
          </Pressable>
        ))}
      </View>
    </MailScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { backgroundColor: color.surface, borderRadius: 16, paddingHorizontal: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
  },
  mark: { width: 32, height: 32, borderRadius: 8, backgroundColor: color.neutralSoft },
  name: { fontSize: 14, fontWeight: "600", color: color.ink },
  sub: { fontSize: 12, color: color.faded, marginTop: 2 },
});
