import { activeModelName } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Quote } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHubStore } from "../hub/HubProvider.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ContextCard, ContextRing, percentOf, useContextUsage } from "./Context.tsx";
import { ModelSheet } from "./ModelSheet.tsx";
import { QuoteChip } from "./QuoteChip.tsx";

export function Composer({
  threadId,
  busy,
  stoppable,
  quote,
  onClearQuote,
  onSend,
  onStop,
}: {
  threadId: string;
  busy: boolean;
  stoppable: boolean;
  quote: Quote | null;
  onClearQuote: () => void;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const store = useHubStore();
  const state = useHubState(store);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [models, setModels] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [usage, setUsage] = useContextUsage(threadId);
  const active = state.model;
  const effort = state.threads.find((thread) => thread.id === threadId)?.thinking ?? "auto";
  const ready = text.trim().length > 0;

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    onSend(trimmed);
  };
  const compact = () => {
    if (!usage) return;
    setUsage({ ...usage, canCompact: false, compacting: true });
    setContextOpen(false);
    void store.compact(threadId).catch(() => undefined);
  };

  const label = active
    ? active.provider === "deepseek"
      ? t("model-row-thinking", {
          model: activeModelName(active),
          effort: t(`thinking-${effort}`),
        })
      : activeModelName(active)
    : null;

  return (
    <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 8) + 4 }]}>
      {contextOpen && usage ? <ContextCard usage={usage} onCompact={compact} /> : null}
      <View style={[styles.box, focused && styles.boxFocused]}>
        {quote ? <QuoteChip quote={quote} tone="light" onRemove={onClearQuote} /> : null}
        <View style={styles.line}>
          <TextInput
            style={styles.input}
            placeholder={busy ? t("composer-placeholder-busy") : t("chat-placeholder")}
            placeholderTextColor={color.faint}
            value={text}
            onChangeText={setText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={send}
            submitBehavior="submit"
            returnKeyType="send"
            multiline
          />
          {ready ? (
            <Pressable
              style={styles.send}
              accessibilityRole="button"
              accessibilityLabel={t("composer-send")}
              onPress={send}
            >
              <Icon name="send" color={color.surface} size={18} />
            </Pressable>
          ) : stoppable ? (
            <Pressable
              style={styles.stop}
              accessibilityRole="button"
              accessibilityLabel={t("composer-stop")}
              onPress={onStop}
            >
              <View style={styles.stopSquare} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {state.status === "open" && (label || usage) ? (
        <View style={styles.footer}>
          {label ? (
            <Pressable
              style={styles.model}
              accessibilityRole="button"
              accessibilityLabel={t("thinking-model")}
              hitSlop={8}
              onPress={() => setModels(true)}
            >
              <Text style={styles.modelText} numberOfLines={1}>
                {label}
              </Text>
              <Icon name="chevronDown" size={12} color={color.muted} width={2} />
            </Pressable>
          ) : (
            <View />
          )}
          {usage ? (
            <ContextRing
              percent={percentOf(usage)}
              open={contextOpen}
              onPress={() => setContextOpen((value) => !value)}
            />
          ) : null}
        </View>
      ) : null}
      <ModelSheet threadId={threadId} open={models} onClose={() => setModels(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: color.ground,
  },
  box: {
    gap: 8,
    padding: 6,
    paddingLeft: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  boxFocused: { borderColor: color.accent },
  line: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    maxHeight: 120,
    paddingTop: 7,
    paddingBottom: 7,
    paddingHorizontal: 0,
    fontSize: 15,
    lineHeight: 20,
    color: color.ink,
  },
  send: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  stop: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  stopSquare: { width: 11, height: 11, borderRadius: 3, backgroundColor: color.surface },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 4,
  },
  model: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 3 },
  modelText: { flexShrink: 1, fontSize: 12, color: color.inkMid },
});
