import { fileName, type HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Deck } from "@xiaoban/protocol";
import { buildPptxBase64, deckIcons, iconKey, type PptxIcon } from "@xiaoban/slides/pptx";
import { color, dark } from "@xiaoban/tokens";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { ChatBar, LifeHeader, life, Sheet, SheetAction } from "../life/LifeUI.tsx";
import { Working } from "../life/Working.tsx";
import { MIME, saveExport, useExporter } from "./exportFile.ts";
import IconRaster from "./IconRaster.tsx";
import SlideFrame from "./SlideFrame.tsx";
import SlideStrip from "./SlideStrip.tsx";
import { ShareButton } from "./WorkUI.tsx";

const THUMB_W = 72;
const RASTER_WAIT = 8000;

type Raster = { icons: PptxIcon[]; onDone: (pngs: (string | null)[]) => Promise<void> };

export function DeckScreen({ store, deckId }: { store: HubStore; deckId: string }) {
  const { t } = useI18n();
  const { deck } = useHubState(store);
  const current = deck?.id === deckId ? deck : null;
  const { width: screenWidth } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [before, setBefore] = useState(false);
  const [turn, setTurn] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [raster, setRaster] = useState<Raster | null>(null);
  const exporter = useExporter(() => setSharing(false));
  const count = current?.slides.length ?? 0;
  const page = useRef({ index, count });
  page.current = { index, count };

  useEffect(() => {
    void store.openDeck(deckId).catch(() => undefined);
  }, [store, deckId]);

  const go = (next: number) => {
    setIndex(Math.max(0, Math.min(page.current.count - 1, next)));
    setBefore(false);
  };
  const goRef = useRef(go);
  goRef.current = go;

  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -40) goRef.current(page.current.index + 1);
          else if (gesture.dx > 40) goRef.current(page.current.index - 1);
        },
      }).panHandlers,
    [],
  );

  const rasterize = (icons: PptxIcon[]) =>
    new Promise<(string | null)[]>((resolve) => {
      if (icons.length === 0) {
        resolve([]);
        return;
      }
      const finish = (pngs: (string | null)[]) => {
        clearTimeout(timer);
        setRaster(null);
        resolve(pngs);
      };
      const timer = setTimeout(() => finish([]), RASTER_WAIT);
      setRaster({ icons, onDone: async (pngs) => finish(pngs) });
    });

  const exportPptx = async (source: Deck) => {
    const icons = deckIcons(source);
    const pngs = await rasterize(icons);
    const found = new Map(icons.map((icon, index) => [iconKey(icon), pngs[index] ?? null]));
    const data = await buildPptxBase64(source, {
      icon: async (name, tint) => found.get(iconKey({ name, color: tint })) ?? null,
    });
    return saveExport({ name: fileName(source.title, "pptx"), mime: MIME.pptx, data });
  };

  if (!current) {
    return (
      <>
        <StatusBar style="light" />
        <LifeHeader title="" onDark close />
      </>
    );
  }

  const at = Math.min(index, Math.max(0, count - 1));
  const slide = current.slides[at];
  const change = slide ? current.changes.find((item) => item.slideId === slide.id) : undefined;
  const shown = before && change?.before ? change.before : slide;
  const stageWidth = screenWidth - 32;
  const stageHeight = Math.round((stageWidth * 9) / 16);
  const stripHeight = Math.ceil((THUMB_W * 9) / 16) + 8;
  const threadId = current.threadId;
  const sub = current.writing
    ? t("slides-writing", {
        n: Math.min(current.slides.length + 1, current.outline.length),
        total: current.outline.length,
      })
    : t("slides-phone-sub", { n: at + 1, total: count, version: current.version });

  const say = (text: string) =>
    threadId
      ? store.send(threadId, t("slides-ask-page", { n: at + 1, text }))
      : Promise.resolve(null);
  const quick = (text: string) => {
    void say(text)
      .then((turnId) => {
        if (turnId) setTurn(turnId);
      })
      .catch(() => undefined);
  };
  const chips = [
    slide?.chart ? t("slides-chart-line") : t("slides-reword"),
    t("slides-phone-less-text"),
    t("slides-phone-add-summary"),
  ];

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <LifeHeader
        title={current.title}
        sub={sub}
        onDark
        close
        right={
          <ShareButton
            label={t("doc-phone-share")}
            onDark
            onPress={() => {
              exporter.clear();
              setSharing(true);
            }}
          />
        }
      />
      <View style={styles.top}>
        {shown ? (
          <View style={[styles.stage, { width: stageWidth, height: stageHeight }]}>
            <SlideFrame
              slide={shown}
              theme={current.theme}
              width={stageWidth}
              dom={{
                style: { width: stageWidth, height: stageHeight, backgroundColor: "transparent" },
                scrollEnabled: false,
              }}
            />
            <View
              style={StyleSheet.absoluteFill}
              accessible
              accessibilityRole="adjustable"
              accessibilityLabel={shown.title}
              accessibilityValue={{ min: 1, max: count, now: at + 1 }}
              accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
              onAccessibilityAction={(event) =>
                go(event.nativeEvent.actionName === "increment" ? at + 1 : at - 1)
              }
              {...swipe}
            />
          </View>
        ) : current.writing ? null : (
          <Text style={styles.empty}>{t("slides-empty")}</Text>
        )}
        {change ? (
          <View style={styles.change}>
            {change.before ? (
              <View style={styles.pills}>
                {[true, false].map((value) => (
                  <Pressable
                    key={String(value)}
                    style={[styles.pill, before === value && styles.pillOn]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: before === value }}
                    onPress={() => setBefore(value)}
                  >
                    <Text style={[styles.pillText, before === value && styles.pillTextOn]}>
                      {t(value ? "slides-phone-before" : "slides-phone-after")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.changeNote}>{t("slides-change-new", { n: at + 1 })}</Text>
            )}
            <View style={styles.pills}>
              <Pressable
                style={[styles.action, styles.actionOn]}
                accessibilityRole="button"
                onPress={() =>
                  void store
                    .resolveSlideChange(current.id, change.slideId, true)
                    .catch(() => undefined)
                }
              >
                <Text style={styles.actionTextOn}>{t("slides-keep")}</Text>
              </Pressable>
              <Pressable
                style={styles.action}
                accessibilityRole="button"
                onPress={() => {
                  setBefore(false);
                  void store
                    .resolveSlideChange(current.id, change.slideId, false)
                    .catch(() => undefined);
                }}
              >
                <Text style={styles.actionText}>
                  {change.before ? t("slides-undo") : t("slides-undo-new")}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
      {count > 0 ? (
        <View style={[styles.strip, { height: stripHeight }]}>
          <SlideStrip
            slides={current.slides}
            theme={current.theme}
            width={THUMB_W}
            gap={8}
            current={at}
            onSelect={async (picked) => go(picked)}
            dom={{
              style: { width: stageWidth, height: stripHeight, backgroundColor: "transparent" },
            }}
          />
        </View>
      ) : null}
      {current.writing ? (
        <View style={styles.working}>
          <Working text={sub} />
        </View>
      ) : null}
      <View style={styles.flex} />
      <ChatBar
        store={store}
        threadId={threadId}
        disabled={current.writing || !slide}
        placeholder={t("slides-chat-placeholder", { n: at + 1 })}
        onSend={say}
        turn={turn}
        onTurn={setTurn}
        top={
          slide ? (
            <View style={styles.say}>
              <Text style={styles.sayLabel}>{t("slides-phone-say", { n: at + 1 })}</Text>
              <View style={styles.chips}>
                {chips.map((chip) => (
                  <Pressable
                    key={chip}
                    style={styles.chip}
                    disabled={current.writing || !threadId}
                    accessibilityRole="button"
                    onPress={() => quick(chip)}
                  >
                    <Text style={styles.chipText}>{chip}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null
        }
      />
      <Sheet open={sharing} onClose={() => setSharing(false)}>
        <Text style={life.sheetTitle}>{current.title}</Text>
        <SheetAction
          label={exporter.busy === "pptx" ? t("export-phone-busy") : t("slides-export-pptx")}
          disabled={current.writing || count === 0 || exporter.busy !== null}
          onPress={() => exporter.start("pptx", () => exportPptx(current))}
        />
        {exporter.failed ? (
          <Text style={[life.hint, styles.failed]}>{t("export-phone-failed")}</Text>
        ) : null}
      </Sheet>
      {raster ? (
        <IconRaster
          icons={raster.icons}
          onDone={raster.onDone}
          dom={{ style: styles.raster, scrollEnabled: false }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ink },
  failed: { color: color.dangerInk },
  raster: { position: "absolute", width: 1, height: 1, opacity: 0 },
  flex: { flex: 1 },
  top: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },
  stage: { borderRadius: 10, overflow: "hidden", backgroundColor: color.surface },
  empty: { fontSize: 13, color: dark.textMuted, textAlign: "center", paddingVertical: 40 },
  change: { alignItems: "center", gap: 10 },
  changeNote: { fontSize: 12, color: dark.textMuted },
  pills: { flexDirection: "row", justifyContent: "center", gap: 6 },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: dark.line,
  },
  pillOn: { backgroundColor: color.surface },
  pillText: { fontSize: 12, color: dark.textMuted },
  pillTextOn: { color: color.ink },
  action: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 10,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: dark.lineStrong,
  },
  actionOn: { backgroundColor: color.surface, borderColor: color.surface },
  actionText: { fontSize: 13, color: dark.text },
  actionTextOn: { fontSize: 13, color: color.ink, fontWeight: "500" },
  strip: { marginTop: 20, paddingHorizontal: 16 },
  working: { paddingHorizontal: 16, paddingTop: 16 },
  say: { paddingHorizontal: 14, gap: 10 },
  sayLabel: { fontSize: 13, color: color.inkMid },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: { fontSize: 13, color: color.ink },
});
