import { useI18n } from "@xiaoban/i18n/react";
import { useState } from "react";
import { useHub } from "../../../app/hub.tsx";
import { PairingPanel } from "../../pairing/PairingPanel.tsx";
import { StepFooter } from "../StepFooter.tsx";

export function PhoneStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const [paired, setPaired] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const finish = async () => {
    setFinishing(true);
    try {
      await store.completeOnboarding();
      onDone();
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="step">
      <div className="step__body">
        <PairingPanel onPaired={() => setPaired(true)} />
      </div>
      <StepFooter
        onBack={onBack}
        skip={paired ? undefined : { label: t("onboarding-later"), onSkip: () => void finish() }}
        next={{ label: t("onboarding-finish"), busy: finishing, onNext: () => void finish() }}
      />
    </div>
  );
}
