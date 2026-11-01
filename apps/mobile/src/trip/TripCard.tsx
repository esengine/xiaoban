import { cardCostParts, costNumber, costSummary, range, stopsText, weekday } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";
import { CostBar, useMoney } from "./TripCostView.tsx";
import { ChevronIcon } from "./TripIcons.tsx";
import { dayInk, openTrip, useTrip } from "./useTrip.ts";

export function TripCard({ tripId, version }: { tripId: string; version: number }) {
  const { t, locale } = useI18n();
  const money = useMoney();
  const store = useHubStore();
  const { latestTrip } = useHubState(store);
  const trip = useTrip(store, tripId, version);
  if (!trip) {
    return (
      <View style={styles.card}>
        <Text style={styles.meta}>{t("trip-loading")}</Text>
      </View>
    );
  }
  const outdated = (latestTrip[tripId] ?? version) > version;
  const open = () => openTrip(tripId, outdated ? version : null);
  const summary = trip.costs ? costSummary(trip.costs) : null;
  return (
    <Pressable
      style={[styles.card, outdated && styles.outdated]}
      accessibilityRole="button"
      onPress={open}
    >
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>
          {trip.title}
        </Text>
        {outdated ? <Text style={styles.tag}>{t("trip-updated")}</Text> : null}
      </View>
      <Text style={styles.meta} numberOfLines={1}>
        {t("trip-card-meta", { range: range(t, trip), party: trip.party })}
      </Text>
      <View style={styles.days}>
        {trip.days.map((day, index) => (
          <View key={day.date} style={styles.day}>
            <View style={[styles.dot, { backgroundColor: dayInk(index) }]} />
            <Text style={styles.dayLabel}>
              {t("trip-day", { n: index + 1 })} {weekday(t, day.date)}
            </Text>
            <Text style={styles.stops} numberOfLines={1}>
              {stopsText(t, day)}
            </Text>
          </View>
        ))}
      </View>
      {trip.costs && summary && summary.cents > 0 ? (
        <View style={styles.cost}>
          <View style={styles.costRow}>
            <Text style={styles.meta}>{t("trip-card-cost")}</Text>
            <Text style={styles.costTotal}>{money(summary.cents)}</Text>
            <Text style={styles.costParts} numberOfLines={1}>
              {cardCostParts(t, costNumber(locale), trip.costs)}
            </Text>
          </View>
          <CostBar summary={summary} />
        </View>
      ) : null}
      <View style={styles.foot}>
        <Text style={styles.open}>{t(outdated ? "trip-view-version" : "trip-open")}</Text>
        <ChevronIcon color={color.accent} size={12} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    minWidth: 260,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    padding: 12,
    gap: 6,
  },
  outdated: { opacity: 0.7 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: "700", color: color.ink },
  tag: {
    fontSize: 11,
    color: color.changeInk,
    backgroundColor: color.changeSoft,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
  meta: { fontSize: 12, color: color.muted },
  days: { gap: 6, marginTop: 4 },
  day: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dayLabel: { fontSize: 12, fontWeight: "700", color: color.ink },
  stops: { flex: 1, fontSize: 12, color: color.inkMid },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
  },
  open: { fontSize: 13, fontWeight: "500", color: color.accent },
  cost: { marginTop: 4 },
  costRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  costTotal: { fontSize: 17, fontWeight: "700", color: color.ink },
  costParts: { flex: 1, fontSize: 11, color: color.muted },
});
