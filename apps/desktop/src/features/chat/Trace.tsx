import type { TraceStep, TurnTrace } from "@xiaoban/client";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { Memory } from "@xiaoban/protocol";
import { motion } from "@xiaoban/tokens";
import { useEffect, useState } from "react";
import { isBetweenSteps, StepList, stepText } from "./Steps.tsx";

const TOOL_NAMES: Record<string, PlainMessageKey> = {
  remember: "tool-name-remember",
  weather: "tool-name-weather",
  web_search: "tool-name-search",
  read_page: "tool-name-page",
  save_trip: "tool-name-trip",
  save_place_detail: "tool-name-detail",
  locate: "tool-name-locate",
  find_apps: "tool-name-apps",
  open_app: "tool-name-apps",
  look_at_app: "tool-name-operate",
  click: "tool-name-operate",
  type_text: "tool-name-operate",
  press_keys: "tool-name-operate",
  confirm: "tool-name-operate",
};

export function useToolName() {
  const { t } = useI18n();
  return (tool: string) => {
    const key = TOOL_NAMES[tool];
    return key ? t(key) : tool;
  };
}

export function WorkingLine({ steps }: { steps: readonly TraceStep[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const current = steps.at(-1);
  const text = !current || isBetweenSteps(steps) ? t("step-thinking") : stepText(t, current);
  const [shown, setShown] = useState(text);
  const [leaving, setLeaving] = useState<string | null>(null);
  useEffect(() => {
    if (text === shown) return;
    setLeaving(shown);
    setShown(text);
    const timer = window.setTimeout(() => setLeaving(null), motion.standard);
    return () => window.clearTimeout(timer);
  }, [text, shown]);
  if (!current) return null;
  return (
    <li className="working" aria-live="polite">
      <button
        type="button"
        className="working-line"
        aria-expanded={open}
        title={t("working-show-steps")}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="working-line__dot" aria-hidden="true" />
        <span className="working-line__texts">
          {leaving && (
            <span
              key={`leaving-${leaving}`}
              className="working-line__text--leaving"
              aria-hidden="true"
            >
              {leaving}
            </span>
          )}
          <span key={text} className="working-line__text">
            {text}
          </span>
        </span>
      </button>
      {open && <StepList steps={steps} live />}
    </li>
  );
}

export function TraceSummary({ trace }: { trace: TurnTrace }) {
  const { t } = useI18n();
  const name = useToolName();
  const [open, setOpen] = useState(false);
  if (trace.tools.length === 0) return null;
  const names = [...new Set(trace.tools.map(name))].join(t("trace-joiner"));
  return (
    <li className="trace">
      <button
        type="button"
        className="trace__summary"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {t("trace-summary", { names, count: trace.tools.length })}
      </button>
      {open &&
        (trace.steps.length > 0 ? (
          <StepList steps={trace.steps} />
        ) : (
          <ol className="trace__steps">
            {trace.tools.map((tool, index) => (
              <li key={index}>{name(tool)}</li>
            ))}
          </ol>
        ))}
    </li>
  );
}

export function MemoryChips({ memories }: { memories: Memory[] }) {
  const { t } = useI18n();
  if (memories.length === 0) return null;
  return (
    <li className="memory-saved">
      {memories.map((memory) => (
        <span key={memory.id} className="memory-saved__chip" data-memory={memory.id}>
          {t("memory-saved-chip", { subject: memory.subject, value: memory.value })}
        </span>
      ))}
    </li>
  );
}
