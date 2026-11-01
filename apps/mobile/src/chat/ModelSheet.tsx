import { failureKey, modelName } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { ProviderOption, ThinkingEffort } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";
import { Sheet } from "../life/LifeUI.tsx";
import { Icon } from "../ui/Icon.tsx";

export const EFFORTS: ThinkingEffort[] = ["auto", "none", "low", "high", "max"];

export function ModelSheet({
  threadId,
  open,
  onClose,
}: {
  threadId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const store = useHubStore();
  const state = useHubState(store);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const active = state.model;
  const effort = state.threads.find((thread) => thread.id === threadId)?.thinking ?? "auto";
  const supported = active?.provider === "deepseek";

  useEffect(() => {
    if (!open) return;
    setFailed(null);
    void store
      .listProviders()
      .then(setProviders)
      .catch(() => undefined);
  }, [open, store]);

  if (!active) return null;
  const models = [...(providers.find((option) => option.id === active.provider)?.models ?? [])];
  if (!models.includes(active.model)) models.unshift(active.model);

  const pick = async (model: string) => {
    if (model === active.model) return;
    setSwitching(model);
    setFailed(null);
    try {
      const { failure } = await store.selectModel(active.provider, model);
      if (failure) setFailed(t(failureKey(failure.kind)));
    } catch {
      setFailed(t("model-switch-failed"));
    } finally {
      setSwitching(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.section}>{t("thinking-model")}</Text>
        <View style={styles.group}>
          {models.map((model) => {
            const current = model === active.model;
            return (
              <Pressable
                key={model}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityState={{ selected: current, disabled: switching !== null }}
                disabled={switching !== null}
                onPress={() => void pick(model)}
              >
                <Text style={[styles.rowText, current && styles.rowCurrent]} numberOfLines={1}>
                  {current ? (active.label ?? modelName(model)) : modelName(model)}
                </Text>
                {switching === model ? (
                  <Text style={styles.note}>{t("model-switching")}</Text>
                ) : current ? (
                  <Text style={styles.current}>{t("model-current-short")}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        {failed ? <Text style={styles.failed}>{failed}</Text> : null}
        <Text style={styles.section}>{t("thinking-title")}</Text>
        {supported ? (
          <View style={styles.group}>
            {EFFORTS.map((value) => {
              const chosen = value === effort;
              return (
                <Pressable
                  key={value}
                  style={({ pressed }) => [styles.effort, pressed && styles.pressed]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: chosen }}
                  onPress={() => void store.setThinking(threadId, value).catch(() => undefined)}
                >
                  <View style={styles.effortText}>
                    <Text style={[styles.rowText, chosen && styles.rowCurrent]}>
                      {t(`thinking-${value}`)}
                    </Text>
                    <Text style={styles.help}>{t(`thinking-${value}-help`)}</Text>
                  </View>
                  {chosen ? <Icon name="check" size={18} color={color.accent} width={2.2} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={styles.help}>{t("thinking-unsupported")}</Text>
        )}
        <Pressable
          style={styles.manage}
          accessibilityRole="link"
          onPress={() => {
            onClose();
            router.push("/models");
          }}
        >
          <Text style={styles.manageText}>{t("models-manage-link")}</Text>
          <Icon name="chevronRight" size={14} color={color.accent} width={2} />
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { gap: 8, paddingBottom: 4 },
  section: { fontSize: 12, color: color.muted, marginTop: 6 },
  group: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: color.line,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.lineSoft,
  },
  pressed: { backgroundColor: color.ground },
  rowText: { flex: 1, fontSize: 15, color: color.ink },
  rowCurrent: { fontWeight: "600" },
  note: { fontSize: 12, color: color.muted },
  current: {
    fontSize: 11,
    color: color.accent,
    backgroundColor: color.accentWash,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  failed: { fontSize: 12, color: color.dangerInk },
  effort: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: color.lineSoft,
  },
  effortText: { flex: 1, gap: 2 },
  help: { fontSize: 12, lineHeight: 17, color: color.muted },
  manage: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 2,
    paddingVertical: 12,
  },
  manageText: { fontSize: 14, color: color.accent },
});
