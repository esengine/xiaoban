import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { FloorPlan, PlanAction } from "@xiaoban/protocol";
import { useEffect } from "react";
import { useHub } from "../../app/hub.tsx";

export function FloorProgress({ plan, onSent }: { plan: FloorPlan; onSent: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const { plans } = useHubState(store);
  const progress = plans[plan.threadId] ?? null;

  useEffect(() => {
    void store.loadPlan(plan.threadId).catch(() => undefined);
  }, [store, plan.threadId]);

  const act = (action: PlanAction) =>
    void store.planAction(plan.threadId, action).catch(() => undefined);

  if (!progress) {
    return (
      <div className="floor-progress">
        <p className="floor-progress__empty">{t("floorplan-progress-empty")}</p>
        <button
          type="button"
          className="button--dark floor-progress__wide"
          onClick={() =>
            void store
              .send(plan.threadId, t("floorplan-progress-start-message"))
              .then(onSent)
              .catch(() => undefined)
          }
        >
          {t("floorplan-progress-start")}
        </button>
      </div>
    );
  }

  const done = progress.steps.filter(
    (step) => step.status === "done" || step.status === "skipped",
  ).length;
  const next = progress.steps.findIndex(
    (step) => step.status === "todo" || step.status === "running",
  );
  const question = progress.question;
  return (
    <div className="floor-progress">
      <div>
        <b className="floor-progress__title">
          {t("floorplan-progress-title", {
            title: progress.title,
            done,
            total: progress.steps.length,
          })}
        </b>
        {progress.bounds && <div className="floor-progress__sub">{progress.bounds}</div>}
      </div>
      <ol className="floor-progress__steps">
        {progress.steps.map((step, index) => (
          <li key={`${index}-${step.title}`} className="floor-progress__step">
            <span className="floor-progress__dot" data-status={step.status} />
            <span className="floor-progress__name">{step.title}</span>
            {step.due && <span className="floor-progress__due">{step.due}</span>}
          </li>
        ))}
      </ol>
      {question && (
        <>
          <div className="floor-progress__ask">
            {t("floorplan-progress-ask", { text: question.text })}
          </div>
          {question.options.length > 0 && (
            <div className="floor-progress__options">
              {question.options.map((option, index) => (
                <button
                  key={option}
                  type="button"
                  className={index === 0 ? "button--dark" : "button--line"}
                  onClick={() => act({ kind: "choose", option })}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {progress.status === "draft" ? (
        <button
          type="button"
          className="button--dark floor-progress__wide"
          onClick={() => act({ kind: "approve" })}
        >
          {t("plan-approve")}
        </button>
      ) : next >= 0 ? (
        <button
          type="button"
          className="button--line floor-progress__wide"
          onClick={() => act({ kind: "step_done", step: next + 1 })}
        >
          {t("floorplan-progress-step-done")}
          {t("daily-dot")}
          {progress.steps[next]?.title}
        </button>
      ) : null}
      <p className="floor-progress__foot">{t("floorplan-progress-foot")}</p>
    </div>
  );
}
