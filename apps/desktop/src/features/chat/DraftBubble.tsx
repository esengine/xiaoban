import type { Draft } from "@xiaoban/client";
import { failureKey } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import { waiting } from "@xiaoban/tokens";
import { useEffect, useRef, useState } from "react";
import { MascotFace } from "../onboarding/Mascot.tsx";
import { RichText } from "./RichText.tsx";
import { WorkingLine } from "./Trace.tsx";

export function useElapsed(since: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [active]);
  return now - since;
}

const UNREACHABLE = new Set(["network", "model"]);

function Reasoning({ draft }: { draft: Draft }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const since = draft.reasoningSince ?? draft.startedAt;
  const thinking = draft.reasoningUntil === undefined;
  const elapsed = useElapsed(since, thinking);
  const seconds = Math.max(
    1,
    Math.round(((draft.reasoningUntil ?? since + elapsed) - since) / 1000),
  );
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [open, draft.reasoning]);
  return (
    <li className="reasoning">
      <span className="reasoning__line">
        <span key={seconds} className="reasoning__time">
          {thinking ? t("reasoning-thinking", { seconds }) : t("reasoning-thought", { seconds })}
        </span>
        <button
          type="button"
          className="reasoning__toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? t("reasoning-hide") : t("reasoning-show")}
        </button>
      </span>
      {open && (
        <div ref={box} className="reasoning__box">
          {draft.reasoning}
        </div>
      )}
    </li>
  );
}

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

  const reasoned = draft.reasoningSince !== undefined;
  if (waitingForText) {
    if (draft.steps.length > 0) return <WorkingLine steps={draft.steps} />;
    if (reasoned) return <Reasoning draft={draft} />;
    if (elapsed < waiting.silentMs) return null;
    return (
      <li className="thinking" aria-live="polite">
        <span className="thinking__face" aria-hidden="true">
          <MascotFace thinking />
        </span>
        <span className="bubble bubble--assistant bubble--thinking">
          <span className="shimmer">{t("draft-thinking")}</span>
          {elapsed >= waiting.showElapsedMs && (
            <span key={Math.floor(elapsed / 1000)} className="bubble__note">
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
