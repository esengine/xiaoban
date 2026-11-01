import type { HubStore } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { LedgerYear } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { moneyFormat } from "../ui/format.ts";
import { addDays, isoDay, monthKey, parseDay, spanDays } from "./dates.ts";
import { DarkButton, life, Segment, Sheet } from "./LifeUI.tsx";

export type LedgerQuery =
  | { kind: "month"; month: string }
  | { kind: "range"; from: string; to: string };

function useYear(store: HubStore, year: number) {
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

function Nav({
  title,
  prev,
  next,
  canNext,
  onPrev,
  onNext,
}: {
  title: string;
  prev: string;
  next: string;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.nav}>
      <Pressable style={styles.navButton} accessibilityLabel={prev} onPress={onPrev}>
        <Text style={styles.navText}>{t("ledger-prev")}</Text>
      </Pressable>
      <Text style={styles.navTitle}>{title}</Text>
      <Pressable
        style={styles.navButton}
        accessibilityLabel={next}
        disabled={!canNext}
        onPress={onNext}
      >
        <Text style={[styles.navText, !canNext && styles.off]}>{t("ledger-next")}</Text>
      </Pressable>
    </View>
  );
}

function Months({
  store,
  query,
  onPick,
}: {
  store: HubStore;
  query: LedgerQuery;
  onPick: (query: LedgerQuery) => void;
}) {
  const { t, locale } = useI18n();
  const money = moneyFormat(locale);
  const now = new Date();
  const thisMonth = monthKey(now);
  const [year, setYear] = useState(() =>
    query.kind === "month" ? Number(query.month.slice(0, 4)) : parseDay(query.to).getFullYear(),
  );
  const data = useYear(store, year);
  return (
    <>
      <Nav
        title={t("ledger-year", { year: String(year) })}
        prev={t("ledger-prev-year")}
        next={t("ledger-next-year")}
        canNext={year < now.getFullYear()}
        onPrev={() => setYear(year - 1)}
        onNext={() => setYear(year + 1)}
      />
      <View style={styles.months}>
        {[0, 1, 2].map((row) => (
          <View key={row} style={styles.monthRow}>
            {[0, 1, 2, 3].map((column) => {
              const index = row * 4 + column;
              const month = `${year}-${String(index + 1).padStart(2, "0")}`;
              const total = data?.months.find((item) => item.month === month);
              const future = month > thisMonth;
              const on = query.kind === "month" && query.month === month;
              return (
                <Pressable
                  key={month}
                  style={[styles.month, on && styles.monthOn, future && styles.monthFuture]}
                  disabled={future}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => onPick({ kind: "month", month })}
                >
                  <Text
                    style={[styles.monthName, on && styles.onText, future && styles.futureText]}
                  >
                    {t("ledger-month-short", { month: String(index + 1) })}
                  </Text>
                  <Text style={[styles.monthAmount, on && styles.onMuted]} numberOfLines={1}>
                    {future || !data
                      ? ""
                      : total && total.count > 0
                        ? money(total.cents)
                        : t("ledger-month-none")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <Text style={life.hint}>{t("ledger-picker-month-hint")}</Text>
    </>
  );
}

function Range({
  store,
  query,
  onPick,
}: {
  store: HubStore;
  query: LedgerQuery;
  onPick: (query: LedgerQuery) => void;
}) {
  const { t, locale } = useI18n();
  const today = new Date();
  const todayKey = isoDay(today);
  const [shown, setShown] = useState(() => {
    const base = query.kind === "range" ? parseDay(query.to) : parseDay(`${query.month}-01`);
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [start, setStart] = useState<string | null>(query.kind === "range" ? query.from : null);
  const [end, setEnd] = useState<string | null>(query.kind === "range" ? query.to : null);
  const data = useYear(store, shown.getFullYear());
  const days = new Set(data?.days ?? []);
  const title = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(shown);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  const short = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  const monday = new Date(2024, 0, 1);
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
  const cells: (string | null)[] = [
    ...Array.from({ length: blanks }, () => null),
    ...Array.from({ length: count }, (_, index) =>
      isoDay(new Date(shown.getFullYear(), shown.getMonth(), index + 1)),
    ),
  ];
  return (
    <>
      <View style={styles.presets}>
        {presets.map(([label, presetFrom, presetTo]) => (
          <Pressable
            key={label}
            style={styles.preset}
            onPress={() => onPick({ kind: "range", from: presetFrom, to: presetTo })}
          >
            <Text style={styles.presetText}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Nav
        title={title}
        prev={t("ledger-prev-month")}
        next={t("ledger-next-month")}
        canNext={
          shown.getFullYear() * 12 + shown.getMonth() < today.getFullYear() * 12 + today.getMonth()
        }
        onPrev={() => setShown(new Date(shown.getFullYear(), shown.getMonth() - 1, 1))}
        onNext={() => setShown(new Date(shown.getFullYear(), shown.getMonth() + 1, 1))}
      />
      <View style={styles.calendar}>
        {Array.from({ length: 7 }, (_, index) => (
          <Text key={`head-${index}`} style={styles.weekday}>
            {weekday.format(addDays(monday, index))}
          </Text>
        ))}
        {cells.map((key, index) => {
          if (!key) return <View key={`blank-${index}`} style={styles.cell} />;
          const edge = key === from || key === to;
          const inside = Boolean(from && to && key > from && key < to);
          const future = key > todayKey;
          return (
            <Pressable key={key} style={styles.cell} disabled={future} onPress={() => pickDay(key)}>
              <View style={[styles.day, inside && styles.dayInside, edge && styles.dayEdge]}>
                <Text style={[styles.dayText, edge && styles.onText, future && styles.futureText]}>
                  {Number(key.slice(8))}
                </Text>
                <View
                  style={[styles.dot, days.has(key) && (edge ? styles.dotOnEdge : styles.dotOn)]}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.foot}>
        <Text style={[life.note, life.flex]}>
          {from && to
            ? t("ledger-range-days", {
                range: `${short.format(parseDay(from))} – ${short.format(parseDay(to))}`,
                days: spanDays(from, to),
              })
            : t("ledger-picker-range-hint")}
        </Text>
        <DarkButton
          label={t("ledger-range-go")}
          disabled={!from || !to}
          onPress={() => from && to && onPick({ kind: "range", from, to })}
        />
      </View>
    </>
  );
}

export function LedgerPicker({
  store,
  open,
  query,
  onPick,
  onClose,
}: {
  store: HubStore;
  open: boolean;
  query: LedgerQuery;
  onPick: (query: LedgerQuery) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"month" | "range">(query.kind);
  useEffect(() => {
    if (open) setTab(query.kind);
  }, [open, query.kind]);
  const pick = (next: LedgerQuery) => {
    onPick(next);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <Segment
        value={tab}
        style={styles.tabs}
        options={[
          { id: "month", label: t("ledger-picker-month") },
          { id: "range", label: t("ledger-picker-range") },
        ]}
        onChange={setTab}
      />
      {open &&
        (tab === "month" ? (
          <Months store={store} query={query} onPick={pick} />
        ) : (
          <Range store={store} query={query} onPick={pick} />
        ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tabs: { backgroundColor: color.ground, borderRadius: 10 },
  nav: { flexDirection: "row", alignItems: "center" },
  navButton: { width: 44, height: 32, alignItems: "center", justifyContent: "center" },
  navText: { fontSize: 16, color: color.accent },
  navTitle: { flex: 1, textAlign: "center", fontSize: 14, fontWeight: "700", color: color.ink },
  off: { color: color.checkOff },
  months: { gap: 6 },
  monthRow: { flexDirection: "row", gap: 6 },
  month: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    backgroundColor: color.ground,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  monthOn: { backgroundColor: color.ink },
  monthFuture: { backgroundColor: "transparent" },
  monthName: { fontSize: 13, fontWeight: "700", color: color.ink },
  monthAmount: { fontSize: 11, color: color.faint },
  onText: { color: color.surface },
  onMuted: { color: color.lineStrong },
  futureText: { color: color.checkOff },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  preset: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: color.lineStrong,
    justifyContent: "center",
  },
  presetText: { fontSize: 13, color: color.ink },
  calendar: { flexDirection: "row", flexWrap: "wrap" },
  weekday: {
    width: `${100 / 7}%`,
    textAlign: "center",
    fontSize: 11,
    color: color.faint,
    paddingVertical: 4,
  },
  cell: { width: `${100 / 7}%`, height: 40, alignItems: "center", justifyContent: "center" },
  day: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  dayInside: { backgroundColor: color.accentWash },
  dayEdge: { backgroundColor: color.ink },
  dayText: { fontSize: 13, color: color.ink },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 1, backgroundColor: "transparent" },
  dotOn: { backgroundColor: color.accent },
  dotOnEdge: { backgroundColor: color.surface },
  foot: { flexDirection: "row", alignItems: "center", gap: 10 },
});
