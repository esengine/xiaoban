import type { HubStore } from "@xiaoban/client";
import { draftsForThread, useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { CookTimer } from "@xiaoban/protocol";
import { color, dark } from "@xiaoban/tokens";
import { useKeepAwake } from "expo-keep-awake";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { clock } from "./dates.ts";
import { TimerIcon } from "./LifeIcons.tsx";
import { goBack, LifeHeader } from "./LifeUI.tsx";

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, []);
  return now;
}

function TimerChip({ store, timer, now }: { store: HubStore; timer: CookTimer; now: number }) {
  const { t } = useI18n();
  const left = (timer.endsAt - now) / 1000;
  const fired = timer.fired || left <= 0;
  return (
    <Pressable
      style={[styles.timer, fired && styles.timerFired]}
      accessibilityRole="button"
      accessibilityLabel={fired ? t("timer-ok") : t("timer-extend")}
      onPress={() =>
        void (fired ? store.dismissTimer(timer.id) : store.extendTimer(timer.id, 30)).catch(
          () => undefined,
        )
      }
    >
      <TimerIcon color={fired ? color.ink : dark.text} />
      <Text style={[styles.timerText, fired && styles.timerTextFired]} numberOfLines={1}>
        {timer.label}
      </Text>
      <Text style={[styles.timerLeft, fired && styles.timerTextFired]}>
        {fired ? t("timer-done") : clock(left)}
      </Text>
    </Pressable>
  );
}

function Ask({ store, threadId, since }: { store: HubStore; threadId: string; since: number }) {
  const { t } = useI18n();
  const state = useHubState(store);
  const [text, setText] = useState("");
  useEffect(() => {
    void store.loadMessages(threadId).catch(() => undefined);
  }, [store, threadId]);
  const messages = (state.messages[threadId] ?? []).filter((message) => message.createdAt >= since);
  const question = [...messages].reverse().find((message) => message.role === "user");
  const answer = [...messages].reverse().find((message) => message.role === "assistant");
  const running = draftsForThread(state, threadId).find((draft) => !draft.failure);
  const reply = running
    ? running.text || t("kitchen-thinking")
    : answer && question && answer.createdAt > question.createdAt
      ? answer.text
      : null;
  const send = () => {
    const value = text.trim();
    if (!value || running) return;
    setText("");
    void store.send(threadId, value).catch(() => setText(value));
  };
  return (
    <>
      {question && reply ? (
        <View style={styles.qa}>
          <Text style={styles.qaQuestion}>{t("cook-you-asked", { text: question.text })}</Text>
          <Text style={styles.qaAnswer}>{reply}</Text>
        </View>
      ) : null}
      <View style={styles.ask}>
        <TextInput
          style={styles.askInput}
          value={text}
          placeholder={t("cook-ask-placeholder")}
          placeholderTextColor={dark.textMuted}
          returnKeyType="send"
          onChangeText={setText}
          onSubmitEditing={send}
        />
      </View>
    </>
  );
}

export function CookScreen({ store }: { store: HubStore }) {
  useKeepAwake();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { kitchen, status } = useHubState(store);
  const now = useNow();
  const [since] = useState(() => Date.now());

  useEffect(() => {
    if (status === "open") void store.loadKitchen().catch(() => undefined);
  }, [store, status]);

  const cook = kitchen?.cook ?? null;
  const steps = cook?.steps ?? [];
  const current = cook ? Math.min(cook.current, Math.max(0, steps.length - 1)) : 0;
  const step = steps[current];
  const timers = kitchen?.timers ?? [];
  const threadId = kitchen?.threadId ?? null;
  const stepTimer = timers.find((timer) => timer.step === current && !timer.fired);
  const last = current >= steps.length - 1;

  const finish = () => {
    if (threadId) void store.send(threadId, t("cook-finished-message")).catch(() => undefined);
    void store
      .finishCooking()
      .then(goBack)
      .catch(() => undefined);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <LifeHeader
        onDark
        close
        center={false}
        title={cook ? cook.dishes.join(t("kitchen-plus")) : t("cook-title")}
        sub={
          cook ? t("cook-meta", { servings: cook.servings || 0, minutes: cook.minutes }) : undefined
        }
        right={
          cook && steps.length > 0 ? (
            <Text style={styles.count}>
              {t("cook-count", { n: current + 1, total: steps.length })}
            </Text>
          ) : null
        }
      />
      {!cook ? (
        <View style={styles.waiting}>
          <Text style={styles.waitingText}>{t("cook-planning")}</Text>
        </View>
      ) : (
        <>
          <View style={styles.bars}>
            {steps.map((_, index) => (
              <Pressable
                key={index}
                style={styles.barHit}
                accessibilityRole="button"
                accessibilityLabel={t("cook-step-n", { n: index + 1 })}
                onPress={() => void store.cookGo(index).catch(() => undefined)}
              >
                <View style={[styles.bar, index <= current && styles.barDone]} />
              </Pressable>
            ))}
          </View>
          <ScrollView style={styles.flex} contentContainerStyle={styles.body}>
            {step && (
              <>
                <Text style={styles.stepNo}>{t("cook-step-n", { n: current + 1 })}</Text>
                <Text style={styles.stepText}>{step.text}</Text>
                {step.tip ? <Text style={styles.tip}>{step.tip}</Text> : null}
                <View style={styles.chips}>
                  {step.dish ? <Text style={styles.chip}>{step.dish}</Text> : null}
                  <Text style={styles.chip}>{t(`heat-${step.heat}`)}</Text>
                </View>
                {step.seconds > 0 ? (
                  <Pressable
                    style={[styles.timerButton, stepTimer && styles.dim]}
                    disabled={Boolean(stepTimer)}
                    accessibilityRole="button"
                    onPress={() =>
                      void store
                        .startTimer(
                          current,
                          t("cook-timer-label", { dish: step.dish, step: current + 1 }),
                          step.after,
                          step.seconds,
                        )
                        .catch(() => undefined)
                    }
                  >
                    <Text style={styles.timerButtonText}>
                      {stepTimer
                        ? t("cook-timer-running", { left: clock((stepTimer.endsAt - now) / 1000) })
                        : t("cook-start-timer", { time: clock(step.seconds) })}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}
            {threadId ? <Ask store={store} threadId={threadId} since={since} /> : null}
          </ScrollView>
          {timers.length > 0 ? (
            <View style={styles.timers}>
              {timers.map((timer) => (
                <TimerChip key={timer.id} store={store} timer={timer} now={now} />
              ))}
            </View>
          ) : null}
          <View style={[styles.nav, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
            <Pressable
              style={[styles.prev, current === 0 && styles.dim]}
              disabled={current === 0}
              accessibilityRole="button"
              onPress={() => void store.cookGo(current - 1).catch(() => undefined)}
            >
              <Text style={styles.prevText}>{t("cook-prev-step")}</Text>
            </Pressable>
            <Pressable
              style={styles.next}
              accessibilityRole="button"
              onPress={() =>
                last ? finish() : void store.cookGo(current + 1).catch(() => undefined)
              }
            >
              <Text style={styles.nextText}>{last ? t("cook-done") : t("cook-next-step")}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.ground },
  flex: { flex: 1 },
  count: { fontSize: 13, color: dark.textMuted, paddingRight: 4 },
  waiting: { flex: 1, alignItems: "center", justifyContent: "center" },
  waitingText: { fontSize: 15, color: dark.textSoft },
  bars: { flexDirection: "row", gap: 4, paddingHorizontal: 16, paddingTop: 2 },
  barHit: { flex: 1, paddingVertical: 6 },
  bar: { height: 4, borderRadius: 2, backgroundColor: dark.line },
  barDone: { backgroundColor: color.accentBright },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 14 },
  stepNo: { fontSize: 13, color: dark.link },
  stepText: { fontSize: 26, fontWeight: "700", lineHeight: 38, color: dark.text },
  tip: { fontSize: 15, lineHeight: 24, color: dark.textSoft },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    fontSize: 13,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: dark.line,
    color: dark.text,
  },
  timerButton: {
    alignSelf: "flex-start",
    height: 44,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: dark.lineStrong,
    borderRadius: 12,
    justifyContent: "center",
  },
  timerButtonText: { fontSize: 14, color: dark.text },
  dim: { opacity: 0.5 },
  qa: { backgroundColor: dark.surface, borderRadius: 14, padding: 12, gap: 4 },
  qaQuestion: { fontSize: 14, lineHeight: 22, color: dark.textMuted },
  qaAnswer: { fontSize: 14, lineHeight: 22, color: dark.text },
  ask: { backgroundColor: dark.surface, borderRadius: 14, paddingHorizontal: 12 },
  askInput: { height: 42, fontSize: 14, color: dark.text },
  timers: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  timer: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: dark.line,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
  },
  timerFired: { backgroundColor: color.attention },
  timerText: { fontSize: 13, color: dark.text, flexShrink: 1 },
  timerLeft: { fontSize: 13, fontWeight: "700", color: dark.text, fontVariant: ["tabular-nums"] },
  timerTextFired: { color: color.ink },
  nav: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 14 },
  prev: {
    flex: 1,
    height: 64,
    borderWidth: 1,
    borderColor: dark.lineStrong,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  prevText: { fontSize: 16, color: dark.text },
  next: {
    flex: 2,
    height: 64,
    borderRadius: 18,
    backgroundColor: dark.text,
    alignItems: "center",
    justifyContent: "center",
  },
  nextText: { fontSize: 18, fontWeight: "700", color: color.ink },
});
