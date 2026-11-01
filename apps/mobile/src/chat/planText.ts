import type { useI18n } from "@xiaoban/i18n/react";
import type { Plan, PlanStep } from "@xiaoban/protocol";

type Translate = ReturnType<typeof useI18n>["t"];

export type StepMark = "done" | "now" | "todo";
export type StepTag = "you" | "bot" | null;

export function finished(step: PlanStep) {
  return step.status === "done" || step.status === "skipped";
}

export function progress(plan: Plan) {
  return { done: plan.steps.filter(finished).length, total: plan.steps.length };
}

export function nextIndex(plan: Plan) {
  return plan.steps.findIndex((step) => step.status === "todo" || step.status === "running");
}

export function stepMark(plan: Plan, index: number): StepMark {
  const step = plan.steps[index];
  if (!step || finished(step)) return "done";
  if (plan.status !== "draft" && (index === nextIndex(plan) || step.status === "running")) {
    return "now";
  }
  return "todo";
}

export function stepTag(plan: Plan, index: number): StepTag {
  const step = plan.steps[index];
  if (!step || finished(step)) return null;
  if (step.owner === "you") return "you";
  if (plan.status === "blocked" && index === nextIndex(plan)) return "you";
  return "bot";
}

function stepLine(t: Translate, step: PlanStep) {
  return step.due
    ? t("plan-chat-next-due", { step: step.title, due: step.due })
    : t("plan-chat-next", { step: step.title });
}

export function planSubtitle(t: Translate, plan: Plan) {
  if (plan.status === "draft") return t("plan-sub-draft", { version: plan.version });
  if (plan.status === "done") return t("plan-sub-done");
  if (plan.status === "blocked") return plan.question?.text || t("plan-sub-blocked");
  if (plan.status === "paused") return t("plan-sub-paused");
  const step = plan.steps[nextIndex(plan)];
  return step ? stepLine(t, step) : t("plan-sub-done");
}

export function ballState(t: Translate, plan: Plan) {
  const { done, total } = progress(plan);
  const index = nextIndex(plan);
  const step = plan.steps[index];
  const blocked = plan.status === "blocked";
  const question = blocked ? plan.question : null;
  const next = question?.text
    ? t("plan-ball-ask", { question: question.text })
    : plan.status === "running" && step
      ? t("plan-ball-next", {
          step: step.due
            ? t("plan-ball-then-step", { step: step.title, due: step.due })
            : step.title,
        })
      : planSubtitle(t, plan);
  const later = index < 0 ? [] : plan.steps.slice(index + 1).filter((item) => !finished(item));
  const then = later
    .slice(0, 2)
    .map((item) =>
      item.due ? t("plan-ball-then-step", { step: item.title, due: item.due }) : item.title,
    )
    .join(" · ");
  return {
    mode: "show",
    threadId: plan.threadId,
    title: plan.title,
    done,
    total,
    count: t("plan-ring", { done, total }),
    attention: blocked,
    label: t("plan-ball-label", { title: plan.title, done, total }),
    next,
    after: then ? t("plan-ball-then", { steps: then }) : "",
    options: question ? question.options.slice(0, 3) : [],
    open: t("plan-ball-open"),
    closed: t("plan-ball-closed"),
    undo: t("plan-ball-undo"),
  };
}

export function planChange(t: Translate, before: Plan, after: Plan): string | null {
  if (before.threadId !== after.threadId) return null;
  if (after.version !== before.version) {
    return after.changes
      ? t("plan-notice-changes", { changes: after.changes })
      : t("plan-notice-version", { version: after.version });
  }
  for (const [index, step] of after.steps.entries()) {
    const old = before.steps[index];
    if (!old) continue;
    if (step.due && step.due !== old.due) {
      return t("plan-notice-due", { step: index + 1, due: step.due });
    }
    if (step.title !== old.title) {
      return t("plan-notice-title", { step: index + 1, title: step.title });
    }
    if (step.note && step.note !== old.note) return t("plan-notice-note", { note: step.note });
  }
  if (after.steps.length !== before.steps.length) return t("plan-notice-updated");
  return null;
}
