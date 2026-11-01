import words from "../../../../locales/native/plan-dates.json";

export interface PlanDate {
  start: number;
  allDay: boolean;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const any = (items: string[]) => items.map(escape).join("|");
const weekdayChars = Object.keys(words.weekdays).map(escape).join("");
const dateMark = `[-/.${words.dateMarks.map(escape).join("")}]`;
const FULL = new RegExp(`(\\d{4})${dateMark}(\\d{1,2})${dateMark}(\\d{1,2})`);
const SHORT = new RegExp(`(\\d{1,2})[/.${escape(words.dateMarks[1] ?? "")}](\\d{1,2})`);
const WEEK = new RegExp(
  `(${escape(words.afterNext)}|${escape(words.next)})?(?:${any(words.week)})([${weekdayChars}])`,
);
const CLOCK = new RegExp(`(\\d{1,2})[:${escape(words.clockMarks[0] ?? "")}](\\d{2})`);
const HOUR = new RegExp(
  `(\\d{1,2})${escape(words.clockMarks[1] ?? "")}(${escape(words.half)}|(\\d{1,2})${escape(words.minute)}?)?`,
);
const LATE = new RegExp(any(words.afternoon));
const weekdays: Record<string, number> = words.weekdays;
const days: Record<string, number> = words.days;
const periods: Record<string, number> = words.periods;

function dayOf(due: string, base: Date): Date | null {
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = base.getDate();
  const full = FULL.exec(due);
  if (full) return new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3]));
  const short = SHORT.exec(due);
  if (short) {
    const day = new Date(y, Number(short[1]) - 1, Number(short[2]));
    if (day < new Date(y, m, d - 60)) day.setFullYear(y + 1);
    return day;
  }
  const week = WEEK.exec(due);
  if (week) {
    const target = weekdays[week[2] ?? ""] ?? 0;
    if (!week[1]) return new Date(y, m, d + ((target - base.getDay() + 7) % 7));
    const monday = d - ((base.getDay() + 6) % 7);
    return new Date(y, m, monday + (week[1] === words.afterNext ? 14 : 7) + ((target + 6) % 7));
  }
  for (const [word, ahead] of Object.entries(days)) {
    if (due.includes(word)) return new Date(y, m, d + ahead);
  }
  return null;
}

function timeOf(due: string): { hour: number; minute: number } | null {
  const clock = CLOCK.exec(due) ?? HOUR.exec(due);
  if (!clock) {
    for (const [word, hour] of Object.entries(periods)) {
      if (due.includes(word)) return { hour, minute: 0 };
    }
    return null;
  }
  let hour = Number(clock[1]);
  const minute = clock[2] === words.half ? 30 : Number(clock[3] ?? clock[2] ?? 0) || 0;
  if (LATE.test(due) && hour < 12) hour += 12;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function planDate(due: string | null, base: Date): PlanDate | null {
  if (!due) return null;
  const day = dayOf(due, base);
  if (!day) return null;
  const time = timeOf(due);
  if (!time) return { start: day.getTime(), allDay: true };
  day.setHours(time.hour, time.minute, 0, 0);
  return { start: day.getTime(), allDay: false };
}
