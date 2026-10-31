import { invoke, isTauri } from "@tauri-apps/api/core";
import { draftsForThread, useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Trip, TripDay } from "@xiaoban/protocol";
import { type FormEvent, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { openExternal } from "../../lib/external.ts";
import {
  amapFood,
  amapPlace,
  amapRoute,
  dayColor,
  familyText,
  legText,
  monthDay,
  range,
  weatherText,
  weekday,
} from "./format.ts";
import { CalendarIcon, CopyIcon, OutIcon, WeatherIcon } from "./icons.tsx";
import { PlaceDetail, type StopRef } from "./PlaceDetail.tsx";
import { useTrip } from "./TripCard.tsx";
import { useToast } from "./useToast.tsx";

type CalendarOutcome = { added: number } | { handed: number } | "denied" | "failed";

const CALENDAR_APP = "ical://";
const CALENDAR_SETTINGS =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars";

interface Props {
  tripId: string;
  version: number | null;
  threadId: string;
  threadTitle: string;
  onBack: () => void;
  onLatest: () => void;
}

export function TripWorkbench(props: Props) {
  const { t, locale } = useI18n();
  const store = useHub();
  const state = useHubState(store);
  const trip = useTrip(props.tripId, props.version);
  const latest = state.latestTrip[props.tripId] ?? trip?.version ?? 0;
  const busy = draftsForThread(state, props.threadId).some((draft) => !draft.failure);
  const { toast, show } = useToast();
  const [selected, setSelected] = useState<StopRef | null>(null);
  const [draft, setDraft] = useState("");

  if (!trip) {
    return (
      <main className="trip" aria-busy="true">
        <p className="trip__loading">{t("trip-loading")}</p>
      </main>
    );
  }
  const old = trip.version < latest;

  const open = (url: string) => {
    show({ text: t("trip-toast-amap"), ms: 2_000 });
    void openExternal(url);
  };
  const say = (text: string) => {
    if (!text.trim() || busy) return;
    void store.send(props.threadId, text.trim());
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    say(draft);
    setDraft("");
  };
  const copy = async () => {
    await navigator.clipboard.writeText(familyText(t, trip));
    show({ text: t("trip-toast-copied") });
  };
  const sync = async () => {
    const outcome = isTauri()
      ? await store
          .tripCalendar(trip.id, trip.version)
          .then((calendar) =>
            invoke<CalendarOutcome>("calendar_sync", { calendar, name: t("trip-calendar-name") }),
          )
          .catch((): CalendarOutcome => "failed")
      : "failed";
    if (outcome === "denied") {
      show({
        text: t("trip-toast-calendar-denied"),
        action: {
          label: t("trip-toast-calendar-settings"),
          run: () => void openExternal(CALENDAR_SETTINGS),
        },
      });
    } else if (outcome === "failed") {
      show({ text: t("trip-toast-calendar-failed") });
    } else if ("handed" in outcome) {
      show({
        text: t("trip-toast-calendar-handed", { count: outcome.handed }),
        action: { label: t("trip-toast-calendar-retry"), run: () => void sync() },
      });
    } else {
      show({
        text: t("trip-toast-calendar", { count: outcome.added }),
        action: {
          label: t("trip-toast-calendar-open"),
          run: () => void openExternal(CALENDAR_APP),
        },
      });
    }
  };

  const savedAt = new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(trip.createdAt);
  const facts = [
    range(t, trip),
    trip.party,
    trip.needs,
    trip.cost && t("trip-cost", { cost: trip.cost }),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="trip" data-detail={selected ? true : undefined}>
      <div className="trip__page">
        <button type="button" className="link-button trip__back" onClick={props.onBack}>
          {t("trip-back", { title: props.threadTitle })}
        </button>
        {old && (
          <div className="trip__old">
            {t("trip-old-version", { time: savedAt })}
            <button type="button" className="link-button" onClick={props.onLatest}>
              {t("trip-back-latest")}
            </button>
          </div>
        )}
        <header className="trip__header">
          <div className="trip__heading">
            <h1 className="trip__title">{trip.title}</h1>
            <p className="trip__facts">{facts}</p>
          </div>
          <button type="button" className="button button--line" onClick={() => void sync()}>
            <CalendarIcon />
            {t("trip-sync-calendar")}
          </button>
          <button type="button" className="button button--line" onClick={() => void copy()}>
            <CopyIcon />
            {t("trip-copy-family")}
          </button>
        </header>
        {trip.reminder && (
          <p className="trip__reminder">{t("trip-reminder", { text: trip.reminder })}</p>
        )}
        <div className="trip__days">
          {trip.days.map((day, index) => (
            <DayColumn
              key={day.date}
              trip={trip}
              day={day}
              index={index}
              selected={selected?.day === index ? selected.index : null}
              onSelect={(stop) => setSelected({ day: index, index: stop })}
              onOpen={open}
            />
          ))}
        </div>
        {!old && (
          <form className="trip__say" onSubmit={submit}>
            <label className="trip__say-field">
              <span className="visually-hidden">{t("trip-say")}</span>
              <input
                value={draft}
                disabled={busy}
                placeholder={t("trip-say-placeholder")}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="button button--dark trip__send"
              disabled={busy || !draft.trim()}
            >
              {t("trip-send")}
            </button>
          </form>
        )}
      </div>
      {selected && (
        <>
          <button
            type="button"
            className="trip__scrim"
            aria-label={t("place-close")}
            tabIndex={-1}
            onClick={() => setSelected(null)}
          />
          <PlaceDetail
            key={`${selected.day}-${selected.index}`}
            trip={trip}
            at={selected}
            color={dayColor(selected.day)}
            readOnly={old || busy}
            onClose={() => setSelected(null)}
            onOpen={open}
            onAsk={(text) => {
              say(text);
              setSelected(null);
            }}
          />
        </>
      )}
      {toast}
    </main>
  );
}

function DayColumn({
  trip,
  day,
  index,
  selected,
  onSelect,
  onOpen,
}: {
  trip: Trip;
  day: TripDay;
  index: number;
  selected: number | null;
  onSelect: (stop: number) => void;
  onOpen: (url: string) => void;
}) {
  const { t } = useI18n();
  const color = dayColor(index);
  return (
    <section className="trip-day" aria-label={t("trip-day", { n: index + 1 })}>
      <header className="trip-day__head">
        <span className="trip-day__dot" style={{ background: color }} />
        <b className="trip-day__label">{t("trip-day", { n: index + 1 })}</b>
        <span className="trip-day__date">
          {weekday(t, day.date)} {monthDay(t, day.date)}
        </span>
        {day.weather && (
          <span className="trip-day__weather">
            <WeatherIcon sky={day.weather.sky} />
            {weatherText(t, day.weather)}
          </span>
        )}
      </header>
      {day.change && <p className="trip-day__change">{day.change}</p>}
      <ol className="trip-day__stops">
        {day.stops.map((stop, stopIndex) => {
          const next = day.stops[stopIndex + 1];
          return (
            <li
              key={`${stop.time}-${stop.name}`}
              className="trip-stop"
              data-selected={selected === stopIndex || undefined}
            >
              <div className="trip-stop__row">
                <button
                  type="button"
                  className="trip-stop__main"
                  onClick={() => onSelect(stopIndex)}
                >
                  <span className="trip-stop__time">{stop.time}</span>
                  <span className="trip-stop__number" style={{ background: color }}>
                    {stopIndex + 1}
                  </span>
                  <span className="trip-stop__text">
                    <b className="trip-stop__name">{stop.name}</b>
                    <span className="trip-stop__note">{stop.note}</span>
                  </span>
                </button>
                <span className="trip-stop__actions">
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onOpen(amapPlace(trip, stop))}
                  >
                    {t("trip-open-amap")}
                    <OutIcon />
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onOpen(amapFood(t, trip, stop))}
                  >
                    {t("trip-nearby-food")}
                    <OutIcon />
                  </button>
                </span>
              </div>
              {next && stop.next && (
                <div className="trip-stop__leg">
                  {legText(t, stop.next)}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => onOpen(amapRoute(trip, stop, next))}
                  >
                    {t("trip-route")}
                    <OutIcon />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
