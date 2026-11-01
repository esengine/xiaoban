import type { Translator } from "@xiaoban/i18n";
import type { ConfirmChoice, ConfirmRequest } from "@xiaoban/protocol";

export interface ConfirmOption {
  choice: ConfirmChoice;
  label: string;
  primary?: boolean;
}

export function confirmText(confirm: ConfirmRequest, t: Translator["t"]) {
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
      ] satisfies ConfirmOption[],
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
      ] satisfies ConfirmOption[],
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
      ] satisfies ConfirmOption[],
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
      ] satisfies ConfirmOption[],
    };
  }
  if (kind.kind === "price_check") {
    return {
      title: t(kind.phone ? "confirm-price-title" : "confirm-price-title-computer", {
        app: kind.app,
        item: kind.item,
      }),
      hint: t(kind.phone ? "confirm-price-hint" : "confirm-price-hint-computer"),
      detail: kind.detail || null,
      choices: [
        { choice: "yes", label: t("confirm-price-yes"), primary: true },
        { choice: "no", label: t("confirm-price-no") },
      ] satisfies ConfirmOption[],
    };
  }
  if (kind.kind === "run_command") {
    return {
      title: t("confirm-run-title"),
      hint: t("confirm-run-cwd", { cwd: kind.cwd }),
      detail: kind.command,
      choices: [
        { choice: "once", label: t("confirm-run-once"), primary: true },
        ...(kind.rule
          ? [{ choice: "always" as const, label: t("confirm-run-always", { rule: kind.rule }) }]
          : []),
        { choice: "no", label: t("confirm-run-no") },
      ] satisfies ConfirmOption[],
    };
  }
  if (kind.kind === "read_outside") {
    return {
      title: t("confirm-read-title"),
      hint: "",
      detail: kind.path,
      choices: [
        { choice: "once", label: t("confirm-run-once"), primary: true },
        { choice: "always", label: t("confirm-read-always", { folder: kind.folder }) },
        { choice: "no", label: t("confirm-run-no") },
      ] satisfies ConfirmOption[],
    };
  }
  if (kind.kind === "write_outside") {
    return {
      title: t("confirm-write-title"),
      hint: "",
      detail: kind.path,
      choices: [
        { choice: "once", label: t("confirm-run-once"), primary: true },
        { choice: "always", label: t("confirm-write-always", { folder: kind.folder }) },
        { choice: "no", label: t("confirm-run-no") },
      ] satisfies ConfirmOption[],
    };
  }
  return {
    title: t("confirm-permissions-title"),
    hint: t("confirm-permissions-hint"),
    detail: null,
    choices: [] satisfies ConfirmOption[],
  };
}
