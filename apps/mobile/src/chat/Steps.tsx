import type { AgentState, TraceStep } from "@xiaoban/client";
import type { MessageKey, PlainMessageKey, Translator } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { FadeIn, Pulse } from "./Motion.tsx";

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
  ask_user: { detail: "step-ask_user", plain: "step-ask_user-plain" },
  list_dir: { detail: "step-list_dir", plain: "step-list_dir-plain" },
  read_file: { detail: "step-read_file", plain: "step-read_file-plain" },
  search_files: { detail: "step-search_files", plain: "step-search_files-plain" },
  write_file: { detail: "step-write_file", plain: "step-write_file-plain" },
  edit_file: { detail: "step-edit_file", plain: "step-edit_file-plain" },
  run_command: { detail: "step-run_command", plain: "step-run_command-plain" },
  git: { detail: "step-git", plain: "step-git-plain" },
  gh: { detail: "step-gh", plain: "step-gh-plain" },
  save_place_detail: {
    detail: "step-save_place_detail",
    plain: "step-save_place_detail-plain",
  },
};

const PLAIN: Record<string, PlainMessageKey> = {
  save_trip: "step-save_trip",
  browse: "step-browse",
  check_page: "step-check_page",
  floorplan_save: "step-floorplan_save",
  floorplan_edit: "step-floorplan_edit",
  check_price_in_app: "step-check_price_in_app",
  note_app_price: "step-note_app_price",
  log_trip_expense: "step-log_trip_expense",
  locate: "step-locate",
  history_read: "step-history_read",
  read_thread: "step-read_thread",
  list_threads: "step-list_threads",
  history_outline: "step-history_outline",
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
    case "ran":
      return result.exitCode === 0
        ? t("step-ran-ok")
        : result.timedOut
          ? t("step-ran-timeout")
          : t("step-ran-failed", { code: result.exitCode ?? 0 });
    case "declined":
      return t("step-declined");
  }
}

export const isBetweenSteps = (steps: readonly TraceStep[]): boolean =>
  steps.length > 0 && steps.every((step) => step.result !== null);

function StepIcon({ step }: { step: TraceStep }) {
  if (!step.result) {
    return (
      <View style={styles.icon}>
        <Pulse period={1400} />
      </View>
    );
  }
  const failed =
    step.result.kind === "failed" ||
    step.result.kind === "declined" ||
    (step.result.kind === "ran" && step.result.exitCode !== 0);
  return (
    <FadeIn style={[styles.icon, failed ? styles.iconFailed : styles.iconDone]}>
      <Svg width={failed ? 10 : 11} height={failed ? 10 : 11} viewBox="0 0 24 24">
        <Path
          d={failed ? "M6 6l12 12M18 6L6 18" : "M5 12l5 5 9-10"}
          fill="none"
          stroke={failed ? color.faint : color.success}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </FadeIn>
  );
}

function AgentCard({ agents }: { agents: AgentState[] }) {
  const { t } = useI18n();
  return (
    <View style={styles.agents}>
      <Text style={styles.agentsHead}>{t("agents-head", { count: agents.length })}</Text>
      {agents.map((agent, index) => (
        <View key={index} style={styles.agentRow}>
          <Text style={styles.agentTitle} numberOfLines={1}>
            {t("agents-title", { title: agent.title })}
          </Text>
          <Text style={[styles.agentState, agent.done && styles.agentDone]}>
            {agent.done
              ? t("agents-done", { steps: agent.steps })
              : t("agents-working", { steps: agent.steps + 1 })}
          </Text>
        </View>
      ))}
    </View>
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
    <View style={styles.list}>
      {steps.map((step) => {
        const result = stepResult(t, step);
        const own = agents?.[step.callId];
        return (
          <FadeIn key={step.callId} style={styles.step}>
            <StepIcon step={step} />
            <View style={styles.body}>
              <Text style={[styles.text, !step.result && styles.current]}>{stepText(t, step)}</Text>
              {result ? <Text style={styles.result}>{result}</Text> : null}
              {own ? <AgentCard agents={own} /> : null}
            </View>
          </FadeIn>
        );
      })}
      {live && isBetweenSteps(steps) && (
        <FadeIn style={styles.step}>
          <View style={styles.icon}>
            <Pulse period={1400} />
          </View>
          <View style={styles.body}>
            <Text style={[styles.text, styles.current, styles.thinking]}>{t("step-thinking")}</Text>
          </View>
        </FadeIn>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8, paddingVertical: 4 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  icon: {
    width: 18,
    height: 18,
    marginTop: 1,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  iconDone: { backgroundColor: color.successSoft },
  iconFailed: { backgroundColor: color.lineSoft },
  body: { flex: 1, minWidth: 0 },
  text: { fontSize: 13, lineHeight: 19, color: color.ink },
  current: { fontWeight: "500" },
  thinking: { color: color.inkMid },
  result: { marginTop: 1, fontSize: 11, color: color.muted },
  agents: {
    marginTop: 6,
    padding: 10,
    gap: 4,
    borderRadius: 10,
    backgroundColor: color.surface,
  },
  agentsHead: { fontSize: 12, color: color.muted },
  agentRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  agentTitle: { flex: 1, fontSize: 12, color: color.ink },
  agentState: { fontSize: 12, color: color.accent },
  agentDone: { color: color.success },
});
