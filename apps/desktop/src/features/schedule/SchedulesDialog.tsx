import { lastText, scheduleLine, sortedSchedules } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Schedule } from "@xiaoban/protocol";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { dismiss, dismissOnCancel } from "../../lib/dialog.ts";
import { ConfirmDialog } from "../dialog/ConfirmDialog.tsx";

export function SchedulesDialog({
  onClose,
  onOpenThread,
}: {
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const { schedules } = useHubState(store);
  const dialog = useRef<HTMLDialogElement>(null);
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState<Schedule | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    void store.listSchedules().catch(() => undefined);
  }, [store]);

  const items = sortedSchedules(schedules);
  const open = (threadId: string) => {
    onOpenThread(threadId);
    dismiss(dialog.current);
  };

  return (
    <dialog
      ref={dialog}
      onCancel={dismissOnCancel}
      onClose={onClose}
      className="dialog ws-settings"
      aria-labelledby="schedules-title"
    >
      <div className="ws-settings__head">
        <h2 id="schedules-title" className="dialog__title">
          {t("schedules-title")}
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
        {items.length === 0 ? (
          <p className="ws-settings__none">{t("schedules-empty")}</p>
        ) : (
          <ul className="schedules">
            {items.map((schedule) => {
              const on = schedule.state === "active";
              const live = on || schedule.state === "paused";
              const target = schedule.threadId;
              return (
                <li key={schedule.id} className="schedules__item">
                  <button
                    type="button"
                    className="schedules__text"
                    disabled={!target}
                    onClick={() => {
                      if (target) open(target);
                    }}
                  >
                    <b>{schedule.title}</b>
                    <span>{scheduleLine(t, schedule)}</span>
                    {schedule.last && (
                      <span
                        className="schedules__last"
                        data-failed={!schedule.last.ok || undefined}
                      >
                        {lastText(t, schedule.last)}
                      </span>
                    )}
                  </button>
                  {live && (
                    <button
                      type="button"
                      role="switch"
                      className="schedules__toggle"
                      aria-checked={on}
                      aria-label={t("schedule-toggle", { title: schedule.title })}
                      onClick={() => {
                        setFailed(false);
                        void store.setScheduleActive(schedule.id, !on).catch(() => setFailed(true));
                      }}
                    >
                      <span />
                    </button>
                  )}
                  <button
                    type="button"
                    className="ws-settings__danger"
                    onClick={() => setRemoving(schedule)}
                  >
                    {t("schedule-delete")}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {failed && <p className="schedule-card__invalid">{t("schedule-start-failed")}</p>}
        <p className="ws-settings__hint">{t("schedules-hint")}</p>
      </section>
      {removing && (
        <ConfirmDialog
          title={t("schedule-delete-confirm", { title: removing.title })}
          body=""
          confirm={t("schedule-delete")}
          onConfirm={() => void store.deleteSchedule(removing.id).catch(() => undefined)}
          onClose={() => setRemoving(null)}
        />
      )}
    </dialog>
  );
}
