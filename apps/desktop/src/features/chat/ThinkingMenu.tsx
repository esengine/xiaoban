import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { ThinkingEffort } from "@xiaoban/protocol";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";

const EFFORTS: ThinkingEffort[] = ["auto", "none", "low", "high", "max"];

export function ThinkingMenu({ threadId, model }: { threadId: string; model: string }) {
  const { t } = useI18n();
  const store = useHub();
  const state = useHubState(store);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const effort = state.threads.find((thread) => thread.id === threadId)?.thinking ?? "auto";
  const supported = state.model?.provider === "deepseek";
  const label = (value: ThinkingEffort) => t(`thinking-${value}`);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);

  return (
    <span ref={root} className="thinking-menu">
      <button
        type="button"
        className="thinking-menu__trigger"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {supported
          ? t("thinking-trigger", { model, effort: label(effort) })
          : t("thinking-trigger-plain", { model })}
      </button>
      {open && (
        <div className="thinking-menu__panel" role="dialog" aria-label={t("thinking-title")}>
          <b className="thinking-menu__title">{t("thinking-title")}</b>
          <div className="thinking-menu__segments" data-disabled={!supported || undefined}>
            {EFFORTS.map((value) => (
              <button
                key={value}
                type="button"
                className="thinking-menu__segment"
                aria-pressed={value === effort}
                disabled={!supported}
                onClick={() => void store.setThinking(threadId, value)}
              >
                {label(value)}
              </button>
            ))}
          </div>
          {supported ? (
            <dl className="thinking-menu__help">
              {EFFORTS.map((value) => (
                <div key={value}>
                  <dt>{label(value)}</dt>
                  <dd>{t(`thinking-${value}-help`)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="thinking-menu__help">{t("thinking-unsupported")}</p>
          )}
          <hr className="thinking-menu__separator" />
          <div className="thinking-menu__model">
            <span>{t("thinking-model")}</span>
            <span className="thinking-menu__model-name">{model}</span>
          </div>
        </div>
      )}
    </span>
  );
}
