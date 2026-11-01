import { useI18n } from "@xiaoban/i18n/react";
import type { Thinking } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon } from "../ui/Icon.tsx";
import { FadeIn } from "./Motion.tsx";
import { Rich } from "./Rich.tsx";

export function ThoughtToggle({ thinking }: { thinking: Thinking }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={6}
        onPress={() => setOpen(!open)}
      >
        <Text style={styles.label}>
          {thinking.effort
            ? t("reply-thought-effort", {
                seconds: thinking.seconds,
                effort: t(`thinking-${thinking.effort}`),
              })
            : t("reply-thought", { seconds: thinking.seconds })}
        </Text>
        <View style={open && styles.flipped}>
          <Icon name="chevronDown" size={12} color={color.accent} width={2} />
        </View>
      </Pressable>
      {open && (
        <FadeIn style={styles.box}>
          <ScrollView nestedScrollEnabled style={styles.scroll}>
            <Rich text={thinking.text} style={styles.text} />
          </ScrollView>
        </FadeIn>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, gap: 6 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start" },
  label: { fontSize: 12, color: color.accent },
  flipped: { transform: [{ rotate: "180deg" }] },
  box: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.line,
    overflow: "hidden",
  },
  scroll: { maxHeight: 320, paddingHorizontal: 12, paddingVertical: 10 },
  text: { fontSize: 12, lineHeight: 20, color: color.inkMid },
});
