import type { AgentState, TraceStep, TurnTrace } from "@xiaoban/client";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { Memory } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../ui/Icon.tsx";
import { FadeIn, Pulse } from "./Motion.tsx";
import { isBetweenSteps, StepList, stepText } from "./Steps.tsx";

const TOOL_NAMES: Record<string, PlainMessageKey> = {
  remember: "tool-name-remember",
  weather: "tool-name-weather",
  web_search: "tool-name-search",
  read_page: "tool-name-page",
  save_trip: "tool-name-trip",
  check_price_in_app: "tool-name-price",
  note_app_price: "tool-name-price",
  log_trip_expense: "tool-name-spend",
  save_place_detail: "tool-name-detail",
  locate: "tool-name-locate",
  find_apps: "tool-name-apps",
  open_app: "tool-name-apps",
  look_at_app: "tool-name-operate",
  click: "tool-name-operate",
  type_text: "tool-name-operate",
  press_keys: "tool-name-operate",
  confirm: "tool-name-operate",
  ask_user: "tool-name-ask",
};

function useToolName() {
  const { t } = useI18n();
  return (tool: string) => {
    const key = TOOL_NAMES[tool];
    return key ? t(key) : tool;
  };
}

export function WorkingLine({
  steps,
  agents,
  paused = false,
  onPause,
}: {
  steps: readonly TraceStep[];
  agents?: Record<string, AgentState[]> | undefined;
  paused?: boolean;
  onPause?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const current = steps.at(-1);
  if (!current) return null;
  const text = paused
    ? t("island-paused")
    : isBetweenSteps(steps)
      ? t("step-thinking")
      : stepText(t, current);
  return (
    <View style={styles.working} accessibilityLiveRegion="polite">
      <View style={styles.workingRow}>
        <Pressable
          style={styles.workingLine}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityHint={t("working-show-steps")}
          onPress={() => setOpen((value) => !value)}
        >
          <Pulse />
          <FadeIn key={text} style={styles.workingTextWrap}>
            <Text style={styles.workingText}>{text}</Text>
          </FadeIn>
          <Icon name={open ? "chevronDown" : "chevronRight"} size={14} color={color.accentStrong} />
        </Pressable>
        {onPause ? (
          <Pressable
            style={[styles.pause, paused && styles.pauseOn]}
            accessibilityRole="button"
            hitSlop={6}
            onPress={onPause}
          >
            <Text style={[styles.pauseText, paused && styles.pauseTextOn]}>
              {t(paused ? "island-resume" : "island-pause")}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {open && <StepList steps={steps} live agents={agents} />}
    </View>
  );
}

export function TraceSummary({ trace }: { trace: TurnTrace }) {
  const { t } = useI18n();
  const name = useToolName();
  const [open, setOpen] = useState(false);
  if (trace.tools.length === 0) return null;
  const names = [...new Set(trace.tools.map(name))].join(t("trace-joiner"));
  return (
    <FadeIn style={styles.trace}>
      <Pressable
        style={styles.summary}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
      >
        <Text style={styles.summaryText}>
          {t("trace-summary", { names, count: trace.tools.length })}
        </Text>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={12} color={color.inkMid} />
      </Pressable>
      {open &&
        (trace.steps.length > 0 ? (
          <StepList steps={trace.steps} />
        ) : (
          <View style={styles.tools}>
            {trace.tools.map((tool, index) => (
              <Text key={index} style={styles.tool}>
                {name(tool)}
              </Text>
            ))}
          </View>
        ))}
    </FadeIn>
  );
}

export function MemoryChips({ memories }: { memories: readonly Memory[] }) {
  const { t } = useI18n();
  if (memories.length === 0) return null;
  return (
    <View style={styles.memories}>
      {memories.map((memory) => (
        <FadeIn key={memory.id} style={styles.memoryChip}>
          <Text style={styles.memoryText}>
            {t("memory-saved-chip", { subject: memory.subject, value: memory.value })}
          </Text>
        </FadeIn>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  working: { alignSelf: "stretch", gap: 6 },
  workingLine: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  workingTextWrap: { flexShrink: 1 },
  workingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  pause: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: color.lineStrong,
    justifyContent: "center",
  },
  pauseOn: { backgroundColor: color.ink, borderColor: color.ink },
  pauseText: { fontSize: 12, color: color.inkMid },
  pauseTextOn: { color: color.surface, fontWeight: "500" },
  workingText: { fontSize: 13, lineHeight: 19, color: color.accentStrong },
  trace: { alignSelf: "stretch", gap: 6 },
  summary: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 30,
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: color.line,
  },
  summaryText: { fontSize: 12, color: color.inkMid, flexShrink: 1 },
  tools: { paddingLeft: 12, gap: 2 },
  tool: { fontSize: 12, color: color.muted },
  memories: {
    alignSelf: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
  },
  memoryChip: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: color.successSoft,
  },
  memoryText: { fontSize: 12, color: color.success },
});
