import type { Quote } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import type { ReactNode } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";
import { Markdown } from "./Markdown.tsx";
import { QuoteChip } from "./QuoteChip.tsx";
import { Rich } from "./Rich.tsx";

export function Bubble({
  from,
  text,
  quote = null,
  muted = false,
  trailing,
  footer,
  style,
}: {
  from: "user" | "assistant";
  text: string;
  quote?: Quote | null;
  muted?: boolean;
  trailing?: ReactNode;
  footer?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const user = from === "user";
  return (
    <View style={[styles.bubble, user ? styles.user : styles.assistant, style]}>
      {quote ? <QuoteChip quote={quote} tone={user ? "blue" : "light"} /> : null}
      {user || muted ? (
        <Rich
          text={text}
          style={[styles.text, user && styles.userText, muted && styles.muted]}
          trailing={trailing}
        />
      ) : (
        <>
          <Markdown text={text} />
          {trailing}
        </>
      )}
      {footer}
    </View>
  );
}

export const bubbleStyles = StyleSheet.create({
  userShell: { alignSelf: "flex-end", maxWidth: "78%" },
  assistantShell: { alignSelf: "flex-start", maxWidth: "86%" },
});

const styles = StyleSheet.create({
  bubble: { paddingVertical: 10, paddingHorizontal: 14 },
  user: {
    backgroundColor: color.accent,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  assistant: {
    backgroundColor: color.surface,
    paddingVertical: 11,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderBottomLeftRadius: 4,
  },
  text: { fontSize: 14, lineHeight: 22, color: color.ink },
  userText: { color: color.surface },
  muted: { opacity: 0.6 },
});
