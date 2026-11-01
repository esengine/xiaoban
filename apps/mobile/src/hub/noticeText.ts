import type { PlainMessageKey } from "@xiaoban/i18n";
import type { useI18n } from "@xiaoban/i18n/react";
import type { NotifyCategory } from "@xiaoban/protocol";

type Translate = ReturnType<typeof useI18n>["t"];

export const CATEGORY_KEY: Record<NotifyCategory, PlainMessageKey> = {
  confirm: "notify-cat-confirm",
  remind: "notify-cat-remind",
  error: "notify-cat-error",
  morning: "notify-cat-morning",
  done: "notify-cat-done",
  idea: "notify-cat-idea",
  report: "notify-cat-report",
  family: "notify-cat-family",
};

export function noticeTexts(t: Translate, category: NotifyCategory) {
  return {
    category: t(CATEGORY_KEY[category]),
    reply: t("notify-reply"),
    replyHint: t("notify-reply-hint"),
    replied: t("notify-replied"),
    answeredYes: t("notify-answered-yes"),
    answeredEdit: t("notify-answered-edit"),
    answeredNo: t("notify-answered-no"),
    failed: t("notify-send-failed"),
    channelUrgent: t("notify-channel-urgent"),
    channelQuiet: t("notify-channel-quiet"),
  };
}
