import { currentLayout, type HubStore, pendingMeasures, preciseMeters } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DarkButton, LifeHeader, life } from "../life/LifeUI.tsx";
import { FloorCanvas } from "./FloorCanvas.tsx";
import { floorStyles } from "./FloorPlanScreen.tsx";
import { SchemeButton, SchemeSheet } from "./SchemeSheet.tsx";
import { useFloorPlan } from "./useFloorPlan.ts";

type Look = "result" | "source";

function SourceImage({ store, fileId, width }: { store: HubStore; fileId: string; width: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [ratio, setRatio] = useState(0.8);
  useEffect(() => {
    let live = true;
    void store
      .fileData(fileId)
      .then((data) => {
        if (!live) return;
        setUrl(data);
        Image.getSize(
          data,
          (w, h) => live && w > 0 && setRatio(h / w),
          () => undefined,
        );
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, fileId]);
  if (!url) return <View style={{ width, height: width * ratio }} />;
  return (
    <Image
      source={{ uri: url }}
      style={{ width, height: width * ratio }}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}

export function FloorCheckScreen({ store, planId }: { store: HubStore; planId: string }) {
  const { t } = useI18n();
  const plan = useFloorPlan(store, planId);
  const insets = useSafeAreaInsets();
  const { width: screen } = useWindowDimensions();
  const [look, setLook] = useState<Look>("result");
  const [queue, setQueue] = useState<string[] | null>(null);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [schemes, setSchemes] = useState(false);
  const [panel, setPanel] = useState(240);

  const ready = plan !== undefined;
  useEffect(() => {
    if (!ready || queue !== null || !plan) return;
    setQueue(pendingMeasures(currentLayout(plan)).map((measure) => measure.id));
  }, [ready, queue, plan]);

  if (!plan || queue === null) {
    return (
      <View style={styles.screen}>
        <LifeHeader title={t("floorplan-loading")} />
      </View>
    );
  }
  const layout = currentLayout(plan);
  const left = pendingMeasures(layout).length;
  const measure = layout.measures.find((candidate) => candidate.id === queue[index]) ?? null;
  const width = screen - 28 - 24;
  const advance = () => {
    setValue("");
    setBad(false);
    setIndex(index + 1);
  };
  const submit = () => {
    if (!measure || busy) return;
    const text = value.trim().replace(",", ".");
    if (!text) {
      advance();
      return;
    }
    const meters = Number(text);
    if (!Number.isFinite(meters) || meters < 0.05 || meters > 100) {
      setBad(true);
      return;
    }
    setBusy(true);
    void store
      .measureFloor(plan.id, measure.id, meters * 1000)
      .then(advance)
      .catch(() => setBad(true))
      .finally(() => setBusy(false));
  };
  const last = index >= queue.length - 1;

  return (
    <View style={styles.screen}>
      <LifeHeader
        title={plan.title}
        sub={
          left > 0 ? t("floorplan-check-title", { count: left }) : t("floorplan-check-done-title")
        }
        right={<SchemeButton onPress={() => setSchemes(true)} />}
      />
      <ScrollView
        style={life.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: panel + 16 }]}
      >
        <View style={styles.chips} accessibilityRole="tablist">
          {(["result", "source"] as const).map((id) => {
            const on = id === look;
            return (
              <Pressable
                key={id}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setLook(id)}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {id === "result" ? t("floorplan-check-result") : t("floorplan-check-source")}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={floorStyles.plan}>
          {look === "result" ? (
            <FloorCanvas
              layout={layout}
              view="size"
              width={width}
              maxHeight={520}
              focus={measure?.id ?? null}
            />
          ) : plan.sourceFileId ? (
            <SourceImage store={store} fileId={plan.sourceFileId} width={width} />
          ) : (
            <Text style={styles.noSource}>{t("floorplan-check-no-source")}</Text>
          )}
        </View>
      </ScrollView>
      <View
        style={[floorStyles.panel, styles.dock, { paddingBottom: Math.max(insets.bottom, 14) + 8 }]}
        onLayout={(event) => setPanel(event.nativeEvent.layout.height)}
      >
        {measure ? (
          <>
            <View style={styles.askRow}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t("floorplan-unclear-mark")}</Text>
              </View>
              <Text style={styles.ask} numberOfLines={2}>
                {t("floorplan-check-ask", { label: measure.label })}
              </Text>
              <Text style={styles.count}>
                {t("floorplan-check-progress", { index: index + 1, total: queue.length })}
              </Text>
            </View>
            <Text style={styles.note}>
              {measure.note}
              {t("floorplan-check-estimate", { meters: preciseMeters(measure.estimate) })}
            </Text>
            <View style={styles.inputRow}>
              <View style={[styles.field, bad && styles.fieldBad]}>
                <TextInput
                  style={styles.input}
                  value={value}
                  placeholder={preciseMeters(measure.estimate)}
                  placeholderTextColor={color.faded}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onChangeText={(text) => {
                    setValue(text);
                    setBad(false);
                  }}
                  onSubmitEditing={submit}
                />
                <Text style={styles.unit}>{t("floorplan-check-unit")}</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.next, (pressed || busy) && floorStyles.pressed]}
                accessibilityRole="button"
                disabled={busy}
                onPress={submit}
              >
                <Text style={floorStyles.darkText}>
                  {last ? t("floorplan-check-finish") : t("floorplan-check-next")}
                </Text>
              </Pressable>
            </View>
            {bad ? <Text style={styles.bad}>{t("floorplan-check-bad")}</Text> : null}
            <View style={styles.footRow}>
              <Pressable accessibilityRole="button" hitSlop={6} onPress={advance}>
                <Text style={styles.skip}>{t("floorplan-check-skip")}</Text>
              </Pressable>
              <Text style={styles.foot}>
                {t("daily-dot")}
                {t("floorplan-check-tip")}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.doneText}>
              {left > 0
                ? t("floorplan-card-pending", { count: left })
                : t("floorplan-check-all-done")}
            </Text>
            <DarkButton
              label={t("floorplan-check-back")}
              onPress={() => router.replace({ pathname: "/floor/[id]", params: { id: plan.id } })}
            />
          </>
        )}
      </View>
      <SchemeSheet store={store} plan={plan} open={schemes} onClose={() => setSchemes(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  body: { paddingHorizontal: 14, gap: 10 },
  chips: { flexDirection: "row", gap: 6 },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
  },
  chipOn: { backgroundColor: color.ink, borderColor: color.ink },
  chipText: { fontSize: 12, color: color.ink },
  chipTextOn: { color: color.surface },
  noSource: { fontSize: 13, color: color.muted, paddingVertical: 40 },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0 },
  askRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.attention,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: color.surface },
  ask: { flex: 1, fontSize: 15, fontWeight: "700", color: color.ink },
  count: { fontSize: 12, color: color.faded },
  note: { fontSize: 13, lineHeight: 21, color: color.muted },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  field: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: color.accent,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  fieldBad: { borderColor: color.danger },
  input: { flex: 1, fontSize: 15, color: color.ink, paddingVertical: 0 },
  unit: { fontSize: 13, color: color.faded, marginLeft: 6 },
  next: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  bad: { fontSize: 12, color: color.dangerInk },
  footRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  skip: { fontSize: 12, color: color.accent },
  foot: { fontSize: 12, color: color.faded, flexShrink: 1 },
  doneText: { fontSize: 14, lineHeight: 21, color: color.ink },
});
