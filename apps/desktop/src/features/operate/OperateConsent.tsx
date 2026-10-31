import { useI18n } from "@xiaoban/i18n/react";
import type { ConfirmRequest } from "@xiaoban/protocol";
import { useEffect, useRef } from "react";
import { useHub } from "../../app/hub.tsx";
import { openExternal } from "../../lib/external.ts";

const ACCESSIBILITY =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
const POLL_MS = 1_000;

export function OperateConsent({ confirm }: { confirm: ConfirmRequest }) {
  const { t } = useI18n();
  const store = useHub();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
    const timer = window.setInterval(() => {
      void store.operateStatus().then((permissions) => {
        if (permissions.control) void store.answerConfirm(confirm.id, "yes");
      });
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [store, confirm.id]);

  return (
    <dialog
      ref={dialog}
      className="dialog operate-consent"
      aria-labelledby="operate-consent-title"
      onCancel={(event) => {
        event.preventDefault();
        void store.answerConfirm(confirm.id, "no");
      }}
    >
      <div className="operate-consent__head">
        <span className="operate-consent__icon" aria-hidden="true">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </span>
        <div>
          <h2 id="operate-consent-title" className="operate-consent__title">
            {t("operate-consent-title")}
          </h2>
          <p className="operate-consent__lead">{t("operate-consent-lead")}</p>
        </div>
      </div>
      <div className="operate-consent__body">
        <section>
          <b>{t("operate-consent-what")}</b>
          <p>{t("operate-consent-what-body")}</p>
        </section>
        <section>
          <b>{t("operate-consent-permissions")}</b>
          <div className="operate-consent__permission">
            <b>{t("operate-consent-control")}</b>
            <span>{t("operate-consent-control-body")}</span>
          </div>
        </section>
        <section>
          <b>{t("operate-consent-limits")}</b>
          <p>{t("operate-consent-limits-body")}</p>
        </section>
        <section>
          <b>{t("operate-consent-stop")}</b>
          <p>{t("operate-consent-stop-body")}</p>
        </section>
      </div>
      <div className="operate-consent__actions">
        <button
          type="button"
          className="button button--line"
          onClick={() => void store.answerConfirm(confirm.id, "no")}
        >
          {t("operate-consent-later")}
        </button>
        <button
          type="button"
          className="button button--dark"
          onClick={() => void openExternal(ACCESSIBILITY)}
        >
          {t("operate-consent-open")}
        </button>
      </div>
    </dialog>
  );
}
