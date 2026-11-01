import { describeError } from "@xiaoban/client";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import { color, dark, radius, space } from "@xiaoban/tokens";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Mascot } from "../src/components/Mascot.tsx";
import { useHubContext } from "../src/hub/HubProvider.tsx";
import { useKeyboard } from "../src/ui/useKeyboard.ts";

const CODE_LENGTH = 6;

export default function PairScreen() {
  const { t } = useI18n();
  const { pair } = useHubContext();
  const link = useLocalSearchParams<{ host?: string; port?: string; code?: string }>();
  const linked = link.host && link.code ? `${link.host}${link.port ? `:${link.port}` : ""}` : null;
  const [address, setAddress] = useState(linked ?? "");
  const [code, setCode] = useState(linked ? (link.code ?? "") : "");
  const [error, setError] = useState<PlainMessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = address.trim().length > 0 && code.length === CODE_LENGTH && !busy;

  const submit = async (target = address, secret = code) => {
    setBusy(true);
    setError(null);
    try {
      await pair(target, secret);
      router.replace("/");
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  };

  const keyboard = useKeyboard();
  const started = useRef(false);
  useEffect(() => {
    if (!linked || !link.code || started.current) return;
    started.current = true;
    void submit(linked, link.code);
  });

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        ref={keyboard.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: space.xl + keyboard.height }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.intro}>
          <Mascot />
          <Text style={styles.title} accessibilityRole="header">
            {t("pair-title")}
          </Text>
          <Text style={styles.lead}>{t("pair-scan-lead")}</Text>
        </View>

        <Pressable
          style={styles.scan}
          onPress={() => router.push("/scan")}
          accessibilityRole="button"
        >
          <Svg
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color.ink}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M4 12h16" />
          </Svg>
          <Text style={styles.scanText}>{t("pair-scan")}</Text>
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.rule} />
          <Text style={styles.dividerText}>{t("pair-or-manual")}</Text>
          <View style={styles.rule} />
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder={t("pair-address-placeholder")}
            placeholderTextColor={dark.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={address}
            onChangeText={(value) => {
              setAddress(value);
              setError(null);
            }}
            accessibilityLabel={t("pair-address-placeholder")}
          />
          <TextInput
            style={[styles.input, styles.code]}
            placeholder={t("pair-code-placeholder")}
            placeholderTextColor={dark.textMuted}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            value={code}
            onChangeText={(value) => {
              setCode(value.replace(/\D/g, ""));
              setError(null);
            }}
            accessibilityLabel={t("pair-code-placeholder")}
          />
          {error && (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {t(error)}
            </Text>
          )}
          <Pressable
            style={[styles.submit, ready && styles.submitReady]}
            disabled={!ready}
            onPress={() => void submit()}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready, busy }}
          >
            {busy && <ActivityIndicator color={dark.text} />}
            <Text style={[styles.submitText, ready && styles.submitTextReady]}>
              {t(busy ? "pair-submitting" : "pair-submit")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: dark.ground,
  },
  body: {
    flexGrow: 1,
    paddingHorizontal: space.xl,
    paddingBottom: space.xl,
  },
  scan: {
    marginTop: 28,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  scanText: { fontSize: 16, fontWeight: "500", color: color.ink },
  divider: { marginTop: 26, marginBottom: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  rule: { flex: 1, height: 1, backgroundColor: dark.line },
  dividerText: { fontSize: 12, color: dark.textMuted },
  intro: {
    paddingTop: 72,
    gap: space.lg,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: dark.text,
  },
  lead: {
    fontSize: 15,
    lineHeight: 24,
    color: dark.textSoft,
  },
  form: {
    gap: 10,
  },
  input: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: dark.lineStrong,
    backgroundColor: dark.surface,
    paddingHorizontal: space.lg,
    fontSize: 16,
    color: dark.text,
  },
  code: {
    letterSpacing: 6,
  },
  error: {
    borderRadius: radius.md,
    backgroundColor: color.attentionSoft,
    color: color.attentionInk,
    padding: space.md,
    fontSize: 13,
  },
  submit: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: dark.lineStrong,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  submitReady: { borderColor: dark.text },
  submitText: { fontSize: 15, color: dark.textMuted },
  submitTextReady: { color: dark.text, fontWeight: "500" },
});
