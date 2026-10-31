import type { TurnTrace } from "@xiaoban/client";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { Memory } from "@xiaoban/protocol";
import { useState } from "react";

const TOOL_NAMES: Record<string, PlainMessageKey> = {
  remember: "tool-name-remember",
  weather: "tool-name-weather",
  web_search: "tool-name-search",
  read_page: "tool-name-page",
  save_trip: "tool-name-trip",
  locate: "tool-name-locate",
};

const TOOL_PROGRESS: Record<string, PlainMessageKey> = {
  remember: "tool-progress-remember",
  weather: "tool-progress-weather",
  web_search: "tool-progress-search",
  read_page: "tool-progress-page",
  save_trip: "tool-progress-trip",
  locate: "tool-progress-locate",
};

export function useToolName() {
  const { t } = useI18n();
  return (tool: string) => {
    const key = TOOL_NAMES[tool];
    return key ? t(key) : tool;
  };
}

export function WorkingLine({ tool }: { tool: string }) {
  const { t } = useI18n();
  const key = TOOL_PROGRESS[tool];
  return (
    <li className="working-line" aria-live="polite">
      <span className="working-line__dot" aria-hidden="true" />
      <span key={tool} className="working-line__text">
        {key ? t(key) : t("tool-progress-generic")}
      </span>
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
      {open && (
        <ol className="trace__steps">
          {trace.tools.map((tool, index) => (
            <li key={index}>{name(tool)}</li>
          ))}
        </ol>
      )}
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
