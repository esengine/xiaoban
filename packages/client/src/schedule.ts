import type { PlainMessageKey, Translator } from "@xiaoban/i18n";
import type {
  Message,
  RunMark,
  Schedule,
  ScheduleNotify,
  ScheduleResult,
  ScheduleRule,
  ScheduleStop,
} from "@xiaoban/protocol";
import { dayKey } from "./calendar.ts";
import { monthDay, weekday } from "./trip.ts";

type T = Translator["t"];

const DAY = 86_400_000;

export const MIN_EVERY = 30;

export const SCHEDULE_WEEKDAYS: readonly PlainMessageKey[] = [
  "schedule-weekday-1",
  "schedule-weekday-2",
  "schedule-weekday-3",
  "schedule-weekday-4",
  "schedule-weekday-5",
  "schedule-weekday-6",
  "schedule-weekday-7",
];

const NOTIFY_KEYS = {
  done: "schedule-notify-done",
  changed: "schedule-notify-changed",
  off: "schedule-notify-off",
} as const satisfies Record<ScheduleNotify, PlainMessageKey>;

export const NOTIFY_OPTIONS: readonly ScheduleNotify[] = ["done", "changed", "off"];

export function minuteText(minute: number): string {
  return `${Math.floor(minute / 60)}:${(minute % 60).toString().padStart(2, "0")}`;
}

export function parseMinute(text: string): number | null {
  const match = /^(\d{1,2})[:\uFF1A](\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function clock(ms: number): string {
  const at = new Date(ms);
  return minuteText(at.getHours() * 60 + at.getMinutes());
}

function midnight(ms: number): number {
  const at = new Date(ms);
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

export function intervalText(t: T, minutes: number): string {
  return minutes % 60 === 0
    ? t("schedule-rule-every-hours", { n: minutes / 60 })
    : t("schedule-rule-every-minutes", { n: minutes });
}

export function windowText(t: T, rule: ScheduleRule): string | null {
  if (rule.kind !== "every" || rule.from === null || rule.to === null) return null;
  return t("schedule-rule-window", { from: minuteText(rule.from), to: minuteText(rule.to) });
}

export function ruleText(t: T, rule: ScheduleRule): string {
  const sep = t("schedule-list-sep");
  switch (rule.kind) {
    case "once": {
      const key = dayKey(rule.at);
      return t("schedule-rule-once", {
        date: monthDay(t, key),
        weekday: weekday(t, key),
        time: clock(rule.at),
      });
    }
    case "daily":
      return t("schedule-rule-daily", { time: minuteText(rule.minute) });
    case "weekly":
      return t("schedule-rule-weekly", {
        days: rule.weekdays
          .map((day) => {
            const key = SCHEDULE_WEEKDAYS[day - 1];
            return key ? t(key) : "";
          })
          .join(sep),
        time: minuteText(rule.minute),
      });
    case "monthly":
      return t("schedule-rule-monthly", {
        days: rule.days.join(sep),
        time: minuteText(rule.minute),
      });
    case "every": {
      const window = windowText(t, rule);
      const every = intervalText(t, rule.minutes);
      return window ? `${every}${t("schedule-dot")}${window}` : every;
    }
  }
}

export function whenText(t: T, ms: number, now = Date.now()): string {
  const days = Math.round((midnight(ms) - midnight(now)) / DAY);
  const time = clock(ms);
  if (days === 0) return t("schedule-when-today", { time });
  if (days === 1) return t("schedule-when-tomorrow", { time });
  const key = dayKey(ms);
  if (days > 1 && days < 7) return t("schedule-when-week", { weekday: weekday(t, key), time });
  return t("schedule-when-date", { date: monthDay(t, key), time });
}

export function stateText(t: T, schedule: Schedule, now = Date.now()): string {
  switch (schedule.state) {
    case "paused":
      return t("schedule-state-paused");
    case "finished":
      return t("schedule-state-finished");
    case "applied":
      return t("schedule-state-applied");
    default:
      return schedule.nextAt === null
        ? t("schedule-state-finished")
        : t("schedule-next", { when: whenText(t, schedule.nextAt, now) });
  }
}

export function stopText(t: T, stop: ScheduleStop): string {
  switch (stop.kind) {
    case "never":
      return t("schedule-stop-never");
    case "until":
      return t("schedule-stop-until", { date: monthDay(t, stop.date) });
    case "count":
      return t("schedule-stop-count", { n: stop.runs });
    case "condition":
      return t("schedule-stop-condition", { condition: stop.text });
  }
}

export function notifyText(t: T, notify: ScheduleNotify): string {
  return t(NOTIFY_KEYS[notify]);
}

export function outputText(t: T, schedule: Schedule): string {
  return schedule.output === "new_thread"
    ? t("schedule-output-new", { title: schedule.title })
    : t("schedule-output-same");
}

export function scheduleLine(t: T, schedule: Schedule, now = Date.now()): string {
  const dot = t("schedule-dot");
  const parts = [ruleText(t, schedule.rule), stateText(t, schedule, now)];
  if (schedule.stop.kind !== "never") parts.push(stopText(t, schedule.stop));
  return parts.join(dot);
}

export function lastText(t: T, last: ScheduleResult): string {
  if (!last.ok) return t("schedule-last", { status: t("schedule-last-failed") });
  return t("schedule-last", { status: last.status || t("schedule-last-done") });
}

export function runsText(t: T, schedule: Schedule): string {
  const last = schedule.last;
  if (!last || schedule.runs === 0) return t("schedule-bar-never");
  const runs = t("schedule-bar-runs", { n: schedule.runs });
  const minutes = Math.round(last.durationMs / 60_000);
  const took = !last.ok
    ? t("schedule-bar-failed")
    : minutes < 1
      ? t("schedule-bar-took-quick")
      : t("schedule-bar-took", { n: minutes });
  return `${runs}${t("schedule-dot")}${took}`;
}

export function markText(t: T, mark: RunMark, dueAt: number, failed: boolean): string {
  const key = dayKey(dueAt);
  const day = `${monthDay(t, key)} ${weekday(t, key)}`;
  const when = mark === "catchup" ? day : `${day} ${clock(dueAt)}`;
  if (failed) return t("schedule-mark-failed", { when });
  if (mark === "catchup") return t("schedule-mark-catchup", { when });
  if (mark === "manual") return t("schedule-mark-manual", { when });
  return t("schedule-mark-scheduled", { when });
}

export function runFailed(messages: readonly Message[], index: number): boolean {
  for (const message of messages.slice(index + 1)) {
    if (message.role === "user") return false;
    if (message.attachment?.kind === "schedule_failed") return true;
  }
  return false;
}

export function failedText(t: T, reason: string, schedule: Schedule | undefined): string {
  const plain = (reason || t("schedule-failed-reason")).replace(/[\u3002.!\uFF01\s]+$/u, "");
  const next = schedule?.state === "active" ? schedule.nextAt : null;
  return next === null || next === undefined
    ? t("schedule-failed-now", { reason: plain })
    : t("schedule-failed-next", { reason: plain, next: whenText(t, next) });
}

export function scheduleOfThread(
  schedules: Readonly<Record<string, Schedule>>,
  threadId: string,
): Schedule | undefined {
  return Object.values(schedules).find(
    (schedule) =>
      schedule.threadId === threadId &&
      schedule.output === "new_thread" &&
      schedule.state !== "draft" &&
      schedule.state !== "applied",
  );
}

export function sortedSchedules(schedules: Readonly<Record<string, Schedule>>): Schedule[] {
  return Object.values(schedules)
    .filter((schedule) => schedule.state !== "draft" && schedule.state !== "applied")
    .sort((a, b) => b.createdAt - a.createdAt);
}
