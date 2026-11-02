import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Plan } from "@xiaoban/protocol";
import { useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { MailDialog } from "../mail/MailDialog.tsx";
import { MailTodayCard } from "../mail/MailToday.tsx";
import { ConfirmCard } from "../operate/ConfirmCard.tsx";
import { PlanRing } from "../plan/PlanCard.tsx";
import { usePlanSummary } from "../plan/planSummary.ts";
import { WeatherIcon } from "../trip/icons.tsx";
import { DailyArranged } from "./DailyArrange.tsx";
import { DishCover } from "./KitchenPage.tsx";
import { shadeOf, useMoney } from "./LedgerPage.tsx";
import { DoneCard, type InsightNav, MutedTray, NoticedCard } from "./Noticed.tsx";
import { NoPlace, TipIcon, useSkyText } from "./WeatherPage.tsx";

function WeatherCard({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const { weather } = useHubState(store);
  const skyText = useSkyText();
  if (!weather) return null;
  if (weather.places.length === 0) return <NoPlace compact />;
  const report = weather.report;
  const place = weather.places.find((item) => item.id === weather.placeId) ?? weather.places[0];
  const today = report?.days[0];
  const tip = report?.tips[0];
  return (
    <section className="life-card daily__weather">
      <div className="life-card__head">
        <b>{t("weather-title")}</b>
        <span className="life-card__note">{place?.city}</span>
        <span className="life-card__spacer" />
        <button type="button" className="code-link" onClick={onOpen}>
          {t("daily-open-weather")}
        </button>
      </div>
      {report ? (
        <>
          <div className="daily__weather-now">
            <span className="weather-hero__icon">
              <WeatherIcon sky={report.now.sky} />
            </span>
            <div>
              <b>{t("weather-degrees", { value: String(report.now.temp) })}</b>
              <span className="life-card__note">
                {today
                  ? t("weather-sky-range", {
                      sky: skyText(report.now.sky),
                      low: String(today.low),
                      high: String(today.high),
                    })
                  : skyText(report.now.sky)}
              </span>
            </div>
          </div>
          {tip && (
            <p className="daily__weather-tip">
              <TipIcon kind={tip.kind} />
              {tip.title}
            </p>
          )}
        </>
      ) : (
        <p className="life-card__hint">
          {weather.failed ? t("weather-failed") : t("weather-loading")}
        </p>
      )}
    </section>
  );
}

function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function Spending({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const { ledger } = useHubState(store);
  const money = useMoney();
  if (!ledger || ledger.month !== thisMonth()) return null;
  const spent = ledger.entries.reduce((sum, entry) => sum + entry.cents, 0);
  const sums = new Map<string, number>();
  for (const entry of ledger.entries)
    sums.set(entry.category, (sums.get(entry.category) ?? 0) + entry.cents);
  const top = [...sums].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const max = Math.max(1, ...top.map(([, cents]) => cents));
  const budget = ledger.budgetCents;
  return (
    <section className="life-card daily__money">
      <div className="life-card__head">
        <b>{t("daily-money")}</b>
        <span className="life-card__spacer" />
        <button type="button" className="code-link" onClick={onOpen}>
          {t("daily-open-ledger")}
        </button>
      </div>
      {ledger.entries.length === 0 ? (
        <p className="life-card__hint">{t("daily-money-empty")}</p>
      ) : (
        <>
          <div className="daily__money-total">
            <b>{money(spent)}</b>
            {budget ? <span>{t("daily-money-budget", { amount: money(budget) })}</span> : null}
          </div>
          {budget ? (
            <span className="ledger-bar" data-over={spent > budget || undefined}>
              <span style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }} />
            </span>
          ) : null}
          <div className="ledger-cats">
            {top.map(([category, cents], rank) => (
              <div key={category} className="ledger-cat" data-static>
                <span className="ledger-cat__name">{category}</span>
                <span className="ledger-cat__bar">
                  <span style={{ width: `${(cents / max) * 100}%`, background: shadeOf(rank) }} />
                </span>
                <span className="ledger-cat__amount">{money(cents)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function greetingKey(hour: number) {
  if (hour < 11) return "daily-morning" as const;
  if (hour < 18) return "daily-afternoon" as const;
  return "daily-evening" as const;
}

export function DailyPage({
  onOpenKitchen,
  onOpenWeek,
  onOpenLedger,
  onOpenWeather,
  onTalk,
  onOpenThread,
}: {
  onOpenKitchen: () => void;
  onOpenWeek: () => void;
  onOpenLedger: () => void;
  onOpenWeather: () => void;
  onTalk: () => void;
  onOpenThread: (threadId: string) => void;
}) {
  const { t, locale } = useI18n();
  const store = useHub();
  const { confirms, kitchen, memories, dailyFeed } = useHubState(store);
  const nav: InsightNav = {
    onOpenThread,
    onOpenPage: (page) =>
      ({ kitchen: onOpenKitchen, week: onOpenWeek, ledger: onOpenLedger, weather: onOpenWeather })[
        page
      ](),
  };
  const [editing, setEditing] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);

  useEffect(() => {
    void store.loadKitchen().catch(() => undefined);
    void store.loadLedger(thisMonth()).catch(() => undefined);
    void store.loadWeather().catch(() => undefined);
    void store.loadDailyFeed().catch(() => undefined);
  }, [store]);

  const now = new Date();
  const name = memories.find(
    (memory) => memory.subject === t("memory-topic-preferred-name"),
  )?.value;
  const date = new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(now);
  const pending = confirms.filter((confirm) => confirm.kind.kind !== "permissions");
  const dishes = kitchen?.dishes ?? [];
  const left = kitchen?.shopping.filter((item) => !item.done).length ?? 0;

  return (
    <main className="life-page daily">
      <div className="daily__scroll">
        <header className="daily__head">
          <div>
            <h1>
              {name
                ? t("daily-hello-name", { greeting: t(greetingKey(now.getHours())), name })
                : t(greetingKey(now.getHours()))}
            </h1>
            <p>{date}</p>
          </div>
          <span className="daily__actions">
            {editing && <span className="life-card__note">{t("daily-arrange-hint")}</span>}
            <button
              type="button"
              className="code-status-button"
              data-dark={editing || undefined}
              onClick={() => setEditing(!editing)}
            >
              {editing ? t("daily-arrange-done") : t("daily-arrange")}
            </button>
            {!editing && (
              <button type="button" className="code-status-button" onClick={onTalk}>
                {t("daily-talk")}
              </button>
            )}
          </span>
        </header>
        <DailyArranged
          editing={editing}
          items={[
            {
              id: "confirm",
              title: t("daily-card-confirm"),
              wide: true,
              node:
                pending.length > 0 ? (
                  <section className="life-card daily__confirm">
                    <div className="life-card__head">
                      <span className="daily__dot" aria-hidden="true" />
                      <b>{t("daily-confirm", { count: pending.length })}</b>
                    </div>
                    <div className="daily__confirms">
                      {pending.map((confirm) => (
                        <ConfirmCard key={confirm.id} confirm={confirm} />
                      ))}
                    </div>
                  </section>
                ) : null,
            },
            {
              id: "food",
              title: t("daily-food"),
              wide: true,
              node: (
                <section className="life-card daily__food">
                  <div className="life-card__head">
                    <b>{t("daily-food")}</b>
                    {kitchen && kitchen.servings > 0 && (
                      <span className="life-card__note">
                        {[
                          t("kitchen-servings", { count: kitchen.servings }),
                          ...(kitchen.avoid.length > 0
                            ? [
                                t("kitchen-avoid", {
                                  items: kitchen.avoid.join(t("kitchen-joiner")),
                                }),
                              ]
                            : []),
                        ].join(t("daily-dot"))}
                      </span>
                    )}
                    <span className="life-card__spacer" />
                    <button type="button" className="code-link" onClick={onOpenKitchen}>
                      {t("daily-open-kitchen")}
                    </button>
                  </div>
                  {dishes.length > 0 ? (
                    <>
                      <div className="daily__dishes">
                        {dishes.slice(0, 3).map((dish) => (
                          <button
                            key={dish.name}
                            type="button"
                            className="daily__dish"
                            onClick={onOpenKitchen}
                          >
                            <DishCover name={dish.name} image={dish.image} />
                            <b>{dish.name}</b>
                            <span>
                              {t("kitchen-minutes", { minutes: dish.minutes })}
                              {t("daily-dot")}
                              {dish.missing.length > 0
                                ? t("kitchen-missing", {
                                    items: dish.missing.join(t("kitchen-joiner")),
                                  })
                                : t("kitchen-have-all")}
                            </span>
                          </button>
                        ))}
                      </div>
                      {left > 0 && (
                        <p className="life-card__hint">{t("daily-shopping", { count: left })}</p>
                      )}
                    </>
                  ) : (
                    <div className="daily__empty">
                      <p>{t("daily-food-empty")}</p>
                      <button type="button" className="dialog__primary" onClick={onOpenKitchen}>
                        {t("daily-food-start")}
                      </button>
                    </div>
                  )}
                </section>
              ),
            },
            {
              id: "weather",
              title: t("weather-title"),
              wide: false,
              node: <WeatherCard onOpen={onOpenWeather} />,
            },
            {
              id: "money",
              title: t("daily-money"),
              wide: false,
              node: <Spending onOpen={onOpenLedger} />,
            },
            {
              id: "plans",
              title: t("daily-plans"),
              wide: false,
              node: <Plans onOpen={onOpenThread} />,
            },
            {
              id: "noticed",
              title: t("insight-tag"),
              wide: false,
              node:
                dailyFeed && dailyFeed.insights.length > 0 ? (
                  <NoticedCard insights={dailyFeed.insights.slice(0, 2)} nav={nav} />
                ) : null,
            },
            {
              id: "mail",
              title: t("mail-today"),
              wide: false,
              node: dailyFeed?.mail ? (
                <MailTodayCard
                  today={dailyFeed.mail}
                  onOpenAll={() => setMailOpen(true)}
                  onOpenThread={onOpenThread}
                />
              ) : null,
            },
            {
              id: "done",
              title: t("daily-done"),
              wide: false,
              node:
                dailyFeed && dailyFeed.done.length > 0 ? (
                  <DoneCard items={dailyFeed.done} onOpen={onOpenThread} />
                ) : null,
            },
            {
              id: "more",
              title: t("daily-more-title"),
              wide: false,
              node: (
                <section className="life-card daily__more">
                  <b>{t("daily-more-title")}</b>
                  <p>{t("daily-more-body")}</p>
                </section>
              ),
            },
          ]}
        />
        {editing && <MutedTray />}
        {mailOpen && <MailDialog onClose={() => setMailOpen(false)} onOpenThread={onOpenThread} />}
      </div>
    </main>
  );
}

function PlanLine({ plan, onOpen }: { plan: Plan; onOpen: (threadId: string) => void }) {
  const summary = usePlanSummary(plan);
  return (
    <button type="button" className="daily__plan" onClick={() => onOpen(plan.threadId)}>
      <PlanRing plan={plan} size={28} />
      <span>
        {plan.title}
        <small>{summary}</small>
      </span>
    </button>
  );
}

function Plans({ onOpen }: { onOpen: (threadId: string) => void }) {
  const { t } = useI18n();
  const store = useHub();
  const { plans, status } = useHubState(store);
  useEffect(() => {
    if (status === "open") void store.listPlans().catch(() => undefined);
  }, [store, status]);
  const active = Object.values(plans).filter(
    (plan): plan is Plan => plan !== null && plan.status !== "done",
  );
  return (
    <section className="life-card daily__plans">
      <div className="life-card__head">
        <b>{t("daily-plans")}</b>
        <span className="life-card__spacer" />
        {active.length > 0 && (
          <span className="life-card__note">
            {t("daily-plans-count", { count: active.length })}
          </span>
        )}
      </div>
      {active.length > 0 ? (
        active
          .slice(0, 4)
          .map((plan) => <PlanLine key={plan.threadId} plan={plan} onOpen={onOpen} />)
      ) : (
        <p className="life-card__hint">{t("daily-plans-empty")}</p>
      )}
    </section>
  );
}
