import {
  dayKey,
  mailActions,
  mailMeta,
  mailMoney,
  mailSender,
  mailtoUrl,
  monthDay,
} from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { MailDraft, MailItem } from "@xiaoban/protocol";
import { useState } from "react";
import { openExternal } from "../../lib/external.ts";
import { MailOriginalDialog } from "./MailOriginalDialog.tsx";
import { useMailAct } from "./useMailAct.ts";

export function MailCard({
  mail,
  onOpenThread,
}: {
  mail: MailItem;
  onOpenThread: (threadId: string) => void;
}) {
  const { t } = useI18n();
  const { act, notice } = useMailAct(onOpenThread);
  const [reading, setReading] = useState(false);
  const bill = mail.category === "bill" ? mail.bill : null;
  const detail = bill
    ? [
        mail.title,
        bill.due ? t("mail-due", { date: monthDay(t, bill.due) }) : null,
        bill.minimumCents ? t("mail-minimum", { amount: mailMoney(t, bill.minimumCents) }) : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : mailMeta(t, mail);
  const actions = mailActions(t, mail, true).slice(0, 2);
  return (
    <div className="mail-card">
      <div className="mail-card__head">
        <b>{bill ? mailSender(mail) : mail.title || mail.subject}</b>
        {bill?.cents ? <b>{mailMoney(t, bill.cents)}</b> : null}
      </div>
      <p className="mail-card__detail">{detail}</p>
      <button type="button" className="mail-card__source" onClick={() => setReading(true)}>
        {t("mail-source", { from: mailSender(mail), date: monthDay(t, dayKey(mail.at)) })}
      </button>
      {actions.length > 0 && (
        <div className="mail-card__buttons">
          {actions.map((action, index) => (
            <button
              key={action.kind}
              type="button"
              className={index === 0 ? "button--dark" : "button--line"}
              onClick={() => act(mail, action.kind)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
      {notice && <p className="mail-card__notice">{notice}</p>}
      {reading && <MailOriginalDialog id={mail.id} onClose={() => setReading(false)} />}
    </div>
  );
}

export function DraftCard({ draft }: { draft: MailDraft }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const subject = draft.subject.replace(/^re\s*[:：]\s*/i, "");
  return (
    <div className="mail-card">
      <p className="mail-card__source">
        {t("mail-draft-head", { to: draft.toName || draft.to, subject })}
      </p>
      <p className="mail-card__draft">{draft.text}</p>
      <div className="mail-card__buttons">
        <button
          type="button"
          className="button--dark"
          onClick={() =>
            void navigator.clipboard.writeText(draft.text).then(() => setCopied(true))
          }
        >
          {t("mail-draft-copy")}
        </button>
        <button
          type="button"
          className="button--line"
          onClick={() => void openExternal(mailtoUrl(draft)).catch(() => undefined)}
        >
          {t("mail-draft-open")}
        </button>
      </div>
      {copied && <p className="mail-card__notice">{t("mail-draft-copied")}</p>}
    </div>
  );
}
