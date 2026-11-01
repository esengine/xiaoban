import type { Draft } from "@xiaoban/client";
import { failureKey } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import { color, waiting } from "@xiaoban/tokens";
import { useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MascotFace } from "../components/Mascot.tsx";
import { useHubStore } from "../hub/HubProvider.tsx";
import { Bubble, bubbleStyles } from "./Bubble.tsx";
import { Caret, FadeIn, Shimmer } from "./Motion.tsx";
import { isBetweenSteps, stepText } from "./Steps.tsx";
import { WorkingLine } from "./Trace.tsx";
import { useElapsed } from "./useElapsed.ts";

const UNREACHABLE = new Set(["network", "model"]);
const REASONING_TAIL = 3000;

function tail(text: string): string {
  return text.length > REASONING_TAIL ? `…${text.slice(-REASONING_TAIL)}` : text;
}

function Reasoning({ draft }: { draft: Draft }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef<ScrollViewInstance>(null);
  const since = draft.reasoningSince ?? draft.startedAt;
  const thinking = draft.reasoningUntil === undefined;
  const elapsed = useElapsed(since, thinking);
  const seconds = Math.max(
    1,
    Math.round(((draft.reasoningUntil ?? since + elapsed) - since) / 1000),
  );
  return (
    <FadeIn style={styles.reasoning}>
      <View style={styles.reasoningLine}>
        <Text style={styles.reasoningTime}>
          {thinking ? t("reasoning-thinking", { seconds }) : t("reasoning-thought", { seconds })}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          hitSlop={8}
          onPress={() => setOpen(!open)}
        >
          <Text style={styles.reasoningToggle}>
            {open ? t("reasoning-hide") : t("reasoning-show")}
          </Text>
        </Pressable>
      </View>
      {open && (
        <FadeIn style={styles.reasoningBox}>
          <ScrollView
            ref={box}
            nestedScrollEnabled
            style={styles.reasoningScroll}
            onContentSizeChange={() => box.current?.scrollToEnd({ animated: false })}
          >
            <Text style={styles.reasoningText}>{tail(draft.reasoning ?? "")}</Text>
          </ScrollView>
        </FadeIn>
      )}
    </FadeIn>
  );
}

function LongWait({ since, onBackground }: { since: number; onBackground: () => void }) {
  const { t } = useI18n();
  const elapsed = useElapsed(since, true);
  if (elapsed < waiting.offerBackgroundMs) return null;
  return (
    <FadeIn style={styles.longWait}>
      <Text style={styles.longWaitText}>
        {t("draft-long-wait", { seconds: Math.floor(elapsed / 1000) })}
      </Text>
      <Pressable style={styles.longWaitButton} accessibilityRole="button" onPress={onBackground}>
        <Text style={styles.longWaitButtonText}>{t("draft-background")}</Text>
      </Pressable>
    </FadeIn>
  );
}

export function BackgroundCard({ draft, title }: { draft: Draft; title: string }) {
  const { t } = useI18n();
  const current = draft.steps.at(-1);
  const line = current && !isBetweenSteps(draft.steps) ? stepText(t, current) : t("step-thinking");
  return (
    <View style={styles.background} accessibilityLiveRegion="polite">
      <View style={styles.backgroundHead}>
        <Text style={styles.backgroundTitle} numberOfLines={1}>
          {title || t("draft-background-untitled")}
        </Text>
        <Text style={styles.backgroundState}>{t("draft-background-running")}</Text>
      </View>
      <FadeIn key={line}>
        <Text style={styles.backgroundLine} numberOfLines={2}>
          {draft.steps.length > 0
            ? t("island-step-line", { text: line, n: draft.steps.length })
            : line}
        </Text>
      </FadeIn>
    </View>
  );
}

export function DraftBubble({
  draft,
  onRetry,
  onBackground,
}: {
  draft: Draft;
  onRetry: () => void;
  onBackground?: () => void;
}) {
  const { t } = useI18n();
  const store = useHubStore();
  const waitingForText = draft.text === "" && !draft.failure;
  const elapsed = useElapsed(draft.startedAt, waitingForText);

  if (draft.failure) {
    const kind = draft.failure.kind;
    const label =
      kind === "cancelled"
        ? t("draft-stopped")
        : UNREACHABLE.has(kind)
          ? t("draft-unreachable")
          : t("draft-failed-retry", { reason: t(failureKey(kind)) });
    return (
      <>
        {draft.text ? (
          <View style={bubbleStyles.assistantShell}>
            <Bubble from="assistant" text={draft.text} />
          </View>
        ) : null}
        <FadeIn style={bubbleStyles.assistantShell}>
          <Pressable style={styles.failed} accessibilityRole="button" onPress={onRetry}>
            <Text style={styles.failedText}>{label}</Text>
          </Pressable>
        </FadeIn>
      </>
    );
  }

  const hint = onBackground ? (
    <LongWait since={draft.startedAt} onBackground={onBackground} />
  ) : null;
  if (waitingForText) {
    if (draft.steps.length > 0) {
      return (
        <>
          <WorkingLine
            steps={draft.steps}
            agents={draft.agents}
            paused={Boolean(draft.paused)}
            onPause={() =>
              void (draft.paused ? store.resume(draft.turnId) : store.pause(draft.turnId)).catch(
                () => undefined,
              )
            }
          />
          {hint}
        </>
      );
    }
    if (draft.reasoningSince !== undefined) {
      return (
        <>
          <Reasoning draft={draft} />
          {hint}
        </>
      );
    }
    if (elapsed < waiting.silentMs) return null;
    const seconds = Math.floor(elapsed / 1000);
    return (
      <>
        <FadeIn style={styles.thinking}>
          <View style={styles.face}>
            <MascotFace thinking />
          </View>
          <View style={styles.thinkingBubble} accessibilityLiveRegion="polite">
            <Shimmer text={t("draft-thinking")} style={styles.thinkingText} />
            {elapsed >= waiting.showElapsedMs && (
              <Text style={styles.note}>{t("draft-elapsed", { seconds })}</Text>
            )}
          </View>
        </FadeIn>
        {hint}
      </>
    );
  }
  return (
    <View style={bubbleStyles.assistantShell} accessibilityLiveRegion="polite">
      <Bubble from="assistant" text={draft.text} trailing={<Caret />} />
    </View>
  );
}

const styles = StyleSheet.create({
  failed: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: color.line,
  },
  failedText: { fontSize: 14, color: color.muted },
  thinking: { alignSelf: "flex-start", flexDirection: "row", alignItems: "flex-end", gap: 8 },
  face: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  thinkingBubble: {
    backgroundColor: color.surface,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 4,
  },
  thinkingText: { fontSize: 14, lineHeight: 22 },
  note: { fontSize: 12, color: color.muted },
  reasoning: { alignSelf: "flex-start", maxWidth: "86%", gap: 8 },
  reasoningLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  reasoningTime: { fontSize: 13, color: color.accentStrong },
  reasoningToggle: { fontSize: 12, color: color.accent },
  reasoningBox: { borderRadius: 12, backgroundColor: color.surface, overflow: "hidden" },
  reasoningScroll: { maxHeight: 180, paddingHorizontal: 12, paddingVertical: 10 },
  reasoningText: { fontSize: 12, lineHeight: 20, color: color.inkMid },
  longWait: {
    alignSelf: "flex-start",
    maxWidth: "92%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: color.accentSoft,
  },
  longWaitText: { flex: 1, fontSize: 12, color: color.accentStrong },
  longWaitButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: color.ink,
  },
  longWaitButtonText: { fontSize: 12, color: color.surface },
  background: {
    alignSelf: "flex-start",
    width: "86%",
    gap: 4,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  backgroundHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  backgroundTitle: { flex: 1, fontSize: 13, fontWeight: "600", color: color.ink },
  backgroundState: { fontSize: 11, color: color.accent },
  backgroundLine: { fontSize: 12, color: color.muted },
});
