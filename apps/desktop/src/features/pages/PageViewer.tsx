import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useI18n } from "@xiaoban/i18n/react";
import { useEffect, useRef, useState } from "react";
import { dismiss, dismissOnCancel } from "../../lib/dialog.ts";

export function PageViewer({
  code,
  title,
  name,
  onClose,
}: {
  code: string;
  title: string;
  name: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [id, setId] = useState<string | null>(null);
  const [width, setWidth] = useState<"desk" | "phone">("desk");

  useEffect(() => {
    dialog.current?.showModal();
    void invoke<string>("page_keep", { text: code })
      .then(setId)
      .catch(() => undefined);
  }, [code]);

  return (
    <dialog
      ref={dialog}
      className="dialog page-viewer"
      aria-label={title}
      onCancel={dismissOnCancel}
      onClose={onClose}
    >
      <header className="page-viewer__head">
        <b className="page-viewer__title">{title}</b>
        <div className="page-viewer__widths" role="group">
          <button type="button" aria-pressed={width === "phone"} onClick={() => setWidth("phone")}>
            {t("page-viewer-phone")}
          </button>
          <button type="button" aria-pressed={width === "desk"} onClick={() => setWidth("desk")}>
            {t("page-viewer-desk")}
          </button>
        </div>
        <button
          type="button"
          className="page-viewer__link"
          onClick={() => void invoke("html_open", { text: code, name }).catch(() => undefined)}
        >
          {t("page-viewer-system")}
        </button>
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
      <div className="page-viewer__stage">
        {id ? (
          <iframe
            title={title}
            sandbox="allow-scripts allow-forms allow-modals"
            src={convertFileSrc(id, "xbpage")}
            data-width={width}
          />
        ) : null}
      </div>
    </dialog>
  );
}
