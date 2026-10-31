import type { Draft } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { Trip, TripStop } from "@xiaoban/protocol";
import { useEffect, useRef } from "react";
import { useElapsed } from "../chat/DraftBubble.tsx";
import { StepList } from "../chat/Steps.tsx";
import { amapPlace, amapRoute, monthDay } from "./format.ts";
import { CameraIcon, CheckIcon, CloseIcon, OutIcon } from "./icons.tsx";

const STALE_MS = 30 * 24 * 60 * 60 * 1000;
const SLOW_MS = 60_000;

function LookingPanel({ draft, onStop }: { draft: Draft; onStop: () => void }) {
  const { t } = useI18n();
  const elapsed = useElapsed(draft.startedAt, true);
  return (
    <section className="looking">
      <div className="looking__head">
        <b>{t("looking-title")}</b>
        <span className="looking__elapsed">
          {t("looking-elapsed", { seconds: Math.floor(elapsed / 1000) })}
        </span>
        <button type="button" className="button button--line looking__stop" onClick={onStop}>
          {t("looking-stop")}
        </button>
      </div>
      {draft.steps.length > 0 && <StepList steps={draft.steps} live />}
      {elapsed > SLOW_MS && <p className="looking__slow">{t("looking-slow")}</p>}
    </section>
  );
}

export interface StopRef {
  day: number;
  index: number;
}

function isoDay(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function PlaceDetail({
  trip,
  at,
  color,
  readOnly,
  busy,
  looking,
  onStop,
  onClose,
  onOpen,
  onAsk,
}: {
  trip: Trip;
  at: StopRef;
  color: string;
  readOnly: boolean;
  busy: boolean;
  looking: Draft | null;
  onStop: () => void;
  onClose: () => void;
  onOpen: (url: string) => void;
  onAsk: (text: string, stay: boolean) => void;
}) {
  const { t } = useI18n();
  const panel = useRef<HTMLElement>(null);
  const day = trip.days[at.day];
  const stop: TripStop | undefined = day?.stops[at.index];
  const previous = day?.stops[at.index - 1];

  useEffect(() => {
    panel.current?.focus();
  }, []);

  if (!day || !stop) return null;
  const detail = stop.detail;
  const dayNumber = at.day + 1;
  const checkedAt = detail?.checkedAt ?? null;

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      className="place-detail"
      aria-label={stop.name}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header className="place-detail__head">
        <span className="place-detail__number" style={{ background: color }}>
          {at.index + 1}
        </span>
        <div className="place-detail__heading">
          <h2 className="place-detail__name">{stop.name}</h2>
          <p className="place-detail__meta">
            {t("place-meta", { day: dayNumber, time: stop.time })}
          </p>
        </div>
        <button
          type="button"
          className="place-detail__close"
          aria-label={t("place-close")}
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>
      <div className="place-detail__body">
        <div className="place-detail__links">
          <button
            type="button"
            className="button button--dark place-detail__photos"
            onClick={() => onOpen(amapPlace(trip, stop))}
          >
            <CameraIcon />
            {t("place-photos")}
            <OutIcon />
          </button>
          <button
            type="button"
            className="button button--line"
            onClick={() =>
              onOpen(previous ? amapRoute(trip, previous, stop) : amapPlace(trip, stop))
            }
          >
            {t("trip-route")}
            <OutIcon />
          </button>
        </div>
        {looking ? (
          <LookingPanel draft={looking} onStop={onStop} />
        ) : detail ? (
          <>
            <section>
              <h3 className="place-detail__title">{t("place-why")}</h3>
              <p className="place-detail__text">{detail.why}</p>
            </section>
            {detail.suits.length > 0 && (
              <section>
                <h3 className="place-detail__title">{t("place-suits")}</h3>
                <ul className="place-detail__chips">
                  {detail.suits.map((suit) => (
                    <li key={suit}>{suit}</li>
                  ))}
                </ul>
              </section>
            )}
            {(detail.duration || detail.quiet) && (
              <div className="place-detail__facts">
                {detail.duration && (
                  <div className="place-detail__fact">
                    <span>{t("place-duration")}</span>
                    <b>{detail.duration}</b>
                  </div>
                )}
                {detail.quiet && (
                  <div className="place-detail__fact">
                    <span>{t("place-quiet")}</span>
                    <b>{detail.quiet}</b>
                  </div>
                )}
              </div>
            )}
            {detail.tickets && (
              <section>
                <div className="place-detail__title-row">
                  <h3 className="place-detail__title">{t("place-tickets")}</h3>
                  {checkedAt !== null && (
                    <span
                      className="place-detail__checked"
                      data-stale={Date.now() - checkedAt > STALE_MS || undefined}
                    >
                      {Date.now() - checkedAt > STALE_MS ? (
                        t("place-checked-old", { date: monthDay(t, isoDay(checkedAt)) })
                      ) : (
                        <>
                          <CheckIcon />
                          {t("place-checked", { date: monthDay(t, isoDay(checkedAt)) })}
                        </>
                      )}
                    </span>
                  )}
                </div>
                <p className="place-detail__text">{detail.tickets}</p>
                {detail.ticketsSource ? (
                  <button
                    type="button"
                    className="place-detail__source"
                    onClick={() => detail.ticketsSource && onOpen(detail.ticketsSource.url)}
                  >
                    {t("place-source", { title: detail.ticketsSource.title })}
                    <OutIcon />
                  </button>
                ) : (
                  <p className="place-detail__unverified">{t("place-unverified")}</p>
                )}
              </section>
            )}
            {detail.reviews.length > 0 && (
              <section>
                <h3 className="place-detail__title">{t("place-reviews")}</h3>
                <ul className="place-detail__reviews">
                  {detail.reviews.map((review) => (
                    <li key={review.source.url + review.text}>
                      {t("place-review", { text: review.text })}
                      <button
                        type="button"
                        className="place-detail__source"
                        onClick={() => onOpen(review.source.url)}
                      >
                        {review.source.date
                          ? t("place-review-source", {
                              title: review.source.title,
                              date: review.source.date,
                            })
                          : review.source.title}
                        <OutIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <div className="place-detail__empty">
            {t("place-empty")}
            {!readOnly && (
              <button
                type="button"
                className="button button--line"
                disabled={busy}
                onClick={() => onAsk(t("place-ask-message", { name: stop.name }), true)}
              >
                {t("place-ask")}
              </button>
            )}
          </div>
        )}
      </div>
      {!readOnly && (
        <footer className="place-detail__foot">
          <button
            type="button"
            className="button button--line"
            disabled={busy}
            onClick={() =>
              onAsk(t("place-replace-message", { day: dayNumber, name: stop.name }), false)
            }
          >
            {t("place-replace")}
          </button>
          <button
            type="button"
            className="button button--line"
            disabled={busy}
            onClick={() =>
              onAsk(t("place-remove-message", { day: dayNumber, name: stop.name }), false)
            }
          >
            {t("place-remove")}
          </button>
        </footer>
      )}
    </aside>
  );
}
