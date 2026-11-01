import { activeModelName } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Quote } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHubStore } from "../hub/HubProvider.tsx";
import { Icon } from "../ui/Icon.tsx";
import { HoldToTalk, VoiceNote, VoiceSwitch } from "../voice/HoldToTalk.tsx";
import { useVoice } from "../voice/useVoice.ts";
import {
  AttachmentStrip,
  AttachSheet,
  useAttachments,
  useVisionChoice,
  VisionNotice,
} from "./Attachments.tsx";
import { ContextCard, ContextRing, percentOf, useContextUsage } from "./Context.tsx";
import { ModelSheet } from "./ModelSheet.tsx";
import { QuoteChip } from "./QuoteChip.tsx";

export function Composer({
  threadId,
  busy,
  stoppable,
  quote,
  placeholder,
  onClearQuote,
  onSend,
  onStop,
}: {
  threadId: string;
  busy: boolean;
  stoppable: boolean;
  quote: Quote | null;
  placeholder?: string | undefined;
  onClearQuote: () => void;
  onSend: (text: string, files: string[]) => void;
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
  const attachments = useAttachments(store);
  const [attaching, setAttaching] = useState(false);
  const vision = useVisionChoice(store);
  const [visionAccepted, setVisionAccepted] = useState(false);
  const hasAny = attachments.items.length > 0;
  useEffect(() => {
    if (!hasAny) setVisionAccepted(false);
  }, [hasAny]);
  const waitingVision = attachments.hasImages && vision === "ask" && !visionAccepted;
  const active = state.model;
  const effort = state.threads.find((thread) => thread.id === threadId)?.thinking ?? "auto";
  const ready =
    (text.trim().length > 0 || attachments.paths.length > 0) &&
    !attachments.uploading &&
    !waitingVision;

  const input = useRef<ComponentRef<typeof TextInput>>(null);

  const send = () => {
    if (!ready) return;
    const trimmed = text.trim();
    setText("");
    const files = attachments.paths;
    attachments.clear();
    onSend(trimmed, files);
  };
  const voice = useVoice((spoken) => {
    if (attachments.uploading || waitingVision) {
      setText(spoken);
      voice.enterTyping();
      return;
    }
    const files = attachments.paths;
    attachments.clear();
    onSend(spoken, files);
  });
  const speaking = voice.available && voice.mode === "voice";
  const focusInput = () => setTimeout(() => input.current?.focus(), 50);
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
        <AttachmentStrip items={attachments.items} onRemove={attachments.remove} />
        {attachments.hasImages ? (
          <VisionNotice
            choice={vision}
            accepted={visionAccepted}
            onAccept={() => setVisionAccepted(true)}
            onTextOnly={attachments.dropImages}
          />
        ) : null}
        <VoiceNote voice={voice} />
        <View style={styles.line}>
          <Pressable
            style={styles.add}
            accessibilityRole="button"
            accessibilityLabel={t("attach-add")}
            disabled={attachments.full}
            onPress={() => setAttaching(true)}
          >
            <Icon name="plus" color={attachments.full ? color.faint : color.inkMid} size={20} />
          </Pressable>
          {speaking ? (
            <HoldToTalk voice={voice} height={34} />
          ) : (
            <TextInput
              ref={input}
              style={styles.input}
              placeholder={
                busy
                  ? t("composer-placeholder-busy")
                  : placeholder
                    ? placeholder
                    : voice.available
                      ? t("chat-placeholder-voice")
                      : t("chat-placeholder")
              }
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
          )}
          {speaking || text.trim().length === 0 ? (
            <VoiceSwitch voice={voice} onTyping={focusInput} />
          ) : null}
          {ready && !speaking ? (
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
      <AttachSheet
        open={attaching}
        onClose={() => setAttaching(false)}
        onPick={(kind) => void attachments.pick(kind).catch(() => undefined)}
      />
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.surface,
  },
  boxFocused: { borderColor: color.accent },
  line: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  add: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
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
