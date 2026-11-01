import { costSummary, type HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Expense, Trip } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useMoney } from "./TripCostView.tsx";

const RECENT = 3;
const JUST_NOW = 5 * 60_000;

function useSpending(store: HubStore, tripId: string) {
  const { ledgerTick } = useHubState(store);
  const [data, setData] = useState<{ category: string; entries: Expense[] } | null>(null);
  useEffect(() => {
    let live = true;
    if (ledgerTick < 0) return;
    void store
      .tripSpending(tripId)
      .then((next) => {
        if (live) setData(next);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, tripId, ledgerTick]);
  return data;
}

export function TripSpend({ store, trip }: { store: HubStore; trip: Trip }) {
  const { t, locale } = useI18n();
  const money = useMoney();
  const data = useSpending(store, trip.id);
  const [logging, setLogging] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const entries = data?.entries ?? [];
  const spent = entries.reduce((sum, entry) => sum + entry.cents, 0);
  const planned = trip.costs ? costSummary(trip.costs).cents : 0;
  const clock = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const save = async () => {
    const value = Number(amount.replace(/[^\d.]/g, ""));
    if (!name.trim() || !Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    setFailed(false);
    try {
      await store.addTripExpense(trip.id, name.trim(), Math.round(value * 100));
      setName("");
      setAmount("");
      setLogging(false);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={styles.label}>{t("trip-live-spent")}</Text>
          <Text style={styles.spent}>{money(spent)}</Text>
          {planned > 0 ? (
            <Text style={styles.label}>{t("trip-live-planned", { amount: money(planned) })}</Text>
          ) : null}
        </View>
        {planned > 0 ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.min(100, (spent / planned) * 100)}%` }]} />
          </View>
        ) : null}
        {entries.slice(0, RECENT).map((entry) => (
          <View key={entry.id} style={styles.entry}>
            <View style={styles.flex}>
              <Text style={styles.entryName} numberOfLines={1}>
                {entry.name}
              </Text>
              <Text style={styles.entryMeta}>
                {t("trip-live-entry-meta", {
                  time:
                    Date.now() - entry.at < JUST_NOW
                      ? t("trip-live-just-now")
                      : clock.format(entry.at),
                  who: t("trip-live-said"),
                })}
              </Text>
            </View>
            <Text style={styles.entryAmount}>{money(entry.cents)}</Text>
          </View>
        ))}
        {logging ? (
          <View style={styles.form}>
            <TextInput
              style={[styles.input, styles.flex]}
              value={name}
              onChangeText={setName}
              placeholder={t("trip-live-log-name")}
              placeholderTextColor={color.faint}
              accessibilityLabel={t("trip-live-log-name")}
              autoFocus
            />
            <TextInput
              style={[styles.input, styles.amount]}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={t("trip-live-log-amount")}
              placeholderTextColor={color.faint}
              accessibilityLabel={t("trip-live-log-amount")}
              onSubmitEditing={() => void save()}
            />
            <Pressable
              style={[styles.button, styles.buttonDark]}
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void save()}
            >
              <Text style={styles.buttonDarkText}>{t("trip-live-log-save")}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, styles.buttonDark, styles.flex]}
              accessibilityRole="button"
              onPress={() => setLogging(true)}
            >
              <Text style={styles.buttonDarkText}>{t("trip-live-log")}</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.flex]}
              accessibilityRole="button"
              onPress={() => router.push("/ledger")}
            >
              <Text style={styles.buttonText}>{t("trip-live-all")}</Text>
            </Pressable>
          </View>
        )}
        {failed ? <Text style={styles.failed}>{t("trip-live-log-failed")}</Text> : null}
      </View>
      {data ? (
        <Text style={styles.hint}>{t("trip-live-hint", { category: data.category })}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  card: {
    backgroundColor: color.surface,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  head: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  label: { fontSize: 12, color: color.muted },
  spent: { fontSize: 22, fontWeight: "700", color: color.ink },
  track: { height: 6, borderRadius: 3, backgroundColor: color.lineSoft, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3, backgroundColor: color.accent },
  entry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
  },
  entryName: { fontSize: 13, color: color.ink },
  entryMeta: { fontSize: 11, color: color.muted, marginTop: 2 },
  entryAmount: { fontSize: 13, fontWeight: "700", color: color.ink },
  buttons: { flexDirection: "row", gap: 8, marginTop: 4 },
  form: { flexDirection: "row", gap: 8, marginTop: 4, alignItems: "center" },
  input: {
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.lineStrong,
    paddingHorizontal: 10,
    fontSize: 14,
    color: color.ink,
  },
  amount: { width: 84 },
  button: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDark: { backgroundColor: color.ink, borderColor: color.ink },
  buttonText: { fontSize: 14, color: color.ink },
  buttonDarkText: { fontSize: 14, fontWeight: "600", color: color.surface },
  failed: { fontSize: 12, color: color.dangerInk },
  hint: { fontSize: 12, lineHeight: 18, color: color.muted, paddingHorizontal: 4 },
});
