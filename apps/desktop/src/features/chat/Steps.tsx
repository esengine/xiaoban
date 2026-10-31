import type { TraceStep } from "@xiaoban/client";
import type { MessageKey, PlainMessageKey, Translator } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";

type T = Translator["t"];

const WITH_DETAIL: Record<string, { detail: MessageKey; plain: PlainMessageKey }> = {
  web_search: { detail: "step-web_search", plain: "step-web_search-plain" },
  read_page: { detail: "step-read_page", plain: "step-read_page-plain" },
  weather: { detail: "step-weather", plain: "step-weather-plain" },
  remember: { detail: "step-remember", plain: "step-remember-plain" },
};

const PLAIN: Record<string, PlainMessageKey> = {
  save_trip: "step-save_trip",
  locate: "step-locate",
};

export function stepText(t: T, step: TraceStep): string {
  const keyed = WITH_DETAIL[step.tool];
  if (keyed) {
    return step.detail
      ? t(keyed.detail as "step-web_search", { detail: step.detail })
      : t(keyed.plain);
  }
  const plain = PLAIN[step.tool];
  return plain ? t(plain) : t("step-generic");
}

export function stepResult(t: T, step: TraceStep): string | null {
  const result = step.result;
  if (!result) return null;
  switch (result.kind) {
    case "found":
      return result.sources.length > 0
        ? t("step-found", {
            count: result.count,
            sources: result.sources.join(t("step-sources-joiner")),
          })
        : t("step-found-plain", { count: result.count });
    case "page":
      return result.title || null;
    case "saved":
      return t("step-saved", { version: result.version });
    case "failed":
      return t(step.tool === "read_page" ? "step-failed-page" : "step-failed");
    case "done":
      return null;
  }
}

function StepIcon({ step }: { step: TraceStep }) {
  if (!step.result) return <span className="step__now" aria-hidden="true" />;
  if (step.result.kind === "failed") {
    return (
      <span className="step__icon step__icon--failed" aria-hidden="true">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </span>
    );
  }
  return (
    <span className="step__icon" aria-hidden="true">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 12l5 5 9-10" />
      </svg>
    </span>
  );
}

export function StepList({ steps }: { steps: readonly TraceStep[] }) {
  const { t } = useI18n();
  return (
    <ol className="steps">
      {steps.map((step) => {
        const result = stepResult(t, step);
        return (
          <li key={step.callId} className="step" data-current={step.result ? undefined : true}>
            <StepIcon step={step} />
            <span className="step__body">
              {stepText(t, step)}
              {result && <span className="step__result">{result}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
