import { useI18n } from "@xiaoban/i18n/react";
import { useEffect, useRef } from "react";

interface Props {
  title: string;
  body: string;
  confirm: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ title, body, confirm, onConfirm, onClose }: Props) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="dialog dialog--confirm"
      aria-labelledby="confirm-title"
      onClose={onClose}
    >
      <h2 id="confirm-title" className="dialog__title">
        {title}
      </h2>
      <p className="dialog__body">{body}</p>
      <div className="dialog__actions">
        <button type="button" className="dialog__secondary" onClick={() => dialog.current?.close()}>
          {t("dialog-cancel")}
        </button>
        <button
          type="button"
          className="dialog__danger"
          onClick={() => {
            onConfirm();
            dialog.current?.close();
          }}
        >
          {confirm}
        </button>
      </div>
    </dialog>
  );
}
