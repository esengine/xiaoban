import { dayKey, mailSender, monthDay } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { MailOriginal } from "@xiaoban/protocol";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { dismiss, dismissOnCancel } from "../../lib/dialog.ts";

export function MailOriginalDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const dialog = useRef<HTMLDialogElement>(null);
  const [original, setOriginal] = useState<MailOriginal | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    let live = true;
    void store
      .mailOriginal(id)
      .then((found) => {
        if (live) setOriginal(found);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [store, id]);

  const item = original?.item;
  return (
    <dialog
      ref={dialog}
      onCancel={dismissOnCancel}
      onClose={onClose}
      className="dialog ws-settings mail-original"
      aria-labelledby="mail-original-title"
    >
      <div className="ws-settings__head">
        <h2 id="mail-original-title" className="dialog__title">
          {item?.subject || t("mail-original-title")}
        </h2>
        <button
          type="button"
          className="dialog__close"
          aria-label={t("dialog-close")}
          onClick={() => dismiss(dialog.current)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M7 7l10 10M17 7L7 17" />
          </svg>
        </button>
      </div>
      <section className="ws-settings__section">
        {original && item ? (
          <>
            <p className="mail-original__from">
              {t("mail-original-from", {
                from: `${mailSender(item)} <${item.fromAddress}>`,
                date: monthDay(t, dayKey(item.at)),
              })}
            </p>
            <p className="mail-original__text">{original.text}</p>
            {original.truncated && (
              <p className="mail-original__from">{t("mail-original-truncated")}</p>
            )}
          </>
        ) : (
          <p className="life-card__hint">
            {failed ? t("mail-original-failed") : t("mail-original-loading")}
          </p>
        )}
      </section>
    </dialog>
  );
}
