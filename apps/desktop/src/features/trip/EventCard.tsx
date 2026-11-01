import { reminderText, whenText } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { EventDraft } from "@xiaoban/protocol";
import { useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { openExternal } from "../../lib/external.ts";
import {
  CALENDAR_APP,
  CALENDAR_SETTINGS,
  type CalendarOutcome,
  syncCalendar,
} from "./calendarSync.ts";
import { CalendarIcon } from "./icons.tsx";

export function EventCard({ event }: { event: EventDraft }) {
  const { t } = useI18n();
  const store = useHub();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<CalendarOutcome | null>(null);
  const name = t("trip-calendar-name");

  const add = async () => {
    setBusy(true);
    setOutcome(await syncCalendar(() => store.eventCalendar(event), name));
    setBusy(false);
  };

  const status = () => {
    if (outcome === null) return null;
    if (outcome === "denied") {
      return (
        <p className="event-card__status">
          {t("trip-toast-calendar-denied")}
          <button
            type="button"
            className="event-card__link"
            onClick={() => void openExternal(CALENDAR_SETTINGS)}
          >
            {t("trip-toast-calendar-settings")}
          </button>
        </p>
      );
    }
    if (outcome === "failed") {
      return <p className="event-card__status">{t("trip-toast-calendar-failed")}</p>;
    }
    if ("handed" in outcome) {
      return (
        <p className="event-card__status">
          {t("trip-toast-calendar-handed", { count: outcome.handed })}
        </p>
      );
    }
    return (
      <p className="event-card__status event-card__status--done">
        {t("event-added", { calendar: name })}
        <button
          type="button"
          className="event-card__link"
          onClick={() => void openExternal(CALENDAR_APP)}
        >
          {t("event-view")}
        </button>
      </p>
    );
  };

  const added = outcome !== null && typeof outcome === "object" && "added" in outcome;
  return (
    <div className="event-card">
      <div className="event-card__head">
        <CalendarIcon />
        <b>{event.title}</b>
      </div>
      <dl className="event-card__rows">
        <dt>{t("event-card-time")}</dt>
        <dd>{whenText(t, event.start, event.end)}</dd>
        {event.location ? (
          <>
            <dt>{t("event-card-place")}</dt>
            <dd>{event.location}</dd>
          </>
        ) : null}
        <dt>{t("event-card-remind")}</dt>
        <dd>{reminderText(t, event.reminder)}</dd>
      </dl>
      {added ? null : (
        <button
          type="button"
          className="button button--dark event-card__add"
          disabled={busy}
          onClick={() => void add()}
        >
          {t("event-add")}
        </button>
      )}
      {status()}
    </div>
  );
}
