const MINUTE = 60_000;
const DAY = 86_400_000;

const startOfDay = (time: number) => {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export type Recency =
  | { kind: "now" }
  | { kind: "today"; text: string }
  | { kind: "yesterday" }
  | { kind: "week"; text: string }
  | { kind: "date"; text: string };

export function recency(time: number, now: number, locale: string): Recency {
  if (now - time < MINUTE) return { kind: "now" };
  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY);
  if (days <= 0) {
    return {
      kind: "today",
      text: new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(time),
    };
  }
  if (days === 1) return { kind: "yesterday" };
  if (days < 7) {
    return {
      kind: "week",
      text: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(time),
    };
  }
  return {
    kind: "date",
    text: new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(time),
  };
}

export function moneyFormat(locale: string) {
  const format = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return (cents: number) => format.format(cents / 100);
}

export function firstChar(text: string): string {
  return Array.from(text.trim())[0] ?? "";
}

export function toneOf(id: string, count: number): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % count;
}
