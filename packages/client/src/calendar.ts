import type { Translator } from "@xiaoban/i18n";
import { monthDay, weekday } from "./trip.ts";

type T = Translator["t"];

const pad = (value: number) => value.toString().padStart(2, "0");

export function dayKey(ms: number): string {
  const at = new Date(ms);
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function clockOf(ms: number): string {
  const at = new Date(ms);
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function reminderText(t: T, minutes: number | null): string {
  if (minutes === null) return t("event-remind-none");
  if (minutes > 0 && minutes % 1440 === 0) return t("event-remind-days", { n: minutes / 1440 });
  if (minutes > 0 && minutes % 60 === 0) return t("event-remind-hours", { n: minutes / 60 });
  return t("event-remind-minutes", { n: minutes });
}

export function whenText(t: T, start: number, end: number): string {
  const first = dayKey(start);
  const last = dayKey(end);
  const parts = {
    date: monthDay(t, first),
    weekday: weekday(t, first),
    start: clockOf(start),
    end: clockOf(end),
  };
  return first === last || end < start
    ? t("event-card-when", parts)
    : t("event-card-when-days", { ...parts, endDate: monthDay(t, last) });
}
