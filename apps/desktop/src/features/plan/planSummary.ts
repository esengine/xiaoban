import { useI18n } from "@xiaoban/i18n/react";
import type { Plan, PlanStep } from "@xiaoban/protocol";

export function nextStep(plan: Plan): [number, PlanStep] | null {
  const index = plan.steps.findIndex((step) => step.status === "todo" || step.status === "running");
  const step = plan.steps[index];
  return step ? [index, step] : null;
}

export function usePlanSummary(plan: Plan) {
  const { t } = useI18n();
  const next = nextStep(plan);
  if (plan.status === "draft") return t("plan-sub-draft", { version: plan.version });
  if (plan.status === "done") return t("plan-sub-done");
  if (plan.status === "blocked") return t("plan-sub-blocked");
  if (plan.status === "paused") return t("plan-sub-paused");
  if (!next) return t("plan-sub-done");
  const [, step] = next;
  return step.owner === "you"
    ? t("plan-sub-you", { step: step.title })
    : t("plan-sub-doing", { step: step.title });
}
