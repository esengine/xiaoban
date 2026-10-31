import { useI18n } from "@xiaoban/i18n/react";
import type { ReactNode } from "react";

interface Props {
  note?: ReactNode;
  onBack?: (() => void) | undefined;
  skip?: { label: string; onSkip: () => void } | undefined;
  next: {
    label: string;
    disabled?: boolean | undefined;
    busy?: boolean | undefined;
    onNext?: (() => void) | undefined;
  };
}

export function StepFooter({ note, onBack, skip, next }: Props) {
  const { t } = useI18n();
  return (
    <footer className="step-footer">
      {onBack && (
        <button type="button" className="step-footer__back" onClick={onBack}>
          {t("onboarding-back")}
        </button>
      )}
      {note && <span className="step-footer__note">{note}</span>}
      <span className="step-footer__spacer" />
      {skip && (
        <button type="button" className="step-footer__skip" onClick={skip.onSkip}>
          {skip.label}
        </button>
      )}
      <button
        type={next.onNext ? "button" : "submit"}
        className="step-footer__next"
        disabled={next.disabled || next.busy}
        onClick={next.onNext}
      >
        {next.busy && <span className="spinner" aria-hidden="true" />}
        {next.label}
      </button>
    </footer>
  );
}
