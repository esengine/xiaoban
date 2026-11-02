import {
  type HubStore,
  type MailActionKind,
  mailEvent,
  mailSay,
  mailTargetThread,
  mailTodo,
} from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { MailItem } from "@xiaoban/protocol";
import type { ReactNode } from "react";
import { Alert } from "react-native";
import { calendarName, useCalendarTarget } from "../calendar/CalendarPicker.tsx";
import { addEvent } from "../calendar/device.ts";
import { shortToast } from "../hub/shortToast.ts";
import { openThread } from "../screens/ChatsTab.tsx";

const REMIND_MINUTES = 60;

export function useMailAct(store: HubStore): {
  act: (item: MailItem, kind: MailActionKind) => void;
  sheet: ReactNode;
} {
  const { t } = useI18n();
  const { preferences, ledger } = useHubState(store);
  const { ensure, sheet } = useCalendarTarget();
  const primary = preferences?.primaryThreadId ?? null;

  const say = (thread: string | null, text: string) => {
    const target = thread ?? primary;
    if (!target) return;
    void store.send(target, text).catch(() => undefined);
    openThread(target);
  };

  const calendar = async (item: MailItem) => {
    const event = mailEvent(t, item);
    if (!event) return;
    try {
      const target = await ensure();
      if (!target) return;
      await addEvent(target.id, { ...event, reminder: REMIND_MINUTES });
      shortToast(t("mail-calendar-done", { calendar: calendarName(t, target.choice) }));
    } catch {
      Alert.alert(t("mail-calendar-failed"));
    }
  };

  const act = (item: MailItem, kind: MailActionKind) => {
    if (kind === "calendar") {
      void calendar(item);
      return;
    }
    const todo = kind === "remind" ? mailTodo(t, item) : null;
    if (todo) {
      void store
        .addTodo(todo)
        .then(() => shortToast(t("mail-todo-done")))
        .catch(() => Alert.alert(t("mail-todo-failed")));
      return;
    }
    const thread = kind === "ledger" ? (ledger?.threadId ?? null) : mailTargetThread(item, kind);
    say(thread, mailSay(t, item, kind));
  };

  return { act, sheet };
}
