import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import { useState } from "react";
import { Mascot } from "./Mascot.tsx";
import { MeetStep } from "./steps/MeetStep.tsx";
import { ModelStep } from "./steps/ModelStep.tsx";
import { PhoneStep } from "./steps/PhoneStep.tsx";
import { TrustStep } from "./steps/TrustStep.tsx";
import "./onboarding.css";

const STEPS = [
  { title: "step-model-title", hint: "step-model-hint" },
  { title: "step-meet-title", hint: "step-meet-hint" },
  { title: "step-trust-title", hint: "step-trust-hint" },
  { title: "step-phone-title", hint: "step-phone-hint" },
] as const satisfies readonly { title: PlainMessageKey; hint: PlainMessageKey }[];

const HEADINGS = [
  { heading: "model-heading", lead: "model-lead" },
  { heading: "meet-heading", lead: "meet-lead" },
  { heading: "trust-heading", lead: "trust-lead" },
  { heading: "phone-heading", lead: "phone-lead" },
] as const satisfies readonly { heading: PlainMessageKey; lead: PlainMessageKey }[];

export function Onboarding({ startAt, onFinish }: { startAt: number; onFinish: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState(startAt);
  const next = () => setStep((current) => Math.min(current + 1, STEPS.length - 1));
  const back = () => setStep((current) => Math.max(current - 1, 0));
  const copy = HEADINGS[step] ?? HEADINGS[0];

  return (
    <div className="onboarding">
      <aside className="onboarding__aside">
        <Mascot />
        <p className="onboarding__hello">{t("onboarding-hello")}</p>
        <p className="onboarding__intro">{t("onboarding-intro")}</p>
        <ol className="onboarding__steps">
          {STEPS.map((item, index) => {
            const state = index < step ? "done" : index === step ? "current" : "pending";
            return (
              <li
                key={item.title}
                className="onboarding-step"
                data-state={state}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span className="onboarding-step__dot">
                  {state === "done" ? (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>
                <span>
                  <span className="onboarding-step__title">{t(item.title)}</span>
                  <span className="onboarding-step__hint">{t(item.hint)}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <p className="onboarding__privacy">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          {t("onboarding-privacy")}
        </p>
      </aside>

      <main className="onboarding__main">
        <p className="onboarding__progress">
          {t("onboarding-progress", { step: step + 1, total: STEPS.length })}
        </p>
        <h1 className="onboarding__heading">{t(copy.heading)}</h1>
        <p className="onboarding__lead">{t(copy.lead)}</p>
        {step === 0 && <ModelStep onDone={next} />}
        {step === 1 && <MeetStep onBack={back} onDone={next} />}
        {step === 2 && <TrustStep onBack={back} onDone={next} />}
        {step === 3 && <PhoneStep onBack={back} onDone={onFinish} />}
      </main>
    </div>
  );
}
