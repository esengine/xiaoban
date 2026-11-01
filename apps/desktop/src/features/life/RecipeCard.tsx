import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { DishCover } from "./KitchenPage.tsx";

const PREVIEW_STEPS = 3;

export function RecipeCard({ recipeId, onCook }: { recipeId: string; onCook?: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const { recipes, kitchen } = useHubState(store);
  const view = recipes[recipeId];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const known = view !== undefined;
  useEffect(() => {
    if (known && !kitchen) return;
    void store.recipe(recipeId).catch(() => undefined);
  }, [store, recipeId, kitchen, known]);

  if (!view) return null;
  const { recipe } = view;
  const have = new Set(view.have);
  const missing = recipe.ingredients.filter((item) => !have.has(item.name));
  const listed = new Set(view.listed);
  const carted = missing.length > 0 && missing.every((item) => listed.has(item.name));
  const meta = [
    recipe.minutes > 0 ? t("kitchen-minutes", { minutes: recipe.minutes }) : "",
    recipe.servings > 0 ? t("kitchen-servings", { count: recipe.servings }) : "",
    recipe.style,
  ]
    .filter(Boolean)
    .join(t("daily-dot"));
  const titles = recipe.steps
    .slice(0, PREVIEW_STEPS)
    .map((step) => step.title || step.text)
    .join(t("recipe-arrow"));
  const cook = () => {
    setBusy(true);
    void store
      .cookRecipe(recipeId)
      .then(() => onCook?.())
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  return (
    <div className="recipe-card">
      <div className="recipe-card__photo">
        <DishCover name={recipe.dish} image={recipe.image} />
        {recipe.image && <span className="recipe-card__credit">{t("recipe-photo-credit")}</span>}
      </div>
      <div className="recipe-card__body">
        <div className="recipe-card__title">
          <b>{recipe.dish}</b>
          {meta && <span>{meta}</span>}
        </div>
        {recipe.ingredients.length > 0 && (
          <div className="recipe-card__chips">
            {recipe.ingredients.map((item) => {
              const ok = have.has(item.name);
              return (
                <span
                  key={item.name}
                  className="recipe-card__chip"
                  data-missing={!ok || undefined}
                  title={item.amount || undefined}
                >
                  {ok ? item.name : t("recipe-missing", { name: item.name })}
                </span>
              );
            })}
          </div>
        )}
        {recipe.steps.length > 0 && (
          <button
            type="button"
            className="recipe-card__preview"
            aria-expanded={open}
            aria-label={open ? t("recipe-hide-steps") : t("recipe-show-steps")}
            onClick={() => setOpen(!open)}
          >
            <span>{t("recipe-steps", { count: recipe.steps.length, titles })}</span>
            <svg aria-hidden="true" viewBox="0 0 24 24" data-open={open || undefined}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
        {open && (
          <ol className="recipe-card__steps">
            {recipe.steps.map((step, index) => (
              <li key={`${index}-${step.text}`}>
                <span>{step.text}</span>
                {step.tip && <small>{step.tip}</small>}
              </li>
            ))}
          </ol>
        )}
        <div className="recipe-card__actions">
          <button type="button" className="recipe-card__go" disabled={busy} onClick={cook}>
            {t("kitchen-cook-go")}
          </button>
          {missing.length > 0 && (
            <button
              type="button"
              className="recipe-card__cart"
              data-done={carted || undefined}
              disabled={carted}
              onClick={() => void store.recipeToShopping(recipeId).catch(() => undefined)}
            >
              {carted ? t("recipe-carted") : t("recipe-cart")}
            </button>
          )}
        </div>
        {recipe.threadId && (
          <button
            type="button"
            className="recipe-card__another"
            onClick={() =>
              void store
                .send(recipe.threadId, t("recipe-another-message", { dish: recipe.dish }))
                .catch(() => undefined)
            }
          >
            {t("recipe-another")}
          </button>
        )}
      </div>
    </div>
  );
}
