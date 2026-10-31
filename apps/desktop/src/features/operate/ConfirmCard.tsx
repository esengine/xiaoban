import { useI18n } from "@xiaoban/i18n/react";
import type { ConfirmChoice, ConfirmRequest } from "@xiaoban/protocol";
import { useState } from "react";
import { useHub } from "../../app/hub.tsx";

interface Choice {
  choice: ConfirmChoice;
  label: string;
  primary?: boolean;
}

export function useConfirmText(confirm: ConfirmRequest) {
  const { t } = useI18n();
  const kind = confirm.kind;
  if (kind.kind === "allow_app") {
    return {
      title: t("confirm-allow-title", { app: kind.app }),
      hint: t("confirm-allow-hint"),
      detail: null,
      choices: [
        { choice: "no", label: t("confirm-allow-no") },
        { choice: "once", label: t("confirm-allow-once") },
        { choice: "always", label: t("confirm-allow-always"), primary: true },
      ] satisfies Choice[],
    };
  }
  if (kind.kind === "borrow_mouse") {
    return {
      title: t("confirm-mouse-title", { app: kind.app }),
      hint: t("confirm-mouse-hint"),
      detail: null,
      choices: [
        { choice: "no", label: t("confirm-mouse-no") },
        { choice: "once", label: t("confirm-mouse-once") },
        { choice: "always", label: t("confirm-mouse-always"), primary: true },
      ] satisfies Choice[],
    };
  }
  if (kind.kind === "open_subthreads") {
    return {
      title: t("confirm-subthreads-title", { count: kind.titles.length }),
      hint: t("confirm-subthreads-hint"),
      detail: [
        kind.reason,
        ...kind.titles.map((title) => t("confirm-subthreads-item", { title })),
      ].join("\n"),
      choices: [
        { choice: "no", label: t("confirm-subthreads-no") },
        { choice: "edit", label: t("confirm-subthreads-edit") },
        { choice: "yes", label: t("confirm-subthreads-yes"), primary: true },
      ] satisfies Choice[],
    };
  }
  if (kind.kind === "action") {
    return {
      title: kind.title,
      hint: t("confirm-action-hint"),
      detail: kind.detail,
      choices: [
        { choice: "no", label: t("confirm-action-no") },
        { choice: "edit", label: t("confirm-action-edit") },
        { choice: "yes", label: t("confirm-action-yes"), primary: true },
      ] satisfies Choice[],
    };
  }
  return {
    title: t("confirm-permissions-title"),
    hint: t("confirm-permissions-hint"),
    detail: null,
    choices: [] satisfies Choice[],
  };
}

export function ConfirmCard({ confirm }: { confirm: ConfirmRequest }) {
  const store = useHub();
  const text = useConfirmText(confirm);
  const [sent, setSent] = useState(false);
  const answer = (choice: ConfirmChoice) => {
    setSent(true);
    void store.answerConfirm(confirm.id, choice).catch(() => setSent(false));
  };
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
