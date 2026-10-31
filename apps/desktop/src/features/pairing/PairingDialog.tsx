import { useI18n } from "@xiaoban/i18n/react";
import { useEffect, useRef } from "react";
import { dismiss, dismissOnCancel } from "../../lib/dialog.ts";
import { PairingPanel } from "./PairingPanel.tsx";

export function PairingDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onCancel={dismissOnCancel}
      className="dialog"
      aria-labelledby="pairing-title"
      onClose={onClose}
    >
      <header className="dialog__header">
        <h2 id="pairing-title">{t("pairing-dialog-title")}</h2>
        <button
          type="button"
          className="dialog__close"
          aria-label={t("dialog-close")}
          onClick={() => dismiss(dialog.current)}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <PairingPanel />
    </dialog>
  );
}
