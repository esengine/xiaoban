import type { AgentState, TraceStep } from "@xiaoban/client";
import type { MessageKey, PlainMessageKey, Translator } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";

type T = Translator["t"];

const WITH_DETAIL: Record<string, { detail: MessageKey; plain: PlainMessageKey }> = {
  web_search: { detail: "step-web_search", plain: "step-web_search-plain" },
  read_page: { detail: "step-read_page", plain: "step-read_page-plain" },
  weather: { detail: "step-weather", plain: "step-weather-plain" },
  remember: { detail: "step-remember", plain: "step-remember-plain" },
  find_apps: { detail: "step-find_apps", plain: "step-find_apps-plain" },
  open_app: { detail: "step-open_app", plain: "step-open_app-plain" },
  look_at_app: { detail: "step-look_at_app", plain: "step-look_at_app-plain" },
  click: { detail: "step-click", plain: "step-click-plain" },
  type_text: { detail: "step-type_text", plain: "step-type_text-plain" },
  press_keys: { detail: "step-press_keys", plain: "step-press_keys-plain" },
  do_steps: { detail: "step-do_steps", plain: "step-do_steps-plain" },
  recall: { detail: "step-recall", plain: "step-recall-plain" },
  history_search: { detail: "step-history_search", plain: "step-history_search-plain" },
  find_threads: { detail: "step-find_threads", plain: "step-find_threads-plain" },
  forget: { detail: "step-forget", plain: "step-forget-plain" },
  confirm: { detail: "step-confirm", plain: "step-confirm-plain" },
  list_dir: { detail: "step-list_dir", plain: "step-list_dir-plain" },
  read_file: { detail: "step-read_file", plain: "step-read_file-plain" },
  search_files: { detail: "step-search_files", plain: "step-search_files-plain" },
  write_file: { detail: "step-write_file", plain: "step-write_file-plain" },
  edit_file: { detail: "step-edit_file", plain: "step-edit_file-plain" },
  run_command: { detail: "step-run_command", plain: "step-run_command-plain" },
  git_diff: { detail: "step-git_diff", plain: "step-git_diff-plain" },
  save_place_detail: {
    detail: "step-save_place_detail",
    plain: "step-save_place_detail-plain",
  },
};

const PLAIN: Record<string, PlainMessageKey> = {
  save_trip: "step-save_trip",
  locate: "step-locate",
  history_read: "step-history_read",
  read_thread: "step-read_thread",
  list_threads: "step-list_threads",
  history_outline: "step-history_outline",
  git_status: "step-git_status",
  git_log: "step-git_log",
};

export function stepText(t: T, step: TraceStep): string {
  const keyed = WITH_DETAIL[step.tool];
  if (keyed) {
    return step.detail
      ? t(keyed.detail as "step-web_search", { detail: step.detail })
      : t(keyed.plain);
  }
  const plain = PLAIN[step.tool];
  return plain ? t(plain) : t("step-generic");
}

export function stepResult(t: T, step: TraceStep): string | null {
  const result = step.result;
  if (!result) return null;
  switch (result.kind) {
    case "found":
      return result.sources.length > 0
        ? t("step-found", {
            count: result.count,
            sources: result.sources.join(t("step-sources-joiner")),
          })
        : t("step-found-plain", { count: result.count });
    case "page":
      return result.title || null;
    case "matched":
      return result.names.length > 0
        ? t("step-matched", { names: result.names.join(t("step-sources-joiner")) })
        : t("step-matched-none");
    case "saved":
      return t("step-saved", { version: result.version });
    case "failed":
      return t(step.tool === "read_page" ? "step-failed-page" : "step-failed");
    case "done":
      return null;
  }
}

function StepIcon({ step }: { step: TraceStep }) {
  if (!step.result) return <span className="trace-step__now" aria-hidden="true" />;
  if (step.result.kind === "failed") {
    return (
      <span className="trace-step__icon trace-step__icon--failed" aria-hidden="true">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </span>
    );
  }
  return (
    <span className="trace-step__icon" aria-hidden="true">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M5 12l5 5 9-10" />
      </svg>
    </span>
  );
}

export const isBetweenSteps = (steps: readonly TraceStep[]): boolean =>
  steps.length > 0 && steps.every((step) => step.result !== null);

function AgentCard({ agents }: { agents: AgentState[] }) {
  const { t } = useI18n();
  return (
    <span className="agents">
      <span className="agents__head">{t("agents-head", { count: agents.length })}</span>
      {agents.map((agent, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: agents are numbered by the hub
        <span key={index} className="agents__row" data-done={agent.done || undefined}>
          <span className="agents__title">{t("agents-title", { title: agent.title })}</span>
          <span className="agents__state">
            {agent.done
              ? t("agents-done", { steps: agent.steps })
              : t("agents-working", { steps: agent.steps + 1 })}
          </span>
        </span>
      ))}
    </span>
  );
}

export function StepList({
  steps,
  live = false,
  agents,
}: {
  steps: readonly TraceStep[];
  live?: boolean;
  agents?: Record<string, AgentState[]> | undefined;
}) {
  const { t } = useI18n();
  return (
    <ol className="trace-steps">
      {steps.map((step) => {
        const result = stepResult(t, step);
        return (
          <li
            key={step.callId}
            className="trace-step"
            data-current={step.result ? undefined : true}
          >
            <StepIcon step={step} />
            <span className="trace-step__body">
              {stepText(t, step)}
              {result && <span className="trace-step__result">{result}</span>}
              {agents?.[step.callId] && <AgentCard agents={agents[step.callId] ?? []} />}
            </span>
          </li>
        );
      })}
      {live && isBetweenSteps(steps) && (
        <li className="trace-step trace-step--thinking" data-current>
          <span className="trace-step__now" aria-hidden="true" />
          <span className="trace-step__body">{t("step-thinking")}</span>
        </li>
      )}
    </ol>
  );
}
