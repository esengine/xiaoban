import { cardCostParts, costNumber, costSummary, tripKey } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Trip } from "@xiaoban/protocol";
import { useEffect } from "react";
import { useHub } from "../../app/hub.tsx";
import { dayColor, range, stopsText, weatherText, weekday } from "./format.ts";
import { WeatherIcon } from "./icons.tsx";
import { CostBar, useMoney } from "./TripCostPanel.tsx";

export interface TripActions {
  onOpen: (tripId: string, version: number | null) => void;
  onRevise: (text: string) => void;
  onConnectSearch: () => void;
}

export function useTrip(tripId: string, version: number | null): Trip | undefined {
  const store = useHub();
  const state = useHubState(store);
  const latest = state.latestTrip[tripId];
  const wanted = version ?? latest ?? null;
  const trip = wanted === null ? undefined : state.trips[tripKey(tripId, wanted)];
  useEffect(() => {
    if (!trip) void store.loadTrip(tripId, wanted).catch(() => undefined);
  }, [store, trip, tripId, wanted]);
  return trip;
}

export function TripCard({
  tripId,
  version,
  actions,
}: {
  tripId: string;
  version: number;
  actions: TripActions;
}) {
  const { t, locale } = useI18n();
  const money = useMoney();
  const store = useHub();
  const { latestTrip } = useHubState(store);
  const trip = useTrip(tripId, version);
  if (!trip) return <div className="trip-card trip-card--loading">{t("trip-loading")}</div>;
  const outdated = (latestTrip[tripId] ?? version) > version;
  const when = range(t, trip);
  const open = () => actions.onOpen(tripId, outdated ? version : null);
  const summary = trip.costs ? costSummary(trip.costs) : null;

  return (
    <div className="trip-card" data-outdated={outdated || undefined}>
      <div className="trip-card__head">
        <b className="trip-card__title">{trip.title}</b>
        <span className="trip-card__meta">
          {t("trip-card-meta", { range: when, party: trip.party })}
        </span>
        {outdated && <span className="trip-card__tag">{t("trip-updated")}</span>}
      </div>
      <ol className="trip-card__days">
        {trip.days.map((day, index) => (
          <li key={day.date}>
            <button type="button" className="trip-card__day" disabled={outdated} onClick={open}>
              <span className="trip-card__dot" style={{ background: dayColor(index) }} />
              <span className="trip-card__day-body">
                <span className="trip-card__day-head">
                  <b>{t("trip-day", { n: index + 1 })}</b>
                  <span className="trip-card__weekday">{weekday(t, day.date)}</span>
                  {day.weather && (
                    <span className="trip-card__weather">
                      <WeatherIcon sky={day.weather.sky} />
                      {weatherText(t, day.weather)}
                    </span>
                  )}
                </span>
                <span className="trip-card__stops">{stopsText(t, day)}</span>
                {day.change && <span className="trip-card__change">{day.change}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {trip.costs && summary && summary.cents > 0 && (
        <div className="trip-card__cost">
          <span className="trip-card__cost-row">
            <span className="trip-card__meta-label">{t("trip-card-cost")}</span>
            <b className="trip-card__cost-total">{money(summary.cents)}</b>
            <span className="trip-card__cost-parts">
              {cardCostParts(t, costNumber(locale), trip.costs)}
            </span>
          </span>
          <CostBar summary={summary} />
        </div>
      )}
      {!trip.verified && !outdated && (
        <p className="trip-card__unverified">
          {t("trip-unverified-lead", { text: t("trip-unverified") })}
          <button type="button" className="link-button" onClick={actions.onConnectSearch}>
            {t("trip-connect-search")}
          </button>
        </p>
      )}
      {outdated ? (
        <button type="button" className="link-button trip-card__version" onClick={open}>
          {t("trip-view-version")}
        </button>
      ) : (
        <div className="trip-card__actions">
          <button type="button" className="button button--dark" onClick={open}>
            {t("trip-open")}
          </button>
          <button
            type="button"
            className="button button--line"
            onClick={() =>
              actions.onRevise(t("trip-revise-quote", { title: trip.title, range: when }))
            }
          >
            {t("trip-revise")}
          </button>
        </div>
      )}
    </div>
  );
}
