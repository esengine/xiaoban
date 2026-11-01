import { areaText, currentLayout, pendingMeasures, planArea } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useEffect } from "react";
import { useHub } from "../../app/hub.tsx";
import { FloorCanvas } from "./FloorCanvas.tsx";

export function useFloorPlan(planId: string) {
  const store = useHub();
  const { floorPlans } = useHubState(store);
  const plan = floorPlans[planId];
  const known = plan !== undefined;
  useEffect(() => {
    if (!known) void store.floorPlan(planId).catch(() => undefined);
  }, [store, planId, known]);
  return plan;
}

export function FloorCard({
  planId,
  onOpen,
}: {
  planId: string;
  onOpen: (planId: string, check: boolean) => void;
}) {
  const { t } = useI18n();
  const plan = useFloorPlan(planId);
  if (!plan) return null;
  const layout = currentLayout(plan);
  const pending = pendingMeasures(layout).length;
  const meta = [
    t("floorplan-area", { area: areaText(planArea(plan, layout)) }),
    plan.kind,
    t("floorplan-rooms", { count: layout.rooms.length }),
  ]
    .filter(Boolean)
    .join(t("daily-dot"));
  return (
    <div className="floor-card">
      <button type="button" className="floor-card__top" onClick={() => onOpen(plan.id, false)}>
        <span className="floor-card__thumb">
          <FloorCanvas
            layout={layout}
            view="plain"
            thumbnail
            className="floor-card__svg"
            label={plan.title}
          />
        </span>
        <span className="floor-card__text">
          <b className="floor-card__title">{plan.title}</b>
          <span className="floor-card__meta">{meta}</span>
          {pending > 0 ? (
            <span className="floor-card__pending">
              {t("floorplan-card-pending", { count: pending })}
            </span>
          ) : layout.measures.length > 0 ? (
            <span className="floor-card__checked">{t("floorplan-card-checked")}</span>
          ) : null}
        </span>
      </button>
      <div className="floor-card__actions">
        <button type="button" className="button--dark" onClick={() => onOpen(plan.id, false)}>
          {t("floorplan-open")}
        </button>
        {pending > 0 && (
          <button type="button" className="button--line" onClick={() => onOpen(plan.id, true)}>
            {t("floorplan-check-first")}
          </button>
        )}
      </div>
    </div>
  );
}
