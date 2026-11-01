import { useI18n } from "@xiaoban/i18n/react";
import { color, dark } from "@xiaoban/tokens";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { CloseIcon } from "../life/LifeIcons.tsx";
import { openScene } from "../life/LifeUI.tsx";
import type { Reply } from "./useTrip.ts";

export function ReplyCard({
  reply,
  day,
  threadId,
  onClose,
  style,
}: {
  reply: Reply;
  day: number;
  threadId: string;
  onClose: () => void;
  style?: ViewStyle;
}) {
  const { t } = useI18n();
  const text =
    reply.phase === "thinking"
      ? t("trip-say-thinking", { day: t("trip-day", { n: day + 1 }) })
      : reply.phase === "failed"
        ? t("trip-say-failed")
        : reply.text;
  return (
    <View style={[styles.card, style]}>
      <View style={styles.avatar} />
      <Text style={styles.text} numberOfLines={4}>
        {text}
      </Text>
      {reply.phase !== "thinking" ? (
        <>
          <Pressable hitSlop={6} accessibilityRole="button" onPress={() => openScene(threadId)}>
            <Text style={styles.link}>{t("trip-say-open")}</Text>
          </Pressable>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("place-close")}
            onPress={onClose}
          >
            <CloseIcon color={dark.textMuted} size={16} />
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.ink,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: color.ink,
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: color.accent },
  text: { flex: 1, fontSize: 13, lineHeight: 19, color: dark.text },
  link: { fontSize: 13, color: dark.link },
});
