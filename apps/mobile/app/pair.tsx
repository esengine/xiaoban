import { describeError } from "@xiaoban/client";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import { color, dark, radius, space } from "@xiaoban/tokens";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Mascot } from "../src/components/Mascot.tsx";
import { useHubContext } from "../src/hub/HubProvider.tsx";

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

  const started = useRef(false);
  useEffect(() => {
    if (!linked || !link.code || started.current) return;
    started.current = true;
    void submit(linked, link.code);
  });

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={styles.body} behavior="padding">
        <View style={styles.intro}>
          <Mascot />
          <Text style={styles.title} accessibilityRole="header">
            {t("onboarding-hello")}
          </Text>
          <Text style={styles.lead}>{t("pair-home-lead")}</Text>
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
        </View>

        <Pressable
          style={[styles.submit, !ready && styles.disabled]}
          disabled={!ready}
          onPress={() => void submit()}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready, busy }}
        >
          {busy && <ActivityIndicator color={color.ink} />}
          <Text style={styles.submitText}>{t(busy ? "pair-submitting" : "pair-submit")}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: dark.ground,
  },
  body: {
    flex: 1,
    paddingHorizontal: space.xl,
    paddingBottom: space.xl,
    justifyContent: "space-between",
  },
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
    gap: space.md,
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
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  disabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: 16,
    fontWeight: "500",
    color: color.ink,
  },
});
