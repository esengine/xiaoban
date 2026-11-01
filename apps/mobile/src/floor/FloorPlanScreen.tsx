import {
  activeScheme,
  areaText,
  changedRooms,
  compareTarget,
  currentLayout,
  type FloorView,
  type HubStore,
  latestVersion,
  pendingMeasures,
  planArea,
  roomSize,
} from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { ContextNote, FloorPlan, FloorRoom } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LifeReply } from "../life/LifeReply.tsx";
import { LifeHeader, life, Segment } from "../life/LifeUI.tsx";
import { Icon } from "../ui/Icon.tsx";
import { useExporter } from "../work/exportFile.ts";
import { FloorCanvas } from "./FloorCanvas.tsx";
import { FloorProgress } from "./FloorProgress.tsx";
import { floorPdf } from "./floorExport.ts";
import { SchemeButton, SchemeSheet } from "./SchemeSheet.tsx";
import { openFloorCheck, useFloorPlan } from "./useFloorPlan.ts";

type Tab = "plan" | "progress";
type Translate = ReturnType<typeof useI18n>["t"];

export function planSub(t: Translate, plan: FloorPlan): string {
  const layout = currentLayout(plan);
  return [
    t("floorplan-area", { area: areaText(planArea(plan, layout)) }),
    plan.kind,
    t("floorplan-scheme-version", {
      scheme: plan.scheme,
      version: latestVersion(activeScheme(plan))?.number ?? 1,
    }),
  ]
    .filter(Boolean)
    .join(t("daily-dot"));
}

export function ViewChips({
  value,
  onChange,
}: {
  value: FloorView;
  onChange: (view: FloorView) => void;
}) {
  const { t } = useI18n();
  const views: { id: FloorView; label: string }[] = [
    { id: "plain", label: t("floorplan-view-plain") },
    { id: "furniture", label: t("floorplan-view-furniture") },
    { id: "size", label: t("floorplan-view-size") },
  ];
  return (
    <View style={styles.chips} accessibilityRole="tablist">
      {views.map((view) => {
        const on = view.id === value;
        return (
          <Pressable
            key={view.id}
            style={[styles.chip, on && styles.chipOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(view.id)}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{view.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function roomMeta(t: Translate, room: FloorRoom): string {
  return [
    t("floorplan-area", { area: areaText(room.area) }),
    t("floorplan-size", roomSize(room)),
    room.facing ? t(`floorplan-facing-${room.facing}`) : "",
  ]
    .filter(Boolean)
    .join(t("daily-dot"));
}

function Panel({
  store,
  plan,
  room,
  comparing,
  onCompare,
  onTurn,
}: {
  store: HubStore;
  plan: FloorPlan;
  room: FloorRoom | null;
  comparing: boolean;
  onCompare: () => void;
  onTurn: (turnId: string) => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const exporter = useExporter(() => undefined);
  const target = compareTarget(plan);
  const pending = pendingMeasures(currentLayout(plan)).length;
  const ask = (value: string) => {
    const words = value.trim();
    if (!words) return;
    const context: ContextNote[] = room
      ? [
          {
            label: t("floorplan-ask-label"),
            body: t("floorplan-ask-body", {
              title: plan.title,
              scheme: plan.scheme,
              room: room.name,
            }),
          },
        ]
      : [];
    const message = room ? t("floorplan-ask-message", { room: room.name, text: words }) : words;
    void store
      .send(plan.threadId, message, { context })
      .then((turnId) => {
        setText("");
        setSent(true);
        onTurn(turnId);
      })
      .catch(() => undefined);
  };
  const example = room?.ideas[0];
  const placeholder = room
    ? example
      ? t("floorplan-ask-room-example", { room: room.name, example })
      : t("floorplan-ask-room", { room: room.name })
    : t("floorplan-ask-plan");
  return (
    <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 14) + 8 }]}>
      {room ? (
        <>
          <View style={styles.roomHead}>
            <Text style={styles.roomName}>{room.name}</Text>
            <Text style={styles.roomMeta} numberOfLines={1}>
              {roomMeta(t, room)}
            </Text>
          </View>
          <Text style={room.advice ? styles.advice : styles.adviceEmpty}>
            {room.advice || t("floorplan-advice-empty")}
          </Text>
          {room.ideas.length > 0 ? (
            <View style={styles.ideas}>
              {room.ideas.map((idea) => (
                <Pressable
                  key={idea}
                  style={({ pressed }) => [styles.idea, pressed && styles.pressed]}
                  accessibilityRole="button"
                  onPress={() => ask(idea)}
                >
                  <Text style={styles.ideaText}>{idea}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.hintRow}>
          <Text style={styles.hint}>{sent ? t("floorplan-sent") : t("floorplan-hint-tap")}</Text>
          {pending > 0 ? (
            <Pressable
              style={styles.pendingPill}
              accessibilityRole="button"
              onPress={() => openFloorCheck(plan.id)}
            >
              <Text style={styles.pendingText}>
                {t("floorplan-pending-banner", { count: pending })}
              </Text>
              <Icon name="chevronRight" size={10} color={color.attentionInk} width={2.4} />
            </Pressable>
          ) : null}
        </View>
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          placeholder={placeholder}
          placeholderTextColor={color.faded}
          returnKeyType="send"
          onChangeText={setText}
          onSubmitEditing={() => ask(text)}
        />
        {text.trim() ? (
          <Pressable
            style={styles.send}
            accessibilityRole="button"
            accessibilityLabel={t("composer-send")}
            onPress={() => ask(text)}
          >
            <Icon name="send" size={16} color={color.surface} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.actions}>
        {target ? (
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.line,
              comparing && styles.lineOn,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: comparing }}
            onPress={onCompare}
          >
            <Text style={styles.lineText} numberOfLines={1}>
              {comparing
                ? t("floorplan-compare-back", { scheme: plan.scheme })
                : target.sameScheme
                  ? t("floorplan-compare-version", { version: target.version })
                  : t("floorplan-compare", { scheme: target.scheme })}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          style={({ pressed }) => [styles.button, styles.dark, pressed && styles.pressed]}
          accessibilityRole="button"
          disabled={exporter.busy !== null}
          onPress={() => exporter.start("pdf", () => floorPdf(t, plan))}
        >
          <Text style={styles.darkText}>
            {exporter.busy ? t("export-phone-busy") : t("floorplan-share")}
          </Text>
        </Pressable>
      </View>
      {exporter.failed ? <Text style={styles.failed}>{t("export-phone-failed")}</Text> : null}
    </View>
  );
}

export function FloorPlanScreen({ store, planId }: { store: HubStore; planId: string }) {
  const { t } = useI18n();
  const plan = useFloorPlan(store, planId);
  const { width: screen } = useWindowDimensions();
  const [tab, setTab] = useState<Tab>("plan");
  const [view, setView] = useState<FloorView>("furniture");
  const [selected, setSelected] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [schemes, setSchemes] = useState(false);
  const [turn, setTurn] = useState<string | null>(null);
  const [panel, setPanel] = useState(260);

  if (!plan) {
    return (
      <View style={styles.screen}>
        <LifeHeader title={t("floorplan-loading")} />
      </View>
    );
  }
  const layout = currentLayout(plan);
  const target = comparing ? compareTarget(plan) : null;
  const shown = target ? target.layout : layout;
  const changed = target ? changedRooms(layout, target.layout) : [];
  const room = shown.rooms.find((candidate) => candidate.id === selected) ?? null;
  const width = screen - 28 - 24;

  return (
    <View style={styles.screen}>
      <LifeHeader
        title={plan.title}
        sub={planSub(t, plan)}
        right={<SchemeButton onPress={() => setSchemes(true)} />}
      />
      <View style={styles.tabs}>
        <Segment
          value={tab}
          options={[
            { id: "plan", label: t("floorplan-tab-plan") },
            { id: "progress", label: t("floorplan-tab-progress") },
          ]}
          onChange={setTab}
        />
      </View>
      {tab === "progress" ? (
        <FloorProgress store={store} plan={plan} />
      ) : (
        <>
          <ScrollView
            style={life.scroll}
            contentContainerStyle={[styles.body, { paddingBottom: panel + 16 }]}
          >
            <ViewChips value={view} onChange={setView} />
            {target ? (
              <View style={styles.compare}>
                <Text style={styles.compareTitle}>
                  {t("floorplan-comparing", { scheme: target.scheme, version: target.version })}
                </Text>
                <Text style={styles.compareText}>
                  {changed.length > 0
                    ? t("floorplan-compare-diff", {
                        rooms: changed.join(t("floorplan-compare-joiner")),
                      })
                    : t("floorplan-compare-same")}
                </Text>
              </View>
            ) : null}
            <View style={styles.plan}>
              <FloorCanvas
                layout={shown}
                view={view}
                width={width}
                maxHeight={520}
                selected={selected}
                marked={changed}
                onPick={(picked) => setSelected(picked.id === selected ? null : picked.id)}
              />
            </View>
          </ScrollView>
          <View style={styles.dock} onLayout={(event) => setPanel(event.nativeEvent.layout.height)}>
            {turn ? (
              <LifeReply
                store={store}
                threadId={plan.threadId}
                turnId={turn}
                onClose={() => setTurn(null)}
              />
            ) : null}
            <Panel
              store={store}
              plan={plan}
              room={room}
              comparing={comparing}
              onCompare={() => setComparing(!comparing)}
              onTurn={setTurn}
            />
          </View>
        </>
      )}
      <SchemeSheet store={store} plan={plan} open={schemes} onClose={() => setSchemes(false)} />
    </View>
  );
}

export const floorStyles = StyleSheet.create({
  panel: {
    backgroundColor: color.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
    paddingHorizontal: 16,
    gap: 10,
    shadowColor: color.ink,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 8,
  },
  plan: {
    backgroundColor: color.surface,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
  },
  dark: { backgroundColor: color.ink },
  darkText: { fontSize: 13, fontWeight: "600", color: color.surface },
  pressed: { opacity: 0.85 },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  tabs: { paddingHorizontal: 14, paddingBottom: 10 },
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
  compare: {
    backgroundColor: color.accentWash,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  compareTitle: { fontSize: 13, fontWeight: "600", color: color.accentStrong },
  compareText: { fontSize: 12, color: color.inkMid },
  plan: floorStyles.plan,
  dock: { position: "absolute", left: 0, right: 0, bottom: 0 },
  panel: floorStyles.panel,
  roomHead: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  roomName: { fontSize: 17, fontWeight: "700", color: color.ink },
  roomMeta: { flexShrink: 1, fontSize: 12, color: color.muted },
  advice: { fontSize: 13, lineHeight: 21, color: color.ink },
  adviceEmpty: { fontSize: 13, lineHeight: 21, color: color.faint },
  ideas: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  idea: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
  },
  ideaText: { fontSize: 12, color: color.ink },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  hint: { flexShrink: 1, fontSize: 13, color: color.muted },
  pendingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: color.attentionSoft,
  },
  pendingText: { fontSize: 12, color: color.attentionInk },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: color.ground,
    paddingHorizontal: 12,
    fontSize: 13,
    color: color.ink,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", gap: 8 },
  button: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  line: { borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.surface },
  lineOn: { borderColor: color.accent, backgroundColor: color.accentWash },
  lineText: { fontSize: 13, color: color.ink },
  dark: floorStyles.dark,
  darkText: floorStyles.darkText,
  pressed: floorStyles.pressed,
  failed: { fontSize: 12, color: color.dangerInk },
});
