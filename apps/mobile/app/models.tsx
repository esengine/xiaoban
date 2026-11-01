import { describeError, failureKey, providerKey } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { ProviderId, ProviderOption } from "@xiaoban/protocol";
import { providerSvg } from "@xiaoban/provider-icons";
import { color, radius } from "@xiaoban/tokens";
import { router, Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, SvgXml } from "react-native-svg";
import { useHubContext, useHubStore } from "../src/hub/HubProvider.tsx";
import { useKeyboard } from "../src/ui/useKeyboard.ts";

type Check = { state: "testing" } | { state: "ok" } | { state: "failed"; message: PlainMessageKey };

function Field({
  label,
  value,
  onChange,
  secret = false,
  mono = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  mono?: boolean;
  placeholder?: string | undefined;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, mono && styles.mono]}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secret}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor={color.faint}
        accessibilityLabel={label}
      />
    </View>
  );
}

function ProviderRow({
  option,
  first,
  open,
  onToggle,
  onSaved,
}: {
  option: ProviderOption;
  first: boolean;
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const store = useHubStore();
  const { local, keySaved } = useHubContext();
  const { model } = useHubState(store);
  const active = model?.provider === option.id ? model : null;
  const custom = option.id === "custom";
  const [key, setKey] = useState("");
  const [picked, setPicked] = useState<string | null>(active?.model ?? option.defaultModel);
  const [baseUrl, setBaseUrl] = useState(active?.baseUrl ?? "");
  const [customModel, setCustomModel] = useState(custom ? (active?.model ?? "") : "");
  const [label, setLabel] = useState(active?.label ?? "");
  const [check, setCheck] = useState<Check | null>(null);
  const name = custom && active?.label ? active.label : t(providerKey(option.id));
  const shownModel = active?.model ?? option.defaultModel ?? "";

  const test = async () => {
    const apiKey = key.trim();
    setCheck({ state: "testing" });
    try {
      const result =
        apiKey === "" && option.configured && !custom && picked
          ? await store.selectModel(option.id, picked)
          : await store.configureProvider(
              custom
                ? {
                    provider: option.id,
                    apiKey,
                    baseUrl: baseUrl.trim(),
                    model: customModel.trim(),
                    ...(label.trim() ? { label: label.trim() } : {}),
                  }
                : { provider: option.id, apiKey, ...(picked ? { model: picked } : {}) },
            );
      if (result.failure) {
        setCheck({ state: "failed", message: failureKey(result.failure.kind) });
        return;
      }
      if (apiKey && store === local) await keySaved(option.id, apiKey);
      setKey("");
      setCheck({ state: "ok" });
      onSaved();
    } catch (cause) {
      setCheck({ state: "failed", message: describeError(cause) });
    }
  };

  const ready =
    check?.state !== "testing" &&
    (custom
      ? key.trim() !== "" && baseUrl.trim() !== "" && customModel.trim() !== ""
      : key.trim() !== "" || (option.configured && picked !== null));

  return (
    <View style={!first && styles.divider}>
      <Pressable
        style={[styles.row, open && styles.rowOpen]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.tile}>
          {custom ? (
            <Svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke={color.muted}
              strokeWidth={2}
              strokeLinecap="round"
            >
              <Path d="M12 5v14M5 12h14" />
            </Svg>
          ) : (
            <SvgXml xml={providerSvg(option.id)} width={24} height={24} />
          )}
        </View>
        <View style={styles.flex}>
          <Text style={styles.name}>{name}</Text>
          {shownModel ? (
            <Text style={styles.model} numberOfLines={1}>
              {shownModel}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.status, option.configured ? styles.statusOn : styles.statusOff]}>
          {t(option.configured ? "models-connected" : "models-not-set")}
        </Text>
        <Svg
          width={14}
          height={14}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color.faint}
          strokeWidth={2.2}
          strokeLinecap="round"
          style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}
        >
          <Path d="M6 9l6 6 6-6" />
        </Svg>
      </Pressable>
      {open && (
        <View style={styles.panel}>
          {custom && (
            <>
              <Field
                label={t("custom-base-url-label")}
                value={baseUrl}
                onChange={setBaseUrl}
                mono
              />
              <View style={styles.pair}>
                <View style={styles.flex}>
                  <Field
                    label={t("custom-model-label")}
                    value={customModel}
                    onChange={setCustomModel}
                    mono
                  />
                </View>
                <View style={styles.flex}>
                  <Field label={t("models-label")} value={label} onChange={setLabel} />
                </View>
              </View>
            </>
          )}
          <Field
            label={t("onboarding-key-label")}
            value={key}
            onChange={(value) => {
              setKey(value);
              setCheck(null);
            }}
            secret
            placeholder={option.configured ? t("models-key-saved") : undefined}
          />
          {!custom && option.models.length > 0 && (
            <View style={styles.models}>
              <Text style={styles.fieldLabel}>{t("models-model")}</Text>
              {option.models.map((id) => {
                const on = id === picked;
                return (
                  <Pressable
                    key={id}
                    style={[styles.choice, on && styles.choiceOn]}
                    onPress={() => {
                      setPicked(id);
                      setCheck(null);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <View style={[styles.radio, on && styles.radioOn]}>
                      {on && <View style={styles.dot} />}
                    </View>
                    <Text style={[styles.flex, styles.choiceText]}>{id}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <View style={styles.actions}>
            <Pressable
              style={[styles.test, !ready && styles.disabled]}
              disabled={!ready}
              onPress={() => void test()}
              accessibilityRole="button"
            >
              <Text style={styles.testText}>{t("models-test")}</Text>
            </Pressable>
            {check?.state === "testing" && (
              <View style={styles.result}>
                <ActivityIndicator size="small" color={color.accent} />
                <Text style={styles.resultText}>{t("models-testing")}</Text>
              </View>
            )}
            {check?.state === "ok" && (
              <Text style={[styles.resultText, styles.ok]}>{t("models-ok")}</Text>
            )}
            <View style={styles.flex} />
            {option.consoleUrl ? (
              <Pressable onPress={() => void Linking.openURL(option.consoleUrl ?? "")}>
                <Text style={styles.link}>{t("models-get-key")}</Text>
              </Pressable>
            ) : null}
          </View>
          {check?.state === "failed" && <Text style={styles.error}>{t(check.message)}</Text>}
          {custom && <Text style={styles.warning}>{t("custom-trust-warning")}</Text>}
        </View>
      )}
    </View>
  );
}

export default function ModelsScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const store = useHubStore();
  const { model } = useHubState(store);
  const keyboard = useKeyboard();
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [open, setOpen] = useState<ProviderId | null>(null);

  const load = useCallback(() => {
    void store
      .listProviders()
      .then(setProviders)
      .catch(() => undefined);
  }, [store]);

  useEffect(() => {
    load();
    setOpen((current) => current ?? model?.provider ?? null);
  }, [load, model?.provider]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          style={styles.back}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("onboarding-back")}
        >
          <Svg
            width={22}
            height={22}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color.ink}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M15 5l-7 7 7 7" />
          </Svg>
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          {t("models-title")}
        </Text>
      </View>
      <ScrollView
        ref={keyboard.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: 24 + keyboard.height }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.banner}>{t("models-banner")}</Text>
        <View style={styles.card}>
          {providers.map((option, index) => (
            <ProviderRow
              key={option.id}
              option={option}
              first={index === 0}
              open={open === option.id}
              onToggle={() => setOpen((current) => (current === option.id ? null : option.id))}
              onSaved={load}
            />
          ))}
        </View>
        <Text style={styles.credit}>{t("models-icon-credit")}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  flex: { flex: 1, minWidth: 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 4,
    gap: 4,
  },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: {
    flex: 1,
    textAlign: "center",
    marginRight: 48,
    fontSize: 16,
    fontWeight: "700",
    color: color.ink,
  },
  body: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  banner: {
    backgroundColor: color.accentWash,
    color: color.accentStrong,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    lineHeight: 19,
    overflow: "hidden",
  },
  card: { backgroundColor: color.surface, borderRadius: 18, overflow: "hidden" },
  divider: { borderTopWidth: 1, borderTopColor: color.lineSoft },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowOpen: { backgroundColor: color.ground },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.lineSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontSize: 15, fontWeight: "500", color: color.ink },
  model: { fontSize: 12, color: color.muted, fontFamily: "monospace" },
  status: {
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  statusOn: { backgroundColor: color.successSoft, color: color.success },
  statusOff: { backgroundColor: color.neutralSoft, color: color.muted },
  panel: { paddingLeft: 66, paddingRight: 14, paddingTop: 4, paddingBottom: 14, gap: 10 },
  pair: { flexDirection: "row", gap: 8 },
  field: { gap: 4 },
  fieldLabel: { fontSize: 12, color: color.muted },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 13,
    color: color.ink,
  },
  mono: { fontFamily: "monospace" },
  models: { gap: 6 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.line,
  },
  choiceOn: { borderColor: color.accent, backgroundColor: color.accentWash },
  radio: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: color.line,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: color.accent },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.accent },
  choiceText: { fontSize: 13, fontFamily: "monospace", color: color.ink },
  actions: { flexDirection: "row", alignItems: "center", gap: 10 },
  test: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: { opacity: 0.4 },
  testText: { fontSize: 13, color: color.surface },
  result: { flexDirection: "row", alignItems: "center", gap: 6 },
  resultText: { fontSize: 12, color: color.inkMid },
  ok: { color: color.success },
  link: { fontSize: 12, color: color.accent },
  error: {
    borderRadius: radius.md,
    backgroundColor: color.attentionSoft,
    color: color.attentionInk,
    padding: 10,
    fontSize: 12,
    overflow: "hidden",
  },
  warning: { fontSize: 12, color: color.attentionInk },
  credit: { fontSize: 11, color: color.faint, paddingHorizontal: 4 },
});
