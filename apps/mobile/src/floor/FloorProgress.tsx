import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { FloorPlan, PlanAction, PlanStep } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LifeReply } from "../life/LifeReply.tsx";
import { life } from "../life/LifeUI.tsx";

function Dot({ step }: { step: PlanStep }) {
  if (step.status === "done" || step.status === "skipped") {
    return <View style={[styles.dot, { backgroundColor: color.success }]} />;
  }
  if (step.status === "running") {
    return <View style={[styles.dot, { backgroundColor: color.attention }]} />;
  }
  return <View style={[styles.dot, styles.dotTodo]} />;
}

export function FloorProgress({ store, plan }: { store: HubStore; plan: FloorPlan }) {
  const { t } = useI18n();
  const { plans } = useHubState(store);
  const progress = plans[plan.threadId] ?? null;
  const [turn, setTurn] = useState<string | null>(null);

  useEffect(() => {
    void store.loadPlan(plan.threadId).catch(() => undefined);
  }, [store, plan.threadId]);

  const act = (action: PlanAction) =>
    void store.planAction(plan.threadId, action).catch(() => undefined);
  const start = () =>
    void store
      .send(plan.threadId, t("floorplan-progress-start-message"))
      .then(setTurn)
      .catch(() => undefined);

  const reply = turn ? (
    <LifeReply store={store} threadId={plan.threadId} turnId={turn} onClose={() => setTurn(null)} />
  ) : null;

  if (!progress) {
    return (
      <ScrollView style={life.scroll} contentContainerStyle={styles.body}>
        <View style={styles.card}>
          <Text style={styles.empty}>{t("floorplan-progress-empty")}</Text>
          <Pressable
            style={({ pressed }) => [styles.button, styles.dark, pressed && styles.pressed]}
            accessibilityRole="button"
            onPress={start}
          >
            <Text style={styles.darkText}>{t("floorplan-progress-start")}</Text>
          </Pressable>
        </View>
        {reply}
      </ScrollView>
    );
  }

  const done = progress.steps.filter(
    (step) => step.status === "done" || step.status === "skipped",
  ).length;
  const next = progress.steps.findIndex(
    (step) => step.status === "todo" || step.status === "running",
  );
  const question = progress.question;
  return (
    <ScrollView style={life.scroll} contentContainerStyle={styles.body}>
      <View style={styles.card}>
        <Text style={styles.title}>
          {t("floorplan-progress-title", {
            title: progress.title,
            done,
            total: progress.steps.length,
          })}
        </Text>
        {progress.bounds ? <Text style={styles.sub}>{progress.bounds}</Text> : null}
        <View style={styles.steps}>
          {progress.steps.map((step, index) => (
            <View key={`${index}-${step.title}`} style={styles.step}>
              <Dot step={step} />
              <Text style={styles.stepTitle}>{step.title}</Text>
              {step.due ? <Text style={styles.due}>{step.due}</Text> : null}
            </View>
          ))}
        </View>
        {question ? (
          <>
            <Text style={styles.ask}>{t("floorplan-progress-ask", { text: question.text })}</Text>
            {question.options.length > 0 ? (
              <View style={styles.actions}>
                {question.options.map((option, index) => (
                  <Pressable
                    key={option}
                    style={({ pressed }) => [
                      styles.button,
                      index === 0 ? styles.dark : styles.line,
                      pressed && styles.pressed,
                    ]}
                    accessibilityRole="button"
                    onPress={() => act({ kind: "choose", option })}
                  >
                    <Text style={index === 0 ? styles.darkText : styles.lineText}>{option}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
        {progress.status === "draft" ? (
          <Pressable
            style={({ pressed }) => [styles.button, styles.dark, pressed && styles.pressed]}
            accessibilityRole="button"
            onPress={() => act({ kind: "approve" })}
          >
            <Text style={styles.darkText}>{t("plan-approve")}</Text>
          </Pressable>
        ) : next >= 0 ? (
          <Pressable
            style={({ pressed }) => [styles.button, styles.line, pressed && styles.pressed]}
            accessibilityRole="button"
            onPress={() => act({ kind: "step_done", step: next + 1 })}
          >
            <Text style={styles.lineText}>
              {t("floorplan-progress-step-done")}
              {t("daily-dot")}
              {progress.steps[next]?.title}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {reply}
      <Text style={styles.foot}>{t("floorplan-progress-foot")}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 14, paddingBottom: 32, gap: 12 },
  card: { backgroundColor: color.surface, borderRadius: 14, padding: 14, gap: 10 },
  title: { fontSize: 16, fontWeight: "700", color: color.ink },
  sub: { fontSize: 12, color: color.muted, marginTop: -6 },
  empty: { fontSize: 13, lineHeight: 20, color: color.muted },
  steps: {},
  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
  },
  dot: { width: 16, height: 16, borderRadius: 8 },
  dotTodo: { borderWidth: 1.5, borderColor: color.checkOff },
  stepTitle: { flex: 1, fontSize: 13, color: color.ink },
  due: { fontSize: 12, color: color.muted },
  ask: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: color.attentionSoft,
    fontSize: 13,
    lineHeight: 21,
    color: color.attentionInk,
  },
  actions: { flexDirection: "row", gap: 8 },
  button: {
    flex: 1,
    minHeight: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  dark: { backgroundColor: color.ink },
  darkText: { fontSize: 13, fontWeight: "600", color: color.surface },
  line: { borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.surface },
  lineText: { fontSize: 13, color: color.ink },
  pressed: { opacity: 0.85 },
  foot: { fontSize: 12, lineHeight: 19, color: color.faded, paddingHorizontal: 2 },
});
