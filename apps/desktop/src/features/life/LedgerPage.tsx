import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { CategoryTotal, Expense, ImportRow, Ledger } from "@xiaoban/protocol";
import { useEffect, useMemo, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { SideChat } from "../chat/SideChat.tsx";
import {
  addDays,
  isoDay,
  LedgerPicker,
  type LedgerQuery,
  parseDay,
  spanDays,
} from "./LedgerPicker.tsx";

const IMAGE = /\.(png|jpe?g|heic|webp|gif)$/i;
const BILL = /\.(csv|xlsx|xls)$/i;
const SHADES = 5;
const DEFAULT_CATEGORIES = [
  "dining",
  "household",
  "transport",
  "kids",
  "housing",
  "health",
  "fun",
  "clothes",
  "gifts",
  "other",
] as const;

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(month: string, by: number) {
  const [year, number] = month.split("-").map(Number);
  return monthKey(new Date(year ?? 1970, (number ?? 1) - 1 + by, 1));
}

function monthDate(month: string) {
  const [year, number] = month.split("-").map(Number);
  return new Date(year ?? 1970, (number ?? 1) - 1, 1);
}

export function useMoney() {
  const { locale } = useI18n();
  return useMemo(() => {
    const format = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return (cents: number) => format.format(cents / 100);
  }, [locale]);
}

function totalsOf(entries: Expense[]): CategoryTotal[] {
  const sums = new Map<string, number>();
  for (const entry of entries)
    sums.set(entry.category, (sums.get(entry.category) ?? 0) + entry.cents);
  return [...sums]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents);
}

export function shadeOf(rank: number) {
  return `var(--color-ledger${Math.min(rank, SHADES - 1)})`;
}

function usePace(ledger: Ledger, spent: number) {
  const { t } = useI18n();
  const money = useMoney();
  const budget = ledger.budgetCents;
  if (!budget) return null;
  const now = new Date();
  const start = monthDate(ledger.month);
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const current = monthKey(now) === ledger.month;
  const left = budget - spent;
  if (!current) {
    return left >= 0
      ? t("ledger-past-left", { amount: money(left) })
      : t("ledger-past-over", { amount: money(-left) });
  }
  const projected = (spent / Math.max(1, now.getDate())) * days;
  const end = budget - projected;
  const head =
    left >= 0
      ? t("ledger-left", { amount: money(left) })
      : t("ledger-over", { amount: money(-left) });
  if (Math.abs(end) <= budget * 0.05) return `${head}${t("ledger-pace-even")}`;
  return end > 0
    ? `${head}${t("ledger-pace-save", { amount: money(end) })}`
    : `${head}${t("ledger-pace-over", { amount: money(-end) })}`;
}

function Summary({ ledger, spent }: { ledger: Ledger; spent: number }) {
  const { t } = useI18n();
  const store = useHub();
  const money = useMoney();
  const pace = usePace(ledger, spent);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const budget = ledger.budgetCents;
  const share = budget ? Math.min(100, (spent / budget) * 100) : 0;
  const save = () => {
    const yuan = Number(value);
    void store
      .setBudget(ledger.month, Number.isFinite(yuan) && yuan > 0 ? Math.round(yuan * 100) : null)
      .catch(() => undefined);
    setEditing(false);
  };
  return (
    <section className="life-card ledger-summary">
      <span className="life-card__note">
        {t("ledger-spent", { month: monthDate(ledger.month).getMonth() + 1 })}
      </span>
      <b className="ledger-summary__total">{money(spent)}</b>
      {budget ? (
        <span className="ledger-bar" data-over={spent > budget || undefined}>
          <span style={{ width: `${share}%` }} />
        </span>
      ) : null}
      {pace && <span className="life-card__note">{pace}</span>}
      <span className="ledger-summary__budget">
        {editing ? (
          <>
            <span>{t("ledger-budget-label")}</span>
            <input
              // biome-ignore lint/a11y/noAutofocus: opened by the user to type a number
              autoFocus
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
                if (event.key === "Escape") setEditing(false);
              }}
              onBlur={save}
            />
          </>
        ) : (
          <>
            <span>
              {budget ? t("ledger-budget", { amount: money(budget) }) : t("ledger-no-budget")}
            </span>
            <button
              type="button"
              className="code-link"
              onClick={() => {
                setValue(budget ? String(budget / 100) : "");
                setEditing(true);
              }}
            >
              {budget ? t("ledger-budget-edit") : t("ledger-budget-set")}
            </button>
          </>
        )}
      </span>
    </section>
  );
}

function RangeSummary({ ledger, spent, label }: { ledger: Ledger; spent: number; label: string }) {
  const { t } = useI18n();
  const money = useMoney();
  const days = spanDays(ledger.from, ledger.to);
  const diff = spent - ledger.previousCents;
  return (
    <section className="life-card ledger-summary">
      <span className="life-card__note">{t("ledger-range-spent", { range: label })}</span>
      <b className="ledger-summary__total">{money(spent)}</b>
      <span className="life-card__note">
        {[
          t("ledger-range-count", { days }),
          t("ledger-range-daily", { amount: money(Math.round(spent / Math.max(1, days))) }),
          ledger.previousCents > 0 || spent > 0
            ? diff >= 0
              ? t("ledger-range-more", { days, amount: money(diff) })
              : t("ledger-range-less", { days, amount: money(-diff) })
            : "",
        ]
          .filter(Boolean)
          .join(t("daily-dot"))}
      </span>
    </section>
  );
}

function Categories({
  totals,
  filter,
  onFilter,
}: {
  totals: CategoryTotal[];
  filter: string | null;
  onFilter: (category: string | null) => void;
}) {
  const { t } = useI18n();
  const money = useMoney();
  const max = Math.max(1, ...totals.map((total) => total.cents));
  if (totals.length === 0) return null;
  return (
    <section className="life-card">
      <div className="life-card__head">
        <b>{t("ledger-by-category")}</b>
        <span className="life-card__spacer" />
        <span className="life-card__note">
          {filter ? t("ledger-filter-on", { category: filter }) : t("ledger-filter-hint")}
        </span>
      </div>
      <div className="ledger-cats">
        {totals.map((total, rank) => (
          <button
            key={total.category}
            type="button"
            className="ledger-cat"
            aria-pressed={filter === total.category}
            onClick={() => onFilter(filter === total.category ? null : total.category)}
          >
            <span className="ledger-cat__name">{total.category}</span>
            <span className="ledger-cat__bar">
              <span style={{ width: `${(total.cents / max) * 100}%`, background: shadeOf(rank) }} />
            </span>
            <span className="ledger-cat__amount">{money(total.cents)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Noticed({
  ledger,
  totals,
  onOpenWeek,
}: {
  ledger: Ledger;
  totals: CategoryTotal[];
  onOpenWeek: () => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const money = useMoney();
  const dining = t("ledger-cat-dining");
  const notes = totals
    .map((total) => {
      const before = ledger.previous.find((item) => item.category === total.category)?.cents ?? 0;
      const diff = total.cents - before;
      if (before <= 0 || diff < 20_000 || total.cents < before * 1.3) return null;
      return { key: total.category, diff, pct: Math.round((diff / before) * 100) };
    })
    .filter((note): note is { key: string; diff: number; pct: number } => note !== null)
    .filter((note) => !ledger.muted.includes(note.key))
    .slice(0, 2);
  if (notes.length === 0) return null;
  return (
    <section className="life-card ledger-noticed">
      <b>{t("ledger-noticed")}</b>
      {notes.map((note) => (
        <div key={note.key} className="ledger-noticed__item">
          <p>
            {t("ledger-noticed-up", {
              category: note.key,
              amount: money(note.diff),
              pct: String(note.pct),
            })}
          </p>
          <div className="ledger-noticed__actions">
            {note.key === dining && (
              <button type="button" className="code-status-button" onClick={onOpenWeek}>
                {t("ledger-open-week")}
              </button>
            )}
            <button
              type="button"
              className="code-link"
              onClick={() => void store.muteInsight(ledger.month, note.key).catch(() => undefined)}
            >
              {t("ledger-mute")}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function EditRow({
  entry,
  categories,
  onDone,
}: {
  entry: Expense;
  categories: string[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const { ledger } = useHubState(store);
  const [name, setName] = useState(entry.name);
  const [category, setCategory] = useState(entry.category);
  const [amount, setAmount] = useState(String(entry.cents / 100));
  const save = () => {
    const yuan = Number(amount);
    if (!ledger || !(yuan > 0)) return;
    void store
      .updateExpense(ledger.month, {
        ...entry,
        name: name.trim() || entry.name,
        category: category.trim() || entry.category,
        cents: Math.round(yuan * 100),
      })
      .catch(() => undefined);
    onDone();
  };
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) save();
    if (event.key === "Escape") onDone();
  };
  return (
    <div className="ledger-row ledger-row--edit">
      <input
        className="ledger-row__input"
        aria-label={t("ledger-edit-name")}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={keys}
      />
      <input
        className="ledger-row__input ledger-row__input--cat"
        aria-label={t("ledger-edit-category")}
        list="ledger-categories"
        value={category}
        onChange={(event) => setCategory(event.target.value)}
        onKeyDown={keys}
      />
      <datalist id="ledger-categories">
        {categories.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <input
        className="ledger-row__input ledger-row__input--amount"
        aria-label={t("ledger-edit-amount")}
        inputMode="decimal"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        onKeyDown={keys}
      />
      <button type="button" className="code-link" onClick={save}>
        {t("ledger-save")}
      </button>
      <button type="button" className="code-link" onClick={onDone}>
        {t("ledger-cancel")}
      </button>
    </div>
  );
}

function Flow({
  ledger,
  entries,
  filter,
  categories,
  colors,
  onImport,
  period,
  onThisMonth,
}: {
  period: string | null;
  onThisMonth: () => void;
  ledger: Ledger;
  entries: Expense[];
  filter: string | null;
  categories: string[];
  colors: Map<string, string>;
  onImport: () => void;
}) {
  const { t, locale } = useI18n();
  const store = useHub();
  const money = useMoney();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const day = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  const clock = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const needle = query.trim().toLowerCase();
  const shown = entries.filter(
    (entry) =>
      (!filter || entry.category === filter) &&
      (!needle ||
        entry.name.toLowerCase().includes(needle) ||
        entry.note.toLowerCase().includes(needle) ||
        String(entry.cents / 100).includes(needle)),
  );
  const groups = new Map<string, Expense[]>();
  for (const entry of shown) {
    const key = new Date(entry.at).toDateString();
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const label = (key: string) => {
    const date = new Date(key);
    if (key === today) return t("ledger-today");
    if (key === yesterday) return t("ledger-yesterday", { date: day.format(date) });
    return day.format(date);
  };
  const month = ledger.month ? monthDate(ledger.month).getMonth() + 1 : 0;
  return (
    <section className="life-card ledger-flow">
      <div className="life-card__head">
        <b>
          {period
            ? t("ledger-flow-head-range", {
                scope: filter ?? t("ledger-all"),
                range: period,
                count: shown.length,
              })
            : t("ledger-flow-head", {
                scope: filter ?? t("ledger-all"),
                month,
                count: shown.length,
              })}
        </b>
        {period && (
          <button type="button" className="code-link" onClick={onThisMonth}>
            {t("ledger-this-month")}
          </button>
        )}
        <span className="life-card__spacer" />
        <input
          className="ledger-search"
          value={query}
          placeholder={t("ledger-search")}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className="code-status-button" onClick={onImport}>
          {t("ledger-import")}
        </button>
      </div>
      <div className="ledger-flow__list">
        {shown.length === 0 && <p className="life-card__hint">{t("ledger-flow-empty")}</p>}
        {[...groups].map(([key, items]) => (
          <div key={key} className="ledger-day">
            <div className="ledger-day__head">
              <span>{label(key)}</span>
              <span className="life-card__spacer" />
              <span>{`−${money(items.reduce((sum, item) => sum + item.cents, 0))}`}</span>
            </div>
            {items.map((entry) =>
              editing === entry.id ? (
                <EditRow
                  key={entry.id}
                  entry={entry}
                  categories={categories}
                  onDone={() => setEditing(null)}
                />
              ) : (
                <div key={entry.id} className="ledger-row">
                  <span
                    className="ledger-row__dot"
                    style={{ background: colors.get(entry.category) ?? shadeOf(SHADES - 1) }}
                  />
                  <span className="ledger-row__text">
                    <span className="ledger-row__name">{entry.name}</span>
                    <span className="ledger-row__meta">
                      {[entry.category, clock.format(new Date(entry.at))].join(t("daily-dot"))}
                    </span>
                  </span>
                  <span className="ledger-source" data-source={entry.source}>
                    {t(`ledger-source-${entry.source}`)}
                  </span>
                  <span className="ledger-row__actions">
                    <button
                      type="button"
                      className="code-link"
                      onClick={() => setEditing(entry.id)}
                    >
                      {t("ledger-edit")}
                    </button>
                    <button
                      type="button"
                      className="code-link"
                      data-danger
                      onClick={() =>
                        void store.deleteExpense(ledger.month, entry.id).catch(() => undefined)
                      }
                    >
                      {t("ledger-delete")}
                    </button>
                  </span>
                  <span className="ledger-row__amount">{`−${money(entry.cents)}`}</span>
                </div>
              ),
            )}
          </div>
        ))}
      </div>
      <p className="life-card__hint">{t("ledger-flow-hint")}</p>
    </section>
  );
}

function ImportDialog({ ledger, categories }: { ledger: Ledger; categories: string[] }) {
  const { t, locale } = useI18n();
  const store = useHub();
  const money = useMoney();
  const preview = ledger.import;
  if (!preview) return null;
  const when = new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const range = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  const count = (status: ImportRow["status"]) =>
    preview.rows.filter((row) => row.status === status).length;
  const skipped = count("transfer") + count("refund") + count("income");
  const chosen = preview.rows.filter((row) => row.checked).length;
  const app =
    preview.app === "alipay"
      ? t("ledger-app-alipay")
      : preview.app === "wechat"
        ? t("ledger-app-wechat")
        : preview.file;
  return (
    <div className="ledger-scrim">
      <div className="dialog ledger-import" role="dialog" aria-label={t("ledger-import")}>
        <div className="ledger-import__head">
          <b>{t("ledger-import")}</b>
          <span className="life-card__note">
            {t("ledger-import-meta", {
              app,
              from: range.format(new Date(preview.from)),
              to: range.format(new Date(preview.to)),
              count: preview.rows.length,
            })}
          </span>
        </div>
        <p className="ledger-import__summary">
          {preview.sorted
            ? t("ledger-import-summary", {
                fresh: count("new"),
                dup: count("duplicate"),
                skipped,
              })
            : t("ledger-import-sorting")}
        </p>
        <div className="ledger-import__rows">
          {preview.rows.map((row) => (
            <label key={row.id} className="ledger-import__row" data-off={!row.checked || undefined}>
              <input
                type="checkbox"
                checked={row.checked}
                onChange={() =>
                  void store
                    .setImportRow(ledger.month, row.id, !row.checked, row.category)
                    .catch(() => undefined)
                }
              />
              <span className="ledger-import__time">{when.format(new Date(row.at))}</span>
              <span className="ledger-import__payee">{row.payee}</span>
              <span className="ledger-import__item">{row.item === "/" ? "" : row.item}</span>
              <input
                className="ledger-import__cat"
                list="ledger-categories-import"
                aria-label={t("ledger-edit-category")}
                defaultValue={row.category}
                placeholder={preview.sorted ? "—" : "…"}
                onClick={(event) => event.preventDefault()}
                onBlur={(event) => {
                  if (event.target.value !== row.category)
                    void store
                      .setImportRow(ledger.month, row.id, row.checked, event.target.value)
                      .catch(() => undefined);
                }}
              />
              <span className="ledger-import__status" data-status={row.status}>
                {t(`ledger-status-${row.status}`)}
              </span>
              <span className="ledger-import__amount">{`−${money(row.cents)}`}</span>
            </label>
          ))}
          <datalist id="ledger-categories-import">
            {categories.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </div>
        <span className="life-card__note">{t("ledger-import-note")}</span>
        <div className="dialog__actions">
          <button
            type="button"
            className="dialog__secondary"
            onClick={() => void store.cancelImport(ledger.month).catch(() => undefined)}
          >
            {t("ledger-cancel")}
          </button>
          <button
            type="button"
            className="dialog__primary"
            disabled={!preview.sorted || chosen === 0}
            onClick={() => void store.commitImport(ledger.month).catch(() => undefined)}
          >
            {t("ledger-import-commit", { count: chosen })}
          </button>
        </div>
      </div>
    </div>
  );
}

function Empty({ month, onImport }: { month: string; onImport: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const [budget, setBudget] = useState<string | null>(null);
  const save = () => {
    const yuan = Number(budget);
    if (yuan > 0) void store.setBudget(month, Math.round(yuan * 100)).catch(() => undefined);
    setBudget(null);
  };
  return (
    <div className="ledger-empty">
      <section className="life-card ledger-empty__card">
        <b>{t("ledger-empty-title")}</b>
        <p>{t("ledger-empty-body")}</p>
        <ul>
          <li>{t("ledger-empty-say")}</li>
          <li>{t("ledger-empty-receipt")}</li>
          <li>{t("ledger-empty-bill")}</li>
        </ul>
        <div className="ledger-empty__actions">
          <button type="button" className="dialog__primary" onClick={onImport}>
            {t("ledger-empty-import")}
          </button>
          {budget === null ? (
            <button type="button" className="code-status-button" onClick={() => setBudget("")}>
              {t("ledger-empty-budget")}
            </button>
          ) : (
            <span className="ledger-summary__budget">
              <span>{t("ledger-budget-label")}</span>
              <input
                // biome-ignore lint/a11y/noAutofocus: opened by the user to type a number
                autoFocus
                inputMode="decimal"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") save();
                  if (event.key === "Escape") setBudget(null);
                }}
                onBlur={save}
              />
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

export function LedgerPage({ onBack, onOpenWeek }: { onBack: () => void; onOpenWeek: () => void }) {
  const { t, locale } = useI18n();
  const store = useHub();
  const { ledger } = useHubState(store);
  const [query, setQuery] = useState<LedgerQuery>(() => ({
    kind: "month",
    month: monthKey(new Date()),
  }));
  const [filter, setFilter] = useState<string | null>(null);
  const [picker, setPicker] = useState<HTMLElement | null>(null);
  const threadId = ledger?.threadId ?? null;
  const month = query.kind === "month" ? query.month : "";

  useEffect(() => {
    if (query.kind === "month") void store.loadLedger(query.month).catch(() => undefined);
    else void store.loadLedgerRange(query.from, query.to).catch(() => undefined);
  }, [store, query]);

  const go = (next: LedgerQuery) => {
    setFilter(null);
    setQuery(next);
  };
  const step = (by: number) => {
    if (query.kind === "month") go({ kind: "month", month: shiftMonth(query.month, by) });
    else {
      const days = spanDays(query.from, query.to);
      go({
        kind: "range",
        from: isoDay(addDays(parseDay(query.from), by * days)),
        to: isoDay(addDays(parseDay(query.to), by * days)),
      });
    }
  };
  const atEnd =
    query.kind === "month" ? query.month >= monthKey(new Date()) : query.to >= isoDay(new Date());

  const send = (text: string, files: string[] = []) => {
    if (threadId) void store.send(threadId, text, { files }).catch(() => undefined);
  };

  const pickBill = async () => {
    const chosen = await open({
      multiple: false,
      filters: [{ name: t("ledger-bill-filter"), extensions: ["csv", "xlsx", "xls"] }],
    }).catch(() => null);
    if (typeof chosen === "string") send(t("ledger-import-message"), [chosen]);
  };

  useEffect(() => {
    if (!isTauri() || !threadId) return;
    const stop = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type !== "drop") return;
      const bills = payload.paths.filter((path) => BILL.test(path));
      const images = payload.paths.filter((path) => IMAGE.test(path));
      if (bills.length > 0)
        void store.send(threadId, t("ledger-import-message"), { files: bills.slice(0, 1) });
      else if (images.length > 0)
        void store
          .send(threadId, t("ledger-receipt-message"), { files: images })
          .catch(() => undefined);
    });
    return () => void stop.then((unlisten) => unlisten());
  }, [store, threadId, t]);

  const current =
    ledger &&
    (query.kind === "month"
      ? ledger.month === query.month
      : ledger.from === query.from && ledger.to === query.to)
      ? ledger
      : null;
  const entries = current?.entries ?? [];
  const totals = useMemo(() => totalsOf(entries), [entries]);
  const colors = useMemo(
    () => new Map(totals.map((total, rank) => [total.category, shadeOf(rank)])),
    [totals],
  );
  const categories = useMemo(() => {
    const names = new Set(totals.map((total) => total.category));
    for (const total of current?.previous ?? []) names.add(total.category);
    for (const key of DEFAULT_CATEGORIES) names.add(t(`ledger-cat-${key}`));
    return [...names];
  }, [totals, current, t]);
  const spent = entries.reduce((sum, entry) => sum + entry.cents, 0);
  const short = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  const rangeLabel =
    query.kind === "range"
      ? `${short.format(parseDay(query.from))} – ${short.format(parseDay(query.to))}`
      : "";
  const title =
    query.kind === "month"
      ? new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
          monthDate(query.month),
        )
      : rangeLabel;

  return (
    <main className="life-page ledger">
      <header className="life-top">
        <button type="button" className="code-link life-top__back" onClick={onBack}>
          {t("kitchen-back")}
        </button>
        <b className="life-top__title">{t("ledger-title")}</b>
        {ledger && !ledger.empty && (
          <span className="life-top__tabs">
            <button
              type="button"
              className="code-tab"
              aria-label={query.kind === "month" ? t("ledger-prev-month") : t("ledger-prev-range")}
              onClick={() => step(-1)}
            >
              {t("ledger-prev")}
            </button>
            <button
              type="button"
              className="code-tab ledger-month"
              aria-expanded={picker !== null}
              onClick={(event) => setPicker(picker ? null : event.currentTarget)}
            >
              {t("ledger-picker-label", { title })}
            </button>
            <button
              type="button"
              className="code-tab"
              aria-label={query.kind === "month" ? t("ledger-next-month") : t("ledger-next-range")}
              disabled={atEnd}
              onClick={() => step(1)}
            >
              {t("ledger-next")}
            </button>
          </span>
        )}
      </header>
      <div className="kitchen__body">
        <div className="kitchen__content">
          {current &&
            (current.empty ? (
              <Empty month={month || monthKey(new Date())} onImport={() => void pickBill()} />
            ) : (
              <div className="ledger__grid">
                <div className="ledger__side">
                  {query.kind === "month" ? (
                    <Summary ledger={current} spent={spent} />
                  ) : (
                    <RangeSummary ledger={current} spent={spent} label={rangeLabel} />
                  )}
                  <Categories totals={totals} filter={filter} onFilter={setFilter} />
                  {query.kind === "month" && (
                    <Noticed ledger={current} totals={totals} onOpenWeek={onOpenWeek} />
                  )}
                </div>
                <Flow
                  ledger={current}
                  entries={entries}
                  filter={filter}
                  categories={categories}
                  colors={colors}
                  onImport={() => void pickBill()}
                  period={query.kind === "range" ? rangeLabel : null}
                  onThisMonth={() => go({ kind: "month", month: monthKey(new Date()) })}
                />
              </div>
            ))}
        </div>
        {threadId && (
          <SideChat
            threadId={threadId}
            labels={{
              title: t("kitchen-chat"),
              note: t("ledger-chat-note"),
              hint: t("ledger-chat-hint"),
              placeholder: t("ledger-chat-placeholder"),
            }}
          />
        )}
      </div>
      {current?.import && <ImportDialog ledger={current} categories={categories} />}
      {picker && (
        <LedgerPicker anchor={picker} query={query} onPick={go} onClose={() => setPicker(null)} />
      )}
    </main>
  );
}
