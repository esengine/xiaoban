import { useI18n } from "@xiaoban/i18n/react";
import type { Plan, PlanAction } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Animated,
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useHubStore } from "../hub/HubProvider.tsx";
import { useReduceMotion } from "../ui/useReduceMotion.ts";
import { standardEasing } from "./Motion.tsx";
import { planSubtitle, progress, type StepMark, stepMark, stepTag } from "./planText.ts";

const RING = 2 * Math.PI * 14;

function Ring({ done, total }: { done: number; total: number }) {
  const share = total > 0 ? done / total : 0;
  return (
    <Svg width={30} height={30} viewBox="0 0 36 36">
      <Circle cx={18} cy={18} r={14} fill="none" stroke={color.chipSoft} strokeWidth={4} />
      {share > 0 && (
        <Circle
          cx={18}
          cy={18}
          r={14}
          fill="none"
          stroke={color.accent}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${RING} ${RING}`}
          strokeDashoffset={RING * (1 - share)}
          transform="rotate(-90 18 18)"
        />
      )}
    </Svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  const reduced = useReduceMotion();
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      turn.setValue(open ? 1 : 0);
      return;
    }
    Animated.timing(turn, {
      toValue: open ? 1 : 0,
      duration: 240,
      easing: standardEasing,
      useNativeDriver: true,
    }).start();
  }, [open, reduced, turn]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <Svg
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color.inkMid}
        strokeWidth={2.2}
        strokeLinecap="round"
      >
        <Path d="M6 9l6 6 6-6" />
      </Svg>
    </Animated.View>
  );
}

const MARK: Record<StepMark, { ring: string; dot: string; fg: string }> = {
  done: { ring: color.accent, dot: color.accent, fg: color.muted },
  now: { ring: color.attention, dot: color.surface, fg: color.ink },
  todo: { ring: color.checkOff, dot: color.surface, fg: color.ink },
};

function StepRow({ plan, index, delay }: { plan: Plan; index: number; delay: number }) {
  const { t } = useI18n();
  const reduced = useReduceMotion();
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, {
      toValue: 1,
      duration: 220,
      delay,
      easing: standardEasing,
      useNativeDriver: true,
    }).start();
  }, [enter, delay, reduced]);
  const step = plan.steps[index];
  if (!step) return null;
  const mark = MARK[stepMark(plan, index)];
  const tag = stepTag(plan, index);
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] });
  return (
    <Animated.View style={[styles.step, { opacity: enter, transform: [{ translateY }] }]}>
      <View style={[styles.mark, { borderColor: mark.ring, backgroundColor: mark.dot }]} />
      <Text style={[styles.stepTitle, { color: mark.fg }]}>{step.title}</Text>
      {tag && (
        <Text style={[styles.tag, tag === "you" ? styles.tagYou : styles.tagBot]}>
          {t(tag === "you" ? "plan-tag-you" : "plan-tag-bot")}
        </Text>
      )}
      {step.due ? <Text style={styles.due}>{step.due}</Text> : null}
    </Animated.View>
  );
}

export function PlanButton({
  label,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.button, primary && styles.buttonPrimary, disabled && styles.buttonDisabled]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function PlanPin({
  plan,
  open,
  onToggle,
  ball,
  calendar,
}: {
  plan: Plan;
  open: boolean;
  onToggle: () => void;
  ball?: { on: boolean; onPress: () => void } | undefined;
  calendar?: ReactNode;
}) {
  const { t } = useI18n();
  const store = useHubStore();
  const reduced = useReduceMotion();
  const [busy, setBusy] = useState(false);
  const { done, total } = progress(plan);
  const draft = plan.status === "draft";
  const question = plan.status === "blocked" ? plan.question : null;

  const act = (action: PlanAction) => {
    setBusy(true);
    void store
      .planAction(plan.threadId, action)
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };

  const toggle = () => {
    if (!reduced) {
      LayoutAnimation.configureNext({
        duration: 380,
        update: { type: LayoutAnimation.Types.spring, springDamping: 0.78 },
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: "opacity" },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: "opacity" },
      });
    }
    onToggle();
  };

  return (
    <View style={styles.section} accessibilityLabel={plan.title}>
      <Pressable
        style={styles.head}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityHint={t(open ? "plan-chat-hide" : "plan-chat-show")}
      >
        <Ring done={done} total={total} />
        <View style={styles.heading}>
          <Text style={styles.title} numberOfLines={1}>
            {question
              ? t("plan-blocked-title", { title: plan.title })
              : t("plan-chat-title", { title: plan.title, done, total })}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {planSubtitle(t, plan)}
          </Text>
        </View>
        <Chevron open={open} />
      </Pressable>
      {question && question.options.length > 0 && (
        <View style={styles.question}>
          <View style={styles.options}>
            {[...question.options].reverse().map((option) => (
              <PlanButton
                key={option}
                label={option}
                primary={option === question.options[0]}
                disabled={busy}
                onPress={() => act({ kind: "choose", option })}
              />
            ))}
          </View>
        </View>
      )}
      {open && (
        <View style={styles.body}>
          {draft && plan.changes ? <Text style={styles.note}>{plan.changes}</Text> : null}
          <ScrollView style={styles.steps} nestedScrollEnabled>
            {plan.steps.map((step, index) => (
              <StepRow
                key={`${index}-${step.title}`}
                plan={plan}
                index={index}
                delay={index * 30}
              />
            ))}
          </ScrollView>
          {draft && plan.bounds ? (
            <Text style={styles.note}>{t("plan-bounds", { bounds: plan.bounds })}</Text>
          ) : null}
          <View style={styles.footer}>
            {draft ? (
              <>
                <PlanButton
                  label={t("plan-dismiss")}
                  disabled={busy}
                  onPress={() => act({ kind: "dismiss" })}
                />
                <PlanButton
                  label={t("plan-approve")}
                  primary
                  disabled={busy}
                  onPress={() => act({ kind: "approve" })}
                />
              </>
            ) : plan.status === "done" ? (
              <PlanButton label={t("plan-chat-collapse")} primary onPress={toggle} />
            ) : (
              <>
                {ball && (
                  <PlanButton
                    label={t(ball.on ? "plan-ball-off" : "plan-ball")}
                    onPress={ball.onPress}
                  />
                )}
                {calendar}
                {plan.status === "paused" ? (
                  <PlanButton
                    label={t("plan-resume")}
                    disabled={busy}
                    onPress={() => act({ kind: "resume" })}
                  />
                ) : (
                  <PlanButton
                    label={t("plan-pause")}
                    disabled={busy}
                    onPress={() => act({ kind: "pause" })}
                  />
                )}
                <PlanButton label={t("plan-chat-collapse")} primary onPress={toggle} />
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
    overflow: "hidden",
  },
  head: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  heading: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: "500", color: color.ink },
  subtitle: { fontSize: 12, color: color.muted },
  question: { paddingHorizontal: 14, paddingBottom: 12 },
  options: { flexDirection: "row", gap: 8 },
  body: { paddingHorizontal: 14, paddingBottom: 14 },
  steps: { maxHeight: 300, flexGrow: 0 },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 7 },
  mark: { width: 18, height: 18, marginTop: 1, borderRadius: 9, borderWidth: 2 },
  stepTitle: { flex: 1, fontSize: 13, lineHeight: 20 },
  tag: {
    fontSize: 11,
    lineHeight: 18,
    paddingHorizontal: 6,
    borderRadius: 6,
    overflow: "hidden",
  },
  tagYou: { backgroundColor: color.attentionSoft, color: color.attentionInk },
  tagBot: { backgroundColor: color.accentSoft, color: color.accentStrong },
  due: { minWidth: 42, fontSize: 12, lineHeight: 20, color: color.muted, textAlign: "right" },
  note: { fontSize: 12, lineHeight: 18, color: color.muted, paddingVertical: 4 },
  footer: { flexDirection: "row", gap: 8, marginTop: 8 },
  button: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  buttonPrimary: { backgroundColor: color.ink, borderColor: color.ink },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { fontSize: 13, color: color.ink },
  buttonTextPrimary: { color: color.surface },
});
