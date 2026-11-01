import {
  activeModelName,
  type Draft,
  runFailed,
  type Settled,
  scheduleOfThread,
} from "@xiaoban/client";
import { draftsForThread, useHubState } from "@xiaoban/client/react";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { Message, Quote } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  type HostInstance,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { XiaobanHub } from "../../modules/xiaoban-hub/index.ts";
import { PlanCalendarButton } from "../../src/calendar/PlanCalendar.tsx";
import { Bubble, bubbleStyles } from "../../src/chat/Bubble.tsx";
import { Composer } from "../../src/chat/Composer.tsx";
import { ConfirmCard } from "../../src/chat/ConfirmCard.tsx";
import { BackgroundCard, DraftBubble } from "../../src/chat/DraftBubble.tsx";
import { MessageItem } from "../../src/chat/MessageItem.tsx";
import { type MenuActions, type MenuTarget, MessageMenu } from "../../src/chat/MessageMenu.tsx";
import { PlanPin } from "../../src/chat/PlanPin.tsx";
import { plain } from "../../src/chat/plain.ts";
import { usePlanNotices } from "../../src/chat/planNotice.ts";
import { isCancel, toGroups } from "../../src/chat/rows.ts";
import { ThoughtToggle } from "../../src/chat/ThoughtToggle.tsx";
import { MemoryChips, TraceSummary } from "../../src/chat/Trace.tsx";
import { useHubStore } from "../../src/hub/HubProvider.tsx";
import { planBallSupported, setPlanBall, usePlanBall } from "../../src/hub/planBallStore.ts";
import { shortToast } from "../../src/hub/shortToast.ts";
import { RunMarker, ScheduleBar } from "../../src/schedule/ScheduleBits.tsx";
import { Icon } from "../../src/ui/Icon.tsx";
import { useWhen } from "../../src/ui/useWhen.ts";

const GAP_MS = 30 * 60_000;
const SUGGESTIONS: readonly PlainMessageKey[] = [
  "home-suggestion-umbrella",
  "home-suggestion-expense",
  "home-suggestion-weekend",
];

interface Queued {
  id: number;
  text: string;
  quote: Quote | null;
  files: string[];
}

interface Regenerating {
  root: string;
  turnId: string | null;
}

type Row =
  | { key: string; kind: "time"; text: string }
  | { key: string; kind: "notice"; text: string }
  | { key: string; kind: "user"; message: Message }
  | {
      key: string;
      kind: "answer";
      root: string;
      message: Message;
      settled: Settled | undefined;
    }
  | { key: string; kind: "draft"; draft: Draft; question: string }
  | { key: string; kind: "queued"; item: Queued };

let counter = 0;

function parseQuote(value: string | undefined): Quote | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Quote;
    return typeof parsed.text === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function DraftItem({
  draft,
  question,
  onRetry,
  onBackground,
}: {
  draft: Draft;
  question: string;
  onRetry: () => void;
  onBackground: () => void;
}) {
  if (draft.background && !draft.failure) return <BackgroundCard draft={draft} title={question} />;
  return (
    <View style={styles.group}>
      {draft.tools.length > 0 && draft.text !== "" && <TraceSummary trace={draft} />}
      <DraftBubble draft={draft} onRetry={onRetry} onBackground={onBackground} />
      <MemoryChips memories={draft.memories} />
    </View>
  );
}

export default function ThreadScreen() {
  const params = useLocalSearchParams<{ id: string; quote?: string; plan?: string }>();
  const id = params.id;
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const store = useHubStore();
  const state = useHubState(store);
  const when = useWhen();
  const [quote, setQuote] = useState<Quote | null>(() => parseQuote(params.quote));
  const [queued, setQueued] = useState<Queued[]>([]);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [regenerating, setRegenerating] = useState<Regenerating | null>(null);
  const list = useRef<FlatList<Row>>(null);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => {
      list.current?.scrollToOffset({ offset: 0, animated: true });
    });
    return () => {
      shown.remove();
    };
  }, []);
  const primary = state.preferences?.primaryThreadId === id;
  const thread = state.threads.find((item) => item.id === id);
  const title = primary ? t("app-name") : (thread?.title ?? t("thread-untitled"));
  const drafts = draftsForThread(state, id);
  const running = drafts.find((draft) => !draft.failure && !draft.background);
  const holding = state.compacting[id]?.kind === "started";
  const messages = state.messages[id] ?? [];
  const groups = toGroups(messages);
  const lastGroup = groups.at(-1);
  const lastAnswer = lastGroup?.kind === "answer" ? lastGroup : null;
  const confirms = state.confirms.filter(
    (confirm) => confirm.threadId === id && confirm.kind.kind !== "permissions",
  );
  const consent = state.confirms.find(
    (confirm) => confirm.threadId === id && confirm.kind.kind === "permissions",
  );
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!consent || shown.current === consent.id) return;
    shown.current = consent.id;
    router.push({ pathname: "/consent", params: { confirm: consent.id } });
  }, [consent]);

  useEffect(() => {
    if (state.status === "open") void store.loadMessages(id).catch(() => undefined);
  }, [id, state.status, store]);

  const plan = state.plans[id];
  const planNotices = usePlanNotices(id, plan);
  const [planOpen, setPlanOpen] = useState<boolean | null>(params.plan === "open" ? true : null);
  const ballThread = usePlanBall();
  useEffect(() => {
    if (params.plan === "open") setPlanOpen(true);
  }, [params.plan]);
  useEffect(() => {
    if (state.status === "open") void store.loadPlan(id).catch(() => undefined);
  }, [id, state.status, store]);

  const toggleBall = () => {
    if (ballThread === id) {
      setPlanBall(null);
      return;
    }
    if (!XiaobanHub?.operatorReady()) {
      Alert.alert(t("plan-ball-need-title"), t("plan-ball-need-body"), [
        { text: t("dialog-cancel"), style: "cancel" },
        {
          text: t("plan-ball-need-open"),
          onPress: () => router.push({ pathname: "/consent", params: { ball: id } }),
        },
      ]);
      return;
    }
    setPlanBall(id);
    shortToast(t("plan-ball-on"));
  };
  const schedulesLoaded = state.schedulesLoaded;
  useEffect(() => {
    if (state.status === "open" && !schedulesLoaded)
      void store.listSchedules().catch(() => undefined);
  }, [state.status, schedulesLoaded, store]);
  const schedule = scheduleOfThread(state.schedules, id);

  const next = queued[0];
  useEffect(() => {
    if (running || holding || next === undefined) return;
    setQueued((items) => items.slice(1));
    void store.send(id, next.text, { quote: next.quote, files: next.files }).catch(() => undefined);
  }, [running, holding, next, store, id]);

  useEffect(() => {
    if (!regenerating?.turnId) return;
    if (!drafts.some((draft) => draft.turnId === regenerating.turnId)) setRegenerating(null);
  }, [drafts, regenerating]);

  useEffect(() => () => void Speech.stop(), []);

  const inPlace = (draft: Draft) =>
    regenerating !== null &&
    (regenerating.turnId === draft.turnId || (regenerating.turnId === null && !draft.failure));
  const placed = drafts.find(inPlace) ?? null;
  const trailing = drafts.filter((draft) => draft !== placed);
  const questionFor = (draft: Draft) =>
    messages
      .filter((message) => message.role === "user" && message.createdAt <= draft.hubStartedAt)
      .at(-1)?.text ?? "";

  const rows: Row[] = [];
  let last = 0;
  let noticeAt = 0;
  const flushNotices = (before: number) => {
    while (noticeAt < planNotices.length) {
      const notice = planNotices[noticeAt];
      if (!notice || notice.at > before) return;
      rows.push({ key: notice.key, kind: "notice", text: notice.text });
      noticeAt += 1;
    }
  };
  for (const group of groups) {
    const message = group.kind === "user" ? group.message : group.versions.at(-1);
    if (!message) continue;
    const time = group.kind === "user" ? message.createdAt : (group.versions[0]?.createdAt ?? 0);
    flushNotices(time);
    const trigger = message.attachment?.kind === "schedule_run";
    if (!trigger && time - last > GAP_MS)
      rows.push({ key: `t-${message.id}`, kind: "time", text: when(time) });
    last = time;
    if (group.kind === "user") {
      rows.push({ key: message.id, kind: "user", message });
    } else if (placed && regenerating?.root === group.root) {
      rows.push({ key: group.root, kind: "draft", draft: placed, question: questionFor(placed) });
    } else {
      rows.push({
        key: group.root,
        kind: "answer",
        root: group.root,
        message,
        settled: state.settled[message.id],
      });
    }
  }
  flushNotices(Number.POSITIVE_INFINITY);
  for (const draft of trailing) {
    rows.push({ key: draft.turnId, kind: "draft", draft, question: questionFor(draft) });
  }
  for (const item of queued) rows.push({ key: `q-${item.id}`, kind: "queued", item });

  const subtitle = primary
    ? t("chat-sub-primary", { memories: state.memories.length })
    : state.model
      ? activeModelName(state.model)
      : "";

  const send = (text: string, sentQuote: Quote | null = quote, files: string[] = []) => {
    list.current?.scrollToOffset({ offset: 0, animated: true });
    if (running || holding) {
      if (running && isCancel(text, t("composer-cancel-words"))) {
        void store.cancel(running.turnId).catch(() => undefined);
        return;
      }
      counter += 1;
      setQueued((items) => [...items, { id: counter, text, quote: sentQuote, files }]);
    } else {
      void store.send(id, text, { quote: sentQuote, files }).catch(() => undefined);
    }
    setQuote(null);
  };

  const retry = (turnId: string) => {
    store.dropDraft(turnId);
    void store.retry(id).catch(() => undefined);
  };

  const regenerate = async (root: string) => {
    setRegenerating({ root, turnId: null });
    try {
      const turnId = await store.retry(id);
      setRegenerating({ root, turnId });
    } catch {
      setRegenerating(null);
    }
  };

  const speak = (text: string) => {
    void Speech.stop();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    const done = () => setSpeaking(false);
    Speech.speak(plain(text), { language: locale, onDone: done, onStopped: done, onError: done });
  };

  const actions: MenuActions = {
    onCopy: (text) => void Clipboard.setStringAsync(text).catch(() => undefined),
    onQuote: setQuote,
    onSpeak: speak,
    onRegenerate: (root) => void regenerate(root),
    onNewThreadWith: (picked) =>
      void store
        .createThread()
        .then((created) =>
          router.push({
            pathname: "/thread/[id]",
            params: { id: created.id, quote: JSON.stringify(picked) },
          }),
        )
        .catch(() => undefined),
    onLookUp: (picked) => send(t("look-up-message"), picked),
  };

  const openMenu = (message: Message, root: string | null, view: HostInstance | null) => {
    if (!view) return;
    view.measureInWindow((x, y, width, height) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      setMenu({ message, root, rect: { x, y, width, height } });
    });
  };

  const removeSchedule = (target: NonNullable<typeof schedule>) =>
    Alert.alert(t("schedule-delete-confirm", { title: target.title }), undefined, [
      { text: t("dialog-cancel"), style: "cancel" as const },
      {
        text: t("schedule-delete"),
        style: "destructive" as const,
        onPress: () => void store.deleteSchedule(target.id).catch(() => undefined),
      },
    ]);

  const more = () =>
    Alert.alert(title, undefined, [
      ...(schedule
        ? [{ text: t("schedule-delete"), onPress: () => removeSchedule(schedule) }]
        : []),
      ...(primary
        ? []
        : [
            {
              text: t("chat-delete"),
              style: "destructive" as const,
              onPress: () => {
                void store.deleteThread(id).then(() => router.back());
              },
            },
          ]),
      { text: t("dialog-cancel"), style: "cancel" as const },
    ]);

  const newestFirst = [...rows].reverse();

  const renderRow = (row: Row) => {
    switch (row.kind) {
      case "time":
        return <Text style={styles.time}>{row.text}</Text>;
      case "notice":
        return <Text style={styles.notice}>{row.text}</Text>;
      case "user": {
        const run = row.message.attachment;
        if (run?.kind === "schedule_run") {
          return (
            <RunMarker
              mark={run.mark}
              dueAt={run.dueAt}
              failed={runFailed(messages, messages.indexOf(row.message))}
            />
          );
        }
        return (
          <MessageItem
            message={row.message}
            onLongPress={(view) => openMenu(row.message, null, view)}
          />
        );
      }
      case "answer":
        return (
          <View style={styles.group}>
            {row.settled && <TraceSummary trace={row.settled} />}
            <MessageItem
              message={row.message}
              last={row.message.id === messages.at(-1)?.id}
              footer={
                row.message.thinking ? <ThoughtToggle thinking={row.message.thinking} /> : null
              }
              onLongPress={(view) => openMenu(row.message, row.root, view)}
            />
            {row.settled && <MemoryChips memories={row.settled.memories} />}
          </View>
        );
      case "draft":
        return (
          <DraftItem
            draft={row.draft}
            question={row.question}
            onRetry={() => retry(row.draft.turnId)}
            onBackground={() => void store.background(row.draft.turnId).catch(() => undefined)}
          />
        );
      case "queued":
        return (
          <View style={[bubbleStyles.userShell, styles.queued]}>
            <Bubble from="user" text={row.item.text} quote={row.item.quote} muted />
            <Text style={styles.queuedNote}>{t("composer-queued")}</Text>
          </View>
        );
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Pressable
          style={styles.iconButton}
          accessibilityLabel={t("chat-back")}
          onPress={() => router.back()}
        >
          <Icon name="back" color={color.ink} />
        </Pressable>
        <View style={styles.heading}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable style={styles.iconButton} accessibilityLabel={t("chat-more")} onPress={more}>
          <Icon name="more" color={color.ink} />
        </Pressable>
      </View>
      {plan && (
        <PlanPin
          plan={plan}
          open={planOpen ?? plan.status === "draft"}
          onToggle={() => setPlanOpen(!(planOpen ?? plan.status === "draft"))}
          ball={planBallSupported ? { on: ballThread === id, onPress: toggleBall } : undefined}
          calendar={<PlanCalendarButton plan={plan} />}
        />
      )}
      {schedule ? <ScheduleBar schedule={schedule} /> : null}
      <FlatList<Row>
        ref={list}
        style={styles.flex}
        inverted
        initialNumToRender={30}
        data={newestFirst}
        keyExtractor={(row) => row.key}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        maintainVisibleContentPosition={{ minIndexForVisible: 1, autoscrollToTopThreshold: 80 }}
        ListHeaderComponent={
          confirms.length === 0 ? undefined : (
            <View style={styles.footer}>
              {confirms.map((confirm) => (
                <ConfirmCard key={confirm.id} confirm={confirm} />
              ))}
            </View>
          )
        }
        renderItem={({ item }) => renderRow(item)}
      />
      {messages.length === 0 && drafts.length === 0 && (
        <ScrollView
          horizontal
          style={styles.suggestions}
          contentContainerStyle={styles.suggestionRow}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {SUGGESTIONS.map((key) => (
            <Pressable key={key} style={styles.suggestion} onPress={() => send(t(key), null)}>
              <Text style={styles.suggestionText}>{t(key)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <Composer
        threadId={id}
        busy={Boolean(running) || holding}
        stoppable={Boolean(running)}
        quote={quote}
        placeholder={schedule ? t("schedule-composer-hint") : undefined}
        onClearQuote={() => setQuote(null)}
        onSend={(text, files) => send(text, quote, files)}
        onStop={() => {
          if (running) void store.cancel(running.turnId).catch(() => undefined);
        }}
      />
      <MessageMenu
        target={menu}
        latest={menu?.root !== null && menu?.root === lastAnswer?.root}
        running={Boolean(running)}
        speaking={speaking}
        actions={actions}
        onClose={() => setMenu(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: color.ground,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  heading: { flex: 1, alignItems: "center" },
  title: { fontSize: 16, fontWeight: "700", color: color.ink },
  subtitle: { fontSize: 11, color: color.muted, marginTop: 1 },
  list: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  group: { gap: 6 },
  footer: { gap: 12, marginTop: 12 },
  time: { alignSelf: "center", fontSize: 11, color: color.faint },
  notice: {
    alignSelf: "center",
    fontSize: 11,
    color: color.muted,
    backgroundColor: color.chipSoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: "hidden",
  },
  queued: { alignItems: "flex-end", gap: 2 },
  queuedNote: { fontSize: 11, color: color.faint },
  suggestions: { flexGrow: 0 },
  suggestionRow: { gap: 8, paddingHorizontal: 14, paddingVertical: 6 },
  suggestion: {
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  suggestionText: { fontSize: 13, color: color.ink },
});
