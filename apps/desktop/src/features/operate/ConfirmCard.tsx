import { confirmText } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { ConfirmChoice, ConfirmRequest } from "@xiaoban/protocol";
import { useState } from "react";
import { useHub } from "../../app/hub.tsx";

export function useConfirmText(confirm: ConfirmRequest) {
  const translator = useI18n();
  return confirmText(confirm, translator.t);
}

const CODE_KINDS = new Set(["run_command", "read_outside", "write_outside"]);

function CodeConfirm({
  confirm,
  text,
  sent,
  answer,
}: {
  confirm: ConfirmRequest;
  text: ReturnType<typeof useConfirmText>;
  sent: boolean;
  answer: (choice: ConfirmChoice) => void;
}) {
  const kind = confirm.kind;
  return (
    <fieldset className="code-confirm" aria-label={text.title}>
      <legend className="code-confirm__head">{text.title}</legend>
      <p className="code-confirm__detail">{text.detail}</p>
      {text.hint && <p className="code-confirm__hint">{text.hint}</p>}
      {kind.kind === "write_outside" && kind.preview.length > 0 && (
        <div className="code-confirm__preview">
          {kind.preview.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: preview lines have no identity
            <div key={index} className="diff-line" data-kind={line.kind}>
              <span className="diff-line__no">{line.old ?? line.new ?? ""}</span>
              <span className="diff-line__sign">{line.kind === "added" ? "+" : "-"}</span>
              <span className="diff-line__text">{line.text}</span>
            </div>
          ))}
        </div>
      )}
      <div className="code-confirm__choices">
        {text.choices.map((item) => (
          <button
            key={item.choice}
            type="button"
            className="code-confirm__choice"
            data-primary={item.primary || undefined}
            disabled={sent}
            onClick={() => answer(item.choice)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ConfirmCard({ confirm }: { confirm: ConfirmRequest }) {
  const store = useHub();
  const text = useConfirmText(confirm);
  const [sent, setSent] = useState(false);
  const answer = (choice: ConfirmChoice) => {
    setSent(true);
    void store.answerConfirm(confirm.id, choice).catch(() => setSent(false));
  };
  if (CODE_KINDS.has(confirm.kind.kind)) {
    return <CodeConfirm confirm={confirm} text={text} sent={sent} answer={answer} />;
  }
  return (
    <fieldset className="confirm-card" aria-label={text.title}>
      <div className="confirm-card__head">
        <span className="confirm-card__face" aria-hidden="true">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="9" cy="11" r="1.1" />
            <circle cx="15" cy="11" r="1.1" />
          </svg>
        </span>
        <span className="confirm-card__text">
          <b>{text.title}</b>
          <span className="confirm-card__hint">{text.hint}</span>
        </span>
      </div>
      {text.detail && <p className="confirm-card__detail">{text.detail}</p>}
      {text.choices.length > 0 && (
        <div className="confirm-card__choices">
          {text.choices.map((item) => (
            <button
              key={item.choice}
              type="button"
              className="confirm-card__choice"
              data-primary={item.primary || undefined}
              disabled={sent}
              onClick={() => answer(item.choice)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
