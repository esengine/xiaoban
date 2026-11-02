import {
  MAIL_CATEGORY_KEYS,
  type MailActionKind,
  mailActions,
  mailLine,
  mailMeta,
} from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { MailItem, MailToday } from "@xiaoban/protocol";
import { useState } from "react";
import { MailOriginalDialog } from "./MailOriginalDialog.tsx";
import { useMailAct } from "./useMailAct.ts";

export function MailRow({
  item,
  onAct,
  onOpen,
}: {
  item: MailItem;
  onAct?: ((item: MailItem, kind: MailActionKind) => void) | undefined;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  const actions = onAct ? mailActions(t, item) : [];
  return (
    <div className="mail-row">
      <button type="button" className="mail-row__text" onClick={() => onOpen(item.id)}>
        <span className="mail-row__tags">
          <span className="mail-tag" data-category={item.category}>
            {t(MAIL_CATEGORY_KEYS[item.category])}
          </span>
          <span className="mail-row__meta">{mailMeta(t, item)}</span>
        </span>
        <span className="mail-row__line">{mailLine(t, item)}</span>
      </button>
      {actions.length > 0 && (
        <span className="mail-row__chips">
          {actions.map((action) => (
            <button
              key={action.kind}
              type="button"
              className="mail-chip"
              onClick={() => onAct?.(item, action.kind)}
            >
              {action.label}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

export function MailTodayCard({
  today,
  onOpenAll,
  onOpenThread,
}: {
  today: MailToday;
  onOpenAll: () => void;
  onOpenThread: (threadId: string) => void;
}) {
  const { t } = useI18n();
  const { act, notice } = useMailAct(onOpenThread);
  const [reading, setReading] = useState<string | null>(null);
  return (
    <section className="life-card mail-today">
      <div className="life-card__head mail-today__head">
        <b>{t("mail-today")}</b>
        <span className="life-card__note">
          {t("mail-today-count", { total: today.total, worth: today.items.length })}
        </span>
        <span className="life-card__spacer" />
        <button type="button" className="code-link" onClick={onOpenAll}>
          {t("mail-today-all")}
        </button>
      </div>
      {today.items.length === 0 ? (
        <p className="life-card__hint">{t("mail-today-empty")}</p>
      ) : (
        today.items.map((item) => (
          <MailRow key={item.id} item={item} onAct={act} onOpen={setReading} />
        ))
      )}
      {today.folded > 0 && (
        <p className="mail-today__folded">{t("mail-today-folded", { count: today.folded })}</p>
      )}
      {notice && <p className="life-card__hint">{notice}</p>}
      {reading && <MailOriginalDialog id={reading} onClose={() => setReading(null)} />}
    </section>
  );
}
