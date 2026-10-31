import type { PlainMessageKey, Translator } from "@xiaoban/i18n";
import type {
  DayWeather,
  Sky,
  TravelMode,
  Trip,
  TripDay,
  TripLeg,
  TripStop,
} from "@xiaoban/protocol";

type T = Translator["t"];

export const DAY_COLORS = [
  "var(--color-accent)",
  "var(--color-trip-green)",
  "var(--color-trip-purple)",
  "var(--color-trip-rust)",
  "var(--color-trip-teal)",
] as const;

export const dayColor = (index: number): string =>
  DAY_COLORS[index % DAY_COLORS.length] ?? DAY_COLORS[0];

const WEEKDAYS: readonly PlainMessageKey[] = [
  "trip-weekday-0",
  "trip-weekday-1",
  "trip-weekday-2",
  "trip-weekday-3",
  "trip-weekday-4",
  "trip-weekday-5",
  "trip-weekday-6",
];

const SKIES: Record<Sky, PlainMessageKey> = {
  clear: "trip-sky-clear",
  cloudy: "trip-sky-cloudy",
  overcast: "trip-sky-overcast",
  fog: "trip-sky-fog",
  light_rain: "trip-sky-light_rain",
  rain: "trip-sky-rain",
  heavy_rain: "trip-sky-heavy_rain",
  snow: "trip-sky-snow",
  storm: "trip-sky-storm",
};

const MODES: Record<TravelMode, PlainMessageKey> = {
  walk: "trip-mode-walk",
  taxi: "trip-mode-taxi",
  transit: "trip-mode-transit",
};

const WET: ReadonlySet<Sky> = new Set(["light_rain", "rain", "heavy_rain", "snow", "storm"]);
const MAX_STOPS = 4;

function parseDate(date: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function monthDay(t: T, date: string): string {
  const parsed = parseDate(date);
  if (!parsed) return date;
  return t("trip-month-day", { month: parsed.getMonth() + 1, day: parsed.getDate() });
}

export function weekday(t: T, date: string): string {
  const parsed = parseDate(date);
  const key = parsed ? WEEKDAYS[parsed.getDay()] : undefined;
  return key ? t(key) : "";
}

export function range(t: T, trip: Trip): string {
  const first = trip.days[0]?.date;
  const last = trip.days.at(-1)?.date;
  if (!first || !last) return "";
  if (first === last) return monthDay(t, first);
  const to = parseDate(last);
  const from = parseDate(first);
  const sameMonth = from && to && from.getMonth() === to.getMonth();
  return t("trip-range", {
    from: monthDay(t, first),
    to: sameMonth && to ? String(to.getDate()) : monthDay(t, last),
  });
}

export function weatherText(t: T, weather: DayWeather): string {
  const sky = t(SKIES[weather.sky]);
  if (WET.has(weather.sky) && weather.rainChance !== null) {
    return t("trip-weather-rain", { sky, chance: weather.rainChance });
  }
  return t("trip-weather-range", { sky, low: weather.low, high: weather.high });
}

export const isWet = (weather: DayWeather): boolean => WET.has(weather.sky);

export function stopsText(t: T, day: TripDay): string {
  const names = day.stops.map((stop) => stop.name);
  const shown = names.slice(0, MAX_STOPS).join(t("trip-stops-joiner"));
  return names.length > MAX_STOPS
    ? t("trip-stops-more", { stops: shown, count: names.length })
    : shown;
}

export function legText(t: T, leg: TripLeg): string {
  const mode = t(MODES[leg.mode]);
  return leg.estimated
    ? t("trip-leg-estimated", { minutes: leg.minutes, mode })
    : t("trip-leg", { mode, minutes: leg.minutes });
}

export const stopCount = (trip: Trip): number =>
  trip.days.reduce((total, day) => total + day.stops.length, 0);

const AMAP = "https://uri.amap.com";

function amapUrl(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams({ ...params, callnative: "1", src: "xiaoban" });
  return `${AMAP}/${path}?${query.toString()}`;
}

export const amapPlace = (trip: Trip, stop: TripStop): string =>
  amapUrl("search", { keyword: stop.name, city: trip.city });

export const amapFood = (t: T, trip: Trip, stop: TripStop): string =>
  amapUrl("search", { keyword: t("trip-amap-food", { place: stop.name }), city: trip.city });

const AMAP_MODES: Record<TravelMode, string> = { walk: "walk", taxi: "car", transit: "bus" };

export function amapRoute(trip: Trip, from: TripStop, to: TripStop): string {
  if (from.location && to.location) {
    const point = (stop: TripStop) => `${stop.location?.lng},${stop.location?.lat},${stop.name}`;
    return amapUrl("navigation", {
      from: point(from),
      to: point(to),
      mode: AMAP_MODES[from.next?.mode ?? "taxi"],
    });
  }
  return amapPlace(trip, to);
}

export function familyText(t: T, trip: Trip): string {
  const lines = [`${trip.title} · ${range(t, trip)}`];
  trip.days.forEach((day, index) => {
    lines.push(
      "",
      `${t("trip-day", { n: index + 1 })} ${weekday(t, day.date)} ${monthDay(t, day.date)}`,
    );
    for (const stop of day.stops) {
      lines.push(t("trip-copy-stop", { time: stop.time, name: stop.name, note: stop.note }));
    }
  });
  lines.push("", t("trip-copy-footer"));
  return lines.join("\n");
}
