import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { type ReactNode, useEffect } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";
import { openDeck, openDoc, openSheet, themeKey } from "./open.ts";
import SlideStrip from "./SlideStrip.tsx";

const THUMB_GAP = 4;

function useCardWidth() {
  const { width } = useWindowDimensions();
  return Math.min(380, Math.round((width - 28) * 0.86));
}

function Tile({ label, tone }: { label: string; tone: "doc" | "sheet" }) {
  return (
    <View style={[styles.tile, tone === "sheet" && styles.tileSheet]}>
      <Text style={[styles.tileText, tone === "sheet" && styles.tileTextSheet]}>{label}</Text>
    </View>
  );
}

function Progress({ share }: { share: number }) {
  return (
    <View style={styles.bar}>
      <View style={[styles.barFill, { width: `${Math.max(4, Math.min(100, share))}%` }]} />
    </View>
  );
}

function CardShell({
  width,
  label,
  onPress,
  children,
  flush = false,
}: {
  width: number;
  label: string;
  onPress: () => void;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { width },
        flush && styles.flush,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
    >
      {children}
    </Pressable>
  );
}

export function DocCard({ docId }: { docId: string }) {
  const { t } = useI18n();
  const store = useHubStore();
  const { docs } = useHubState(store);
  const summary = docs[docId];
  const width = useCardWidth();

  useEffect(() => {
    if (!summary) void store.docSummary(docId).catch(() => undefined);
  }, [store, docId, summary]);

  if (!summary) return null;
  const open = () => openDoc(docId);
  if (summary.writing) {
    const share = summary.total > 0 ? (summary.written / summary.total) * 100 : 0;
    return (
      <CardShell width={width} label={summary.title} onPress={open}>
        <View style={styles.head}>
          <Tile label={t("doc-icon")} tone="doc" />
          <View style={styles.headText}>
            <Text style={styles.title} numberOfLines={1}>
              {summary.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {t("doc-writing", {
                n: Math.min(summary.written + 1, summary.total),
                total: summary.total,
              })}
            </Text>
          </View>
          <Text style={styles.open}>{t("doc-watch")}</Text>
        </View>
        <Progress share={share} />
      </CardShell>
    );
  }
  const shown = summary.sections.slice(0, 3);
  const more = summary.sections.length - shown.length;
  return (
    <CardShell width={width} label={summary.title} onPress={open}>
      <View style={styles.head}>
        <Tile label={t("doc-icon")} tone="doc" />
        <Text style={[styles.title, styles.headText]} numberOfLines={1}>
          {summary.title}
        </Text>
        <Text style={styles.open}>{t("doc-open")}</Text>
      </View>
      {shown.length > 0 ? (
        <View style={styles.indent}>
          {shown.map((section) => (
            <Text key={section} style={styles.section} numberOfLines={1}>
              {section}
            </Text>
          ))}
          {more > 0 ? (
            <Text style={styles.meta}>{t("doc-more-sections", { count: more })}</Text>
          ) : null}
        </View>
      ) : null}
      <Text style={[styles.meta, styles.indent]}>
        {t("doc-meta-exportable", { chars: summary.chars })}
      </Text>
    </CardShell>
  );
}

export function SheetCard({ sheetId }: { sheetId: string }) {
  const { t } = useI18n();
  const store = useHubStore();
  const { sheets } = useHubState(store);
  const summary = sheets[sheetId];
  const width = useCardWidth();

  useEffect(() => {
    if (!summary) void store.sheetSummary(sheetId).catch(() => undefined);
  }, [store, sheetId, summary]);

  if (!summary) return null;
  const rows = summary.preview.slice(0, 4).map((row) => row.slice(0, 4));
  const more = Math.max(0, summary.rows - rows.length);
  return (
    <CardShell width={width} label={summary.title} onPress={() => openSheet(sheetId)}>
      <View style={styles.head}>
        <Tile label={t("sheet-icon")} tone="sheet" />
        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={1}>
            {summary.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {t("sheet-meta", { rows: summary.rows, cols: summary.cols, tabs: summary.tabs })}
          </Text>
        </View>
        <Text style={styles.open}>{t("doc-open")}</Text>
      </View>
      {rows.length > 0 ? (
        <View style={styles.table}>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={[styles.tableRow, rowIndex === 0 && styles.tableHead]}>
              {row.map((cell, index) => (
                <Text
                  key={index}
                  style={[styles.tableCell, rowIndex === 0 && styles.tableHeadText]}
                  numberOfLines={1}
                >
                  {cell}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}
      {more > 0 ? <Text style={styles.meta}>{t("sheet-more-rows", { count: more })}</Text> : null}
    </CardShell>
  );
}

export function DeckCard({ deckId }: { deckId: string }) {
  const { t } = useI18n();
  const store = useHubStore();
  const { decks } = useHubState(store);
  const summary = decks[deckId];
  const width = useCardWidth();

  useEffect(() => {
    if (!summary) void store.deckSummary(deckId).catch(() => undefined);
  }, [store, deckId, summary]);

  if (!summary) return null;
  const open = () => openDeck(deckId);
  if (summary.writing) {
    return (
      <CardShell width={width} label={summary.title} onPress={open}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.title} numberOfLines={1}>
              {summary.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {t("slides-writing", {
                n: Math.min(summary.pages + 1, summary.total),
                total: summary.total,
              })}
            </Text>
          </View>
          <Text style={styles.open}>{t("doc-watch")}</Text>
        </View>
        <Progress share={(summary.pages / Math.max(1, summary.total)) * 100} />
      </CardShell>
    );
  }
  const inner = width - 24 - 2;
  const thumb = Math.floor((inner - 4 - 4 * 4 - 3 * THUMB_GAP) / 4);
  const extra = summary.pages - 3;
  const shown = summary.preview.slice(0, extra > 1 ? 3 : 4);
  const tall = Math.ceil((thumb * 9) / 16) + 8;
  const stripWidth = 4 + shown.length * (thumb + 4) + Math.max(0, shown.length - 1) * THUMB_GAP;
  return (
    <CardShell width={width} label={summary.title} onPress={open} flush>
      <View style={styles.thumbs}>
        {shown.length > 0 ? (
          <View pointerEvents="none" style={{ width: stripWidth, height: tall }}>
            <SlideStrip
              slides={shown}
              theme={summary.theme}
              width={thumb}
              gap={THUMB_GAP}
              dom={{
                style: { width: stripWidth, height: tall, backgroundColor: "transparent" },
                scrollEnabled: false,
              }}
            />
          </View>
        ) : null}
        {extra > 1 ? (
          <View style={[styles.moreTile, { width: thumb, height: Math.ceil((thumb * 9) / 16) }]}>
            <Text style={styles.moreText}>{t("slides-phone-more", { count: extra })}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.deckFoot}>
        <View style={styles.headText}>
          <Text style={styles.title} numberOfLines={1}>
            {summary.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {t("slides-meta", { pages: summary.pages, theme: t(themeKey(summary.theme)) })}
          </Text>
        </View>
        <Text style={styles.open}>{t("doc-open")}</Text>
      </View>
    </CardShell>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 6,
    overflow: "hidden",
  },
  flush: { paddingVertical: 0, paddingHorizontal: 0, gap: 0 },
  pressed: { opacity: 0.85 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  headText: { flex: 1, minWidth: 0 },
  tile: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: color.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  tileSheet: { backgroundColor: color.diffAdded },
  tileText: { fontSize: 12, fontWeight: "700", color: color.accentStrong },
  tileTextSheet: { color: color.success },
  title: { fontSize: 14, fontWeight: "500", color: color.ink },
  meta: { fontSize: 11, color: color.muted },
  open: { fontSize: 13, color: color.accent },
  indent: { paddingLeft: 36 },
  section: { fontSize: 12, lineHeight: 20, color: color.inkMid },
  bar: { height: 4, borderRadius: 2, backgroundColor: color.lineSoft, overflow: "hidden" },
  barFill: { height: 4, borderRadius: 2, backgroundColor: color.accent },
  table: {
    borderWidth: 1,
    borderColor: color.lineSoft,
    borderRadius: 8,
    overflow: "hidden",
  },
  tableRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: color.lineSoft },
  tableHead: { borderTopWidth: 0, backgroundColor: color.panelSoft },
  tableCell: { flex: 1, minWidth: 0, fontSize: 12, color: color.inkSoft, padding: 6 },
  tableHeadText: { fontWeight: "700", color: color.ink },
  thumbs: {
    flexDirection: "row",
    alignItems: "center",
    gap: THUMB_GAP,
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 12,
    backgroundColor: color.ground,
  },
  moreTile: {
    borderRadius: 5,
    backgroundColor: color.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  moreText: { fontSize: 11, fontWeight: "700", color: color.accentStrong },
  deckFoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
});
