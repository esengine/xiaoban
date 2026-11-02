import {
  dayKey,
  mailActions,
  mailMeta,
  mailMoney,
  mailSender,
  mailtoUrl,
  monthDay,
} from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { MailDraft, MailItem } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import * as Clipboard from "expo-clipboard";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";
import { shortToast } from "../hub/shortToast.ts";
import { mailStyles } from "./MailScreen.tsx";
import { openOriginal } from "./MailToday.tsx";
import { useMailAct } from "./useMailAct.tsx";

function Buttons({
  items,
}: {
  items: { key: string; label: string; onPress: () => void }[];
}) {
  return (
    <View style={mailStyles.buttons}>
      {items.map((item, index) => (
        <Pressable
          key={item.key}
          style={({ pressed }) => [
            mailStyles.button,
            index === 0 && mailStyles.primary,
            pressed && mailStyles.pressed,
          ]}
          accessibilityRole="button"
          onPress={item.onPress}
        >
          <Text style={index === 0 ? mailStyles.primaryText : mailStyles.buttonText}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function MailCard({ mail }: { mail: MailItem }) {
  const { t } = useI18n();
  const store = useHubStore();
  const { act, sheet } = useMailAct(store);
  const bill = mail.category === "bill" ? mail.bill : null;
  const detail = bill
    ? [
        mail.title,
        bill.due ? t("mail-due", { date: monthDay(t, bill.due) }) : null,
        bill.minimumCents ? t("mail-minimum", { amount: mailMoney(t, bill.minimumCents) }) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : mailMeta(t, mail);
  const actions = mailActions(t, mail, true).slice(0, 2);
  return (
    <View style={styles.wrap}>
      <View style={[mailStyles.card, styles.card]}>
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={2}>
            {bill ? mailSender(mail) : mail.title || mail.subject}
          </Text>
          {bill?.cents ? <Text style={styles.amount}>{mailMoney(t, bill.cents)}</Text> : null}
        </View>
        <Text style={styles.detail}>{detail}</Text>
        <Pressable accessibilityRole="link" onPress={() => openOriginal(mail.id)}>
          <Text style={styles.source}>
            {t("mail-source", {
              from: mailSender(mail),
              date: monthDay(t, dayKey(mail.at)),
            })}
          </Text>
        </Pressable>
        {actions.length > 0 && (
          <Buttons
            items={actions.map((action) => ({
              key: action.kind,
              label: action.label,
              onPress: () => act(mail, action.kind),
            }))}
          />
        )}
      </View>
      {sheet}
    </View>
  );
}

export function DraftCard({ draft }: { draft: MailDraft }) {
  const { t } = useI18n();
  const subject = draft.subject.replace(/^re\s*[:：]\s*/i, "");
  return (
    <View style={styles.wrap}>
      <View style={[mailStyles.card, styles.card]}>
        <Text style={mailStyles.label}>
          {t("mail-draft-head", { to: draft.toName || draft.to, subject })}
        </Text>
        <Text selectable style={styles.draft}>
          {draft.text}
        </Text>
        <Buttons
          items={[
            {
              key: "copy",
              label: t("mail-draft-copy"),
              onPress: () =>
                void Clipboard.setStringAsync(draft.text).then(() =>
                  shortToast(t("mail-draft-copied")),
                ),
            },
            {
              key: "open",
              label: t("mail-draft-open"),
              onPress: () => void Linking.openURL(mailtoUrl(draft)).catch(() => undefined),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "flex-start", width: 300, maxWidth: "100%" },
  card: { padding: 12 },
  head: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: "700", color: color.ink },
  amount: { fontSize: 15, fontWeight: "700", color: color.ink },
  detail: { fontSize: 13, color: color.muted },
  source: { fontSize: 11, color: color.faded },
  draft: { fontSize: 13, lineHeight: 21, color: color.ink },
});
