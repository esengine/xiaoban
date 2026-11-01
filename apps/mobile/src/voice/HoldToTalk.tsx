import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { useMemo, useRef } from "react";
import { PanResponder, Pressable, StyleSheet, Text, type TextStyle, View } from "react-native";
import { XiaobanHub } from "../../modules/xiaoban-hub/index.ts";
import { Icon } from "../ui/Icon.tsx";
import { type Voice, WAVE_BARS } from "./useVoice.ts";

const BARS = Array.from({ length: WAVE_BARS }, (_, index) => `bar-${index}`);

export function HoldToTalk({ voice, height = 44 }: { voice: Voice; height?: number }) {
  const { t } = useI18n();
  const latest = useRef(voice);
  latest.current = voice;
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => latest.current.begin(),
        onPanResponderMove: (_, gesture) => latest.current.move(gesture.dy),
        onPanResponderRelease: () => latest.current.release(),
        onPanResponderTerminate: () => latest.current.abandon(),
      }),
    [],
  );
  const { phase, transcript, levels } = voice;
  const live = phase === "holding" || phase === "finishing";
  const cancel = phase === "cancel";
  const label =
    phase === "idle"
      ? t("voice-hold")
      : cancel
        ? t("voice-release-cancel")
        : phase === "finishing"
          ? t("voice-finishing")
          : t("voice-release-send");
  return (
    <View style={styles.wrap}>
      {phase !== "idle" && transcript ? (
        <Text style={[styles.transcript, cancel && styles.transcriptCancel]} numberOfLines={3}>
          {transcript}
        </Text>
      ) : null}
      <View
        {...responder.panHandlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel={t("voice-hold")}
        accessibilityHint={t("voice-release-send")}
        style={[
          styles.pill,
          { height, borderRadius: Math.min(16, height / 2) },
          live && styles.pillLive,
          cancel && styles.pillCancel,
        ]}
      >
        {phase !== "idle" ? <Wave levels={levels} /> : null}
        <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function Wave({ levels }: { levels: number[] }) {
  return (
    <View style={styles.wave}>
      {BARS.map((bar, index) => (
        <View
          key={bar}
          style={[styles.bar, { height: 4 + Math.round((levels[index] ?? 0) * 18) }]}
        />
      ))}
    </View>
  );
}

export function VoiceSwitch({
  voice,
  size = 34,
  onTyping,
}: {
  voice: Voice;
  size?: number;
  onTyping?: () => void;
}) {
  const { t } = useI18n();
  if (!voice.available) return null;
  const typing = voice.mode === "typing";
  return (
    <Pressable
      style={[styles.switch, { width: size, height: size }]}
      accessibilityRole="button"
      accessibilityLabel={typing ? t("voice-switch-voice") : t("voice-switch-typing")}
      hitSlop={6}
      disabled={!typing && voice.phase !== "idle"}
      onPress={
        typing
          ? () => void voice.enterVoice()
          : () => {
              voice.enterTyping();
              onTyping?.();
            }
      }
    >
      <Icon name={typing ? "mic" : "keyboard"} color={color.inkMid} size={size > 40 ? 24 : 20} />
    </Pressable>
  );
}

export function VoiceNote({ voice, style }: { voice: Voice; style?: TextStyle }) {
  const { t } = useI18n();
  if (!voice.note) return null;
  return (
    <View style={styles.noteRow}>
      <Text style={[styles.note, style]} accessibilityLiveRegion="polite">
        {voice.note}
      </Text>
      {voice.fixable ? (
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          onPress={() => XiaobanHub?.openRecognizerSettings(t("voice-service-toast"))}
        >
          <Text style={styles.noteFix}>{t("voice-service-fix")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0, gap: 6 },
  transcript: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: color.accentWash,
    fontSize: 14,
    lineHeight: 20,
    color: color.ink,
  },
  transcriptCancel: { backgroundColor: color.dangerSoft, color: color.dangerInk },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 12,
    backgroundColor: color.ink,
  },
  pillLive: { backgroundColor: color.accent },
  pillCancel: { backgroundColor: color.danger },
  label: { flexShrink: 1, fontSize: 15, fontWeight: "500", color: color.surface },
  wave: { flexDirection: "row", alignItems: "center", gap: 2, height: 22 },
  bar: { width: 3, borderRadius: 2, backgroundColor: color.surface },
  switch: { alignItems: "center", justifyContent: "center" },
  note: { flexShrink: 1, paddingHorizontal: 6, fontSize: 12, lineHeight: 17, color: color.muted },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  noteFix: { fontSize: 12, fontWeight: "500", color: color.accent },
});
