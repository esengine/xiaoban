import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { WeatherPlace, WeatherReport, WeatherRules, WeatherView } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { TempBar } from "./Gradient.tsx";
import { SkyIcon, TipIcon } from "./LifeIcons.tsx";
import {
  Card,
  CardHead,
  DarkButton,
  HeaderLink,
  LifeHeader,
  life,
  Sheet,
  SheetAction,
  Toggle,
} from "./LifeUI.tsx";
import { useSky } from "./useSky.ts";

function placeName(place: WeatherPlace) {
  const where = place.district || place.city;
  return !place.label || place.label === where ? where : `${place.label} · ${where}`;
}

function whereOf(place: WeatherPlace) {
  return [place.city, place.district].filter(Boolean).join(" ");
}

function aqiLevel(aqi: number) {
  if (aqi <= 50) return ["weather-aqi-1", "good"] as const;
  if (aqi <= 100) return ["weather-aqi-2", "good"] as const;
  if (aqi <= 150) return ["weather-aqi-3", "fair"] as const;
  if (aqi <= 200) return ["weather-aqi-4", "bad"] as const;
  if (aqi <= 300) return ["weather-aqi-5", "bad"] as const;
  return ["weather-aqi-6", "bad"] as const;
}

function Hero({ report }: { report: WeatherReport }) {
  const { t } = useI18n();
  const sky = useSky();
  const now = report.now;
  const today = report.days[0];
  const level = now.aqi !== null ? aqiLevel(now.aqi) : null;
  const tone =
    level?.[1] === "good"
      ? { color: color.success, backgroundColor: color.successSoft }
      : level?.[1] === "fair"
        ? { color: color.attentionInk, backgroundColor: color.attentionSoft }
        : { color: color.dangerInk, backgroundColor: color.dangerSoft };
  return (
    <Card style={styles.hero}>
      <SkyIcon sky={now.sky} size={48} />
      <View style={life.flex}>
        <Text style={styles.temp}>{t("weather-degrees", { value: String(now.temp) })}</Text>
        <Text style={styles.heroLine}>
          {[
            t("weather-now-line", { sky: sky(now.sky), feels: String(now.feels) }),
            today ? t("weather-range", { low: String(today.low), high: String(today.high) }) : "",
          ]
            .filter(Boolean)
            .join(t("daily-dot"))}
        </Text>
      </View>
      <View style={styles.heroSide}>
        {level && now.aqi !== null ? (
          <Text style={[styles.aqi, tone]}>
            {t("weather-air-tag", { level: t(level[0]), value: String(now.aqi) })}
          </Text>
        ) : null}
        {now.sunset ? (
          <Text style={life.note}>{t("weather-sunset", { time: now.sunset })}</Text>
        ) : null}
      </View>
    </Card>
  );
}

function Hours({ report }: { report: WeatherReport }) {
  const { t } = useI18n();
  if (report.hours.length === 0) return null;
  return (
    <Card>
      <CardHead title={t("weather-hours")}>
        <Text style={life.note}>{t("weather-hours-swipe")}</Text>
      </CardHead>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.hours}>
          {report.hours.map((hour, index) => (
            <View key={hour.at} style={styles.hour}>
              <Text style={life.note}>
                {index === 0
                  ? t("weather-now")
                  : t("weather-hour-short", { hour: String(hour.hour) })}
              </Text>
              <SkyIcon sky={hour.sky} />
              <Text style={styles.hourTemp}>
                {t("weather-degrees", { value: String(hour.temp) })}
              </Text>
              <Text style={styles.rain}>{t("weather-percent", { value: String(hour.rain) })}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </Card>
  );
}

function Tips({ report }: { report: WeatherReport }) {
  const { t } = useI18n();
  if (report.tips.length === 0) return null;
  return (
    <Card style={styles.tips}>
      <CardHead title={t("weather-tips")} />
      {report.tips.map((tip) => (
        <View key={tip.title} style={styles.tip}>
          <TipIcon kind={tip.kind} />
          <Text style={styles.tipText}>{tip.title}</Text>
        </View>
      ))}
    </Card>
  );
}

function Days({ report }: { report: WeatherReport }) {
  const { t, locale } = useI18n();
  if (report.days.length === 0) return null;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const low = Math.min(...report.days.map((day) => day.low));
  const high = Math.max(...report.days.map((day) => day.high));
  const span = Math.max(1, high - low);
  return (
    <Card style={styles.days}>
      <CardHead title={t("weather-days")} />
      {report.days.map((day, index) => {
        const [year, month, date] = day.date.split("-").map(Number);
        return (
          <View key={day.date} style={[styles.day, index > 0 && styles.dayLine]}>
            <Text style={styles.dayName}>
              {index === 0
                ? t("weather-today")
                : weekday.format(new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1))}
            </Text>
            <SkyIcon sky={day.sky} size={16} />
            <Text style={[styles.rain, styles.dayRain]}>
              {day.rain >= 20 ? t("weather-percent", { value: String(day.rain) }) : ""}
            </Text>
            <Text style={styles.dayLow}>{t("weather-degrees", { value: String(day.low) })}</Text>
            <TempBar
              left={((day.low - low) / span) * 100}
              width={Math.max(4, ((day.high - day.low) / span) * 100)}
            />
            <Text style={styles.dayHigh}>{t("weather-degrees", { value: String(day.high) })}</Text>
          </View>
        );
      })}
    </Card>
  );
}

function TimeField({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
    const hour = Number(match?.[1]);
    const minute = Number(match?.[2]);
    if (match && hour < 24 && minute < 60)
      onChange(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
    else setText(value);
  };
  return (
    <TextInput
      style={styles.time}
      value={text}
      accessibilityLabel={label}
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      onChangeText={setText}
      onBlur={commit}
      onSubmitEditing={commit}
    />
  );
}

function RulesSheet({
  store,
  view,
  open,
  onClose,
}: {
  store: HubStore;
  view: WeatherView;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const rules = view.rules;
  const set = (next: Partial<WeatherRules>) =>
    void store.setWeatherRules({ ...rules, ...next }).catch(() => undefined);
  const fixed = rules.fixed || !view.presence;
  const rows: [keyof WeatherRules, string, string][] = [
    [
      "today",
      t("weather-rule-today"),
      fixed ? t("weather-rule-today-fixed") : t("weather-rule-today-note"),
    ],
    [
      "rain",
      t("weather-rule-rain"),
      fixed ? t("weather-rule-rain-fixed") : t("weather-rule-rain-note"),
    ],
    [
      "cold",
      t("weather-rule-cold"),
      fixed ? t("weather-rule-cold-fixed") : t("weather-rule-cold-note"),
    ],
    ["air", t("weather-rule-air"), t("weather-rule-air-note")],
  ];
  return (
    <Sheet open={open} onClose={onClose}>
      <Text style={life.sheetTitle}>{t("weather-rules")}</Text>
      <ScrollView style={styles.sheetScroll}>
        {rows.map(([key, title, note], index) => (
          <View key={key} style={[styles.rule, index > 0 && styles.dayLine]}>
            <View style={life.flex}>
              <Text style={styles.ruleTitle}>{title}</Text>
              <Text style={styles.ruleNote}>{note}</Text>
              {fixed && key === "today" && rules.today ? (
                <TimeField
                  value={rules.todayTime}
                  label={title}
                  onChange={(todayTime) => set({ todayTime })}
                />
              ) : null}
              {fixed && key === "cold" && rules.cold ? (
                <TimeField
                  value={rules.coldTime}
                  label={title}
                  onChange={(coldTime) => set({ coldTime })}
                />
              ) : null}
            </View>
            <Toggle on={Boolean(rules[key])} label={title} onChange={(on) => set({ [key]: on })} />
          </View>
        ))}
        <View style={styles.rhythm}>
          {!view.presence ? (
            <Text style={styles.rhythmText}>{t("weather-rhythm-unsupported")}</Text>
          ) : rules.fixed ? (
            <Text style={styles.rhythmText}>
              {t("weather-rhythm-fixed")}{" "}
              <Text style={life.link} onPress={() => set({ fixed: false })}>
                {t("weather-rhythm-follow")}
              </Text>
            </Text>
          ) : (
            <Text style={styles.rhythmText}>
              {view.rhythm
                ? t("weather-rhythm", { start: view.rhythm.start, end: view.rhythm.end })
                : t("weather-rhythm-learning")}{" "}
              <Text style={life.link} onPress={() => set({ fixed: true })}>
                {t("weather-rhythm-make-fixed")}
              </Text>
            </Text>
          )}
        </View>
      </ScrollView>
    </Sheet>
  );
}

function PlaceSearch({
  store,
  offerHere,
  onPick,
}: {
  store: HubStore;
  offerHere: boolean;
  onPick: (place: WeatherPlace) => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<WeatherPlace[]>([]);
  const [here, setHere] = useState<WeatherPlace | null>(null);

  useEffect(() => {
    if (!offerHere) return;
    let live = true;
    void store
      .locatePlace()
      .then((place) => live && setHere(place))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, offerHere]);

  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setFound([]);
      return;
    }
    const timer = setTimeout(() => {
      void store
        .searchPlaces(value)
        .then(setFound)
        .catch(() => undefined);
    }, 500);
    return () => clearTimeout(timer);
  }, [store, query]);

  return (
    <>
      {here ? (
        <Pressable style={styles.found} onPress={() => onPick(here)}>
          <Text style={styles.foundName}>{t("weather-use-here")}</Text>
          <Text style={life.note}>{whereOf(here)}</Text>
        </Pressable>
      ) : null}
      <TextInput
        style={[life.input, styles.searchInput]}
        value={query}
        placeholder={t("weather-place-placeholder")}
        placeholderTextColor={color.faint}
        onChangeText={setQuery}
      />
      {found.map((item) => (
        <Pressable key={item.id} style={styles.found} onPress={() => onPick(item)}>
          <Text style={styles.foundName}>{item.district || item.city}</Text>
          <Text style={life.note}>{item.region}</Text>
        </Pressable>
      ))}
    </>
  );
}

function AddPlaceSheet({
  store,
  open,
  onClose,
}: {
  store: HubStore;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<WeatherPlace | null>(null);
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setLabel("");
    }
  }, [open]);
  const add = () => {
    if (!picked) return;
    void store
      .addPlace({ ...picked, label: label.trim() })
      .then(() => store.loadWeather(picked.id))
      .catch(() => undefined);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <Text style={life.sheetTitle}>{t("weather-add")}</Text>
      {picked ? (
        <>
          <Text style={styles.foundName}>{whereOf(picked)}</Text>
          <View style={life.fieldRow}>
            <Text style={life.fieldLabel}>{t("weather-add-label")}</Text>
            <TextInput
              style={life.input}
              value={label}
              returnKeyType="done"
              onChangeText={setLabel}
              onSubmitEditing={add}
            />
          </View>
          <DarkButton label={t("weather-add-go")} onPress={add} style={styles.wide} />
        </>
      ) : (
        <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
          <PlaceSearch
            store={store}
            offerHere
            onPick={(place) => {
              setPicked(place);
              setLabel(place.district || place.city);
            }}
          />
        </ScrollView>
      )}
      <Text style={life.hint}>{t("weather-add-note")}</Text>
    </Sheet>
  );
}

function PlaceMenuSheet({
  store,
  place,
  home,
  onClose,
}: {
  store: HubStore;
  place: WeatherPlace | null;
  home: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [label, setLabel] = useState("");
  const [moving, setMoving] = useState(false);
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    setLabel(place?.label ?? "");
    setMoving(false);
  }, [place]);
  if (!place)
    return (
      <Sheet open={false} onClose={onClose}>
        {null}
      </Sheet>
    );
  const saveLabel = () => {
    if (label.trim() && label.trim() !== place.label)
      void store.updatePlace(place.id, label.trim(), null).catch(() => undefined);
  };
  const move = (next: WeatherPlace) => {
    void store.updatePlace(place.id, null, next).catch(() => undefined);
    onClose();
  };
  const close = () => {
    saveLabel();
    onClose();
  };
  return (
    <Sheet open onClose={close}>
      <Text style={life.sheetTitle}>{placeName(place)}</Text>
      <View style={life.fieldRow}>
        <Text style={life.fieldLabel}>{t("weather-menu-name")}</Text>
        <TextInput
          style={life.input}
          value={label}
          returnKeyType="done"
          onChangeText={setLabel}
          onBlur={saveLabel}
          onSubmitEditing={saveLabel}
        />
      </View>
      <View style={styles.whereRow}>
        <Text style={life.fieldLabel}>{t("weather-menu-where")}</Text>
        <View style={life.flex}>
          <Text style={styles.whereText}>{whereOf(place)}</Text>
          <Text style={life.note}>
            {place.located ? t("weather-menu-located") : t("weather-menu-searched")}
          </Text>
        </View>
      </View>
      {moving ? (
        <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
          <PlaceSearch store={store} offerHere={false} onPick={move} />
        </ScrollView>
      ) : (
        <View>
          <SheetAction label={t("weather-menu-move")} onPress={() => setMoving(true)} />
          {home ? (
            <SheetAction
              label={t("weather-menu-here")}
              disabled={locating}
              onPress={() => {
                setLocating(true);
                void store
                  .locatePlace()
                  .then((next) => next && move(next))
                  .catch(() => undefined)
                  .finally(() => setLocating(false));
              }}
            />
          ) : (
            <SheetAction
              label={t("weather-menu-make-home")}
              onPress={() => {
                void store.setHomePlace(place.id).catch(() => undefined);
                close();
              }}
            />
          )}
          <SheetAction
            label={t("weather-menu-remove")}
            danger
            onPress={() => {
              void store
                .removePlace(place.id)
                .then(() => store.loadWeather())
                .catch(() => undefined);
              onClose();
            }}
          />
        </View>
      )}
    </Sheet>
  );
}

function NoPlace({ store }: { store: HubStore }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const typed = async () => {
    const value = query.trim();
    if (!value) return;
    setBusy(true);
    const first = (await store.searchPlaces(value).catch(() => []))[0];
    if (first) await store.addPlace({ ...first, label: "" }).catch(() => undefined);
    else setFailed(true);
    setBusy(false);
  };
  return (
    <Card>
      <CardHead title={t("weather-title")} />
      <Text style={life.hint}>{failed ? t("weather-none-failed") : t("weather-none")}</Text>
      <DarkButton
        label={t("weather-locate")}
        disabled={busy}
        style={styles.noneButton}
        onPress={() => {
          setBusy(true);
          void store
            .locateWeather()
            .catch(() => setFailed(true))
            .finally(() => setBusy(false));
        }}
      />
      <TextInput
        style={[life.input, styles.searchInput]}
        value={query}
        placeholder={t("weather-city-placeholder")}
        placeholderTextColor={color.faint}
        returnKeyType="search"
        onChangeText={setQuery}
        onSubmitEditing={() => void typed()}
      />
    </Card>
  );
}

export function WeatherScreen({ store }: { store: HubStore }) {
  const { t } = useI18n();
  const { weather, status } = useHubState(store);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<WeatherPlace | null>(null);

  useEffect(() => {
    if (status === "open") void store.loadWeather().catch(() => undefined);
  }, [store, status]);

  const report = weather?.report ?? null;
  const places = weather?.places ?? [];

  return (
    <>
      <LifeHeader
        title={t("weather-title")}
        right={
          weather && places.length > 0 ? (
            <HeaderLink label={t("weather-rules-link")} onPress={() => setRulesOpen(true)} />
          ) : null
        }
      />
      {places.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.placesScroll}
          contentContainerStyle={styles.places}
        >
          {places.map((place) => {
            const on = weather?.placeId === place.id;
            return (
              <Pressable
                key={place.id}
                style={[styles.place, on && styles.placeOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                delayLongPress={350}
                onPress={() => void store.loadWeather(place.id).catch(() => undefined)}
                onLongPress={() => setMenu(place)}
              >
                <Text style={[styles.placeText, on && styles.placeTextOn]}>{placeName(place)}</Text>
              </Pressable>
            );
          })}
          {places.length < 5 ? (
            <Pressable
              style={styles.place}
              accessibilityRole="button"
              accessibilityLabel={t("weather-add")}
              onPress={() => setAdding(true)}
            >
              <Text style={styles.placeText}>{t("weather-add-short")}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      ) : null}
      <ScrollView style={life.scroll} contentContainerStyle={styles.body}>
        {weather && places.length === 0 ? (
          <NoPlace store={store} />
        ) : weather?.failed ? (
          <Text style={life.hint}>{t("weather-failed")}</Text>
        ) : report ? (
          <>
            <Hero report={report} />
            <Hours report={report} />
            <Tips report={report} />
            <Days report={report} />
          </>
        ) : weather ? (
          <Text style={life.hint}>{t("weather-loading")}</Text>
        ) : null}
      </ScrollView>
      {weather ? (
        <RulesSheet
          store={store}
          view={weather}
          open={rulesOpen}
          onClose={() => setRulesOpen(false)}
        />
      ) : null}
      <AddPlaceSheet store={store} open={adding} onClose={() => setAdding(false)} />
      <PlaceMenuSheet
        store={store}
        place={menu}
        home={places[0]?.id === menu?.id}
        onClose={() => setMenu(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 24, gap: 10 },
  wide: { height: 46, borderRadius: 12 },
  placesScroll: { flexGrow: 0 },
  places: { gap: 6, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 10 },
  place: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: color.surface,
  },
  placeOn: { backgroundColor: color.ink },
  placeText: { fontSize: 13, color: color.inkMid },
  placeTextOn: { color: color.surface },
  hero: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16 },
  temp: { fontSize: 40, fontWeight: "700", lineHeight: 44, color: color.ink },
  heroLine: { fontSize: 12, color: color.faint, marginTop: 4 },
  heroSide: { alignItems: "flex-end", gap: 4 },
  aqi: {
    fontSize: 11,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
  hours: { flexDirection: "row", gap: 2 },
  hour: { width: 42, alignItems: "center", gap: 4 },
  hourTemp: { fontSize: 12, fontWeight: "700", color: color.ink },
  rain: { fontSize: 11, color: color.rain },
  tips: { gap: 8 },
  tip: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  tipText: { flex: 1, fontSize: 13, color: color.ink, lineHeight: 18 },
  days: { gap: 0 },
  day: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  dayLine: { borderTopWidth: 1, borderTopColor: color.lineSoft },
  dayName: { width: 34, fontSize: 13, color: color.ink },
  dayRain: { width: 30 },
  dayLow: { width: 26, textAlign: "right", fontSize: 13, color: color.faint },
  dayHigh: { width: 26, fontSize: 13, color: color.ink },
  sheetScroll: { flexGrow: 0 },
  rule: { flexDirection: "row", gap: 10, paddingVertical: 10 },
  ruleTitle: { fontSize: 14, color: color.ink },
  ruleNote: { fontSize: 12, color: color.faint, marginTop: 2, lineHeight: 18 },
  time: {
    alignSelf: "flex-start",
    marginTop: 6,
    height: 34,
    minWidth: 72,
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: color.ink,
  },
  rhythm: {
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: color.ground,
  },
  rhythmText: { fontSize: 12, lineHeight: 18, color: color.inkMid },
  whereRow: { flexDirection: "row", gap: 10 },
  whereText: { fontSize: 14, color: color.ink },
  found: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: color.lineSoft,
    gap: 2,
  },
  foundName: { fontSize: 14, color: color.ink },
  searchInput: { flex: 0, marginVertical: 6, borderColor: color.lineStrong },
  noneButton: { alignSelf: "flex-start" },
});
