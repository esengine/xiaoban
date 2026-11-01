import { useI18n } from "@xiaoban/i18n/react";
import type { LedgerYear } from "@xiaoban/protocol";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHub } from "../../app/hub.tsx";
import { useMoney } from "./LedgerPage.tsx";

export type LedgerQuery =
  | { kind: "month"; month: string }
  | { kind: "range"; from: string; to: string };

export function isoDay(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseDay(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function spanDays(from: string, to: string) {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000) + 1;
}

function useYear(year: number) {
  const store = useHub();
  const [data, setData] = useState<LedgerYear | null>(null);
  useEffect(() => {
    let live = true;
    void store
      .ledgerYear(year)
      .then((result) => live && setData(result))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, year]);
  return data?.year === year ? data : null;
}

function Months({ query, onPick }: { query: LedgerQuery; onPick: (query: LedgerQuery) => void }) {
  const { t } = useI18n();
  const money = useMoney();
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [year, setYear] = useState(() =>
    query.kind === "month" ? Number(query.month.slice(0, 4)) : parseDay(query.to).getFullYear(),
  );
  const data = useYear(year);
  return (
    <>
      <div className="ledger-picker__nav">
        <button
          type="button"
          className="code-link"
          aria-label={t("ledger-prev-year")}
          onClick={() => setYear(year - 1)}
        >
          {t("ledger-prev")}
        </button>
        <b>{t("ledger-year", { year: String(year) })}</b>
        <button
          type="button"
          className="code-link"
          aria-label={t("ledger-next-year")}
          disabled={year >= now.getFullYear()}
          onClick={() => setYear(year + 1)}
        >
          {t("ledger-next")}
        </button>
      </div>
      <div className="ledger-picker__months">
        {Array.from({ length: 12 }, (_, index) => {
          const month = `${year}-${String(index + 1).padStart(2, "0")}`;
          const total = data?.months.find((item) => item.month === month);
          const future = month > thisMonth;
          const on = query.kind === "month" && query.month === month;
          return (
            <button
              key={month}
              type="button"
              className="ledger-picker__month"
              aria-pressed={on}
              disabled={future}
              onClick={() => onPick({ kind: "month", month })}
            >
              <b>{t("ledger-month-short", { month: String(index + 1) })}</b>
              <span>
                {future || !data
                  ? ""
                  : total && total.count > 0
                    ? money(total.cents)
                    : t("ledger-month-none")}
              </span>
            </button>
          );
        })}
      </div>
      <span className="life-card__note">{t("ledger-picker-month-hint")}</span>
    </>
  );
}

function Range({ query, onPick }: { query: LedgerQuery; onPick: (query: LedgerQuery) => void }) {
  const { t, locale } = useI18n();
  const today = new Date();
  const todayKey = isoDay(today);
  const [shown, setShown] = useState(() => {
    const base = query.kind === "range" ? parseDay(query.to) : parseDay(`${query.month}-01`);
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [start, setStart] = useState<string | null>(query.kind === "range" ? query.from : null);
  const [end, setEnd] = useState<string | null>(query.kind === "range" ? query.to : null);
  const data = useYear(shown.getFullYear());
  const days = new Set(data?.days ?? []);
  const title = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(shown);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  const short = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  const monday = addDays(new Date(2024, 0, 1), 0);
  const blanks = (shown.getDay() + 6) % 7;
  const count = new Date(shown.getFullYear(), shown.getMonth() + 1, 0).getDate();
  const weekStart = addDays(today, -((today.getDay() + 6) % 7));
  const presets: [string, string, string][] = [
    [t("ledger-preset-week"), isoDay(weekStart), todayKey],
    [t("ledger-preset-last-week"), isoDay(addDays(weekStart, -7)), isoDay(addDays(weekStart, -1))],
    [t("ledger-preset-7"), isoDay(addDays(today, -6)), todayKey],
    [t("ledger-preset-30"), isoDay(addDays(today, -29)), todayKey],
    [t("ledger-preset-year"), `${today.getFullYear()}-01-01`, todayKey],
  ];
  const pickDay = (key: string) => {
    if (!start || end) {
      setStart(key);
      setEnd(null);
    } else if (key < start) {
      setEnd(start);
      setStart(key);
    } else {
      setEnd(key);
    }
  };
  const from = start;
  const to = end ?? start;
  return (
    <>
      <div className="ledger-picker__presets">
        {presets.map(([label, presetFrom, presetTo]) => (
          <button
            key={label}
            type="button"
            className="code-status-button"
            onClick={() => onPick({ kind: "range", from: presetFrom, to: presetTo })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="ledger-picker__nav">
        <button
          type="button"
          className="code-link"
          aria-label={t("ledger-prev-month")}
          onClick={() => setShown(new Date(shown.getFullYear(), shown.getMonth() - 1, 1))}
        >
          {t("ledger-prev")}
        </button>
        <b>{title}</b>
        <button
          type="button"
          className="code-link"
          aria-label={t("ledger-next-month")}
          disabled={
            shown.getFullYear() * 12 + shown.getMonth() >=
            today.getFullYear() * 12 + today.getMonth()
          }
          onClick={() => setShown(new Date(shown.getFullYear(), shown.getMonth() + 1, 1))}
        >
          {t("ledger-next")}
        </button>
      </div>
      <div className="ledger-picker__days">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={`head-${index}`} className="ledger-picker__weekday">
            {weekday.format(addDays(monday, index))}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {Array.from({ length: count }, (_, index) => {
          const key = isoDay(new Date(shown.getFullYear(), shown.getMonth(), index + 1));
          const edge = key === from || key === to;
          const inside = from && to && key > from && key < to;
          return (
            <button
              key={key}
              type="button"
              className="ledger-picker__day"
              data-edge={edge || undefined}
              data-inside={inside || undefined}
              disabled={key > todayKey}
              onClick={() => pickDay(key)}
            >
              {index + 1}
              <span className="ledger-picker__dot" data-on={days.has(key) || undefined} />
            </button>
          );
        })}
      </div>
      <div className="ledger-picker__foot">
        <span className="life-card__note">
          {from && to
            ? t("ledger-range-days", {
                range: `${short.format(parseDay(from))} – ${short.format(parseDay(to))}`,
                days: spanDays(from, to),
              })
            : t("ledger-picker-range-hint")}
        </span>
        <span className="life-card__spacer" />
        <button
          type="button"
          className="code-status-button"
          data-dark
          disabled={!from || !to}
          onClick={() => from && to && onPick({ kind: "range", from, to })}
        >
          {t("ledger-range-go")}
        </button>
      </div>
      <span className="life-card__note">{t("ledger-picker-range-note")}</span>
    </>
  );
}

export function LedgerPicker({
  anchor,
  query,
  onPick,
  onClose,
}: {
  anchor: HTMLElement;
  query: LedgerQuery;
  onPick: (query: LedgerQuery) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"month" | "range">(query.kind);
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const width = box.current?.offsetWidth ?? 340;
    setPlace({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: rect.bottom + 6,
    });
  }, [anchor]);

  useEffect(() => {
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [anchor, onClose]);

  const pick = (next: LedgerQuery) => {
    onPick(next);
    onClose();
  };

  return createPortal(
    <div
      ref={box}
      className="ledger-picker"
      role="dialog"
      aria-label={t("ledger-picker")}
      style={{ left: place.left, top: place.top }}
    >
      <div className="ledger-picker__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "month"}
          onClick={() => setTab("month")}
        >
          {t("ledger-picker-month")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "range"}
          onClick={() => setTab("range")}
        >
          {t("ledger-picker-range")}
        </button>
      </div>
      {tab === "month" ? (
        <Months query={query} onPick={pick} />
      ) : (
        <Range query={query} onPick={pick} />
      )}
    </div>,
    document.body,
  );
}
