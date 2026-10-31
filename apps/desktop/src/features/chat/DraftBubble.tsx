import type { Draft } from "@xiaoban/client";
import { failureKey } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import { waiting } from "@xiaoban/tokens";
import { useEffect, useState } from "react";
import { MascotFace } from "../onboarding/Mascot.tsx";
import { RichText } from "./RichText.tsx";
import { WorkingLine } from "./Trace.tsx";

function useElapsed(since: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active]);
  return now - since;
}

const UNREACHABLE = new Set(["network", "model"]);

export function DraftBubble({ draft, onRetry }: { draft: Draft; onRetry: () => void }) {
  const { t } = useI18n();
  const waitingForText = draft.text === "" && !draft.failure;
  const elapsed = useElapsed(draft.startedAt, waitingForText);

  if (draft.failure) {
    const kind = draft.failure.kind;
    const label =
      kind === "cancelled"
        ? t("draft-stopped")
        : UNREACHABLE.has(kind)
          ? t("draft-unreachable")
          : t("draft-failed-retry", { reason: t(failureKey(kind)) });
    return (
      <>
        {draft.text && (
          <li className="bubble bubble--assistant bubble--settled">
            <RichText text={draft.text} />
          </li>
        )}
        <li className="draft-failed">
          <button type="button" className="draft-failed__button" onClick={onRetry}>
            {label}
          </button>
        </li>
      </>
    );
  }

  const tool = draft.tools.at(-1);
  if (waitingForText) {
    if (tool) return <WorkingLine tool={tool} />;
    if (elapsed < waiting.silentMs) return null;
    return (
      <li className="thinking" aria-live="polite">
        <span className="thinking__face" aria-hidden="true">
          <MascotFace thinking />
        </span>
        <span className="bubble bubble--assistant bubble--thinking">
          <span className="shimmer">{t("draft-thinking")}</span>
          {elapsed >= waiting.showElapsedMs && (
            <span className="bubble__note">
              {t("draft-elapsed", { seconds: Math.floor(elapsed / 1000) })}
            </span>
          )}
        </span>
      </li>
    );
  }
  return (
    <li className="bubble bubble--assistant bubble--streaming" aria-live="polite">
      <RichText text={draft.text} />
      <span className="caret" aria-hidden="true" />
    </li>
  );
}
