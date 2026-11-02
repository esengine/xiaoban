import { summarizeAnswer } from "@xiaoban/client";
import { useAskFlow } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { AskAnswer, AskRequest } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";

const TICK = "✓";
const DASH = "–";

export function AskCard({ ask }: { ask: AskRequest }) {
  const { t } = useI18n();
  const store = useHubStore();
  const flow = useAskFlow(store, ask);
  const { question, total } = flow;

  useEffect(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, []);

  if (!question) return null;
  const many = total > 1;
  const typing = question.options.length === 0 || flow.flow.other;
  const sent = flow.flow.sent;
  const submitLabel = typing
    ? t("ask-submit-text")
    : question.multiple
      ? t("ask-submit-multi", { count: flow.flow.picked.length })
      : t("ask-submit-single");

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.dot} />
        <Text style={styles.headText}>{many ? t("ask-title") : t("ask-title-waiting")}</Text>
        {many && (
          <View style={styles.steps}>
            <View style={styles.bars}>
              {ask.questions.map((item, index) => (
                <View
                  key={item.text}
                  style={[styles.bar, index <= flow.flow.step && styles.barOn]}
                />
              ))}
            </View>
            <Text style={styles.stepText}>
              {t("ask-step", { current: flow.flow.step + 1, total })}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.question}>
          {question.text}
          {question.multiple ? `  ${t("ask-multiple-hint")}` : ""}
        </Text>
        {question.note ? <Text style={styles.note}>{question.note}</Text> : null}
        {question.options.map((option) => {
          const on = flow.flow.picked.includes(option.label);
          return (
            <Pressable
              key={option.label}
              disabled={sent}
              accessibilityRole={question.multiple ? "checkbox" : "radio"}
              accessibilityState={{ checked: on, disabled: sent }}
              style={[styles.option, on && styles.optionOn, sent && styles.dim]}
              onPress={() => flow.pick(option.label)}
            >
              <View
                style={[
                  styles.mark,
                  question.multiple && styles.markSquare,
                  on && (question.multiple ? styles.markOnSquare : styles.markOn),
                ]}
              >
                {on && question.multiple ? <Text style={styles.tick}>{TICK}</Text> : null}
              </View>
              <View style={styles.optionText}>
                <Text style={styles.optionLabel}>{option.label}</Text>
                {option.note ? <Text style={styles.optionNote}>{option.note}</Text> : null}
              </View>
            </Pressable>
          );
        })}
        {question.options.length > 0 && (
          <Pressable
            disabled={sent}
            accessibilityRole="button"
            accessibilityState={{ selected: flow.flow.other, disabled: sent }}
            style={[styles.option, styles.other, flow.flow.other && styles.optionOn]}
            onPress={flow.toggleOther}
          >
            <Text style={styles.otherText}>{t("ask-other")}</Text>
          </Pressable>
        )}
        {typing && (
          <TextInput
            style={styles.input}
            value={flow.flow.text}
            editable={!sent}
            autoFocus
            returnKeyType="done"
            placeholder={
              question.options.length === 0 ? t("ask-type-placeholder") : t("ask-other-placeholder")
            }
            placeholderTextColor={color.faint}
            onChangeText={flow.setText}
            onSubmitEditing={flow.submit}
          />
        )}
        <View style={styles.actions}>
          {flow.flow.step > 0 && (
            <Pressable style={styles.ghost} disabled={sent} onPress={flow.back}>
              <Text style={styles.ghostText}>{t("ask-prev")}</Text>
            </Pressable>
          )}
          {(!many || typing || question.multiple) && (
            <Pressable
              disabled={!flow.canSubmit || sent}
              style={[styles.submit, (!flow.canSubmit || sent) && styles.submitOff]}
              onPress={flow.submit}
            >
              <Text style={styles.submitText}>{submitLabel}</Text>
            </Pressable>
          )}
          {question.multiple && !typing && (
            <Pressable style={styles.ghost} disabled={sent} onPress={flow.none}>
              <Text style={styles.ghostText}>{t("ask-none")}</Text>
            </Pressable>
          )}
          <Pressable style={styles.ghost} disabled={sent} onPress={flow.skip}>
            <Text style={styles.ghostText}>{many ? t("ask-skip-step") : t("ask-skip")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function AnsweredAsk({ ask, answers }: { ask: AskRequest; answers: AskAnswer[] }) {
  const { t } = useI18n();
  return (
    <View style={styles.answeredList}>
      {ask.questions.map((question, index) => {
        const answer = answers[index];
        const text = answer ? summarizeAnswer(answer) : null;
        const shown = text === null ? t("ask-answered-skipped") : text || t("ask-answered-none");
        return (
          <View key={question.text} style={styles.answered}>
            <Text style={[styles.answeredMark, text === null && styles.answeredSkipped]}>
              {text === null ? DASH : TICK}
            </Text>
            <Text style={styles.answeredQuestion} numberOfLines={2}>
              {question.text}
            </Text>
            <Text style={[styles.answeredText, text === null && styles.answeredSkipped]}>
              {shown}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "flex-start",
    width: "92%",
    backgroundColor: color.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: color.accent,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: color.accentWash,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent },
  headText: { fontSize: 12, fontWeight: "500", color: color.accentStrong },
  steps: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 },
  bars: { flexDirection: "row", gap: 4 },
  bar: { width: 18, height: 4, borderRadius: 2, backgroundColor: color.accentLine },
  barOn: { backgroundColor: color.accent },
  stepText: { fontSize: 11, color: color.muted },
  body: { padding: 14, gap: 10 },
  question: { fontSize: 15, fontWeight: "700", lineHeight: 22, color: color.ink },
  note: { fontSize: 12, lineHeight: 19, color: color.muted },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  optionOn: { borderWidth: 1.5, borderColor: color.accent, backgroundColor: color.accentWash },
  mark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: color.faint,
    alignItems: "center",
    justifyContent: "center",
  },
  markSquare: { borderRadius: 5, width: 16, height: 16 },
  markOn: { borderWidth: 5, borderColor: color.accent },
  markOnSquare: { borderWidth: 0, backgroundColor: color.accent },
  tick: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  optionText: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 14, fontWeight: "500", color: color.ink },
  optionNote: { fontSize: 12, color: color.muted },
  other: { borderStyle: "dashed" },
  otherText: { fontSize: 14, color: color.inkMid },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: color.accent,
    paddingHorizontal: 12,
    fontSize: 14,
    color: color.ink,
  },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  submit: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  submitOff: { backgroundColor: "#C4C8D2" },
  submitText: { fontSize: 13, fontWeight: "500", color: color.surface },
  ghost: { height: 44, paddingHorizontal: 10, alignItems: "center", justifyContent: "center" },
  ghostText: { fontSize: 13, color: color.muted },
  dim: { opacity: 0.6 },
  answeredList: { alignSelf: "flex-start", width: "92%", gap: 6 },
  answered: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  answeredMark: { fontSize: 13, fontWeight: "700", color: color.success },
  answeredQuestion: { fontSize: 13, color: color.muted, flexShrink: 1 },
  answeredText: { fontSize: 13, fontWeight: "500", color: color.ink },
  answeredSkipped: { color: color.faint },
});
