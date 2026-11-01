import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { CategoryTotal, Expense, ImportRow, Ledger } from "@xiaoban/protocol";
import { color, dark } from "@xiaoban/tokens";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { moneyFormat } from "../ui/format.ts";
import { monthDate, monthKey, parseDay, spanDays } from "./dates.ts";
import { LedgerPicker, type LedgerQuery } from "./LedgerPicker.tsx";
import { LedgerNoticed } from "./Noticed.tsx";
import { ChatBar, Checkbox, DarkButton, LifeHeader, life, Sheet, SwipeRow } from "./LifeUI.tsx";

const SHADES = [color.ledger0, color.ledger1, color.ledger2, color.ledger3, color.ledger4] as const;
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

function shadeOf(rank: number) {
  return SHADES[Math.min(rank, SHADES.length - 1)] ?? color.ledger4;
}

function useMoney() {
  const { locale } = useI18n();
  return useMemo(() => moneyFormat(locale), [locale]);
}

function totalsOf(entries: Expense[]): CategoryTotal[] {
  const sums = new Map<string, number>();
  for (const entry of entries)
    sums.set(entry.category, (sums.get(entry.category) ?? 0) + entry.cents);
  return [...sums]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents);
}

function usePace(ledger: Ledger, spent: number) {
  const { t } = useI18n();
  const money = useMoney();
  const budget = ledger.budgetCents;
  if (!budget) return null;
  const now = new Date();
  const start = monthDate(ledger.month);
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const left = budget - spent;
  if (monthKey(now) !== ledger.month) {
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

function BudgetSheet({
  store,
  month,
  budget,
  open,
  onClose,
}: {
  store: HubStore;
  month: string;
  budget: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  useEffect(() => {
    if (open) setValue(budget ? String(budget / 100) : "");
  }, [open, budget]);
  const save = () => {
    const yuan = Number(value);
    void store
      .setBudget(month, Number.isFinite(yuan) && yuan > 0 ? Math.round(yuan * 100) : null)
      .catch(() => undefined);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <Text style={life.sheetTitle}>{t("ledger-budget-label")}</Text>
      <TextInput
        style={[life.input, styles.inputGrow]}
        value={value}
        keyboardType="decimal-pad"
        returnKeyType="done"
        onChangeText={setValue}
        onSubmitEditing={save}
      />
      <DarkButton label={t("ledger-save")} onPress={save} style={styles.wide} />
    </Sheet>
  );
}

function Summary({
  ledger,
  spent,
  onBudget,
}: {
  ledger: Ledger;
  spent: number;
  onBudget: () => void;
}) {
  const { t } = useI18n();
  const money = useMoney();
  const pace = usePace(ledger, spent);
  const budget = ledger.budgetCents;
  return (
    <View style={styles.summary}>
      <View style={styles.summaryHead}>
        <Text style={styles.summaryNote}>
          {t("ledger-spent", { month: monthDate(ledger.month).getMonth() + 1 })}
        </Text>
        <Pressable hitSlop={8} onPress={onBudget}>
          <Text style={styles.summaryNote}>
            {budget ? t("ledger-budget", { amount: money(budget) }) : t("ledger-budget-none-phone")}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.total}>{money(spent)}</Text>
      {budget ? (
        <View style={styles.track}>
          <View
            style={[
              styles.trackFill,
              { width: `${Math.min(100, (spent / budget) * 100)}%` },
              spent > budget && styles.trackOver,
            ]}
          />
        </View>
      ) : null}
      {pace ? <Text style={styles.pace}>{pace}</Text> : null}
    </View>
  );
}

function RangeSummary({ ledger, spent, label }: { ledger: Ledger; spent: number; label: string }) {
  const { t } = useI18n();
  const money = useMoney();
  const days = spanDays(ledger.from, ledger.to);
  const diff = spent - ledger.previousCents;
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryNote}>{t("ledger-range-spent", { range: label })}</Text>
      <Text style={styles.total}>{money(spent)}</Text>
      <Text style={styles.pace}>
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
      </Text>
    </View>
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
    <View style={styles.cats}>
      <View style={styles.catsHead}>
        <Text style={styles.catsTitle}>{t("ledger-by-category")}</Text>
        <Text style={life.note} numberOfLines={1}>
          {filter ? t("ledger-filter-on", { category: filter }) : t("ledger-filter-hint")}
        </Text>
      </View>
      {totals.map((total, rank) => {
        const on = filter === total.category;
        return (
          <Pressable
            key={total.category}
            style={[styles.cat, on && styles.catOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onFilter(on ? null : total.category)}
          >
            <Text style={styles.catName} numberOfLines={1}>
              {total.category}
            </Text>
            <View style={styles.catTrack}>
              <View
                style={[
                  styles.catFill,
                  { width: `${(total.cents / max) * 100}%`, backgroundColor: shadeOf(rank) },
                ]}
              />
            </View>
            <Text style={styles.catAmount}>{money(total.cents)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function EditSheet({
  store,
  ledger,
  entry,
  categories,
  onClose,
}: {
  store: HubStore;
  ledger: Ledger;
  entry: Expense | null;
  categories: string[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  useEffect(() => {
    if (!entry) return;
    setName(entry.name);
    setCategory(entry.category);
    setAmount(String(entry.cents / 100));
  }, [entry]);
  const save = () => {
    const yuan = Number(amount);
    if (!entry || !(yuan > 0)) return;
    void store
      .updateExpense(ledger.month, {
        ...entry,
        name: name.trim() || entry.name,
        category: category.trim() || entry.category,
        cents: Math.round(yuan * 100),
      })
      .catch(() => undefined);
    onClose();
  };
  return (
    <Sheet open={entry !== null} onClose={onClose}>
      <Text style={life.sheetTitle}>{entry?.name}</Text>
      <View style={life.fieldRow}>
        <Text style={life.fieldLabel}>{t("ledger-edit-name")}</Text>
        <TextInput style={life.input} value={name} onChangeText={setName} />
      </View>
      <View style={life.fieldRow}>
        <Text style={life.fieldLabel}>{t("ledger-edit-amount")}</Text>
        <TextInput
          style={life.input}
          value={amount}
          keyboardType="decimal-pad"
          onChangeText={setAmount}
        />
      </View>
      <View style={life.fieldRow}>
        <Text style={life.fieldLabel}>{t("ledger-edit-category")}</Text>
        <TextInput style={life.input} value={category} onChangeText={setCategory} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catPicks}>
        {categories.map((item) => (
          <Pressable
            key={item}
            style={[styles.catPick, item === category && styles.catPickOn]}
            onPress={() => setCategory(item)}
          >
            <Text style={[styles.catPickText, item === category && styles.catPickTextOn]}>
              {item}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <DarkButton label={t("ledger-save")} onPress={save} style={styles.wide} />
    </Sheet>
  );
}

function Flow({
  store,
  ledger,
  entries,
  colors,
  onEdit,
}: {
  store: HubStore;
  ledger: Ledger;
  entries: Expense[];
  colors: Map<string, string>;
  onEdit: (entry: Expense) => void;
}) {
  const { t, locale } = useI18n();
  const money = useMoney();
  const day = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  const clockText = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  const when = (at: number) => {
    const date = new Date(at);
    const key = date.toDateString();
    if (key === today)
      return t("ledger-row-when", { day: t("ledger-today"), time: clockText.format(date) });
    if (key === yesterday)
      return t("ledger-row-when", { day: t("time-yesterday"), time: clockText.format(date) });
    return day.format(date);
  };
  return (
    <View style={styles.flow}>
      {entries.length === 0 ? (
        <Text style={[life.hint, styles.flowEmpty]}>{t("ledger-flow-empty")}</Text>
      ) : (
        entries.map((entry, index) => (
          <View key={entry.id} style={index > 0 && styles.flowLine}>
            <SwipeRow
              action={t("life-delete")}
              actionColor={color.dangerInk}
              width={72}
              onAction={() =>
                void store.deleteExpense(ledger.month, entry.id).catch(() => undefined)
              }
            >
              <Pressable style={styles.row} onPress={() => onEdit(entry)}>
                <View
                  style={[
                    styles.rowDot,
                    { backgroundColor: colors.get(entry.category) ?? color.ledger4 },
                  ]}
                />
                <View style={life.flex}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {entry.name}
                  </Text>
                  <View style={styles.rowMeta}>
                    <Text style={styles.rowTime}>{when(entry.at)}</Text>
                    <Text style={styles.rowSource}>{t(`ledger-source-${entry.source}`)}</Text>
                  </View>
                </View>
                <Text style={styles.rowAmount}>{`−${money(entry.cents)}`}</Text>
              </Pressable>
            </SwipeRow>
          </View>
        ))
      )}
    </View>
  );
}

function ImportSheet({ store, ledger }: { store: HubStore; ledger: Ledger }) {
  const { t, locale } = useI18n();
  const money = useMoney();
  const preview = ledger.import;
  const day = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  if (!preview) return null;
  const count = (status: ImportRow["status"]) =>
    preview.rows.filter((row) => row.status === status).length;
  const skipped = count("transfer") + count("refund") + count("income");
  const chosen = preview.rows.filter((row) => row.checked).length;
  const app =
    preview.app === "alipay"
      ? t("ledger-app-alipay-name")
      : preview.app === "wechat"
        ? t("ledger-app-wechat-name")
        : preview.file;
  return (
    <Sheet
      open
      style={styles.importSheet}
      onClose={() => void store.cancelImport(ledger.month).catch(() => undefined)}
    >
      <Text style={life.sheetTitle}>
        {t("ledger-import-title-phone", { app, count: preview.rows.length })}
      </Text>
      <Text style={styles.importSummary}>
        {preview.sorted
          ? t("ledger-import-summary", { fresh: count("new"), dup: count("duplicate"), skipped })
          : t("ledger-import-sorting")}
      </Text>
      <ScrollView style={styles.importRows}>
        {preview.rows.map((row) => (
          <Pressable
            key={row.id}
            style={styles.importRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: row.checked }}
            onPress={() =>
              void store
                .setImportRow(ledger.month, row.id, !row.checked, row.category)
                .catch(() => undefined)
            }
          >
            <Checkbox on={row.checked} size={18} />
            <View style={life.flex}>
              <Text style={[styles.importPayee, !row.checked && styles.faded]} numberOfLines={1}>
                {row.item && row.item !== "/" ? `${row.payee} ${row.item}` : row.payee}
              </Text>
              <Text style={life.note} numberOfLines={1}>
                {[
                  day.format(new Date(row.at)),
                  row.status === "new" ? row.category : t(`ledger-status-${row.status}`),
                ]
                  .filter(Boolean)
                  .join(t("daily-dot"))}
              </Text>
            </View>
            <Text style={[styles.importAmount, !row.checked && styles.faded]}>
              {`−${money(row.cents)}`}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <DarkButton
        label={t("ledger-import-commit", { count: chosen })}
        disabled={!preview.sorted || chosen === 0}
        style={styles.commit}
        onPress={() => void store.commitImport(ledger.month).catch(() => undefined)}
      />
    </Sheet>
  );
}

function Empty({ onBudget }: { onBudget: () => void }) {
  const { t } = useI18n();
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{t("ledger-empty-title")}</Text>
      <Text style={life.hint}>{t("ledger-empty-say-phone")}</Text>
      <Pressable style={styles.emptyButton} onPress={onBudget}>
        <Text style={styles.emptyButtonText}>{t("ledger-empty-budget")}</Text>
      </Pressable>
    </View>
  );
}

export function LedgerScreen({ store }: { store: HubStore }) {
  const { t, locale } = useI18n();
  const { ledger, status, dailyFeed } = useHubState(store);
  const [query, setQuery] = useState<LedgerQuery>(() => ({
    kind: "month",
    month: monthKey(new Date()),
  }));
  const [filter, setFilter] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [budgeting, setBudgeting] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  useEffect(() => {
    if (status !== "open") return;
    if (query.kind === "month") void store.loadLedger(query.month).catch(() => undefined);
    else void store.loadLedgerRange(query.from, query.to).catch(() => undefined);
  }, [store, status, query]);

  useEffect(() => {
    if (status === "open") void store.loadDailyFeed().catch(() => undefined);
  }, [store, status]);

  const noticed = (dailyFeed?.insights ?? []).filter(
    (insight) => insight.kind === "ledger_up" || insight.kind === "takeout",
  );

  const go = (next: LedgerQuery) => {
    setFilter(null);
    setQuery(next);
  };

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
  const shown = filter ? entries.filter((entry) => entry.category === filter) : entries;
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
  const month = query.kind === "month" ? query.month : monthKey(new Date());

  return (
    <>
      <LifeHeader title={t("ledger-title")} />
      <ScrollView style={life.scroll} contentContainerStyle={styles.body}>
        <View style={styles.pillRow}>
          <Pressable
            style={styles.pill}
            accessibilityRole="button"
            onPress={() => setPicking(true)}
          >
            <Text style={styles.pillText}>{t("ledger-picker-label", { title })}</Text>
          </Pressable>
        </View>
        {current &&
          (current.empty ? (
            <Empty onBudget={() => setBudgeting(true)} />
          ) : (
            <>
              {query.kind === "month" ? (
                <Summary ledger={current} spent={spent} onBudget={() => setBudgeting(true)} />
              ) : (
                <RangeSummary ledger={current} spent={spent} label={rangeLabel} />
              )}
              <Categories totals={totals} filter={filter} onFilter={setFilter} />
              {query.kind === "month" && query.month === monthKey(new Date())
                ? noticed.map((insight) => (
                    <LedgerNoticed key={insight.id} store={store} insight={insight} />
                  ))
                : null}
              <Flow
                store={store}
                ledger={current}
                entries={shown}
                colors={colors}
                onEdit={setEditing}
              />
              {shown.length > 0 ? (
                <Text style={[life.hint, styles.flowHint]}>{t("ledger-flow-hint-phone")}</Text>
              ) : null}
            </>
          ))}
      </ScrollView>
      <ChatBar
        store={store}
        threadId={ledger?.threadId ?? null}
        placeholder={t("ledger-chat-placeholder")}
      />
      <LedgerPicker
        store={store}
        open={picking}
        query={query}
        onPick={go}
        onClose={() => setPicking(false)}
      />
      <BudgetSheet
        store={store}
        month={month}
        budget={current?.budgetCents ?? null}
        open={budgeting}
        onClose={() => setBudgeting(false)}
      />
      {current ? (
        <EditSheet
          store={store}
          ledger={current}
          entry={editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {current?.import ? <ImportSheet store={store} ledger={current} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 16, gap: 10 },
  wide: { height: 46, borderRadius: 12 },
  inputGrow: { flex: 0 },
  pillRow: { alignItems: "center" },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: color.ink,
  },
  pillText: { fontSize: 13, color: color.surface },
  summary: {
    backgroundColor: color.ink,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 6,
  },
  summaryHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  summaryNote: { fontSize: 12, color: dark.textMuted },
  total: {
    fontSize: 30,
    fontWeight: "700",
    color: dark.text,
    fontVariant: ["tabular-nums"],
  },
  track: { height: 6, borderRadius: 3, backgroundColor: dark.line, overflow: "hidden" },
  trackFill: { height: 6, borderRadius: 3, backgroundColor: color.accentBright },
  trackOver: { backgroundColor: color.attention },
  pace: { fontSize: 12, color: dark.textSoft },
  cats: {
    backgroundColor: color.surface,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 2,
  },
  catsHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 4,
  },
  catsTitle: { fontSize: 14, fontWeight: "500", color: color.ink },
  cat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  catOn: { backgroundColor: color.accentWash },
  catName: { width: 40, fontSize: 12, color: color.ink },
  catTrack: {
    flex: 1,
    height: 12,
    borderRadius: 4,
    backgroundColor: color.ground,
    overflow: "hidden",
  },
  catFill: { height: 12, borderRadius: 4 },
  catAmount: {
    minWidth: 62,
    textAlign: "right",
    fontSize: 12,
    color: color.ink,
    fontVariant: ["tabular-nums"],
  },
  flow: {
    backgroundColor: color.surface,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    overflow: "hidden",
  },
  flowEmpty: { paddingVertical: 10 },
  flowLine: { borderTopWidth: 1, borderTopColor: color.lineSoft },
  flowHint: { paddingHorizontal: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  rowDot: { width: 8, height: 8, borderRadius: 4 },
  rowName: { fontSize: 14, color: color.ink },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  rowTime: { fontSize: 11, color: color.muted },
  rowSource: {
    fontSize: 10,
    paddingHorizontal: 5,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: color.ground,
    color: color.inkMid,
  },
  rowAmount: { fontSize: 14, fontWeight: "500", color: color.ink, fontVariant: ["tabular-nums"] },
  catPicks: { flexGrow: 0 },
  catPick: {
    height: 30,
    paddingHorizontal: 10,
    marginRight: 6,
    borderRadius: 9,
    backgroundColor: color.ground,
    justifyContent: "center",
  },
  catPickOn: { backgroundColor: color.ink },
  catPickText: { fontSize: 12, color: color.inkMid },
  catPickTextOn: { color: color.surface },
  importSheet: { maxHeight: "80%" },
  importSummary: { fontSize: 13, lineHeight: 21, color: color.inkMid },
  importRows: { flexGrow: 0 },
  importRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
  },
  importPayee: { fontSize: 13, color: color.ink },
  importAmount: { fontSize: 13, color: color.ink, fontVariant: ["tabular-nums"] },
  faded: { color: color.faded },
  commit: { height: 46, borderRadius: 9 },
  empty: { backgroundColor: color.surface, borderRadius: 16, padding: 16, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: color.ink },
  emptyButton: {
    alignSelf: "flex-start",
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.lineStrong,
    justifyContent: "center",
    marginTop: 4,
  },
  emptyButtonText: { fontSize: 13, color: color.ink },
});
