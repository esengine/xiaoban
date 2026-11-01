const WEEKDAYS: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };
const DAY = 24 * 60 * 60 * 1000;

export interface PlanDate {
  start: number;
  allDay: boolean;
}

function dayOf(due: string, base: Date): Date | null {
  const full = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(due);
  if (full) return new Date(Number(full[1]), Number(full[2]) - 1, Number(full[3]));
  const short = /(\d{1,2})[/.月](\d{1,2})/.exec(due);
  if (short) {
    const day = new Date(base.getFullYear(), Number(short[1]) - 1, Number(short[2]));
    if (day.getTime() < base.getTime() - 60 * DAY) day.setFullYear(day.getFullYear() + 1);
    return day;
  }
  const week = /(下下|下)?(?:周|星期|礼拜)([一二三四五六日天])/.exec(due);
  if (week) {
    const target = WEEKDAYS[week[2] ?? ""] ?? 0;
    const y = base.getFullYear();
    const m = base.getMonth();
    const d = base.getDate();
    if (!week[1]) return new Date(y, m, d + ((target - base.getDay() + 7) % 7));
    const monday = d - ((base.getDay() + 6) % 7);
    return new Date(y, m, monday + (week[1] === "下下" ? 14 : 7) + ((target + 6) % 7));
  }
  if (/今天/.test(due)) return new Date(base.getFullYear(), base.getMonth(), base.getDate());
  if (/明天/.test(due)) return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
  if (/后天/.test(due)) return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 2);
  return null;
}

function timeOf(due: string): { hour: number; minute: number } | null {
  const clock = /(\d{1,2})[:：](\d{2})/.exec(due) ?? /(\d{1,2})点(半|(\d{1,2})分?)?/.exec(due);
  if (!clock) {
    if (/上午/.test(due)) return { hour: 9, minute: 0 };
    if (/中午/.test(due)) return { hour: 12, minute: 0 };
    if (/下午/.test(due)) return { hour: 14, minute: 0 };
    if (/晚上/.test(due)) return { hour: 19, minute: 0 };
    return null;
  }
  let hour = Number(clock[1]);
  const minute = clock[2] === "半" ? 30 : Number(clock[3] ?? clock[2] ?? 0) || 0;
  if (/下午|晚上|傍晚/.test(due) && hour < 12) hour += 12;
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
