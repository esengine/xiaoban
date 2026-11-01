import { describeError, failureKey, providerKey } from "@xiaoban/client";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { ProviderId, ProviderOption } from "@xiaoban/protocol";
import { providerSvg } from "@xiaoban/provider-icons";
import { color, dark, radius, space } from "@xiaoban/tokens";
import { Redirect, router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";
import { Mascot } from "../src/components/Mascot.tsx";
import { useHubContext } from "../src/hub/HubProvider.tsx";

export default function SetupScreen() {
  const { t } = useI18n();
  const { phase, local, keySaved } = useHubContext();
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selected, setSelected] = useState<ProviderId | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PlainMessageKey | null>(null);

  useEffect(() => {
    if (!local) return;
    void local
      .listProviders()
      .then((options) => {
        setProviders(options);
        setSelected((current) => current ?? options[0]?.id ?? null);
      })
      .catch(() => undefined);
  }, [local]);

  if (phase === "ready") return <Redirect href="/" />;

  const provider = providers.find((option) => option.id === selected) ?? null;
  const custom = selected === "custom";
  const builtIn = providers.filter((option) => option.id !== "custom");
  const ready =
    provider !== null &&
    apiKey.trim() !== "" &&
    (!custom || (baseUrl.trim() !== "" && model.trim() !== "")) &&
    !busy;

  const pick = (id: ProviderId) => {
    setSelected(id);
    setError(null);
  };

  const submit = async () => {
    if (!local || !provider) return;
    setBusy(true);
    setError(null);
    try {
      const key = apiKey.trim();
      const { failure } = await local.configureProvider(
        custom
          ? { provider: provider.id, apiKey: key, baseUrl: baseUrl.trim(), model: model.trim() }
          : { provider: provider.id, apiKey: key },
      );
      if (failure) setError(failureKey(failure.kind));
      else await keySaved(provider.id, key);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  };

  const field = (value: string, change: (next: string) => void, label: PlainMessageKey) => (
    <View style={styles.field}>
      <Text style={styles.label}>{t(label)}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(next) => {
          change(next);
          setError(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={t(label)}
      />
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}>
            <Mascot />
            <Text style={styles.title} accessibilityRole="header">
              {t("onboarding-hello")}
            </Text>
            <Text style={styles.lead}>
              {`${t("onboarding-local-first")}\n${t("onboarding-pick-provider")}`}
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.chips}>
              {builtIn.map((option, index) => {
                const active = option.id === selected;
                const name = t(providerKey(option.id));
                return (
                  <Pressable
                    key={option.id}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => pick(option.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                  >
                    <View style={[styles.icon, active && styles.iconActive]}>
                      <SvgXml xml={providerSvg(option.id)} width={16} height={16} />
                    </View>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {index === 0 ? t("setup-recommended", { provider: name }) : name}
                    </Text>
                  </Pressable>
                );
              })}
              {providers.some((option) => option.id === "custom") && (
                <Pressable
                  style={[styles.chip, styles.chipPlain, custom && styles.chipActive]}
                  onPress={() => pick("custom")}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: custom }}
                >
                  <Text style={[styles.chipText, custom && styles.chipTextActive]}>
                    {custom ? t("provider-custom") : t("setup-more")}
                  </Text>
                </Pressable>
              )}
            </View>

            {custom && field(baseUrl, setBaseUrl, "custom-base-url-label")}
            {custom && field(model, setModel, "custom-model-label")}

            <View style={styles.field}>
              <Text style={styles.label}>{t("onboarding-key-label")}</Text>
              <TextInput
                style={styles.input}
                value={apiKey}
                onChangeText={(next) => {
                  setApiKey(next);
                  setError(null);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={
                  provider
                    ? t("onboarding-key-placeholder", { provider: t(providerKey(provider.id)) })
                    : undefined
                }
                placeholderTextColor={dark.textMuted}
                accessibilityLabel={t("onboarding-key-label")}
              />
            </View>

            <View style={styles.links}>
              {provider?.consoleUrl ? (
                <Pressable onPress={() => void Linking.openURL(provider.consoleUrl ?? "")}>
                  <Text style={styles.link}>
                    {t("onboarding-get-key", { provider: t(providerKey(provider.id)) })}
                  </Text>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable onPress={() => router.push("/pair")}>
                <Text style={styles.link}>{t("pair-title")}</Text>
              </Pressable>
            </View>

            <Text style={styles.note}>{t("onboarding-cost-note")}</Text>

            {error && (
              <Text style={styles.error} accessibilityLiveRegion="polite">
                {t(error)}
              </Text>
            )}
          </View>

          <View style={styles.flex} />

          <View style={styles.footer}>
            <Pressable
              style={[styles.submit, !ready && styles.disabled]}
              disabled={!ready}
              onPress={submit}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready, busy }}
            >
              {busy && <ActivityIndicator color={color.ink} />}
              <Text style={styles.submitText}>
                {t(busy ? "onboarding-checking" : "onboarding-submit")}
              </Text>
            </Pressable>
            <Text style={styles.footnote}>{t("setup-key-local")}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.ground },
  flex: { flex: 1 },
  body: { flexGrow: 1, paddingHorizontal: space.xl, paddingBottom: 36 },
  intro: { paddingTop: 72, gap: 14 },
  title: { fontSize: 26, fontWeight: "700", lineHeight: 35, color: dark.text },
  lead: { fontSize: 14, lineHeight: 24, color: dark.textSoft },
  form: { marginTop: 20, gap: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    height: 34,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: dark.lineStrong,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipPlain: { paddingLeft: 12 },
  chipActive: { backgroundColor: color.surface, borderColor: color.surface },
  chipText: { fontSize: 13, color: dark.text },
  chipTextActive: { color: color.ink, fontWeight: "500" },
  icon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActive: { width: 18, borderRadius: 0 },
  field: { gap: 6 },
  label: { fontSize: 12, color: dark.textMuted },
  input: {
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: dark.lineStrong,
    backgroundColor: dark.surface,
    paddingHorizontal: 12,
    fontSize: 14,
    color: dark.text,
  },
  links: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  link: { fontSize: 12, color: dark.link },
  note: {
    backgroundColor: dark.surface,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    lineHeight: 20,
    color: dark.textSoft,
    overflow: "hidden",
  },
  error: {
    borderRadius: radius.md,
    backgroundColor: color.attentionSoft,
    color: color.attentionInk,
    padding: space.md,
    fontSize: 13,
    overflow: "hidden",
  },
  footer: { marginTop: 24, gap: 10 },
  submit: {
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  disabled: { opacity: 0.5 },
  submitText: { fontSize: 16, fontWeight: "500", color: color.ink },
  footnote: { fontSize: 12, lineHeight: 18, color: dark.textMuted, textAlign: "center" },
});
