import { useI18n } from "@xiaoban/i18n/react";
import type { ShareAction, SharedItem, ShareSuggestion } from "@xiaoban/protocol";
import { useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";

export interface ShareOffer {
  item: SharedItem;
  link: string | null;
}

export interface ShareHanded {
  title: string | null;
  done: string;
}

const HANDED_MS = 6000;

export function ShareGuess({
  offer,
  threadId,
  onHanded,
  onDismiss,
}: {
  offer: ShareOffer;
  threadId: string;
  onHanded: (offer: ShareOffer, handed: ShareHanded | null) => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const [suggestion, setSuggestion] = useState<ShareSuggestion | null>(null);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    setSuggestion(null);
    setFailed(false);
    store
      .suggestShare(offer.item)
      .then((next) => {
        if (live) setSuggestion(next);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [store, offer]);

  const pick = async (action: ShareAction) => {
    if (!suggestion || sending) return;
    setSending(true);
    try {
      const landed = await store.sendShare({
        item: offer.item,
        threadId: suggestion.threadId,
        prompt: action.prompt,
        remember: action.remember,
      });
      onHanded(
        offer,
        landed.threadId === threadId
          ? null
          : {
              title: landed.threadId === suggestion.threadId ? suggestion.threadTitle : null,
              done: action.done,
            },
      );
    } catch {
      setFailed(true);
      setSending(false);
    }
  };

  return (
    <section className="share-guess" aria-label={t("share-float-label")}>
      <div className="share-guess__head">
        <span>{t("share-guess")}</span>
        <button type="button" className="share-guess__dismiss" onClick={onDismiss}>
          {t("share-float-dismiss")}
        </button>
      </div>
      {suggestion?.actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className="share-guess__item"
          disabled={sending}
          onClick={() => void pick(action)}
        >
          <span className="share-guess__label">{action.label}</span>
          {action.hint && <span className="share-guess__hint">{action.hint}</span>}
        </button>
      ))}
      {!suggestion && !failed && (
        <p className="share-guess__wait" role="status">
          {t("share-guessing")}
        </p>
      )}
      {failed && <p className="share-guess__problem">{t("share-failed")}</p>}
    </section>
  );
}

export function ShareHandedNote({ handed, onClose }: { handed: ShareHanded; onClose: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    const timer = setTimeout(onClose, HANDED_MS);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="share-guess share-guess--done" role="status">
      <span className="share-guess__check" aria-hidden="true">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <span className="share-guess__done">
        <b>{t("share-done-title")}</b>
        <span>
          {handed.title ? t("share-done-where", { title: handed.title }) : t("share-done-main")}
        </span>
        <span className="share-guess__hint">{handed.done}</span>
      </span>
    </div>
  );
}
