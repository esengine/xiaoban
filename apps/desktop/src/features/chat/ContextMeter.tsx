import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { ContextUsage } from "@xiaoban/protocol";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { FloatPanel } from "./FloatPanel.tsx";

const AUTO = [70, 80, 90, null] as const;
const WARN = 80;

export function percentOf(usage: ContextUsage | null) {
  if (!usage || usage.window === 0) return 0;
  return Math.min(100, Math.round((usage.used / usage.window) * 100));
}

export function useContextUsage(threadId: string) {
  const store = useHub();
  const state = useHubState(store);
  const [usage, setUsage] = useState<ContextUsage | null>(null);
  const count = state.messages[threadId]?.length ?? 0;
  const phase = state.compacting[threadId]?.kind;
  const archived = state.archived[threadId]?.count;
  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when the conversation or compaction state changes
  useEffect(() => {
    if (state.status !== "open") return;
    let live = true;
    store
      .contextUsage(threadId)
      .then((next) => live && setUsage(next))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, threadId, count, phase, archived, state.status]);
  return [usage, setUsage] as const;
}

export function ContextMeter({ threadId }: { threadId: string }) {
  const { t, locale } = useI18n();
  const store = useHub();
  const [usage, setUsage] = useContextUsage(threadId);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  if (!usage) return null;
  const percent = percentOf(usage);
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const setAuto = (value: number | null) => {
    setUsage({ ...usage, autoPercent: value });
    void store.setAutoCompact(value);
  };
  const compactNow = () => {
    setUsage({ ...usage, canCompact: false, compacting: true });
    setOpen(false);
    void store.compact(threadId).catch(() => undefined);
  };
  const note = usage.compacting
    ? t("context-compacting")
    : usage.canCompact
      ? t("context-compact-note")
      : t("context-compact-short");

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="context-meter__trigger"
        aria-expanded={open}
        aria-label={t("context-trigger", { percent })}
        title={t("context-trigger", { percent })}
        data-warn={percent >= WARN || undefined}
        onClick={() => setOpen(!open)}
      >
        <span
          className="context-meter__ring"
          aria-hidden="true"
          style={{ "--used": `${percent * 3.6}deg` } as CSSProperties}
        />
      </button>
      {open && (
        <FloatPanel
          anchor={trigger}
          label={t("context-title")}
          className="context-meter__panel"
          onClose={() => setOpen(false)}
        >
          <div className="context-meter__head">
            <b>{t("context-title")}</b>
            <span>
              {t("context-amount", {
                percent,
                used: compact.format(usage.used),
                window: compact.format(usage.window),
              })}
            </span>
          </div>
          <div className="context-meter__bar" data-warn={percent >= WARN || undefined}>
            <span style={{ width: `${percent}%` }} />
            {usage.autoPercent !== null && (
              <i style={{ left: `${usage.autoPercent}%` }} aria-hidden="true" />
            )}
          </div>
          <p className="context-meter__help">{t("context-help")}</p>
          <div className="context-meter__action">
            <button
              type="button"
              className="context-meter__compact"
              disabled={!usage.canCompact}
              onClick={compactNow}
            >
              {t("context-compact")}
            </button>
            <span>{note}</span>
          </div>
          <hr className="model-menu__separator" />
          <div className="context-meter__auto">
            <span>{t("context-auto")}</span>
            <div className="model-menu__segments">
              {AUTO.map((value) => (
                <button
                  key={value ?? "off"}
                  type="button"
                  aria-pressed={usage.autoPercent === value}
                  onClick={() => setAuto(value)}
                >
                  {value === null ? t("context-auto-off") : `${value}%`}
                </button>
              ))}
            </div>
          </div>
          <p className="context-meter__foot">{t("context-auto-note")}</p>
        </FloatPanel>
      )}
    </>
  );
}
