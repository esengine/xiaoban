import { areaText, currentLayout, pendingMeasures, planArea } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";
import { FloorCanvas } from "./FloorCanvas.tsx";
import { openFloorCheck, openFloorPlan, useFloorPlan } from "./useFloorPlan.ts";

export function FloorCard({ planId }: { planId: string }) {
  const { t } = useI18n();
  const store = useHubStore();
  const plan = useFloorPlan(store, planId);
  if (!plan) return null;
  const layout = currentLayout(plan);
  const pending = pendingMeasures(layout).length;
  const meta = [
    t("floorplan-area", { area: areaText(planArea(plan, layout)) }),
    plan.kind,
    t("floorplan-rooms", { count: layout.rooms.length }),
  ]
    .filter(Boolean)
    .join(t("daily-dot"));
  return (
    <View style={styles.card}>
      <Pressable
        style={styles.top}
        accessibilityRole="button"
        onPress={() => openFloorPlan(plan.id)}
      >
        <View style={styles.thumb}>
          <FloorCanvas layout={layout} view="plain" width={80} maxHeight={70} thumbnail />
        </View>
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {plan.title}
          </Text>
          <Text style={styles.meta} numberOfLines={2}>
            {meta}
          </Text>
          {pending > 0 ? (
            <Text style={styles.pending}>{t("floorplan-card-pending", { count: pending })}</Text>
          ) : layout.measures.length > 0 ? (
            <Text style={styles.checked}>{t("floorplan-card-checked")}</Text>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.button, styles.dark, pressed && styles.pressed]}
          accessibilityRole="button"
          onPress={() => openFloorPlan(plan.id)}
        >
          <Text style={styles.darkText}>{t("floorplan-open")}</Text>
        </Pressable>
        {pending > 0 ? (
          <Pressable
            style={({ pressed }) => [styles.button, styles.line, pressed && styles.pressed]}
            accessibilityRole="button"
            onPress={() => openFloorCheck(plan.id)}
          >
            <Text style={styles.lineText}>{t("floorplan-check-first")}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    width: 300,
    maxWidth: "100%",
    backgroundColor: color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    padding: 12,
    gap: 8,
  },
  top: { flexDirection: "row", gap: 10, alignItems: "center" },
  thumb: {
    width: 92,
    height: 80,
    borderRadius: 8,
    backgroundColor: color.ground,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "700", color: color.ink },
  meta: { fontSize: 12, color: color.muted, marginTop: 3 },
  pending: { fontSize: 12, color: color.attentionInk, marginTop: 3 },
  checked: { fontSize: 12, color: color.success, marginTop: 3 },
  actions: { flexDirection: "row", gap: 8 },
  button: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.85 },
  dark: { backgroundColor: color.ink },
  darkText: { fontSize: 13, fontWeight: "600", color: color.surface },
  line: { borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.surface },
  lineText: { fontSize: 13, color: color.ink },
});
