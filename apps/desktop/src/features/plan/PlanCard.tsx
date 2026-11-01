import { useI18n } from "@xiaoban/i18n/react";
import type { Plan, PlanAction, PlanStep, StepOutput } from "@xiaoban/protocol";
import { type CSSProperties, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { nextStep, usePlanSummary } from "./planSummary.ts";

function stripKind(label: string, prefixes: string) {
  const words = prefixes.split("|").map((word) => word.trim().toLowerCase());
  const [head, ...rest] = label.split(/\s*[·:\uFF1A]\s*/u);
  return rest.length > 0 && words.includes((head ?? "").toLowerCase()) ? rest.join(" · ") : label;
}

export interface PlanOpeners {
  onOpenDoc?: (docId: string) => void;
  onOpenSheet?: (sheetId: string) => void;
  onOpenDeck?: (deckId: string) => void;
}

export function PlanRing({ plan, size = 30 }: { plan: Plan; size?: number }) {
  const { t } = useI18n();
  const done = plan.steps.filter(
    (step) => step.status === "done" || step.status === "skipped",
  ).length;
  const total = plan.steps.length;
  return (
    <span
      className="plan-ring"
      style={
        {
          "--size": `${size}px`,
          "--done": `${total ? (done / total) * 360 : 0}deg`,
        } as CSSProperties
      }
    >
      <span>{t("plan-ring", { done, total })}</span>
    </span>
  );
}

function Output({ output, openers }: { output: StepOutput; openers: PlanOpeners }) {
  const { t } = useI18n();
  const open =
    output.id === null
      ? null
      : output.kind === "doc"
        ? openers.onOpenDoc
        : output.kind === "sheet"
          ? openers.onOpenSheet
          : output.kind === "deck"
            ? openers.onOpenDeck
            : undefined;
  const name = stripKind(output.label, t("plan-output-prefixes")) || output.label;
  const label =
    output.kind === "text" ? output.label : `${t(`plan-output-${output.kind}`)} · ${name}`;
  if (open && output.id) {
    const id = output.id;
    return (
      <button type="button" className="plan-step__output" onClick={() => open(id)}>
        {label}
      </button>
    );
  }
  return (
    <span className="plan-step__output" data-plain>
      {label}
    </span>
  );
}

function Steps({
  plan,
  openers,
  act,
  compact,
}: {
  plan: Plan;
  openers: PlanOpeners;
  act: (action: PlanAction) => void;
  compact: boolean;
}) {
  const { t } = useI18n();
  const next = nextStep(plan);
  return (
    <ol className="plan-steps" data-compact={compact || undefined}>
      {plan.steps.map((step, index) => {
        const current = next?.[0] === index && plan.status === "running";
        const mark =
          step.status === "done" || step.status === "skipped"
            ? "done"
            : current || step.status === "running"
              ? "running"
              : "todo";
        return (
          <li key={`${index}-${step.title}`} className="plan-step" data-mark={mark}>
            <div className="plan-step__row">
              <span className="plan-step__mark" aria-hidden="true" />
              <span className="plan-step__title">{step.title}</span>
              {step.output && !compact && <Output output={step.output} openers={openers} />}
              {mark === "running" && !step.output && (
                <span className="plan-step__doing">{t("plan-step-doing")}</span>
              )}
              {step.due && <span className="plan-step__due">{step.due}</span>}
            </div>
            {step.note && !compact && (
              <p className="plan-step__note">
                <span className="plan-tag" data-tone="accent">
                  {t("plan-adjusted")}
                </span>
                {step.note}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function PlanCard({
  plan,
  docked = false,
  openers = {},
  onDock,
  onAsk,
}: {
  plan: Plan;
  docked?: boolean;
  openers?: PlanOpeners;
  onDock?: (docked: boolean) => void;
  onAsk?: () => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const [open, setOpen] = useState(plan.status !== "done");
  const [busy, setBusy] = useState(false);
  const summary = usePlanSummary(plan);
  const act = (action: PlanAction) => {
    setBusy(true);
    void store
      .planAction(plan.threadId, action)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  if (plan.status === "draft") {
    return (
      <section className="plan-card" data-status="draft" aria-label={plan.title}>
        <header className="plan-card__head">
          <b>{plan.title}</b>
          <span className="plan-tag" data-tone="accent">
            {t("plan-draft-tag", { version: plan.version })}
          </span>
          <span className="plan-card__spacer" />
          {plan.changes && <span className="plan-card__muted">{plan.changes}</span>}
        </header>
        <ol className="plan-draft">
          {plan.steps.map((step, index) => (
            <li key={`${index}-${step.title}`}>
              <span className="plan-draft__number">{index + 1}</span>
              <span className="plan-step__title">{step.title}</span>
              {step.due && <span className="plan-step__due">{step.due}</span>}
            </li>
          ))}
        </ol>
        {plan.bounds && (
          <p className="plan-card__bounds">{t("plan-bounds", { bounds: plan.bounds })}</p>
        )}
        <footer className="plan-card__foot">
          <button
            type="button"
            className="plan-button"
            data-primary
            disabled={busy}
            onClick={() => act({ kind: "approve" })}
          >
            {t("plan-approve")}
          </button>
          <span className="plan-card__muted">{t("plan-draft-hint")}</span>
          <span className="plan-card__spacer" />
          <button type="button" className="plan-link" onClick={() => act({ kind: "dismiss" })}>
            {t("plan-dismiss")}
          </button>
        </footer>
      </section>
    );
  }

  const question = plan.status === "blocked" ? plan.question : null;
  return (
    <section
      className="plan-card"
      data-status={plan.status}
      data-docked={docked || undefined}
      aria-label={plan.title}
    >
      <header className="plan-card__head">
        <PlanRing plan={plan} size={docked ? 26 : 30} />
        <div className="plan-card__heading">
          <b>{question ? t("plan-blocked-title", { title: plan.title }) : plan.title}</b>
          {!question && <span>{summary}</span>}
        </div>
        {docked ? (
          onDock && (
            <button type="button" className="plan-link" onClick={() => onDock(false)}>
              {t("plan-undock")}
            </button>
          )
        ) : (
          <button
            type="button"
            className="plan-link plan-link--muted"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? t("plan-collapse") : t("plan-expand")}
          </button>
        )}
      </header>
      {question && (
        <div className="plan-question">
          <p>{question.text}</p>
          <div className="plan-question__options">
            {question.options.map((option, index) => (
              <button
                key={option}
                type="button"
                className="plan-button"
                data-primary={index === 0 || undefined}
                disabled={busy}
                onClick={() => act({ kind: "choose", option })}
              >
                {option}
              </button>
            ))}
            <span className="plan-card__spacer" />
            {onAsk && (
              <button type="button" className="plan-link" onClick={onAsk}>
                {t("plan-reply")}
              </button>
            )}
          </div>
        </div>
      )}
      {(open || docked) && (
        <>
          <Steps plan={plan} openers={openers} act={act} compact={docked} />
          {!docked && plan.status !== "done" && (
            <footer className="plan-card__foot" data-line>
              {plan.status === "paused" ? (
                <button
                  type="button"
                  className="plan-button"
                  disabled={busy}
                  onClick={() => act({ kind: "resume" })}
                >
                  {t("plan-resume")}
                </button>
              ) : (
                <button
                  type="button"
                  className="plan-button"
                  disabled={busy}
                  onClick={() => act({ kind: "pause" })}
                >
                  {t("plan-pause")}
                </button>
              )}
              {onDock && (
                <button type="button" className="plan-button" onClick={() => onDock(true)}>
                  {t("plan-dock")}
                </button>
              )}
              <span className="plan-card__muted" data-end title={plan.bounds ?? undefined}>
                {plan.bounds}
              </span>
            </footer>
          )}
        </>
      )}
    </section>
  );
}
