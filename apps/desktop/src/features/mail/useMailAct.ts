import { type MailActionKind, mailEvent, mailSay, mailTargetThread } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { MailItem } from "@xiaoban/protocol";
import { useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { syncCalendar } from "../trip/calendarSync.ts";

const REMIND_MINUTES = 60;

export function useMailAct(onOpenThread: (threadId: string) => void): {
  act: (item: MailItem, kind: MailActionKind) => void;
  notice: string | null;
} {
  const { t } = useI18n();
  const store = useHub();
  const { preferences, ledger } = useHubState(store);
  const [notice, setNotice] = useState<string | null>(null);
  const primary = preferences?.primaryThreadId ?? null;

  const calendar = async (item: MailItem) => {
    const event = mailEvent(t, item);
    if (!event) return;
    const name = t("trip-calendar-name");
    const outcome = await syncCalendar(
      () => store.eventCalendar({ id: `mail-${item.id}`, ...event, reminder: REMIND_MINUTES }),
      name,
    );
    setNotice(
      typeof outcome === "object" && "added" in outcome
        ? t("mail-calendar-done", { calendar: name })
        : outcome === "denied"
          ? t("trip-toast-calendar-denied")
          : typeof outcome === "object"
            ? t("trip-toast-calendar-handed", { count: outcome.handed })
            : t("mail-calendar-failed"),
    );
  };

  const act = (item: MailItem, kind: MailActionKind) => {
    if (kind === "calendar") {
      void calendar(item);
      return;
    }
    const thread =
      (kind === "ledger" ? (ledger?.threadId ?? null) : mailTargetThread(item, kind)) ?? primary;
    if (!thread) return;
    void store.send(thread, mailSay(t, item, kind)).catch(() => undefined);
    onOpenThread(thread);
  };

  return { act, notice };
}
