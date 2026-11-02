import { confirmText } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { ConfirmRequest } from "@xiaoban/protocol";
import { color, motion } from "@xiaoban/tokens";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";
import { useReduceMotion } from "../ui/useReduceMotion.ts";
import { springEasing } from "./Motion.tsx";

const RISE = 28;

export function ConfirmCard({ confirm }: { confirm: ConfirmRequest }) {
  const { t } = useI18n();
  const store = useHubStore();
  const reduced = useReduceMotion();
  const [sent, setSent] = useState(false);
  const enter = useRef(new Animated.Value(0)).current;
  const text = confirmText(confirm, t);
  const preview =
    confirm.kind.kind === "write_outside" || confirm.kind.kind === "save_file"
      ? confirm.kind.preview
      : [];

  useEffect(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (reduced) {
      enter.setValue(1);
      return;
    }
    Animated.timing(enter, {
      toValue: 1,
      duration: motion.slow,
      easing: springEasing,
      useNativeDriver: true,
    }).start();
  }, [enter, reduced]);

  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] });
  const opacity = enter.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 1, 1],
    extrapolate: "clamp",
  });

  return (
    <Animated.View style={[styles.confirm, { opacity, transform: [{ translateY }] }]}>
      <Text style={styles.band}>{t("chat-confirm-band")}</Text>
      <View style={styles.body}>
        <Text style={styles.title}>{text.title}</Text>
        {text.detail ? <Text style={styles.detail}>{text.detail}</Text> : null}
        {preview.length > 0 ? (
          <View style={styles.preview}>
            {preview.map((line, index) => (
              <Text
                key={index}
                style={[
                  styles.previewLine,
                  line.kind === "added" && styles.previewAdded,
                  line.kind === "removed" && styles.previewRemoved,
                ]}
                numberOfLines={1}
              >
                {`${line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "} ${line.text}`}
              </Text>
            ))}
          </View>
        ) : null}
        {text.hint ? (
          <Text style={[styles.detail, confirm.kind.kind === "price_check" && styles.strong]}>
            {text.hint}
          </Text>
        ) : null}
      </View>
      <View style={styles.choices}>
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  confirm: {
    alignSelf: "flex-start",
    width: "86%",
    backgroundColor: color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.attentionSoft,
    overflow: "hidden",
  },
  band: {
    backgroundColor: color.attentionSoft,
    color: color.attentionInk,
    fontSize: 12,
    fontWeight: "500",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  body: { paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  title: { fontSize: 15, fontWeight: "500", color: color.ink },
  detail: { fontSize: 12, color: color.muted, lineHeight: 18 },
  strong: { color: color.ink, fontWeight: "600" },
  choices: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
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
  dim: { opacity: 0.6 },
  preview: { backgroundColor: color.ground, borderRadius: 10, padding: 10, marginTop: 4 },
  previewLine: { fontSize: 11.5, lineHeight: 18, color: color.inkSoft, fontFamily: "monospace" },
  previewAdded: { color: color.success },
  previewRemoved: { color: color.dangerInk },
});
