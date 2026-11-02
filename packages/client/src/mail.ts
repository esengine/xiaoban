import type { PlainMessageKey, Translator } from "@xiaoban/i18n";
import type {
  MailCategory,
  MailDraft,
  MailFailure,
  MailItem,
  MailProvider,
} from "@xiaoban/protocol";
import { dayKey } from "./calendar.ts";
import { monthDay } from "./trip.ts";

type T = Translator["t"];

export const MAIL_SECRET = "mail:password";

const DAY = 86_400_000;
const TRIP_MINUTES = 120;

export interface MailProviderInfo {
  id: MailProvider;
  name: PlainMessageKey;
  sub: PlainMessageKey;
  password: PlainMessageKey;
  help: PlainMessageKey;
  url: string | null;
}

const QQ: MailProviderInfo = {
  id: "qq",
  name: "mail-provider-qq",
  sub: "mail-provider-qq-sub",
  password: "mail-password-qq",
  help: "mail-help-qq",
  url: "https://mail.qq.com/",
};

export const MAIL_PROVIDERS: readonly MailProviderInfo[] = [
  QQ,
  {
    id: "netease",
    name: "mail-provider-netease",
    sub: "mail-provider-netease-sub",
    password: "mail-password-netease",
    help: "mail-help-netease",
    url: "https://mail.163.com/",
  },
  {
    id: "gmail",
    name: "mail-provider-gmail",
    sub: "mail-provider-gmail-sub",
    password: "mail-password-gmail",
    help: "mail-help-gmail",
    url: "https://myaccount.google.com/apppasswords",
  },
  {
    id: "outlook",
    name: "mail-provider-outlook",
    sub: "mail-provider-outlook-sub",
    password: "mail-password-outlook",
    help: "mail-help-outlook",
    url: "https://account.microsoft.com/security",
  },
  {
    id: "other",
    name: "mail-provider-other",
    sub: "mail-provider-other-sub",
    password: "mail-password-other",
    help: "mail-help-other",
    url: null,
  },
];

export function mailProvider(id: string | null | undefined): MailProviderInfo {
  return MAIL_PROVIDERS.find((provider) => provider.id === id) ?? QQ;
}

export const MAIL_CATEGORIES: readonly MailCategory[] = [
  "bill",
  "trip",
  "parcel",
  "reply",
  "promo",
  "other",
];

export const MAIL_CATEGORY_KEYS: Record<MailCategory, PlainMessageKey> = {
  bill: "mail-category-bill",
  trip: "mail-category-trip",
  parcel: "mail-category-parcel",
  reply: "mail-category-reply",
  promo: "mail-category-promo",
  other: "mail-category-other",
};

export const MAIL_FAILURE_KEYS: Record<MailFailure, PlainMessageKey> = {
  bad_password: "mail-failure-bad-password",
  refused: "mail-failure-refused",
  unreachable: "mail-failure-unreachable",
  bad_address: "mail-failure-bad-address",
};

function grouped(whole: number): string {
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function mailMoney(t: T, cents: number): string {
  const whole = Math.trunc(cents / 100);
  const rest = Math.abs(cents % 100);
  const amount = rest === 0 ? grouped(whole) : `${grouped(whole)}.${String(rest).padStart(2, "0")}`;
  return t("mail-money", { amount });
}

export function mailWhen(t: T, at: number, now = Date.now()): string {
  const day = dayKey(at);
  if (day === dayKey(now)) return t("mail-today-word");
  if (day === dayKey(now - DAY)) return t("mail-yesterday");
  return monthDay(t, day);
}

export function mailSender(item: MailItem): string {
  return item.fromName || item.fromAddress;
}

export function mailTripText(t: T, item: MailItem): string {
  const trip = item.trip;
  if (!trip) return item.title;
  const parts = [
    trip.date ? monthDay(t, trip.date) : null,
    trip.from && trip.to ? t("mail-trip-route", { from: trip.from, to: trip.to }) : null,
    trip.number,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" ") : item.title;
}

export function mailMeta(t: T, item: MailItem): string {
  if (item.category === "bill" && item.bill?.due) {
    return t("mail-due", { date: monthDay(t, item.bill.due) });
  }
  if (item.category === "trip" && item.trip) {
    const head = [item.trip.time, item.trip.station].filter(Boolean).join(" ");
    const tickets = item.trip.tickets ? t("mail-tickets", { count: item.trip.tickets }) : "";
    const meta = [head, tickets].filter(Boolean).join(" · ");
    if (meta) return meta;
  }
  if (item.category === "parcel" && item.parcel) {
    if (item.parcel.eta) return t("mail-eta", { date: monthDay(t, item.parcel.eta) });
    if (item.parcel.status) return item.parcel.status;
  }
  return `${mailSender(item)} · ${mailWhen(t, item.at)}`;
}

export function mailLine(t: T, item: MailItem): string {
  if (item.category === "bill" && item.bill?.cents) {
    return t("mail-bill-line", { title: item.title, amount: mailMoney(t, item.bill.cents) });
  }
  if (item.category === "trip" && item.trip) {
    return t("mail-from-line", { from: mailSender(item), text: mailTripText(t, item) });
  }
  if (item.category === "parcel" && item.parcel) {
    const text = [item.parcel.item, item.parcel.status].filter(Boolean).join(" ");
    if (text) {
      return t("mail-from-line", { from: item.parcel.merchant ?? mailSender(item), text });
    }
  }
  return item.title || item.subject;
}

export type MailActionKind = "ledger" | "remind" | "calendar" | "trip" | "arrive" | "reply";

export interface MailAction {
  kind: MailActionKind;
  label: string;
}

export function mailActions(t: T, item: MailItem, card = false): MailAction[] {
  switch (item.category) {
    case "bill": {
      const remind: MailAction[] = item.bill?.due
        ? [{ kind: "remind", label: t(card ? "mail-act-remind-card" : "mail-act-remind") }]
        : [];
      const ledger: MailAction[] = item.bill?.cents
        ? [{ kind: "ledger", label: t("mail-act-ledger") }]
        : [];
      return card ? [...remind, ...ledger] : [...ledger, ...remind];
    }
    case "trip": {
      const city = item.trip?.tripCity;
      return [
        ...(item.trip?.start ? [{ kind: "calendar" as const, label: t("mail-act-calendar") }] : []),
        {
          kind: "trip",
          label: city ? t("mail-act-trip", { city }) : t("mail-act-trip-plain"),
        },
      ];
    }
    case "parcel":
      return [{ kind: "arrive", label: t("mail-act-arrive") }];
    case "reply":
      return [{ kind: "reply", label: t("mail-act-reply") }];
    default:
      return [];
  }
}

export function mailSay(t: T, item: MailItem, kind: MailActionKind): string {
  const from = mailSender(item);
  const date = monthDay(t, dayKey(item.at));
  const amount = item.bill?.cents ? mailMoney(t, item.bill.cents) : "";
  switch (kind) {
    case "ledger":
      return t("mail-say-ledger", { title: item.title, amount, from, date });
    case "remind":
      return t("mail-say-remind", {
        due: item.bill?.due ? monthDay(t, item.bill.due) : date,
        title: item.title,
        amount,
      });
    case "trip":
      return t("mail-say-trip", { trip: mailTripText(t, item), from, date });
    case "arrive": {
      const what = [item.parcel?.merchant, item.parcel?.item].filter(Boolean).join(" ") || item.title;
      return item.parcel?.eta
        ? t("mail-say-arrive-eta", { what, eta: monthDay(t, item.parcel.eta), from })
        : t("mail-say-arrive", { what, from, date });
    }
    default:
      return t("mail-say-reply", { subject: item.subject || item.title, from, date });
  }
}

export interface MailEvent {
  title: string;
  start: number;
  end: number;
  location: string;
  notes: string;
}

export function mailEvent(t: T, item: MailItem): MailEvent | null {
  const trip = item.trip;
  if (!trip?.start) return null;
  return {
    title: mailTripText(t, item),
    start: trip.start,
    end: trip.start + TRIP_MINUTES * 60_000,
    location: trip.station ?? trip.from ?? "",
    notes: t("mail-original-from", { from: mailSender(item), date: monthDay(t, dayKey(item.at)) }),
  };
}

export function mailtoUrl(draft: MailDraft): string {
  const query = `subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.text)}`;
  return `mailto:${encodeURIComponent(draft.to)}?${query}`;
}

export function mailTargetThread(item: MailItem, kind: MailActionKind): string | null {
  if (kind === "trip") return item.trip?.tripThreadId ?? null;
  return null;
}
