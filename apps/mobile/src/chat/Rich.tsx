import type { ReactNode } from "react";
import { type StyleProp, StyleSheet, Text, type TextStyle } from "react-native";

export function Rich({
  text,
  style,
  trailing,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  trailing?: ReactNode;
}) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={style}>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <Text key={index} style={styles.bold}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          part
        ),
      )}
      {trailing}
    </Text>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: "700" },
});
