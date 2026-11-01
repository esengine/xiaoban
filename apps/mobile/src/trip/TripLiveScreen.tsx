import {
  foodLinks,
  goLinks,
  type HubStore,
  modeText,
  nextStopIndex,
  skyText,
  todayIndex,
  tripClock,
} from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Trip, TripDay, TripStop } from "@xiaoban/protocol";
import { color, dark } from "@xiaoban/tokens";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConfirmCard } from "../chat/ConfirmCard.tsx";
import { TickIcon } from "../life/LifeIcons.tsx";
import { ChatBar, goBack } from "../life/LifeUI.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ReplyCard } from "./ReplyCard.tsx";
import { DotIcon } from "./TripIcons.tsx";
import { TripMap } from "./TripMap.tsx";
import { TripSpend } from "./TripSpend.tsx";
import {
  dayInk,
  openFirst,
  openLink,
  useNow,
  useShareTrip,
  useTrip,
  useTripSay,
} from "./useTrip.ts";

const MAP = 206;

export function TripLiveScreen({ store, tripId }: { store: HubStore; tripId: string }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const trip = useTrip(store, tripId, null);
  const now = useNow(30_000);
  const clock = trip ? tripClock(trip, now) : null;
  const found = trip && clock ? todayIndex(trip, clock) : -1;
  const dayIndex = Math.max(0, found);
  const { say, reply, busy, dismiss } = useTripSay(store, trip, dayIndex);
  const { confirms } = useHubState(store);

  if (!trip || !clock) {
    return (
      <View style={[styles.screen, styles.loading]}>
        <Text style={styles.muted}>{t("trip-loading")}</Text>
      </View>
    );
  }

  const day = trip.days[dayIndex];
  const stops = day?.stops ?? [];
  const nextIndex = day && found >= 0 ? nextStopIndex(day, clock) : -1;
  const next = stops[nextIndex];
  const previous = stops[nextIndex - 1];
  const focus = next ?? stops.at(-1);
  const mapHeight = MAP + insets.top;
  const tone = dayInk(dayIndex);
  const confirm = confirms.find((item) => item.threadId === trip.threadId) ?? null;

  return (
    <View style={styles.screen}>
      <View style={[styles.map, { height: mapHeight }]}>
        <TripMap
          stops={stops}
          tone={tone}
          area={{
            top: insets.top + 8 + 44 + 56,
            bottom: mapHeight - 40,
            left: 56,
            right: window.width - 56,
          }}
          width={window.width}
          height={mapHeight}
          selected={next ? nextIndex : null}
          passed={next ? nextIndex - 1 : stops.length - 1}
        />
        <View style={[styles.head, { top: insets.top + 8 }]}>
          <Pressable
            style={styles.float}
            accessibilityRole="button"
            accessibilityLabel={t("trip-live-back")}
            onPress={goBack}
          >
            <Icon name="back" size={20} color={color.ink} />
          </Pressable>
          <View style={[styles.float, styles.titleBox]}>
            <Text style={styles.title} numberOfLines={1}>
              {t("trip-live-title", { day: t("trip-day", { n: dayIndex + 1 }) })}
            </Text>
          </View>
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <NextCard trip={trip} next={next ?? null} previous={previous ?? null} time={next?.time} />
        {day ? <Progress day={day} nextIndex={next ? nextIndex : stops.length} /> : null}
        <TripSpend store={store} trip={trip} />
        <Quick trip={trip} day={day ?? null} focus={focus ?? null} />
      </ScrollView>
      {confirm ? (
        <View style={styles.reply}>
          <ConfirmCard confirm={confirm} />
        </View>
      ) : reply ? (
        <ReplyCard
          reply={reply}
          day={dayIndex}
          threadId={trip.threadId}
          onClose={dismiss}
          style={styles.reply}
        />
      ) : null}
      <ChatBar
        store={store}
        threadId={trip.threadId}
        placeholder={t("trip-live-placeholder")}
        disabled={busy}
        onSend={say}
      />
    </View>
  );
}

function NextCard({
  trip,
  next,
  previous,
  time,
}: {
  trip: Trip;
  next: TripStop | null;
  previous: TripStop | null;
  time: string | undefined;
}) {
  const { t } = useI18n();
  if (!next) {
    return (
      <View style={styles.next}>
        <Text style={styles.nextName}>{t("trip-live-done")}</Text>
        <Pressable
          style={[styles.nextButton, styles.nextButtonLight]}
          accessibilityRole="button"
          onPress={() => router.back()}
        >
          <Text style={styles.nextButtonDarkText}>{t("trip-open")}</Text>
        </Pressable>
      </View>
    );
  }
  const leg = previous?.next ?? null;
  return (
    <View style={styles.next}>
      <View style={styles.nextHead}>
        <View style={styles.flex}>
          <Text style={styles.nextLabel}>{t("trip-live-next", { time: time ?? next.time })}</Text>
          <Text style={styles.nextName}>{next.name}</Text>
          {next.note ? (
            <Text style={styles.nextNote} numberOfLines={2}>
              {next.note}
            </Text>
          ) : null}
        </View>
        {leg ? (
          <View style={styles.nextLeg}>
            <Text style={styles.nextMinutes}>
              {t(leg.estimated ? "trip-live-minutes-estimated" : "trip-live-minutes", {
                minutes: leg.minutes,
              })}
            </Text>
            <Text style={styles.nextLabel}>{modeText(t, leg.mode)}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.nextButtons}>
        <Pressable
          style={styles.nextButton}
          accessibilityRole="button"
          onPress={() => void openFirst(goLinks(trip, next, "taxi"))}
        >
          <Text style={styles.nextButtonText}>{t("trip-taxi")}</Text>
        </Pressable>
        <Pressable
          style={[styles.nextButton, styles.nextButtonLight]}
          accessibilityRole="button"
          onPress={() => void openFirst(goLinks(trip, next, leg?.mode ?? "taxi"))}
        >
          <Text style={styles.nextButtonDarkText}>{t("trip-navigate")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Progress({ day, nextIndex }: { day: TripDay; nextIndex: number }) {
  const { t } = useI18n();
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("weather-today")}</Text>
      <View style={styles.progress}>
        {day.stops.map((stop, index) => {
          const done = index < nextIndex;
          const current = index === nextIndex;
          return (
            <View
              key={`${stop.time}-${stop.name}`}
              style={[styles.progressItem, index === 0 && styles.progressFirst]}
            >
              {index > 0 ? (
                <View
                  style={[
                    styles.progressLine,
                    { backgroundColor: done || current ? color.accent : color.lineStrong },
                  ]}
                />
              ) : null}
              <View style={styles.progressStop}>
                {done ? (
                  <TickIcon color={color.muted} size={11} />
                ) : current ? (
                  <DotIcon color={color.ink} size={8} />
                ) : null}
                <Text
                  style={[styles.progressName, current && styles.progressCurrent]}
                  numberOfLines={1}
                >
                  {stop.name}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Quick({ trip, day, focus }: { trip: Trip; day: TripDay | null; focus: TripStop | null }) {
  const { t } = useI18n();
  const share = useShareTrip();
  const chips = [
    focus
      ? {
          key: "food",
          label: t("trip-nearby-food"),
          sub: focus.name,
          run: () => void openFirst(foodLinks(t, trip, focus)),
        }
      : null,
    {
      key: "weather",
      label: t("weather-title"),
      sub: day?.weather
        ? t("trip-weather-short", { sky: skyText(t, day.weather.sky), high: day.weather.high })
        : "",
      run: () => router.push("/weather"),
    },
    { key: "ledger", label: t("ledger-title"), sub: "", run: () => router.push("/ledger") },
    { key: "share", label: t("trip-share-family"), sub: "", run: () => share(trip) },
  ].filter((chip) => chip !== null);
  return (
    <View style={styles.quick}>
      {chips.map((chip) => (
        <Pressable key={chip.key} style={styles.chip} accessibilityRole="button" onPress={chip.run}>
          <Text style={styles.chipLabel} numberOfLines={1}>
            {chip.label}
          </Text>
          {chip.sub ? (
            <Text style={styles.chipSub} numberOfLines={1}>
              {chip.sub}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  loading: { alignItems: "center", justifyContent: "center" },
  muted: { fontSize: 13, color: color.muted },
  flex: { flex: 1, minWidth: 0 },
  map: { overflow: "hidden", backgroundColor: color.mapGround },
  head: { position: "absolute", left: 12, right: 12, flexDirection: "row", gap: 8 },
  float: {
    height: 44,
    minWidth: 44,
    borderRadius: 14,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: color.ink,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  titleBox: { paddingHorizontal: 14, flexShrink: 1 },
  title: { fontSize: 14, fontWeight: "700", color: color.ink },
  scroll: { flex: 1, marginTop: -24 },
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, gap: 10 },
  next: { backgroundColor: color.ink, borderRadius: 20, padding: 16, gap: 12 },
  nextHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  nextLabel: { fontSize: 12, color: dark.textMuted },
  nextName: { fontSize: 22, fontWeight: "700", color: dark.text },
  nextNote: { fontSize: 13, color: dark.textSoft, marginTop: 2 },
  nextLeg: { alignItems: "flex-end" },
  nextMinutes: { fontSize: 20, fontWeight: "700", color: dark.text },
  nextButtons: { flexDirection: "row", gap: 8 },
  nextButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: dark.line,
    alignItems: "center",
    justifyContent: "center",
  },
  nextButtonLight: { backgroundColor: color.surface },
  nextButtonText: { fontSize: 14, color: dark.text },
  nextButtonDarkText: { fontSize: 14, fontWeight: "500", color: color.ink },
  card: {
    backgroundColor: color.surface,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cardTitle: { fontSize: 13, fontWeight: "700", color: color.ink, marginBottom: 8 },
  progress: { flexDirection: "row", alignItems: "center" },
  progressItem: { flexDirection: "row", alignItems: "center", flexShrink: 1, flexGrow: 1 },
  progressFirst: { flexGrow: 0 },
  progressLine: { flex: 1, minWidth: 10, height: 2, marginHorizontal: 6 },
  progressStop: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1 },
  progressName: { fontSize: 12, color: color.muted, flexShrink: 1 },
  progressCurrent: { color: color.ink, fontWeight: "700" },
  quick: { flexDirection: "row", gap: 8 },
  chip: {
    flex: 1,
    minWidth: 0,
    height: 56,
    borderRadius: 14,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 4,
  },
  chipLabel: { fontSize: 12, color: color.ink },
  chipSub: { fontSize: 11, color: color.muted },
  reply: { marginHorizontal: 16, marginBottom: 8 },
});
