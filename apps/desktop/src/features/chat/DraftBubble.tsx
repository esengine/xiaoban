import type { Draft } from "@xiaoban/client";
import { failureKey } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import { waiting } from "@xiaoban/tokens";
import { useEffect, useRef, useState } from "react";
import { MascotFace } from "../onboarding/Mascot.tsx";
import { RichText } from "./RichText.tsx";
import { isBetweenSteps, stepText } from "./Steps.tsx";
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

const BACKGROUND_AFTER_MS = 10_000;

function LongWait({ since, onBackground }: { since: number; onBackground: () => void }) {
  const { t } = useI18n();
  const elapsed = useElapsed(since, true);
  if (elapsed < BACKGROUND_AFTER_MS) return null;
  return (
    <li className="long-wait">
      <span className="long-wait__text">
        {t("draft-long-wait", { seconds: Math.floor(elapsed / 1000) })}
      </span>
      <button type="button" className="long-wait__button" onClick={onBackground}>
        {t("draft-background")}
      </button>
    </li>
  );
}

export function BackgroundCard({ draft, title }: { draft: Draft; title: string }) {
  const { t } = useI18n();
  const current = draft.steps.at(-1);
  const line = current && !isBetweenSteps(draft.steps) ? stepText(t, current) : t("step-thinking");
  return (
    <li className="background-card" aria-live="polite">
      <span className="background-card__head">
        <b className="background-card__title">{title || t("draft-background-untitled")}</b>
        <span className="background-card__state">{t("draft-background-running")}</span>
      </span>
      <span key={line} className="background-card__line">
        {draft.steps.length > 0
          ? t("island-step-line", { text: line, n: draft.steps.length })
          : line}
      </span>
    </li>
  );
}

export function DraftBubble({
  draft,
  onRetry,
  onBackground,
}: {
  draft: Draft;
  onRetry: () => void;
  onBackground?: () => void;
}) {
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
  const hint = onBackground ? (
    <LongWait since={draft.startedAt} onBackground={onBackground} />
  ) : null;
  if (waitingForText) {
    if (draft.steps.length > 0)
      return (
        <>
          <WorkingLine steps={draft.steps} />
          {hint}
        </>
      );
    if (reasoned)
      return (
        <>
          <Reasoning draft={draft} />
          {hint}
        </>
      );
    if (elapsed < waiting.silentMs) return null;
    return (
      <>
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
        {hint}
      </>
    );
  }
  return (
    <li className="bubble bubble--assistant bubble--streaming" aria-live="polite">
      <RichText text={draft.text} />
      <span className="caret" aria-hidden="true" />
    </li>
  );
}
