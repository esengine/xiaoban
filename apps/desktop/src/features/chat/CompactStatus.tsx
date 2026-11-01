import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { CompactPhase, ContextUsage } from "@xiaoban/protocol";
import { useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";

const LINGER_MS = 5000;

export function CompactStatus({ threadId }: { threadId: string }) {
  const { t } = useI18n();
  const store = useHub();
  const state = useHubState(store);
  const phase = state.compacting[threadId];
  const [gone, setGone] = useState<CompactPhase | null>(null);

  useEffect(() => {
    if (!phase || phase.kind === "started") return;
    const timer = window.setTimeout(() => setGone(phase), LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (!phase || phase === gone) return null;
  if (phase.kind === "started") {
    return (
      <li className="compact-status">
        <span className="compact-status__pill">
          <span className="compact-status__spin" aria-hidden="true" />
          {t("context-compacting-pill")}
        </span>
        <span className="compact-status__hint">{t("context-compacting-hint")}</span>
      </li>
    );
  }
  return (
    <li className="compact-status" aria-live="polite">
      <span className="compact-status__toast">
        {phase.kind === "finished"
          ? t("context-compacted", { from: phase.from, to: phase.to })
          : phase.kind === "skipped"
            ? t("context-compact-short")
            : t("context-compact-failed")}
      </span>
    </li>
  );
}

export function SummaryNote({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const [usage, setUsage] = useState<ContextUsage | null>(null);

  useEffect(() => {
    let live = true;
    store
      .contextUsage(threadId)
      .then((next) => live && setUsage(next))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, threadId]);

  return (
    <li className="archive-summary">
      <div className="archive-summary__head">
        <b>{t("archive-summary-title")}</b>
        {usage && usage.compactions > 0 && (
          <span>{t("archive-summary-count", { count: usage.compactions })}</span>
        )}
        <button type="button" onClick={onClose}>
          {t("archive-collapse")}
        </button>
      </div>
      <p className="archive-summary__body">
        {usage ? (usage.summary ?? t("archive-summary-empty")) : t("archive-loading")}
      </p>
      <p className="archive-summary__foot">{t("archive-summary-foot")}</p>
    </li>
  );
}
