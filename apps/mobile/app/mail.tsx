import { MAIL_CATEGORIES, MAIL_CATEGORY_KEYS } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { MailCategory, MailItem } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useHubStore } from "../src/hub/HubProvider.tsx";
import { MailScreen, mailStyles } from "../src/mail/MailScreen.tsx";
import { MailRow } from "../src/mail/MailToday.tsx";
import { useMailAct } from "../src/mail/useMailAct.tsx";

export default function MailListScreen() {
  const { t } = useI18n();
  const store = useHubStore();
  const { status, mailStatus } = useHubState(store);
  const { act, sheet } = useMailAct(store);
  const [category, setCategory] = useState<MailCategory | null>(null);
  const [items, setItems] = useState<MailItem[] | null>(null);
  const checkedAt = mailStatus?.checkedAt ?? null;

  useEffect(() => {
    if (status !== "open") return;
    let live = true;
    void store
      .mailList(category)
      .then((list) => {
        if (live) setItems(list);
      })
      .catch(() => {
        if (live) setItems([]);
      });
    return () => {
      live = false;
    };
  }, [store, status, category, checkedAt]);

  const chips: (MailCategory | null)[] = [null, ...MAIL_CATEGORIES];

  return (
    <MailScreen title={t("mail-list-title")}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {chips.map((chip) => {
          const active = chip === category;
          return (
            <Pressable
              key={chip ?? "all"}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setCategory(chip)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t(chip ? MAIL_CATEGORY_KEYS[chip] : "mail-category-all")}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={mailStyles.card}>
        {items !== null && items.length === 0 ? (
          <Text style={styles.empty}>{t("mail-list-empty")}</Text>
        ) : (
          (items ?? []).map((item, index) => (
            <MailRow key={item.id} item={item} onAct={act} first={index === 0} />
          ))
        )}
      </View>
      {sheet}
    </MailScreen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 6 },
  chip: {
    height: 30,
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: color.ink, borderColor: color.ink },
  chipText: { fontSize: 12, color: color.ink },
  chipTextActive: { color: color.surface, fontWeight: "500" },
  empty: { fontSize: 12.5, color: color.muted },
});
