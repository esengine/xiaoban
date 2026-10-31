import { type Draft, failureKey } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import { waiting } from "@xiaoban/tokens";
import { useEffect, useState } from "react";

function useElapsed(since: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active]);
  return now - since;
}

export function DraftBubble({ draft }: { draft: Draft }) {
  const { t } = useI18n();
  const waitingForText = draft.text === "" && !draft.failure;
  const elapsed = useElapsed(draft.startedAt, waitingForText);

  if (draft.failure) {
    return (
      <li className="bubble bubble--assistant bubble--failed">
        {draft.text && <span>{draft.text}</span>}
        <span className="bubble__note">
          {t("draft-failed", { reason: t(failureKey(draft.failure.kind)) })}
        </span>
      </li>
    );
  }
  if (waitingForText) {
    if (elapsed < waiting.silentMs) return null;
    return (
      <li className="bubble bubble--assistant bubble--thinking" aria-live="polite">
        <span className="shimmer">{t("draft-thinking")}</span>
        {elapsed >= waiting.showElapsedMs && (
          <span className="bubble__note">
            {t("draft-elapsed", { seconds: Math.floor(elapsed / 1000) })}
          </span>
        )}
      </li>
    );
  }
  return (
    <li className="bubble bubble--assistant bubble--streaming" aria-live="polite">
      {draft.text}
      <span className="caret" aria-hidden="true" />
    </li>
  );
}
