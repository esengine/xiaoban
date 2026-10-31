import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { AutonomyLevel } from "@xiaoban/protocol";
import { useState } from "react";
import { useHub } from "../../../app/hub.tsx";
import { StepFooter } from "../StepFooter.tsx";

const LEVELS = [
  {
    level: "cautious",
    name: "trust-cautious-name",
    desc: "trust-cautious-desc",
    example: "trust-cautious-example",
  },
  {
    level: "balanced",
    name: "trust-balanced-name",
    desc: "trust-balanced-desc",
    example: "trust-balanced-example",
  },
  {
    level: "hands_off",
    name: "trust-hands-off-name",
    desc: "trust-hands-off-desc",
    example: "trust-hands-off-example",
  },
] as const satisfies readonly {
  level: AutonomyLevel;
  name: PlainMessageKey;
  desc: PlainMessageKey;
  example: PlainMessageKey;
}[];

export function TrustStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const [level, setLevel] = useState<AutonomyLevel>(
    store.getSnapshot().preferences?.autonomy ?? "balanced",
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await store.setAutonomy(level);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="step">
      <div className="step__body">
        <fieldset className="trust-grid">
          {LEVELS.map((option) => (
            <label key={option.level} className="trust-card" data-selected={option.level === level}>
              <input
                type="radio"
                name="autonomy"
                value={option.level}
                checked={option.level === level}
                onChange={() => setLevel(option.level)}
              />
              <span className="trust-card__head">
                <span className="trust-card__name">{t(option.name)}</span>
                <span className="radio-dot" aria-hidden="true" />
              </span>
              <span className="trust-card__desc">{t(option.desc)}</span>
              <span className="trust-card__example">{t(option.example)}</span>
            </label>
          ))}
        </fieldset>
        <p className="trust-step__red-lines">{t("trust-red-lines")}</p>
      </div>
      <StepFooter
        onBack={onBack}
        next={{ label: t("onboarding-next"), busy: saving, onNext: () => void save() }}
      />
    </div>
  );
}
