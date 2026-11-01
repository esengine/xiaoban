import { activeModelName, confirmText, failureKey } from "@xiaoban/client";
import { draftsForThread, useHubState } from "@xiaoban/client/react";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { ConfirmRequest } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHubStore } from "../../src/hub/HubProvider.tsx";
import { Icon } from "../../src/ui/Icon.tsx";
import { useWhen } from "../../src/ui/useWhen.ts";

const GAP_MS = 30 * 60_000;
const SUGGESTIONS: readonly PlainMessageKey[] = [
  "home-suggestion-umbrella",
  "home-suggestion-expense",
  "home-suggestion-weekend",
];

type Row =
  | { key: string; kind: "time"; text: string }
  | {
      key: string;
      kind: "message";
      role: "user" | "assistant";
      text: string;
      pending: boolean;
      failed: boolean;
    };

function Rich({ text, style }: { text: string; style: object }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={style}>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one static string
          <Text key={index} style={styles.bold}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

function ConfirmCard({ confirm }: { confirm: ConfirmRequest }) {
  const { t } = useI18n();
  const store = useHubStore();
  const [sent, setSent] = useState(false);
  const text = confirmText(confirm, t);
  return (
    <View style={styles.confirm}>
      <Text style={styles.confirmBand}>{t("chat-confirm-band")}</Text>
      <View style={styles.confirmBody}>
        <Text style={styles.confirmTitle}>{text.title}</Text>
        {text.detail ? <Text style={styles.confirmDetail}>{text.detail}</Text> : null}
        {text.hint ? <Text style={styles.confirmDetail}>{text.hint}</Text> : null}
      </View>
      <View style={styles.confirmChoices}>
        {text.choices.map((option) => (
          <Pressable
            key={option.choice}
            disabled={sent}
            style={[styles.choice, option.primary && styles.choicePrimary, sent && styles.dim]}
            onPress={() => {
              setSent(true);
              void store.answerConfirm(confirm.id, option.choice).catch(() => setSent(false));
            }}
          >
            <Text style={[styles.choiceText, option.primary && styles.choicePrimaryText]}>
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const STICK_DISTANCE = 80;

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const store = useHubStore();
  const state = useHubState(store);
  const when = useWhen();
  const [text, setText] = useState("");
  const [queued, setQueued] = useState<string[]>([]);
  const list = useRef<FlatList<Row>>(null);
  const stick = useRef(true);
  const primary = state.preferences?.primaryThreadId === id;
  const thread = state.threads.find((item) => item.id === id);
  const title = primary ? t("app-name") : (thread?.title ?? t("thread-untitled"));
  const drafts = draftsForThread(state, id);
  const running = drafts.find((draft) => !draft.failure);
  const messages = state.messages[id] ?? [];
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

  const next = queued[0];
  useEffect(() => {
    if (running || next === undefined) return;
    setQueued((items) => items.slice(1));
    void store.send(id, next).catch(() => undefined);
  }, [running, next, store, id]);

  const rows: Row[] = [];
  let last = 0;
  for (const message of messages) {
    if (message.createdAt - last > GAP_MS) {
      rows.push({ key: `t-${message.id}`, kind: "time", text: when(message.createdAt) });
    }
    last = message.createdAt;
    rows.push({
      key: message.id,
      kind: "message",
      role: message.role,
      text: message.text,
      pending: false,
      failed: false,
    });
  }
  for (const draft of drafts) {
    rows.push({
      key: draft.turnId,
      kind: "message",
      role: "assistant",
      text: draft.failure
        ? t("draft-failed", { reason: t(failureKey(draft.failure.kind)) })
        : draft.text || t("draft-thinking"),
      pending: !draft.failure && !draft.text,
      failed: Boolean(draft.failure),
    });
  }
  for (const [index, item] of queued.entries()) {
    rows.push({
      key: `q-${index}`,
      kind: "message",
      role: "user",
      text: item,
      pending: true,
      failed: false,
    });
  }

  const subtitle = primary
    ? t("chat-sub-primary", { memories: state.memories.length })
    : state.model
      ? activeModelName(state.model)
      : "";

  const send = (value = text) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setText("");
    stick.current = true;
    if (running) setQueued((items) => [...items, trimmed]);
    else void store.send(id, trimmed).catch(() => undefined);
  };

  const more = () =>
    Alert.alert(title, undefined, [
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

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
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
      <FlatList<Row>
        ref={list}
        style={styles.flex}
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={styles.list}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          stick.current =
            contentSize.height - contentOffset.y - layoutMeasurement.height < STICK_DISTANCE;
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => {
          if (stick.current) list.current?.scrollToEnd({ animated: false });
        }}
        ListFooterComponent={
          confirms.length === 0 ? undefined : (
            <View style={styles.footer}>
              {confirms.map((confirm) => (
                <ConfirmCard key={confirm.id} confirm={confirm} />
              ))}
            </View>
          )
        }
        renderItem={({ item }) =>
          item.kind === "time" ? (
            <Text style={styles.time}>{item.text}</Text>
          ) : (
            <View style={[styles.bubble, item.role === "user" ? styles.user : styles.assistant]}>
              <Rich
                text={item.text}
                style={[
                  styles.text,
                  item.role === "user" && styles.userText,
                  (item.pending || item.failed) && item.role === "assistant" && styles.pending,
                  item.pending && item.role === "user" && styles.dim,
                ]}
              />
            </View>
          )
        }
      />
      {messages.length === 0 && drafts.length === 0 && (
        <ScrollView
          horizontal
          style={styles.suggestions}
          contentContainerStyle={styles.suggestionRow}
          showsHorizontalScrollIndicator={false}
        >
          {SUGGESTIONS.map((key) => (
            <Pressable key={key} style={styles.suggestion} onPress={() => send(t(key))}>
              <Text style={styles.suggestionText}>{t(key)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
        <TextInput
          style={styles.input}
          placeholder={running ? t("composer-placeholder-busy") : t("chat-placeholder")}
          placeholderTextColor={color.faint}
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => send()}
          returnKeyType="send"
          multiline={false}
        />
        {text.trim() ? (
          <Pressable
            style={styles.send}
            accessibilityLabel={t("composer-send")}
            onPress={() => send()}
          >
            <Icon name="send" color={color.surface} size={20} />
          </Pressable>
        ) : running ? (
          <Pressable
            style={styles.stop}
            accessibilityLabel={t("composer-stop")}
            onPress={() => void store.cancel(running.turnId)}
          >
            <View style={styles.stopSquare} />
          </Pressable>
        ) : null}
      </View>
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
  list: { paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  footer: { gap: 12, marginTop: 12 },
  time: { alignSelf: "center", fontSize: 11, color: color.faint },
  bubble: { paddingVertical: 10, paddingHorizontal: 14 },
  user: {
    alignSelf: "flex-end",
    maxWidth: "78%",
    backgroundColor: color.accent,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  assistant: {
    alignSelf: "flex-start",
    maxWidth: "86%",
    backgroundColor: color.surface,
    paddingVertical: 11,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 4,
  },
  text: { fontSize: 14, lineHeight: 22, color: color.ink },
  bold: { fontWeight: "700" },
  userText: { color: color.surface },
  pending: { color: color.muted },
  dim: { opacity: 0.6 },
  confirm: {
    alignSelf: "flex-start",
    width: "86%",
    backgroundColor: color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.attentionSoft,
    overflow: "hidden",
  },
  confirmBand: {
    backgroundColor: color.attentionSoft,
    color: color.attentionInk,
    fontSize: 12,
    fontWeight: "500",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  confirmBody: { paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  confirmTitle: { fontSize: 15, fontWeight: "500", color: color.ink },
  confirmDetail: { fontSize: 12, color: color.muted, lineHeight: 18 },
  confirmChoices: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  choice: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.lineStrong,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  choicePrimary: { backgroundColor: color.ink, borderColor: color.ink },
  choiceText: { fontSize: 14, color: color.ink },
  choicePrimaryText: { color: color.surface, fontWeight: "500" },
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
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderRadius: 12,
    backgroundColor: color.ground,
    paddingHorizontal: 12,
    fontSize: 14,
    color: color.ink,
  },
  send: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  stop: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  stopSquare: { width: 12, height: 12, borderRadius: 3, backgroundColor: color.surface },
});
