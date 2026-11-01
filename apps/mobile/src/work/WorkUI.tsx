import { color } from "@xiaoban/tokens";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CloseIcon } from "../life/LifeIcons.tsx";
import { ShareIcon } from "../trip/TripIcons.tsx";

export function rich(text: string, boldStyle: object): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <Text key={index} style={boldStyle}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      part
    ),
  );
}

export function ShareButton({
  label,
  onDark = false,
  onPress,
}: {
  label: string;
  onDark?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.icon}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
    >
      <ShareIcon color={onDark ? color.surface : color.ink} size={22} />
    </Pressable>
  );
}

export function AskChip({
  text,
  closeLabel,
  onClose,
}: {
  text: string;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <View style={styles.chip}>
      <View style={styles.chipBar} />
      <Text style={styles.chipText} numberOfLines={2}>
        {text}
      </Text>
      <Pressable
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onClose}
      >
        <CloseIcon color={color.faint} size={16} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: -8,
  },
  chip: {
    marginHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: color.ground,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  chipBar: { width: 3, alignSelf: "stretch", borderRadius: 2, backgroundColor: color.accent },
  chipText: { flex: 1, fontSize: 12, lineHeight: 17, color: color.inkMid },
});
