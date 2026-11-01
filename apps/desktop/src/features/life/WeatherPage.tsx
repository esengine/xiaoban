import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Sky, TipKind, WeatherReport, WeatherRules, WeatherView } from "@xiaoban/protocol";
import { useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { WeatherIcon } from "../trip/icons.tsx";
import { AddPlace, PlaceMenu, placeName } from "./WeatherPlaces.tsx";

const HOUR_WIDTH = 38;
const CHART_HEIGHT = 212;

export function useSkyText() {
  const { t } = useI18n();
  return (sky: Sky) =>
    ({
      clear: t("weather-sky-clear"),
      cloudy: t("weather-sky-cloudy"),
      overcast: t("weather-sky-overcast"),
      fog: t("weather-sky-fog"),
      light_rain: t("weather-sky-light-rain"),
      rain: t("weather-sky-rain"),
      heavy_rain: t("weather-sky-heavy-rain"),
      snow: t("weather-sky-snow"),
      storm: t("weather-sky-storm"),
    })[sky];
}

function aqiLevel(aqi: number) {
  if (aqi <= 50) return ["weather-aqi-1", "good"] as const;
  if (aqi <= 100) return ["weather-aqi-2", "good"] as const;
  if (aqi <= 150) return ["weather-aqi-3", "fair"] as const;
  if (aqi <= 200) return ["weather-aqi-4", "bad"] as const;
  if (aqi <= 300) return ["weather-aqi-5", "bad"] as const;
  return ["weather-aqi-6", "bad"] as const;
}

function uvLevel(uv: number) {
  if (uv <= 2) return "weather-uv-1" as const;
  if (uv <= 5) return "weather-uv-2" as const;
  if (uv <= 7) return "weather-uv-3" as const;
  if (uv <= 10) return "weather-uv-4" as const;
  return "weather-uv-5" as const;
}

export function TipIcon({ kind }: { kind: TipKind }) {
  if (kind === "rain") return <WeatherIcon sky="rain" />;
  if (kind === "sun") return <WeatherIcon sky="clear" />;
  return (
    <svg className="weather-icon weather-icon--cold" aria-hidden="true" viewBox="0 0 24 24">
      {kind === "cold" ? (
        <path d="M12 3v12M8.5 13a3.5 3.5 0 107 0" />
      ) : (
        <path d="M4 9h11a3 3 0 10-3-3M4 15h14a3 3 0 11-3 3" />
      )}
    </svg>
  );
}

function Hero({ report }: { report: WeatherReport }) {
  const { t } = useI18n();
  const skyText = useSkyText();
  const today = report.days[0];
  const now = report.now;
  return (
    <section className="life-card weather-hero">
      <span className="weather-hero__icon">
        <WeatherIcon sky={now.sky} />
      </span>
      <div>
        <b className="weather-hero__temp">{t("weather-degrees", { value: String(now.temp) })}</b>
        <span className="weather-hero__sky">
          {t("weather-now-line", { sky: skyText(now.sky), feels: String(now.feels) })}
        </span>
      </div>
      <span className="weather-hero__rule" />
      <dl className="weather-hero__facts">
        {today && (
          <>
            <dt>{t("weather-today")}</dt>
            <dd>{t("weather-range", { low: String(today.low), high: String(today.high) })}</dd>
          </>
        )}
        {now.aqi !== null && (
          <>
            <dt>{t("weather-air")}</dt>
            <dd>
              <span className="weather-aqi" data-level={aqiLevel(now.aqi)[1]}>
                {t("weather-aqi", { level: t(aqiLevel(now.aqi)[0]), value: String(now.aqi) })}
              </span>
            </dd>
          </>
        )}
        {now.sunrise && (
          <>
            <dt>{t("weather-sun-times")}</dt>
            <dd>{`${now.sunrise} / ${now.sunset}`}</dd>
          </>
        )}
        {now.uv !== null && (
          <>
            <dt>{t("weather-uv")}</dt>
            <dd>{t(uvLevel(now.uv))}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

function Hours({ report }: { report: WeatherReport }) {
  const { t } = useI18n();
  const hours = report.hours;
  if (hours.length === 0) return null;
  const temps = hours.map((hour) => hour.temp);
  const low = Math.min(...temps);
  const high = Math.max(...temps);
  const span = Math.max(1, high - low);
  const y = (temp: number) => 100 - ((temp - low) / span) * 72;
  const x = (index: number) => index * HOUR_WIDTH + HOUR_WIDTH / 2;
  return (
    <section className="life-card">
      <div className="life-card__head">
        <b>{t("weather-hours")}</b>
        <span className="life-card__spacer" />
        <span className="life-card__note">{t("weather-hours-note")}</span>
      </div>
      <div className="weather-hours">
        <svg
          width={hours.length * HOUR_WIDTH}
          height={CHART_HEIGHT}
          role="img"
          aria-label={t("weather-hours")}
        >
          <polyline
            className="weather-hours__line"
            points={hours.map((hour, index) => `${x(index)},${y(hour.temp)}`).join(" ")}
          />
          {hours.map((hour, index) => (
            <g key={hour.at}>
              {index % 2 === 0 && (
                <text
                  className="weather-hours__temp"
                  x={x(index)}
                  y={y(hour.temp) - 8}
                  textAnchor="middle"
                >
                  {t("weather-degrees", { value: String(hour.temp) })}
                </text>
              )}
              <rect
                className="weather-hours__bar"
                x={x(index) - 7}
                y={170 - Math.max(1, hour.rain * 0.5)}
                width={14}
                height={Math.max(1, hour.rain * 0.5)}
                rx={3}
                style={{ opacity: 0.25 + hour.rain / 140 }}
              />
              {hour.rain >= 20 && (
                <text className="weather-hours__rain" x={x(index)} y={186} textAnchor="middle">
                  {t("weather-percent", { value: String(hour.rain) })}
                </text>
              )}
              {index % 2 === 0 && (
                <text className="weather-hours__label" x={x(index)} y={206} textAnchor="middle">
                  {index === 0 ? t("weather-now") : t("weather-hour", { hour: String(hour.hour) })}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}

function Tips({ report }: { report: WeatherReport }) {
  const { t } = useI18n();
  if (report.tips.length === 0) return null;
  return (
    <section className="life-card weather-tips">
      <b>{t("weather-tips")}</b>
      {report.tips.map((tip) => (
        <div key={tip.title} className="weather-tip">
          <TipIcon kind={tip.kind} />
          <div>
            <span className="weather-tip__title">{tip.title}</span>
            <span className="life-card__note">{tip.detail}</span>
          </div>
        </div>
      ))}
    </section>
  );
}

function Days({ report }: { report: WeatherReport }) {
  const { t, locale } = useI18n();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const low = Math.min(...report.days.map((day) => day.low));
  const high = Math.max(...report.days.map((day) => day.high));
  const span = Math.max(1, high - low);
  return (
    <section className="life-card weather-days">
      <b>{t("weather-days")}</b>
      {report.days.map((day, index) => {
        const [year, month, date] = day.date.split("-").map(Number);
        return (
          <div key={day.date} className="weather-day">
            <span className="weather-day__name">
              {index === 0
                ? t("weather-today")
                : weekday.format(new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1))}
            </span>
            <WeatherIcon sky={day.sky} />
            <span className="weather-day__rain">
              {day.rain >= 20 ? t("weather-percent", { value: String(day.rain) }) : ""}
            </span>
            <span className="weather-day__low">
              {t("weather-degrees", { value: String(day.low) })}
            </span>
            <span className="weather-day__bar">
              <span
                style={{
                  left: `${((day.low - low) / span) * 100}%`,
                  width: `${Math.max(4, ((day.high - day.low) / span) * 100)}%`,
                }}
              />
            </span>
            <span className="weather-day__high">
              {t("weather-degrees", { value: String(day.high) })}
            </span>
          </div>
        );
      })}
    </section>
  );
}

function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="weather-switch"
      onClick={() => onChange(!on)}
    >
      <span />
    </button>
  );
}

function Rules({ view }: { view: WeatherView }) {
  const { t } = useI18n();
  const store = useHub();
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
    <section className="life-card weather-rules">
      <b>{t("weather-rules")}</b>
      {rows.map(([key, title, note]) => (
        <div key={key} className="weather-rule">
          <div>
            <span className="weather-rule__title">{title}</span>
            <span className="life-card__note">{note}</span>
            {fixed && key === "today" && rules.today && (
              <input
                className="weather-rule__time"
                type="time"
                value={rules.todayTime}
                aria-label={title}
                onChange={(event) => set({ todayTime: event.target.value })}
              />
            )}
            {fixed && key === "cold" && rules.cold && (
              <input
                className="weather-rule__time"
                type="time"
                value={rules.coldTime}
                aria-label={title}
                onChange={(event) => set({ coldTime: event.target.value })}
              />
            )}
          </div>
          <Toggle on={Boolean(rules[key])} label={title} onChange={(on) => set({ [key]: on })} />
        </div>
      ))}
      <div className="weather-rhythm">
        {!view.presence ? (
          <span>{t("weather-rhythm-unsupported")}</span>
        ) : rules.fixed ? (
          <>
            <span>{t("weather-rhythm-fixed")}</span>
            <button type="button" className="code-link" onClick={() => set({ fixed: false })}>
              {t("weather-rhythm-follow")}
            </button>
          </>
        ) : (
          <>
            <span>
              {view.rhythm
                ? t("weather-rhythm", { start: view.rhythm.start, end: view.rhythm.end })
                : t("weather-rhythm-learning")}
            </span>
            <button type="button" className="code-link" onClick={() => set({ fixed: true })}>
              {t("weather-rhythm-make-fixed")}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

export function NoPlace({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const store = useHub();
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
    <section className="life-card weather-none" data-compact={compact || undefined}>
      <b>{t("weather-title")}</b>
      <p>{failed ? t("weather-none-failed") : t("weather-none")}</p>
      <div className="weather-none__actions">
        <button
          type="button"
          className="code-status-button"
          data-dark
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void store
              .locateWeather()
              .catch(() => setFailed(true))
              .finally(() => setBusy(false));
          }}
        >
          {t("weather-locate")}
        </button>
        <input
          value={query}
          placeholder={t("weather-city-placeholder")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) void typed();
          }}
        />
      </div>
    </section>
  );
}

export function WeatherPage({ onBack }: { onBack: () => void }) {
  const { t, locale } = useI18n();
  const store = useHub();
  const { weather } = useHubState(store);
  const [adding, setAdding] = useState<HTMLElement | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);

  useEffect(() => {
    void store.loadWeather().catch(() => undefined);
  }, [store]);

  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const report = weather?.report ?? null;

  return (
    <main className="life-page weather">
      <header className="life-top">
        <button type="button" className="code-link life-top__back" onClick={onBack}>
          {t("kitchen-back")}
        </button>
        <b className="life-top__title">{t("weather-title")}</b>
        {weather && weather.places.length > 0 && (
          <span className="life-top__tabs" role="tablist">
            {weather.places.map((place) => (
              <button
                key={place.id}
                type="button"
                role="tab"
                className="code-tab"
                aria-selected={weather.placeId === place.id}
                onClick={(event) => {
                  if (weather.placeId === place.id) setMenu(menu ? null : event.currentTarget);
                  else void store.loadWeather(place.id).catch(() => undefined);
                }}
              >
                {weather.placeId === place.id
                  ? t("weather-place-active", { name: placeName(place) })
                  : placeName(place)}
              </button>
            ))}
            {weather.places.length < 5 && (
              <button
                type="button"
                className="code-tab"
                onClick={(event) => setAdding(adding ? null : event.currentTarget)}
              >
                {t("weather-add-tab")}
              </button>
            )}
          </span>
        )}
        <span className="life-card__spacer" />
        {report && (
          <span className="life-card__note">
            {t("weather-updated", { time: time.format(new Date(report.updatedAt)) })}
          </span>
        )}
      </header>
      <div className="weather__body">
        {weather && weather.places.length === 0 ? (
          <div className="weather__none">
            <NoPlace />
          </div>
        ) : weather?.failed ? (
          <p className="life-card__hint">{t("weather-failed")}</p>
        ) : report ? (
          <div className="weather__grid">
            <div className="weather__main">
              <Hero report={report} />
              <Hours report={report} />
              <Tips report={report} />
            </div>
            <div className="weather__side">
              <Days report={report} />
              {weather && <Rules view={weather} />}
            </div>
          </div>
        ) : null}
      </div>
      {adding && <AddPlace anchor={adding} onClose={() => setAdding(null)} />}
      {menu &&
        weather?.places
          .filter((place) => place.id === weather.placeId)
          .map((place) => (
            <PlaceMenu
              key={place.id}
              anchor={menu}
              place={place}
              home={weather.places[0]?.id === place.id}
              onClose={() => setMenu(null)}
            />
          ))}
    </main>
  );
}
