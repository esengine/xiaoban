import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { ContextUsage } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useHubStore } from "../hub/HubProvider.tsx";
import { FadeIn } from "./Motion.tsx";

const WARN = 80;
const RING = 18;
const STROKE = 2.5;

export function percentOf(usage: ContextUsage | null) {
  if (!usage || usage.window === 0) return 0;
  return Math.min(100, Math.round((usage.used / usage.window) * 100));
}

export function useContextUsage(threadId: string) {
  const store = useHubStore();
  const state = useHubState(store);
  const [usage, setUsage] = useState<ContextUsage | null>(null);
  const count = state.messages[threadId]?.length ?? 0;
  const phase = state.compacting[threadId]?.kind;
  const archived = state.archived[threadId]?.count;
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

export function ContextRing({
  percent,
  open,
  onPress,
}: {
  percent: number;
  open: boolean;
  onPress: () => void;
}) {
  const { t } = useI18n();
  const r = (RING - STROKE) / 2;
  const length = 2 * Math.PI * r;
  const warn = percent >= WARN;
  return (
    <Pressable
      style={styles.ring}
      accessibilityRole="button"
      accessibilityLabel={t("context-trigger", { percent })}
      accessibilityState={{ expanded: open }}
      hitSlop={10}
      onPress={onPress}
    >
      <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          fill="none"
          stroke={color.lineStrong}
          strokeWidth={STROKE}
        />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          fill="none"
          stroke={warn ? color.attention : color.accent}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${length} ${length}`}
          strokeDashoffset={length * (1 - Math.max(percent, 1) / 100)}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
    </Pressable>
  );
}

export function ContextCard({ usage, onCompact }: { usage: ContextUsage; onCompact: () => void }) {
  const { t } = useI18n();
  const percent = percentOf(usage);
  const note = usage.compacting
    ? t("context-compacting")
    : usage.canCompact
      ? t("context-compact-note")
      : t("context-compact-short");
  return (
    <FadeIn style={styles.card}>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{t("context-used", { percent })}</Text>
        <Text style={styles.cardNote}>{note}</Text>
      </View>
      <Pressable
        style={[styles.compact, !usage.canCompact && styles.compactIdle]}
        accessibilityRole="button"
        disabled={!usage.canCompact}
        onPress={onCompact}
      >
        <Text style={[styles.compactText, !usage.canCompact && styles.compactTextIdle]}>
          {t("context-compact")}
        </Text>
      </Pressable>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  ring: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 14, fontWeight: "600", color: color.ink },
  cardNote: { fontSize: 12, lineHeight: 17, color: color.muted },
  compact: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: color.ink,
  },
  compactIdle: { backgroundColor: color.lineSoft },
  compactText: { fontSize: 13, color: color.surface, fontWeight: "500" },
  compactTextIdle: { color: color.faint },
});
