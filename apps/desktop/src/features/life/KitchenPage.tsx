import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Dish, Kitchen } from "@xiaoban/protocol";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { recency } from "../chat/time.ts";
import { FridgeItems } from "./FridgeItems.tsx";
import { KitchenChat } from "./KitchenChat.tsx";
import { KeepTag, WeekMenu } from "./WeekMenu.tsx";

const IMAGE = /\.(png|jpe?g|heic|webp|gif)$/i;

export function DishCover({ name, image }: { name: string; image: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className="dish__cover" data-tone={toneOf(name)} aria-hidden="true">
      {image && !broken && (
        <img
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      )}
    </span>
  );
}

export function toneOf(name: string): number {
  let value = 0;
  for (const char of name) value = (value * 31 + (char.codePointAt(0) ?? 0)) % 997;
  return value % 5;
}

function usePhoto(fileId: string | null) {
  const store = useHub();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!fileId) {
      setUrl(null);
      return;
    }
    let live = true;
    void store
      .fileData(fileId)
      .then((data) => live && setUrl(data))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, fileId]);
  return url;
}

function DishCard({ dish, onToggle }: { dish: Dish; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className="dish" aria-pressed={dish.selected} onClick={onToggle}>
      <DishCover name={dish.name} image={dish.image} />
      <span className="dish__body">
        <b className="dish__name">{dish.name}</b>
        <span className="dish__meta">
          <span>{t("kitchen-minutes", { minutes: dish.minutes })}</span>
          {dish.missing.length > 0 ? (
            <span className="dish__tag" data-tone="missing">
              {t("kitchen-missing", { items: dish.missing.join(t("kitchen-joiner")) })}
            </span>
          ) : (
            <span className="dish__tag">{t("kitchen-have-all")}</span>
          )}
        </span>
        <span className="dish__why">{dish.why}</span>
        {dish.uses.length > 0 && (
          <span className="dish__uses">
            {t("kitchen-uses", { items: dish.uses.join(t("kitchen-joiner")) })}
          </span>
        )}
      </span>
    </button>
  );
}

function Tonight({
  kitchen,
  onSay,
  onCook,
}: {
  kitchen: Kitchen;
  onSay: (text: string, files?: string[]) => void;
  onCook: () => void;
}) {
  const { t, locale } = useI18n();
  const store = useHub();
  const photo = usePhoto(kitchen.photo);
  const picked = kitchen.dishes.filter((dish) => dish.selected);
  const used = new Set(picked.flatMap((dish) => dish.uses));
  const minutes = picked.reduce((sum, dish) => sum + dish.minutes, 0);
  const missing = picked.flatMap((dish) => dish.missing);
  const when = kitchen.photoAt
    ? (() => {
        const value = recency(kitchen.photoAt, Date.now(), locale);
        return value.kind === "now"
          ? t("time-just-now")
          : value.kind === "yesterday"
            ? t("time-yesterday")
            : value.text;
      })()
    : null;

  const staleDays = kitchen.photoAt ? Math.floor((Date.now() - kitchen.photoAt) / 86_400_000) : 0;
  const stale = staleDays >= 3;

  const pickPhoto = async () => {
    if (!isTauri()) return;
    const chosen = await open({
      multiple: false,
      filters: [
        { name: t("kitchen-photo-filter"), extensions: ["png", "jpg", "jpeg", "heic", "webp"] },
      ],
    }).catch(() => null);
    if (typeof chosen === "string") onSay(t("kitchen-photo-message"), [chosen]);
  };

  return (
    <div className="kitchen-tonight">
      <div className="kitchen-side">
        <section className="life-card">
          <div className="life-card__head">
            <b>{t("kitchen-fridge")}</b>
            <span className="life-card__spacer" />
            <button type="button" className="code-link" onClick={() => void pickPhoto()}>
              {kitchen.photo ? t("kitchen-retake") : t("kitchen-add-photo")}
            </button>
          </div>
          <div className="kitchen-photo" data-empty={!photo || undefined}>
            {photo ? (
              <img src={photo} alt={t("kitchen-fridge")} />
            ) : (
              <span>{t("kitchen-photo-empty")}</span>
            )}
            {when && (
              <span className="kitchen-photo__when">{t("kitchen-photo-when", { when })}</span>
            )}
          </div>
          {stale && kitchen.fridge.length > 0 && (
            <p className="fridge-stale">{t("fridge-stale", { days: staleDays })}</p>
          )}
          {kitchen.fridge.length > 0 ? (
            <FridgeItems items={kitchen.fridge} used={used} />
          ) : (
            <p className="life-card__hint">{t("kitchen-fridge-empty")}</p>
          )}
          {kitchen.fridge.length > 0 && <p className="life-card__hint">{t("fridge-hint")}</p>}
        </section>
        <section className="life-card">
          <div className="life-card__head">
            <b>{t("kitchen-rules")}</b>
          </div>
          <ul className="kitchen-rules">
            <li>
              {kitchen.servings > 0
                ? t("kitchen-servings", { count: kitchen.servings })
                : t("kitchen-servings-unknown")}
            </li>
            {kitchen.avoid.length > 0 && (
              <li>{t("kitchen-avoid", { items: kitchen.avoid.join(t("kitchen-joiner")) })}</li>
            )}
            <li>{t("kitchen-within", { minutes: kitchen.maxMinutes })}</li>
          </ul>
          <p className="life-card__hint">{t("kitchen-rules-hint")}</p>
        </section>
      </div>
      <div className="kitchen-main">
        <div className="kitchen-main__head">
          <b>{t("kitchen-suggested")}</b>
          {kitchen.dishes.length > 0 && (
            <span className="kitchen-main__note">
              {t("kitchen-suggested-note", { minutes: kitchen.maxMinutes, count: picked.length })}
            </span>
          )}
          <span className="life-card__spacer" />
          {kitchen.dishes.length > 0 && (
            <button
              type="button"
              className="code-status-button"
              onClick={() => onSay(t("kitchen-another-batch"))}
            >
              {t("kitchen-another")}
            </button>
          )}
        </div>
        {kitchen.dishes.length === 0 ? (
          <div className="life-card kitchen-empty">
            <b>{t("kitchen-empty-title")}</b>
            <p>{t("kitchen-empty-body")}</p>
            <div className="kitchen-empty__actions">
              <button type="button" className="dialog__primary" onClick={() => void pickPhoto()}>
                {t("kitchen-add-photo")}
              </button>
              <button
                type="button"
                className="dialog__secondary"
                onClick={() => onSay(t("kitchen-ask-tonight"))}
              >
                {t("kitchen-ask")}
              </button>
            </div>
          </div>
        ) : (
          <div className="kitchen-dishes">
            {kitchen.dishes.map((dish) => (
              <DishCard
                key={dish.name}
                dish={dish}
                onToggle={() =>
                  void store.selectDish(dish.name, !dish.selected).catch(() => undefined)
                }
              />
            ))}
          </div>
        )}
        {picked.length > 0 && (
          <div className="life-card kitchen-summary">
            <div className="kitchen-summary__text">
              <b>{picked.map((dish) => dish.name).join(t("kitchen-plus"))}</b>
              <span>
                {t("kitchen-summary", {
                  minutes,
                  servings: kitchen.servings || 0,
                })}
                {missing.length > 0
                  ? t("kitchen-summary-missing", { count: missing.length })
                  : t("kitchen-summary-all")}
              </span>
            </div>
            {missing.length > 0 && (
              <button
                type="button"
                className="code-status-button"
                onClick={() => void store.addMissingToShopping().catch(() => undefined)}
              >
                {t("kitchen-add-missing")}
              </button>
            )}
            <button
              type="button"
              className="code-status-button"
              data-dark
              onClick={() => {
                if (!kitchen.cook)
                  onSay(
                    t("kitchen-start", {
                      dishes: picked.map((dish) => dish.name).join(t("kitchen-plus")),
                    }),
                  );
                onCook();
              }}
            >
              {kitchen.cook ? t("kitchen-resume-cook") : t("kitchen-start-button")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Shopping({ kitchen }: { kitchen: Kitchen }) {
  const { t } = useI18n();
  const store = useHub();
  const left = kitchen.shopping.filter((item) => !item.done);
  const bought = kitchen.shopping.filter((item) => item.done);
  return (
    <div className="kitchen-shopping">
      <section className="life-card">
        <div className="life-card__head">
          <b>{t("kitchen-shopping-left", { count: left.length })}</b>
          <span className="life-card__spacer" />
          {bought.length > 0 && (
            <button
              type="button"
              className="code-link"
              onClick={() => void store.clearBought().catch(() => undefined)}
            >
              {t("kitchen-clear-bought")}
            </button>
          )}
        </div>
        {kitchen.shopping.length === 0 ? (
          <p className="life-card__hint">{t("kitchen-shopping-empty")}</p>
        ) : (
          <ul className="shopping-list">
            {[...left, ...bought].map((item) => (
              <li key={item.name} data-done={item.done || undefined}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() =>
                      void store.toggleShopping(item.name, !item.done).catch(() => undefined)
                    }
                  />
                  <span className="shopping-list__name">{item.name}</span>
                  {item.amount && <span className="shopping-list__amount">{item.amount}</span>}
                  {item.note && <span className="shopping-list__note">{item.note}</span>}
                  {!item.done && <KeepTag keep={item.keep} />}
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function KitchenPage({
  onBack,
  onCook,
  initialTab = "tonight",
}: {
  onBack: () => void;
  onCook: () => void;
  initialTab?: "tonight" | "week" | "shopping";
}) {
  const { t } = useI18n();
  const store = useHub();
  const { kitchen } = useHubState(store);
  const [tab, setTab] = useState<"tonight" | "week" | "shopping">(initialTab);
  const threadId = kitchen?.threadId ?? null;

  useEffect(() => {
    void store.loadKitchen().catch(() => undefined);
  }, [store]);

  const startedAt = kitchen?.cook?.startedAt ?? null;
  const seen = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (kitchen === null) return;
    if (seen.current !== undefined && startedAt !== null && startedAt !== seen.current) onCook();
    seen.current = startedAt;
  }, [kitchen, startedAt, onCook]);

  const say = (text: string, files: string[] = []) => {
    if (threadId) void store.send(threadId, text, { files }).catch(() => undefined);
  };

  useEffect(() => {
    if (!isTauri() || !threadId) return;
    const stop = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type !== "drop") return;
      const images = payload.paths.filter((path) => IMAGE.test(path));
      if (images.length > 0)
        void store
          .send(threadId, t("kitchen-photo-message"), { files: images })
          .catch(() => undefined);
    });
    return () => void stop.then((unlisten) => unlisten());
  }, [store, threadId, t]);

  const left = kitchen?.shopping.filter((item) => !item.done).length ?? 0;
  return (
    <main className="life-page kitchen">
      <header className="life-top">
        <button type="button" className="code-link life-top__back" onClick={onBack}>
          {t("kitchen-back")}
        </button>
        <b className="life-top__title">{t("kitchen-title")}</b>
        <span className="life-top__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className="code-tab"
            aria-selected={tab === "tonight"}
            onClick={() => setTab("tonight")}
          >
            {t("kitchen-tab-tonight")}
          </button>
          <button
            type="button"
            role="tab"
            className="code-tab"
            aria-selected={tab === "week"}
            onClick={() => setTab("week")}
          >
            {t("kitchen-tab-week")}
          </button>
          <button
            type="button"
            role="tab"
            className="code-tab"
            aria-selected={tab === "shopping"}
            onClick={() => setTab("shopping")}
          >
            {t("kitchen-tab-shopping")}
            {left > 0 && <span className="code-tab__count">{left}</span>}
          </button>
        </span>
      </header>
      <div className="kitchen__body">
        <div className="kitchen__content">
          {kitchen &&
            (tab === "tonight" ? (
              <Tonight kitchen={kitchen} onSay={say} onCook={onCook} />
            ) : tab === "week" ? (
              <WeekMenu kitchen={kitchen} onSay={say} onCook={onCook} />
            ) : (
              <Shopping kitchen={kitchen} />
            ))}
        </div>
        {threadId && <KitchenChat threadId={threadId} />}
      </div>
    </main>
  );
}
