import type { PlainMessageKey, Translator } from "@xiaoban/i18n";
import type { CostCategory, Price, PriceSource, Saving, TripCosts } from "@xiaoban/protocol";

type T = Translator["t"];

export type Money = (cents: number) => string;
export type SourceKind = PriceSource["kind"];

export const COST_CATEGORIES: readonly CostCategory[] = [
  "transport",
  "stay",
  "tickets",
  "food",
  "other",
];

export const COST_TONES = {
  transport: "accent",
  stay: "tripGreen",
  tickets: "tripRust",
  food: "memoryLikes",
  other: "memoryOther",
} as const satisfies Record<CostCategory, string>;

export const SOURCE_TONES = {
  web: { ink: "success", soft: "successSoft" },
  app: { ink: "accent", soft: "accentSoft" },
  estimate: { ink: "muted", soft: "chipSoft" },
  user: { ink: "ink", soft: "neutralSoft" },
  none: { ink: "attentionInk", soft: "attentionSoft" },
} as const satisfies Record<SourceKind, { ink: string; soft: string }>;

const CATEGORY_KEYS: Record<CostCategory, PlainMessageKey> = {
  transport: "trip-cost-category-transport",
  stay: "trip-cost-category-stay",
  tickets: "trip-cost-category-tickets",
  food: "trip-cost-category-food",
  other: "trip-cost-category-other",
};

const SOURCE_KEYS: Record<SourceKind, PlainMessageKey> = {
  web: "trip-source-web",
  app: "trip-source-app",
  estimate: "trip-source-estimate",
  user: "trip-source-user",
  none: "trip-source-none",
};

export const categoryText = (t: T, category: CostCategory): string => t(CATEGORY_KEYS[category]);
export const sourceText = (t: T, kind: SourceKind): string => t(SOURCE_KEYS[kind]);

export function costMoney(locale: string): Money {
  const format = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return (cents) => format.format(cents / 100);
}

export function costNumber(locale: string): Money {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return (cents) => format.format(Math.round(cents / 100));
}

export const priceKnown = (price: Price): number | null =>
  price.source.kind === "none" ? null : price.cents;

export interface CostEntry {
  price: Price;
  line: number | null;
  stay: number | null;
}

export interface CostGroup {
  category: CostCategory;
  cents: number;
  missing: boolean;
  entries: CostEntry[];
  kinds: SourceKind[];
}

export function costGroups(costs: TripCosts): CostGroup[] {
  const chosen = costs.stays.findIndex((stay) => stay.chosen);
  return COST_CATEGORIES.flatMap((category) => {
    const entries: CostEntry[] =
      category === "stay" && chosen >= 0
        ? [{ price: costs.stays[chosen]?.price as Price, line: null, stay: chosen }]
        : costs.lines.flatMap((line, index) =>
            line.category === category ? [{ price: line.price, line: index, stay: null }] : [],
          );
    if (entries.length === 0) return [];
    const kinds = [...new Set(entries.map((entry) => entry.price.source.kind))];
    return [
      {
        category,
        cents: entries.reduce((sum, entry) => sum + (priceKnown(entry.price) ?? 0), 0),
        missing: entries.some((entry) => priceKnown(entry.price) === null),
        entries,
        kinds,
      },
    ];
  });
}

export interface CostSummary {
  cents: number;
  groups: CostGroup[];
  pending: CostCategory[];
  perPerson: number | null;
  over: number | null;
}

export function costSummary(costs: TripCosts): CostSummary {
  const groups = costGroups(costs);
  const cents = groups.reduce((sum, group) => sum + group.cents, 0);
  const people = costs.people ?? 0;
  return {
    cents,
    groups,
    pending: groups.filter((group) => group.missing).map((group) => group.category),
    perPerson: people > 1 && cents > 0 ? Math.round(cents / people) : null,
    over: costs.budgetCents !== null ? cents - costs.budgetCents : null,
  };
}

export const savedTotal = (costs: TripCosts, savings: readonly Saving[]): number =>
  costSummary(costs).cents - savings.reduce((sum, saving) => sum + (saving.savesCents ?? 0), 0);

function when(locale: string, ms: number, withTime: boolean): string {
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(ms);
}

function site(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function sourceDetail(t: T, locale: string, price: Price): string {
  const source = price.source;
  const at = price.checkedAt;
  switch (source.kind) {
    case "web":
      return t("trip-source-web-detail", {
        site: source.site || site(source.url),
        time: at === null ? "" : when(locale, at, false),
      });
    case "app": {
      const time = at === null ? "" : when(locale, at, true);
      return price.appliesTo
        ? t("trip-source-app-for", { app: source.app, time, for: price.appliesTo })
        : t("trip-source-app-detail", { app: source.app, time });
    }
    case "estimate":
      return t("trip-source-estimate-detail", { basis: source.basis });
    case "user":
      return t("trip-source-user-detail", { time: at === null ? "" : when(locale, at, true) });
    default:
      if (source.voided) return t("trip-source-voided");
      return source.reason ?? t("trip-source-none-empty");
  }
}

export function groupSource(t: T, locale: string, group: CostGroup): string {
  const details = group.entries.map((entry) => ({
    label: entry.price.label,
    detail: sourceDetail(t, locale, entry.price),
  }));
  const unique = [...new Set(details.map((item) => item.detail))];
  if (unique.length === 1) return unique[0] ?? "";
  return details
    .map((item) => t("trip-source-labelled", { label: item.label, detail: item.detail }))
    .join(t("trip-source-joiner"));
}

export function priceAmount(t: T, money: Money, price: Price): string | null {
  const cents = priceKnown(price);
  if (cents === null) return null;
  if (cents === 0) return t("trip-price-free");
  if (price.unitCents !== null && price.quantity !== null && price.quantity > 1) {
    const unit = price.per
      ? t("trip-price-unit", { amount: money(price.unitCents), per: price.per })
      : money(price.unitCents);
    return t("trip-price-times", { unit, count: price.quantity });
  }
  return money(cents);
}

export function priceText(t: T, money: Money, price: Price): string {
  const amount = priceAmount(t, money, price);
  if (amount === null) return price.label;
  return t(price.source.kind === "estimate" ? "trip-price-line-estimate" : "trip-price-line", {
    label: price.label,
    amount,
  });
}

export const groupItems = (t: T, money: Money, group: CostGroup): string =>
  group.entries.map((entry) => priceText(t, money, entry.price)).join(t("daily-dot"));

export function pendingText(t: T, summary: CostSummary): string {
  return summary.pending.length > 0
    ? t("trip-cost-pending", {
        items: summary.pending
          .map((category) => categoryText(t, category))
          .join(t("trip-cost-items-joiner")),
      })
    : "";
}

export function stayKm(meters: number): string {
  return (Math.round(meters / 100) / 10).toFixed(1);
}

export function cardCostParts(t: T, number: Money, costs: TripCosts): string {
  return costGroups(costs)
    .filter((group) => group.cents > 0 && group.category !== "other")
    .map((group) =>
      t("trip-card-cost-part", {
        category: categoryText(t, group.category),
        amount: number(group.cents),
      }),
    )
    .join(t("daily-dot"));
}
