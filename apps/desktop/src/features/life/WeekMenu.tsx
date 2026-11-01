import { useI18n } from "@xiaoban/i18n/react";
import type { Keep, Kitchen, WeekPlan } from "@xiaoban/protocol";
import { useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { DishCover } from "./KitchenPage.tsx";

function iso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parse(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function mondayOf(date: Date, weeks: number) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + weeks * 7);
  return monday;
}

function daysOf(monday: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  });
}

export function KeepTag({ keep }: { keep: Keep }) {
  const { t } = useI18n();
  if (keep === "none") return null;
  return (
    <span className="keep-tag" data-keep={keep}>
      {t(`keep-${keep}`)}
    </span>
  );
}

function Empty({ onPlan }: { onPlan: () => void }) {
  const { t } = useI18n();
  return (
    <div className="week__empty">
      <section className="life-card week__empty-card">
        <b>{t("week-empty-title")}</b>
        <p>{t("week-empty-body")}</p>
        <button type="button" className="dialog__primary" onClick={onPlan}>
          {t("week-empty-start")}
        </button>
        <span className="life-card__note">{t("week-empty-hint")}</span>
      </section>
    </div>
  );
}

function Buy({ plan, onSay }: { plan: WeekPlan; onSay: (text: string) => void }) {
  const { t } = useI18n();
  const store = useHub();
  const groups = new Map<string, WeekPlan["buy"]>();
  for (const item of plan.buy) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  const left = plan.buy.filter((item) => !item.have).length;
  if (plan.buy.length === 0) return null;
  return (
    <section className="life-card">
      <div className="life-card__head">
        <b>{t("week-buy", { count: left })}</b>
        <span className="life-card__note">{t("week-buy-note")}</span>
        <span className="life-card__spacer" />
        <button
          type="button"
          className="code-status-button"
          data-dark
          disabled={plan.added || left === 0}
          onClick={() => void store.weekToShopping(plan.start).catch(() => undefined)}
        >
          {plan.added ? t("week-buy-added") : t("week-buy-add")}
        </button>
      </div>
      <div className="week-buy">
        {[...groups].map(([group, items]) => (
          <div key={group} className="week-buy__group">
            <span className="week-buy__title">{group}</span>
            {items.map((item) => (
              <div key={item.name} className="week-buy__row" data-have={item.have || undefined}>
                <span className="week-buy__name">{item.name}</span>
                <span
                  className="week-buy__note"
                  title={[item.amount, item.note].filter(Boolean).join(" ")}
                >
                  {item.have
                    ? t("week-have")
                    : [item.amount, item.note].filter(Boolean).join(t("daily-dot"))}
                </span>
                {item.have ? (
                  <button
                    type="button"
                    className="code-link week-buy__gone"
                    onClick={() => {
                      void store.weekItemGone(plan.start, item.name).catch(() => undefined);
                      onSay(t("week-gone-message", { name: item.name }));
                    }}
                  >
                    {t("week-gone")}
                  </button>
                ) : (
                  <KeepTag keep={item.keep} />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export function WeekMenu({
  kitchen,
  onSay,
  onCook,
}: {
  kitchen: Kitchen;
  onSay: (text: string) => void;
  onCook: () => void;
}) {
  const { t, locale } = useI18n();
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const today = iso(now);
  const monday = mondayOf(now, offset);
  const start = iso(monday);
  const dates = daysOf(monday);
  const plan = kitchen.weeks.find((week) => week.start === start) ?? null;
  const short = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const range = `${short.format(dates[0] ?? monday)}–${short.format(dates[6] ?? monday)}`;
  const label = (date: Date) =>
    t("week-day-label", { weekday: weekday.format(date), date: short.format(date) });
  const planWeek = () => onSay(t("week-plan-message", { range, start }));

  return (
    <div className="week">
      <div className="week__head">
        <div>
          <b className="week__title">
            {offset === 0
              ? t("week-title-this")
              : offset === 1
                ? t("week-title-next")
                : t("week-title-other")}
          </b>
          <span className="life-card__note">
            {t("week-subtitle", { range, minutes: kitchen.maxMinutes })}
          </span>
        </div>
        <span className="life-card__spacer" />
        <button type="button" className="code-status-button" onClick={() => setOffset(offset - 1)}>
          {t("week-prev")}
        </button>
        <button type="button" className="code-status-button" onClick={() => setOffset(offset + 1)}>
          {t("week-next")}
        </button>
        {plan && (
          <button
            type="button"
            className="code-status-button"
            onClick={() => onSay(t("week-replan-message", { range, start }))}
          >
            {t("week-replan")}
          </button>
        )}
      </div>
      {!plan ? (
        <Empty onPlan={planWeek} />
      ) : (
        <>
          <div className="week-days">
            {dates.map((date) => {
              const key = iso(date);
              const day = plan.days.find((item) => item.date === key);
              const isToday = key === today;
              return (
                <article
                  key={key}
                  className="week-day"
                  data-today={isToday || undefined}
                  data-takeout={day?.takeout || undefined}
                >
                  <div className="week-day__head">
                    <b>{weekday.format(date)}</b>
                    <span>{short.format(date)}</span>
                    <span className="life-card__spacer" />
                    {isToday ? (
                      <span className="week-day__tag" data-kind="today">
                        {t("week-today")}
                      </span>
                    ) : (
                      day?.changed && (
                        <span className="week-day__tag" data-kind="changed">
                          {t("week-changed")}
                        </span>
                      )
                    )}
                  </div>
                  {day ? (
                    <>
                      <DishCover
                        name={day.takeout ? "" : day.dish}
                        image={day.takeout ? null : day.image}
                      />
                      <div className="week-day__body">
                        <b>{day.dish}</b>
                        <span className="week-day__meta">
                          {[
                            day.minutes > 0 && !day.takeout
                              ? t("kitchen-minutes", { minutes: day.minutes })
                              : "",
                            day.why,
                          ]
                            .filter(Boolean)
                            .join(t("daily-dot"))}
                        </span>
                        <span className="life-card__spacer" />
                        <button
                          type="button"
                          className="code-link week-day__swap"
                          onClick={() =>
                            onSay(t("week-swap-message", { day: label(date), dish: day.dish }))
                          }
                        >
                          {t("week-swap")}
                        </button>
                        {isToday && !day.takeout && (
                          <button
                            type="button"
                            className="code-status-button week-day__cook"
                            data-dark
                            onClick={() => {
                              if (!kitchen.cook) onSay(t("kitchen-start", { dishes: day.dish }));
                              onCook();
                            }}
                          >
                            {kitchen.cook ? t("kitchen-resume-cook") : t("kitchen-start-button")}
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="week-day__body week-day__blank">
                      <button
                        type="button"
                        className="code-link"
                        onClick={() => onSay(t("week-fill-message", { day: label(date) }))}
                      >
                        {t("week-fill")}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {(plan.idea || plan.prep.length > 0) && (
            <section className="life-card week-idea">
              <div className="week-idea__main">
                <b>{t("week-idea")}</b>
                <p>{plan.idea}</p>
              </div>
              {plan.prep.length > 0 && (
                <div className="week-idea__prep">
                  <b>{t("week-prep")}</b>
                  <ul>
                    {plan.prep.map((task) => (
                      <li key={`${task.date}-${task.text}`} data-done={task.notified || undefined}>
                        {t("week-prep-item", {
                          day: weekday.format(parse(task.date)),
                          time: task.time,
                          text: task.text,
                        })}
                      </li>
                    ))}
                  </ul>
                  <span className="life-card__note">{t("week-prep-note")}</span>
                </div>
              )}
            </section>
          )}
          <Buy plan={plan} onSay={onSay} />
        </>
      )}
    </div>
  );
}
