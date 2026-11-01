import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { htmlPage } from "../../src/chat/htmlPages.ts";
import { Icon } from "../../src/ui/Icon.tsx";

export default function HtmlScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const html = htmlPage(id);
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("chat-back")}
        >
          <Icon name="back" color={color.ink} />
        </Pressable>
        <Text style={styles.title}>{t("html-view-title")}</Text>
      </View>
      {html ? (
        <WebView
          style={styles.flex}
          originWhitelist={["*"]}
          source={{ html }}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          javaScriptCanOpenWindowsAutomatically={false}
          setSupportMultipleWindows={false}
        />
      ) : (
        <Text style={styles.gone}>{t("html-view-gone")}</Text>
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
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: {
    flex: 1,
    textAlign: "center",
    marginRight: 44,
    fontSize: 16,
    fontWeight: "700",
    color: color.ink,
  },
  gone: { margin: 24, fontSize: 14, color: color.muted, textAlign: "center" },
});
