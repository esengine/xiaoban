import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import * as Clipboard from "expo-clipboard";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { markdownPage } from "../../src/chat/htmlPages.ts";
import { Markdown } from "../../src/chat/Markdown.tsx";
import { Icon } from "../../src/ui/Icon.tsx";

export default function MarkdownScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const text = markdownPage(id);
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState(false);
  const copy = () => {
    if (!text) return;
    void Clipboard.setStringAsync(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          style={styles.icon}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("chat-back")}
        >
          <Icon name="back" color={color.ink} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title || t("md-card-untitled")}
        </Text>
      </View>
      {text ? (
        <>
          <View style={styles.switch}>
            {[false, true].map((raw) => (
              <Pressable
                key={raw ? "source" : "formatted"}
                style={[styles.segment, raw === source && styles.segmentOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: raw === source }}
                onPress={() => setSource(raw)}
              >
                <Text style={[styles.segmentText, raw === source && styles.segmentTextOn]}>
                  {t(raw ? "md-view-source" : "md-view-formatted")}
                </Text>
              </Pressable>
            ))}
          </View>
          <ScrollView style={styles.flex} contentContainerStyle={styles.body}>
            {source ? (
              <Text style={styles.source} selectable>
                {text}
              </Text>
            ) : (
              <Markdown text={text} />
            )}
          </ScrollView>
          <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
            <Pressable style={styles.button} accessibilityRole="button" onPress={copy}>
              <Icon name={copied ? "check" : "copy"} size={16} color={color.ink} />
              <Text style={styles.buttonText}>{t(copied ? "md-view-copied" : "md-view-copy")}</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.primary]}
              accessibilityRole="button"
              onPress={() => void Share.share({ message: text }).catch(() => undefined)}
            >
              <Text style={styles.primaryText}>{t("md-view-share")}</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Text style={styles.gone}>{t("md-view-gone")}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: color.line,
  },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: {
    flex: 1,
    textAlign: "center",
    marginRight: 44,
    fontSize: 16,
    fontWeight: "700",
    color: color.ink,
  },
  switch: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 10,
    padding: 3,
    borderRadius: 10,
    backgroundColor: color.ground,
  },
  segment: { flex: 1, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  segmentOn: { backgroundColor: color.surface },
  segmentText: { fontSize: 13, color: color.inkMid },
  segmentTextOn: { color: color.ink, fontWeight: "600" },
  source: { fontFamily: "monospace", fontSize: 13, lineHeight: 20, color: color.ink },
  body: { paddingHorizontal: 18, paddingVertical: 16 },
  bar: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.lineStrong,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 14, color: color.ink },
  primary: { backgroundColor: color.ink, borderColor: color.ink },
  primaryText: { fontSize: 14, fontWeight: "600", color: color.surface },
  gone: { margin: 24, fontSize: 14, color: color.muted, textAlign: "center" },
});
