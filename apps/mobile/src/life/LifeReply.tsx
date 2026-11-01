import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { color, dark } from "@xiaoban/tokens";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CloseIcon } from "./LifeIcons.tsx";
import { openScene } from "./LifeUI.tsx";

export function LifeReply({
  store,
  threadId,
  turnId,
  onClose,
}: {
  store: HubStore;
  threadId: string;
  turnId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { drafts } = useHubState(store);
  const draft = drafts[turnId];
  const last = useRef("");
  const [settled, setSettled] = useState(false);
  if (draft?.text) last.current = draft.text;
  useEffect(() => {
    if (!draft) setSettled(true);
  }, [draft]);
  const failed = Boolean(draft?.failure);
  const thinking = !settled && !failed && !draft?.text;
  const text = failed
    ? t("life-reply-failed")
    : thinking
      ? t("life-reply-thinking")
      : last.current || t("life-reply-done");
  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <View style={styles.avatar} />
      <Text style={styles.text} numberOfLines={5}>
        {text}
      </Text>
      {thinking ? null : (
        <>
          <Pressable hitSlop={6} accessibilityRole="button" onPress={() => openScene(threadId)}>
            <Text style={styles.link}>{t("life-reply-open")}</Text>
          </Pressable>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("dialog-close")}
            onPress={onClose}
          >
            <CloseIcon color={dark.textMuted} size={16} />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: color.ink,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: color.accent },
  text: { flex: 1, fontSize: 13, lineHeight: 19, color: dark.text },
  link: { fontSize: 13, color: dark.link },
});
