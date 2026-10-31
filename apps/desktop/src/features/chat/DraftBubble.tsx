import type { Draft } from "@xiaoban/client";
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
  const waitingForText = draft.text === "" && !draft.failure;
  const elapsed = useElapsed(draft.startedAt, waitingForText);

  if (draft.failure) {
    return (
      <li className="bubble bubble--assistant bubble--failed">
        {draft.text && <span>{draft.text}</span>}
        <span className="bubble__note">没成功：{draft.failure.message}</span>
      </li>
    );
  }
  if (waitingForText) {
    if (elapsed < waiting.silentMs) return null;
    const seconds = Math.floor(elapsed / 1000);
    return (
      <li className="bubble bubble--assistant bubble--thinking" aria-live="polite">
        <span className="shimmer">在想…</span>
        {elapsed >= waiting.showElapsedMs && (
          <span className="bubble__note">已想 {seconds} 秒</span>
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
