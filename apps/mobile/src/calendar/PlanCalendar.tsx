import { useI18n } from "@xiaoban/i18n/react";
import type { Plan } from "@xiaoban/protocol";
import { useState } from "react";
import { Alert } from "react-native";
import { PlanButton } from "../chat/PlanPin.tsx";
import { shortToast } from "../hub/shortToast.ts";
import { calendarName, useCalendarTarget } from "./CalendarPicker.tsx";
import { addEvent, removeEvent, updateEvent } from "./device.ts";
import { planDate } from "./planDates.ts";
import { planRecord, setPlanRecord } from "./records.ts";

const HOUR = 60 * 60 * 1000;

function nextDay(start: number): number {
  const day = new Date(start);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
}

export function PlanCalendarButton({ plan }: { plan: Plan }) {
  const { t } = useI18n();
  const { ensure, sheet } = useCalendarTarget();
  const [busy, setBusy] = useState(false);

  const sync = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const target = await ensure();
      if (!target) return;
      const base = new Date(plan.updatedAt);
      const before = planRecord(plan.threadId);
      const after: Record<string, string> = {};
      let added = 0;
      let skipped = 0;
      for (const [index, step] of plan.steps.entries()) {
        if (step.status === "done" || step.status === "skipped") continue;
        const date = planDate(step.due, base);
        if (!date) {
          skipped += 1;
          continue;
        }
        const key = `${index}:${step.title}`;
        const fields = {
          title: t("plan-calendar-event", { plan: plan.title, step: step.title }),
          start: date.start,
          end: date.allDay ? nextDay(date.start) : date.start + HOUR,
          location: "",
          notes: step.detail ?? "",
          reminder: date.allDay ? null : 30,
          allDay: date.allDay,
        };
        const existing = before[key];
        if (existing && (await updateEvent(existing, fields))) {
          after[key] = existing;
        } else {
          after[key] = await addEvent(target.id, fields);
        }
        added += 1;
      }
      for (const [key, eventId] of Object.entries(before)) {
        if (!after[key]) await removeEvent(eventId);
      }
      setPlanRecord(plan.threadId, after);
      shortToast(
        skipped > 0
          ? t("plan-calendar-done-some", {
              count: added,
              skipped,
              calendar: calendarName(t, target.choice),
            })
          : t("plan-calendar-done", { count: added, calendar: calendarName(t, target.choice) }),
      );
    } catch {
      Alert.alert(t("event-add-failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PlanButton
        label={t(busy ? "plan-calendar-busy" : "plan-calendar-sync")}
        disabled={busy}
        onPress={() => void sync()}
      />
      {sheet}
    </>
  );
}
