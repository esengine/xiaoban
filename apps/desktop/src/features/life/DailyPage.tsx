import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useEffect } from "react";
import { useHub } from "../../app/hub.tsx";
import { ConfirmCard } from "../operate/ConfirmCard.tsx";
import { toneOf } from "./KitchenPage.tsx";

function greetingKey(hour: number) {
  if (hour < 11) return "daily-morning" as const;
  if (hour < 18) return "daily-afternoon" as const;
  return "daily-evening" as const;
}

export function DailyPage({
  onOpenKitchen,
  onTalk,
}: {
  onOpenKitchen: () => void;
  onTalk: () => void;
}) {
  const { t, locale } = useI18n();
  const store = useHub();
  const { confirms, kitchen, memories } = useHubState(store);

  useEffect(() => {
    void store.loadKitchen().catch(() => undefined);
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
          <button type="button" className="code-status-button" onClick={onTalk}>
            {t("daily-talk")}
          </button>
        </header>
        <div className="daily__grid">
          {pending.length > 0 && (
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
          )}
          <section className="life-card daily__food">
            <div className="life-card__head">
              <b>{t("daily-food")}</b>
              {kitchen && kitchen.servings > 0 && (
                <span className="life-card__note">
                  {[
                    t("kitchen-servings", { count: kitchen.servings }),
                    ...(kitchen.avoid.length > 0
                      ? [t("kitchen-avoid", { items: kitchen.avoid.join(t("kitchen-joiner")) })]
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
                      <span
                        className="dish__cover"
                        data-tone={toneOf(dish.name)}
                        aria-hidden="true"
                      />
                      <b>{dish.name}</b>
                      <span>
                        {t("kitchen-minutes", { minutes: dish.minutes })}
                        {t("daily-dot")}
                        {dish.missing.length > 0
                          ? t("kitchen-missing", { items: dish.missing.join(t("kitchen-joiner")) })
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
          <section className="life-card daily__more">
            <b>{t("daily-more-title")}</b>
            <p>{t("daily-more-body")}</p>
          </section>
        </div>
      </div>
    </main>
  );
}
