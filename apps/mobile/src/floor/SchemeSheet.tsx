import type { HubStore } from "@xiaoban/client";
import { activeScheme, latestVersion } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { FloorPlan } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { life, Sheet } from "../life/LifeUI.tsx";
import { Icon } from "../ui/Icon.tsx";

export function SchemeButton({ onPress }: { onPress: () => void }) {
  const { t } = useI18n();
  return (
    <Pressable style={styles.button} accessibilityRole="button" onPress={onPress}>
      <Text style={styles.buttonText}>{t("floorplan-scheme-button")}</Text>
      <Icon name="chevronDown" size={10} color={color.ink} width={2.4} />
    </Pressable>
  );
}

export function SchemeSheet({
  store,
  plan,
  open,
  onClose,
}: {
  store: HubStore;
  plan: FloorPlan;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const current = activeScheme(plan);
  const versions = [...(current?.versions ?? [])].reverse();
  const latest = latestVersion(current)?.number;
  return (
    <Sheet open={open} onClose={onClose}>
      <Text style={life.sheetTitle}>{t("floorplan-schemes-title")}</Text>
      <View style={styles.schemes}>
        {plan.schemes.map((scheme) => {
          const on = scheme.id === plan.scheme;
          return (
            <Pressable
              key={scheme.id}
              style={[styles.scheme, on && styles.schemeOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                if (!on) void store.setFloorScheme(plan.id, scheme.id).catch(() => undefined);
              }}
            >
              <Text style={[styles.schemeText, on && styles.schemeTextOn]}>
                {t("floorplan-scheme-version", {
                  scheme: scheme.id,
                  version: latestVersion(scheme)?.number ?? 1,
                })}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {current ? (
        <>
          <Text style={styles.heading}>
            {t("floorplan-versions-title", { scheme: current.id })}
          </Text>
          <ScrollView style={styles.list}>
            {versions.map((version) => (
              <View key={version.number} style={styles.row}>
                <View style={life.flex}>
                  <Text style={styles.rowTitle}>
                    {t("floorplan-version-row", { version: version.number })}
                  </Text>
                  {version.note ? (
                    <Text style={styles.rowNote} numberOfLines={2}>
                      {version.note}
                    </Text>
                  ) : null}
                </View>
                {version.number === latest ? (
                  <Text style={styles.current}>{t("floorplan-version-current")}</Text>
                ) : (
                  <Pressable
                    style={styles.restore}
                    accessibilityRole="button"
                    onPress={() => {
                      void store
                        .restoreFloorVersion(plan.id, current.id, version.number)
                        .then(onClose)
                        .catch(() => undefined);
                    }}
                  >
                    <Text style={styles.restoreText}>{t("floorplan-version-restore")}</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  buttonText: { fontSize: 12, color: color.ink },
  schemes: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 },
  scheme: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.lineStrong,
  },
  schemeOn: { backgroundColor: color.ink, borderColor: color.ink },
  schemeText: { fontSize: 13, color: color.ink },
  schemeTextOn: { color: color.surface, fontWeight: "600" },
  heading: {
    fontSize: 12,
    fontWeight: "700",
    color: color.muted,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
  },
  list: { maxHeight: 320 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
  },
  rowTitle: { fontSize: 14, color: color.ink, fontWeight: "600" },
  rowNote: { fontSize: 12, color: color.muted, marginTop: 2 },
  current: { fontSize: 12, color: color.faded },
  restore: {
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.lineStrong,
    justifyContent: "center",
  },
  restoreText: { fontSize: 12, color: color.ink },
});
