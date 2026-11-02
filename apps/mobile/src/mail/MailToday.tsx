import {
  type HubStore,
  MAIL_CATEGORY_KEYS,
  type MailActionKind,
  mailActions,
  mailLine,
  mailMeta,
} from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { MailItem, MailToday } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { mailStyles, TAGS } from "./MailScreen.tsx";
import { useMailAct } from "./useMailAct.tsx";

export function openOriginal(id: string) {
  router.push({ pathname: "/mail-original", params: { id } });
}

export function MailRow({
  item,
  onAct,
  first = false,
}: {
  item: MailItem;
  onAct?: ((item: MailItem, kind: MailActionKind) => void) | undefined;
  first?: boolean;
}) {
  const { t } = useI18n();
  const tag = TAGS[item.category];
  const actions = onAct ? mailActions(t, item) : [];
  return (
    <View style={[styles.row, first && styles.rowFirst]}>
      <Pressable
        style={({ pressed }) => [styles.rowText, pressed && mailStyles.pressed]}
        accessibilityRole="button"
        onPress={() => openOriginal(item.id)}
      >
        <View style={styles.tagLine}>
          <Text style={[mailStyles.tag, { backgroundColor: tag.bg, color: tag.fg }]}>
            {t(MAIL_CATEGORY_KEYS[item.category])}
          </Text>
          <Text style={mailStyles.meta} numberOfLines={1}>
            {mailMeta(t, item)}
          </Text>
        </View>
        <Text style={mailStyles.line} numberOfLines={2}>
          {mailLine(t, item)}
        </Text>
      </Pressable>
      {actions.length > 0 && (
        <View style={mailStyles.chips}>
          {actions.map((action) => (
            <Pressable
              key={action.kind}
              style={({ pressed }) => [mailStyles.chip, pressed && mailStyles.pressed]}
              accessibilityRole="button"
              onPress={() => onAct?.(item, action.kind)}
            >
              <Text style={mailStyles.chipText}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function MailTodayCard({ store, today }: { store: HubStore; today: MailToday }) {
  const { t } = useI18n();
  const { act, sheet } = useMailAct(store);
  return (
    <View style={mailStyles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t("mail-today")}</Text>
        <Text style={styles.count}>
          {t("mail-today-count", { total: today.total, worth: today.items.length })}
        </Text>
        <View style={styles.flex} />
        <Pressable accessibilityRole="button" onPress={() => router.push("/mail")}>
          <Text style={styles.all}>{t("mail-today-all")}</Text>
        </Pressable>
      </View>
      {today.items.length === 0 ? (
        <Text style={styles.empty}>{t("mail-today-empty")}</Text>
      ) : (
        today.items.map((item) => <MailRow key={item.id} item={item} onAct={act} />)
      )}
      {today.folded > 0 && (
        <Text style={styles.folded}>{t("mail-today-folded", { count: today.folded })}</Text>
      )}
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  title: { fontSize: 16, fontWeight: "700", color: color.ink },
  count: { fontSize: 12, color: color.muted },
  all: { fontSize: 12, color: color.accent },
  row: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
    gap: 6,
  },
  rowFirst: { borderTopWidth: 0, paddingTop: 0 },
  rowText: { gap: 6 },
  tagLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  empty: { fontSize: 12.5, color: color.muted },
  folded: { fontSize: 12, color: color.faded },
});
