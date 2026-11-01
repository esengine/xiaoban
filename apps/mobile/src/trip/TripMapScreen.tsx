import {
  foodLinks,
  goLinks,
  type HubStore,
  legText,
  monthDay,
  placeLinks,
  skyText,
  todayIndex,
  tripClock,
} from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Trip, TripDay } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line } from "react-native-svg";
import { ConfirmCard } from "../chat/ConfirmCard.tsx";
import { ChatBar, goBack } from "../life/LifeUI.tsx";
import { Icon } from "../ui/Icon.tsx";
import { useKeyboard } from "../ui/useKeyboard.ts";
import { ReplyCard } from "./ReplyCard.tsx";
import { TripCostView } from "./TripCostView.tsx";
import { ChevronIcon, NavigateIcon, OutIcon, ShareIcon } from "./TripIcons.tsx";
import { TripMap } from "./TripMap.tsx";
import {
  dayInk,
  openFirst,
  openLink,
  useNow,
  useShareTrip,
  useTrip,
  useTripSay,
} from "./useTrip.ts";

type Snap = "low" | "half" | "full";
type Tab = "route" | "cost";

const BUTTON = 44;

export function TripMapScreen({
  store,
  tripId,
  version,
}: {
  store: HubStore;
  tripId: string;
  version: number | null;
}) {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const state = useHubState(store);
  const trip = useTrip(store, tripId, version);
  const [day, setDay] = useState(0);
  const [selected, setSelected] = useState(0);
  const [snap, setSnap] = useState<Snap>("half");
  const [tab, setTab] = useState<Tab>("route");
  const keyboard = useKeyboard();
  const now = useNow();
  const share = useShareTrip();
  const opened = useRef(false);
  const dayIndex = trip ? Math.max(0, Math.min(day, trip.days.length - 1)) : 0;
  const { say, reply, busy, dismiss } = useTripSay(store, trip, dayIndex);

  const clock = trip ? tripClock(trip, now) : null;
  const today = trip && clock ? todayIndex(trip, clock) : -1;
  const latest = trip ? (state.latestTrip[trip.id] ?? trip.version) : 0;
  const old = trip ? trip.version < latest : false;
  const live = !old && today >= 0;

  useEffect(() => {
    if (!trip || opened.current) return;
    opened.current = true;
    if (today >= 0) setDay(today);
  }, [trip, today]);

  const headerBottom = insets.top + 8 + BUTTON;
  const low = 190 + Math.max(insets.bottom, 14);
  const half = Math.max(low + 140, Math.round(window.height * 0.56));
  const full = Math.max(half, window.height - headerBottom - 12);
  const heights = { low, half, full };
  const target = keyboard.height > 0 ? low : heights[snap];

  const sheet = useRef(new Animated.Value(target)).current;
  const current = useRef(target);
  const start = useRef(target);
  const limits = useRef(heights);
  limits.current = heights;

  useEffect(() => {
    const id = sheet.addListener(({ value }) => {
      current.current = value;
    });
    return () => sheet.removeListener(id);
  }, [sheet]);

  useEffect(() => {
    Animated.spring(sheet, { toValue: target, useNativeDriver: false, bounciness: 4 }).start();
  }, [sheet, target]);

  const drag = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderGrant: () => {
          sheet.stopAnimation();
          start.current = current.current;
        },
        onPanResponderMove: (_, gesture) => {
          const { low: min, full: max } = limits.current;
          sheet.setValue(Math.max(min, Math.min(max, start.current - gesture.dy)));
        },
        onPanResponderRelease: (_, gesture) => {
          const aim = current.current - gesture.vy * 160;
          const options: Snap[] = ["low", "half", "full"];
          const next = options.reduce((best, option) =>
            Math.abs(limits.current[option] - aim) < Math.abs(limits.current[best] - aim)
              ? option
              : best,
          );
          setSnap(next);
          Animated.spring(sheet, {
            toValue: limits.current[next],
            useNativeDriver: false,
            bounciness: 4,
          }).start();
        },
      }),
    [sheet],
  );

  if (!trip) {
    return (
      <View style={[styles.screen, styles.loading]}>
        <Text style={styles.loadingText}>{t("trip-loading")}</Text>
      </View>
    );
  }

  const tripDay = trip.days[dayIndex];
  const stops = tripDay?.stops ?? [];
  const pick = Math.min(selected, Math.max(0, stops.length - 1));
  const tone = dayInk(dayIndex);
  const liveTop = live ? 52 : 0;
  const area = {
    top: headerBottom + liveTop + 70,
    bottom: window.height - half - 24,
    left: 48,
    right: window.width - 48,
  };
  const facts = trip.party;
  const confirm = state.confirms.find((item) => item.threadId === trip.threadId) ?? null;
  const navigate = () => {
    const stop = stops[pick];
    if (!stop) return;
    void openFirst(goLinks(trip, stop, stops[pick - 1]?.next?.mode ?? "taxi"));
  };
  const savedAt = new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(trip.createdAt);

  return (
    <View style={styles.screen}>
      <TripMap
        stops={stops}
        tone={tone}
        area={area}
        width={window.width}
        height={window.height}
        selected={pick}
        onSelect={setSelected}
      />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.headRow}>
          <Pressable
            style={styles.float}
            accessibilityRole="button"
            accessibilityLabel={t("chat-back")}
            onPress={goBack}
          >
            <Icon name="back" size={20} color={color.ink} />
          </Pressable>
          <View style={[styles.float, styles.titleBox]}>
            <Text style={styles.title} numberOfLines={1}>
              {trip.city
                ? t("trip-map-title", { city: trip.city, days: trip.days.length })
                : trip.title}
            </Text>
            {facts ? (
              <Text style={styles.facts} numberOfLines={1}>
                {facts}
              </Text>
            ) : null}
          </View>
          <Pressable
            style={styles.float}
            accessibilityRole="button"
            accessibilityLabel={t("trip-share-family")}
            onPress={() => share(trip)}
          >
            <ShareIcon color={color.ink} />
          </Pressable>
          <Pressable
            style={[styles.float, styles.floatDark]}
            accessibilityRole="button"
            accessibilityLabel={t("trip-navigate")}
            onPress={navigate}
          >
            <NavigateIcon color={color.surface} />
          </Pressable>
        </View>
        {live ? (
          <Pressable
            style={styles.livePill}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/trip/live/[id]", params: { id: trip.id } })}
          >
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>
              {t("trip-live-title", { day: t("trip-day", { n: today + 1 }) })}
            </Text>
            <ChevronIcon color={color.surface} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.spacer} pointerEvents="none" />
      <Animated.View style={{ height: sheet }}>
        {confirm && !old ? (
          <View style={styles.reply}>
            <ConfirmCard confirm={confirm} />
          </View>
        ) : reply && !old ? (
          <ReplyCard
            reply={reply}
            day={dayIndex}
            threadId={trip.threadId}
            onClose={dismiss}
            style={styles.reply}
          />
        ) : null}
        <View style={styles.sheet}>
          <View {...drag.panHandlers}>
            <Pressable
              style={styles.handle}
              accessibilityRole="button"
              accessibilityLabel={t(snap === "low" ? "trip-sheet-expand" : "trip-sheet-collapse")}
              onPress={() => setSnap(snap === "low" ? "half" : "low")}
            >
              <View style={styles.grabber} />
            </Pressable>
            <View
              style={styles.switch}
              accessibilityRole="tablist"
              accessibilityLabel={t("trip-tabs")}
            >
              {(["route", "cost"] as const).map((item) => (
                <Pressable
                  key={item}
                  style={[styles.switchItem, tab === item && styles.switchOn]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === item }}
                  onPress={() => setTab(item)}
                >
                  <Text style={[styles.switchText, tab === item && styles.switchTextOn]}>
                    {t(item === "route" ? "trip-tab-route" : "trip-tab-cost")}
                  </Text>
                </Pressable>
              ))}
            </View>
            {tab === "route" ? (
              <DayTabs
                trip={trip}
                day={dayIndex}
                onPick={(index) => {
                  setDay(index);
                  setSelected(0);
                }}
              />
            ) : null}
          </View>
          {old ? (
            <View style={styles.old}>
              <Text style={styles.oldText}>{t("trip-old-version", { time: savedAt })}</Text>
              <Pressable
                hitSlop={6}
                onPress={() => router.replace({ pathname: "/trip/[id]", params: { id: trip.id } })}
              >
                <Text style={styles.link}>{t("trip-back-latest")}</Text>
              </Pressable>
            </View>
          ) : null}
          {tab === "cost" ? (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listBody}
              keyboardShouldPersistTaps="handled"
            >
              <TripCostView
                store={store}
                trip={trip}
                readOnly={old}
                busy={busy}
                onSay={(text) => void say(text)}
              />
            </ScrollView>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={styles.listBody}>
              {trip.reminder ? (
                <Text style={styles.reminder}>{t("trip-reminder", { text: trip.reminder })}</Text>
              ) : null}
              {tripDay?.change ? <Text style={styles.change}>{tripDay.change}</Text> : null}
              {tripDay ? (
                <Stops
                  trip={trip}
                  day={tripDay}
                  tone={tone}
                  selected={pick}
                  onSelect={setSelected}
                />
              ) : null}
              {!trip.verified ? <Text style={styles.note}>{t("trip-unverified")}</Text> : null}
            </ScrollView>
          )}
          {old ? null : (
            <ChatBar
              store={store}
              threadId={trip.threadId}
              placeholder={t("trip-say-day-placeholder", {
                day: t("trip-day", { n: dayIndex + 1 }),
              })}
              disabled={busy}
              onSend={say}
            />
          )}
        </View>
      </Animated.View>
    </View>
  );
}

function DayTabs({
  trip,
  day,
  onPick,
}: {
  trip: Trip;
  day: number;
  onPick: (index: number) => void;
}) {
  const { t } = useI18n();
  const fit = trip.days.length <= 3;
  const tabs = trip.days.map((item, index) => {
    const on = index === day;
    const sub = [
      monthDay(t, item.date),
      item.weather
        ? t("trip-weather-short", { sky: skyText(t, item.weather.sky), high: item.weather.high })
        : "",
    ]
      .filter(Boolean)
      .join(t("daily-dot"));
    return (
      <Pressable
        key={item.date}
        style={[styles.tab, fit ? styles.tabFit : styles.tabFixed, on && styles.tabOn]}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => onPick(index)}
      >
        <View style={styles.tabHead}>
          <View style={[styles.tabDot, { backgroundColor: on ? color.surface : dayInk(index) }]} />
          <Text style={[styles.tabLabel, on && styles.tabTextOn]}>
            {t("trip-day", { n: index + 1 })}
          </Text>
        </View>
        <Text style={[styles.tabSub, on && styles.tabTextOn]} numberOfLines={1}>
          {sub}
        </Text>
      </Pressable>
    );
  });
  return fit ? (
    <View style={styles.tabs} accessibilityRole="tablist">
      {tabs}
    </View>
  ) : (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabs}
      accessibilityRole="tablist"
    >
      {tabs}
    </ScrollView>
  );
}

function Stops({
  trip,
  day,
  tone,
  selected,
  onSelect,
}: {
  trip: Trip;
  day: TripDay;
  tone: string;
  selected: number;
  onSelect: (index: number) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {day.stops.map((stop, index) => {
        const on = index === selected;
        const next = day.stops[index + 1];
        return (
          <View key={`${stop.time}-${stop.name}`}>
            <Pressable
              style={[styles.stop, on && styles.stopOn]}
              accessibilityRole="button"
              onPress={() => onSelect(index)}
            >
              <View style={[styles.number, { backgroundColor: on ? color.ink : tone }]}>
                <Text style={styles.numberText}>{index + 1}</Text>
              </View>
              <View style={styles.stopBody}>
                <View style={styles.stopHead}>
                  <Text style={styles.stopName} numberOfLines={1}>
                    {stop.name}
                  </Text>
                  <Text style={styles.stopTime}>{stop.time}</Text>
                </View>
                {stop.note ? <Text style={styles.stopNote}>{stop.note}</Text> : null}
                {on ? (
                  <View style={styles.stopLinks}>
                    <Pressable
                      style={styles.stopLink}
                      hitSlop={6}
                      onPress={() => void openFirst(placeLinks(trip, stop))}
                    >
                      <Text style={styles.link}>{t("trip-open-amap")}</Text>
                      <OutIcon color={color.accent} />
                    </Pressable>
                    <Pressable
                      style={styles.stopLink}
                      hitSlop={6}
                      onPress={() => void openFirst(foodLinks(t, trip, stop))}
                    >
                      <Text style={styles.link}>{t("trip-nearby-food")}</Text>
                      <OutIcon color={color.accent} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </Pressable>
            {next && stop.next ? (
              <Pressable
                style={styles.leg}
                accessibilityRole="button"
                onPress={() => void openFirst(goLinks(trip, next, stop.next?.mode ?? "taxi"))}
              >
                <Svg width={2} height={28} style={styles.legLine}>
                  <Line
                    x1={1}
                    y1={0}
                    x2={1}
                    y2={28}
                    stroke={color.checkOff}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                  />
                </Svg>
                <Text style={styles.legText}>{legText(t, stop.next)}</Text>
                <Text style={styles.legRoute}>{t("trip-route")}</Text>
                <OutIcon color={color.muted} size={10} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

const floatShadow = {
  shadowColor: color.ink,
  shadowOpacity: 0.12,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.mapGround, overflow: "hidden" },
  loading: { alignItems: "center", justifyContent: "center" },
  loadingText: { fontSize: 13, color: color.muted },
  top: { position: "absolute", left: 12, right: 12, top: 0, gap: 8 },
  headRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  float: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: 14,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
    ...floatShadow,
  },
  floatDark: { backgroundColor: color.ink },
  titleBox: {
    flex: 1,
    width: undefined,
    minWidth: 0,
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingHorizontal: 14,
    gap: 8,
  },
  title: { fontSize: 14, fontWeight: "700", color: color.ink, flexShrink: 0 },
  facts: { flex: 1, fontSize: 12, color: color.muted },
  livePill: {
    alignSelf: "flex-start",
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 14,
    backgroundColor: color.ink,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...floatShadow,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accentBright },
  liveText: { fontSize: 13, fontWeight: "500", color: color.surface },
  spacer: { flex: 1 },
  reply: { position: "absolute", left: 14, right: 14, bottom: "100%", marginBottom: 10 },
  sheet: {
    flex: 1,
    backgroundColor: color.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    shadowColor: color.ink,
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
  handle: { height: 24, alignItems: "center", justifyContent: "center" },
  switch: {
    flexDirection: "row",
    gap: 6,
    padding: 3,
    borderRadius: 10,
    backgroundColor: color.ground,
    marginHorizontal: 14,
    marginBottom: 10,
  },
  switchItem: {
    flex: 1,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  switchOn: {
    backgroundColor: color.surface,
    shadowColor: color.ink,
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  switchText: { fontSize: 13, color: color.muted },
  switchTextOn: { color: color.ink, fontWeight: "600" },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: color.lineStrong },
  tabs: { flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingBottom: 10 },
  tab: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    paddingHorizontal: 6,
  },
  tabFit: { flex: 1, minWidth: 0 },
  tabFixed: { width: 112 },
  tabOn: { backgroundColor: color.ink, borderColor: color.ink },
  tabHead: { flexDirection: "row", alignItems: "center", gap: 5 },
  tabDot: { width: 6, height: 6, borderRadius: 3 },
  tabLabel: { fontSize: 13, fontWeight: "700", color: color.ink },
  tabSub: { fontSize: 11, color: color.inkMid },
  tabTextOn: { color: color.surface },
  old: {
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: color.changeSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  oldText: { flex: 1, fontSize: 12, color: color.changeInk },
  list: { flex: 1 },
  listBody: { paddingHorizontal: 14, paddingBottom: 12 },
  reminder: {
    fontSize: 12,
    lineHeight: 18,
    color: color.attentionInk,
    backgroundColor: color.attentionSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    overflow: "hidden",
  },
  change: { fontSize: 12, color: color.accentStrong, marginBottom: 6, paddingHorizontal: 8 },
  note: { fontSize: 11, color: color.faint, marginTop: 10, paddingHorizontal: 8 },
  stop: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    padding: 8,
    borderRadius: 12,
  },
  stopOn: { backgroundColor: color.accentWash },
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { fontSize: 12, fontWeight: "700", color: color.surface },
  stopBody: { flex: 1, minWidth: 0 },
  stopHead: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  stopName: { flex: 1, fontSize: 14, fontWeight: "700", color: color.ink },
  stopTime: { fontSize: 12, color: color.muted },
  stopNote: { fontSize: 12, lineHeight: 17, color: color.inkMid, marginTop: 2 },
  stopLinks: { flexDirection: "row", gap: 16, marginTop: 6 },
  stopLink: { flexDirection: "row", alignItems: "center", gap: 3 },
  link: { fontSize: 12, color: color.accent },
  leg: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 19, paddingRight: 8 },
  legLine: { marginRight: 12 },
  legText: { flex: 1, fontSize: 11, color: color.muted },
  legRoute: { fontSize: 11, color: color.muted },
});
