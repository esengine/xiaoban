import { useI18n } from "@xiaoban/i18n/react";
import type { Quote } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Icon } from "../ui/Icon.tsx";
import { plain } from "./plain.ts";

export function QuoteChip({
  quote,
  tone,
  onRemove,
}: {
  quote: Quote;
  tone: "light" | "blue";
  onRemove?: () => void;
}) {
  const { t, locale } = useI18n();
  const who =
    quote.from === "assistant"
      ? t("quote-from-assistant")
      : quote.from === "user"
        ? t("quote-from-user")
        : t("quote-label");
  const when =
    quote.at === null
      ? null
      : new Intl.DateTimeFormat(locale, {
          ...(new Date(quote.at).toDateString() === new Date().toDateString()
            ? {}
            : { month: "numeric", day: "numeric" }),
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(quote.at);
  const blue = tone === "blue";
  return (
    <View style={[styles.chip, blue ? styles.chipBlue : styles.chipLight]}>
      <View style={[styles.bar, blue ? styles.barBlue : styles.barLight]} />
      <View style={styles.main}>
        <Text style={[styles.head, blue && styles.headBlue]} numberOfLines={1}>
          {when ? [who, when].join(t("trace-joiner")) : who}
        </Text>
        <Text style={[styles.body, blue && styles.bodyBlue]} numberOfLines={2}>
          {plain(quote.text)}
        </Text>
      </View>
      {onRemove ? (
        <Pressable
          style={styles.remove}
          accessibilityRole="button"
          accessibilityLabel={t("quote-remove")}
          hitSlop={8}
          onPress={onRemove}
        >
          <Icon name="close" size={14} color={color.muted} width={2} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 6,
  },
  chipLight: { backgroundColor: color.ground },
  chipBlue: { backgroundColor: color.accentStrong, marginBottom: 6 },
  bar: { alignSelf: "stretch", width: 3, borderRadius: 2 },
  barLight: { backgroundColor: color.accent },
  barBlue: { backgroundColor: color.accentBright },
  main: { flex: 1, minWidth: 0, gap: 1 },
  head: { fontSize: 11, color: color.muted },
  headBlue: { color: color.ledger4 },
  body: { fontSize: 12, lineHeight: 17, color: color.inkSoft },
  bodyBlue: { color: color.surface },
  remove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
