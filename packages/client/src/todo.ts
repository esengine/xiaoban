import type { PlainMessageKey, Translator } from "@xiaoban/i18n";
import type { Todo, TodoRepeat, TodoSourceKind } from "@xiaoban/protocol";
import { dayKey } from "./calendar.ts";
import { minuteText, SCHEDULE_WEEKDAYS } from "./schedule.ts";
import { monthDay } from "./trip.ts";

type T = Translator["t"];

const DAY = 86_400_000;

export type TodoBucket = "overdue" | "today" | "later" | "undated" | "done" | "hidden";

export interface TodoGroups {
  overdue: Todo[];
  today: Todo[];
  later: Todo[];
  undated: Todo[];
  done: Todo[];
}

export const TODO_GROUP_ORDER = ["overdue", "today", "later", "undated", "done"] as const;

export const TODO_GROUP_KEYS = {
  overdue: "todo-group-overdue",
  today: "todo-group-today",
  later: "todo-group-later",
  undated: "todo-group-undated",
  done: "todo-group-done",
} as const satisfies Record<keyof TodoGroups, PlainMessageKey>;

export const TODO_SOURCE_KEYS = {
  chat: "todo-source-chat",
  daily: "todo-source-daily",
  share: "todo-source-share",
  email: "todo-source-email",
  sms: "todo-source-sms",
  other: "todo-source-other",
} as const satisfies Record<TodoSourceKind, PlainMessageKey>;

const FROM_KEYS: Partial<Record<TodoSourceKind, PlainMessageKey>> = {
  share: "todo-from-share",
  email: "todo-from-email",
  sms: "todo-from-sms",
};

function dayStart(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
}

function dueAt(todo: Todo): number | null {
  if (!todo.date) return null;
  const start = dayStart(todo.date);
  if (start === null) return null;
  return start + (todo.minute ?? 0) * 60_000;
}

function daysFromToday(date: string, now: number): number {
  const start = dayStart(date);
  const today = dayStart(dayKey(now));
  if (start === null || today === null) return 0;
  return Math.round((start - today) / DAY);
}

export function todoBucket(todo: Todo, now = Date.now()): TodoBucket {
  if (todo.state === "done") return "done";
  if (todo.state !== "open") return "hidden";
  if (!todo.date) return "undated";
  const today = dayKey(now);
  if (todo.date < today) return "overdue";
  if (todo.date > today) return "later";
  const due = dueAt(todo);
  return todo.minute !== null && due !== null && due <= now ? "overdue" : "today";
}

function byWhen(left: Todo, right: Todo): number {
  const a = `${left.date ?? ""}${left.minute === null ? "1" : "0"}${String(left.minute ?? 0).padStart(4, "0")}`;
  const b = `${right.date ?? ""}${right.minute === null ? "1" : "0"}${String(right.minute ?? 0).padStart(4, "0")}`;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function todoGroups(todos: readonly Todo[], now = Date.now()): TodoGroups {
  const groups: TodoGroups = { overdue: [], today: [], later: [], undated: [], done: [] };
  for (const todo of todos) {
    const bucket = todoBucket(todo, now);
    if (bucket !== "hidden") groups[bucket].push(todo);
  }
  groups.overdue.sort(byWhen);
  groups.today.sort(byWhen);
  groups.later.sort(byWhen);
  groups.undated.sort((a, b) => a.createdAt - b.createdAt);
  groups.done.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
  return groups;
}

export function todoRepeatText(t: T, repeat: TodoRepeat): string {
  const sep = t("todo-list-sep");
  switch (repeat.kind) {
    case "daily":
      return t("todo-repeat-daily");
    case "weekly":
      return t("todo-repeat-weekly", {
        days: repeat.weekdays
          .map((day) => {
            const key = SCHEDULE_WEEKDAYS[day - 1];
            return key ? t(key) : "";
          })
          .join(sep),
      });
    case "monthly":
      return repeat.days.length === 1 && repeat.days[0] === 31
        ? t("todo-repeat-month-end")
        : t("todo-repeat-monthly", { days: repeat.days.join(sep) });
  }
}

export function todoFrom(t: T, todo: Todo): string | null {
  const key = FROM_KEYS[todo.source.kind];
  return key ? t(key) : null;
}

function dayWord(t: T, date: string, now: number): string {
  const days = daysFromToday(date, now);
  if (days === 0) return t("todo-today");
  if (days === -1) return t("todo-yesterday");
  if (days === 1) return t("todo-tomorrow");
  return monthDay(t, date);
}

function join(t: T, parts: (string | null | undefined)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(t("todo-dot"));
}

function doneText(t: T, todo: Todo, now: number): string {
  if (todo.doneAt === null) return t("todo-done");
  const time = minuteText(
    new Date(todo.doneAt).getHours() * 60 + new Date(todo.doneAt).getMinutes(),
  );
  const day = dayKey(todo.doneAt);
  return day === dayKey(now)
    ? t("todo-done-at", { time })
    : t("todo-done-at", { time: `${monthDay(t, day)} ${time}` });
}

export function todoDailyLine(t: T, todo: Todo, now = Date.now()): string {
  const bucket = todoBucket(todo, now);
  if (bucket === "done") return doneText(t, todo, now);
  if (bucket === "undated") return join(t, [t("todo-no-time"), todoFrom(t, todo)]);
  if (!todo.date) return "";
  const day = dayWord(t, todo.date, now);
  const when = todo.minute === null ? day : `${day} ${minuteText(todo.minute)}`;
  if (bucket === "overdue") return join(t, [when, t("todo-overdue")]);
  return join(t, [when, todoFrom(t, todo)]);
}

export interface TodoPageLine {
  text: string;
  repeat: string | null;
}

export function todoPageLine(t: T, todo: Todo, now = Date.now()): TodoPageLine {
  const bucket = todoBucket(todo, now);
  const repeat = todo.repeat ? todoRepeatText(t, todo.repeat) : null;
  const from = todoFrom(t, todo);
  const time = todo.minute === null ? null : minuteText(todo.minute);
  if (bucket === "done") return { text: doneText(t, todo, now), repeat: null };
  if (bucket === "undated" || !todo.date) return { text: join(t, [from]), repeat: null };
  if (bucket === "overdue") {
    const late = -daysFromToday(todo.date, now);
    const date = late === 0 ? time : monthDay(t, todo.date);
    const overdue = late === 0 ? t("todo-overdue") : t("todo-overdue-days", { n: late });
    return { text: join(t, [date, overdue, from]), repeat };
  }
  if (bucket === "today") return { text: join(t, [time, from]), repeat };
  const date = monthDay(t, todo.date);
  return { text: join(t, [time ? `${date} ${time}` : date, from]), repeat };
}

export function todoProposalLine(t: T, todo: Todo): string {
  const time = minuteText(todo.minute ?? 9 * 60);
  const date = todo.date ? monthDay(t, todo.date) : "";
  if (todo.repeat) {
    return join(t, [
      t("todo-remind-at", { when: `${todoRepeatText(t, todo.repeat)} ${time}` }),
      date ? t("todo-next", { date }) : null,
    ]);
  }
  return t("todo-remind-at", { when: date ? `${date} ${time}` : time });
}

export function todoSummary(t: T, todos: readonly Todo[], now = Date.now()): string {
  const groups = todoGroups(todos, now);
  const today = groups.today.length + groups.undated.length;
  return groups.overdue.length > 0
    ? t("todo-summary", { today, overdue: groups.overdue.length })
    : t("todo-summary-today", { today });
}

export function todoCardIds(todos: Readonly<Record<string, Todo>>, ids: readonly string[]): Todo[] {
  return ids.map((id) => todos[id]).filter((todo): todo is Todo => Boolean(todo));
}
