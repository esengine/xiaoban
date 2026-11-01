import { cellName, colName, type HubStore, toCsv, toNumber, toTsv } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { SheetOp, SheetTab, Workbook } from "@xiaoban/protocol";
import { color, dark } from "@xiaoban/tokens";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { type ComponentRef, useEffect, useRef, useState } from "react";
import {
  type GestureResponderEvent,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CloseIcon } from "../life/LifeIcons.tsx";
import { ChatBar, HeaderLink, LifeHeader, life, Sheet, SheetAction } from "../life/LifeUI.tsx";
import { Icon } from "../ui/Icon.tsx";
import { useReduceMotion } from "../ui/useReduceMotion.ts";
import { saveExport, useExporter } from "./exportFile.ts";
import { SheetChart } from "./SheetChart.tsx";
import { AskChip } from "./WorkUI.tsx";

const ROW_H = 36;
const HEAD_H = 26;
const NUM_W = 30;
const HOLD_MS = 380;
const SLOP = 8;
const FUNCTIONS = [
  ["sheet-phone-fn-sum", "SUM"],
  ["sheet-phone-fn-average", "AVERAGE"],
  ["sheet-phone-fn-min", "MIN"],
  ["sheet-phone-fn-max", "MAX"],
] as const;

type Spot = { r: number; c: number };
type Range = { r1: number; c1: number; r2: number; c2: number };

function rangeOf(a: Spot, b: Spot): Range {
  return {
    r1: Math.min(a.r, b.r),
    c1: Math.min(a.c, b.c),
    r2: Math.max(a.r, b.r),
    c2: Math.max(a.c, b.c),
  };
}

function rangeName(range: Range) {
  const a = cellName(range.r1, range.c1);
  const b = cellName(range.r2, range.c2);
  return a === b ? a : `${a}:${b}`;
}

function at(grid: string[][], r: number, c: number) {
  return grid[r]?.[c] ?? "";
}

function textWidth(text: string) {
  let width = 0;
  for (const char of text) width += (char.codePointAt(0) ?? 0) > 0x2e80 ? 13 : 7.5;
  return width;
}

function columnWidths(tab: SheetTab, count: number) {
  return Array.from({ length: count }, (_, c) => {
    let widest = 0;
    for (const row of tab.values) widest = Math.max(widest, textWidth(row[c] ?? ""));
    return Math.round(Math.max(56, Math.min(160, widest + 16)));
  });
}

function slice(tab: SheetTab, range: Range) {
  const rows: string[][] = [];
  for (let r = range.r1; r <= range.r2; r += 1) {
    const row: string[] = [];
    for (let c = range.c1; c <= range.c2; c += 1) row.push(at(tab.values, r, c));
    rows.push(row);
  }
  return rows;
}

function EditBar({
  name,
  value,
  onChange,
  onDone,
  onNext,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const formula = (fn: string) => onChange(value.startsWith("=") ? `${value}${fn}(` : `=${fn}(`);
  return (
    <View style={[styles.editBar, { paddingBottom: Math.max(insets.bottom, 14) + 8 }]}>
      <View style={styles.editRow}>
        <Text style={styles.cellTag}>{name}</Text>
        <TextInput
          ref={input}
          style={styles.editInput}
          value={value}
          autoFocus
          accessibilityLabel={t("sheet-formula")}
          returnKeyType="next"
          blurOnSubmit={false}
          onChangeText={onChange}
          onSubmitEditing={onNext}
        />
        <Pressable style={styles.doneButton} accessibilityRole="button" onPress={onDone}>
          <Text style={styles.doneText}>{t("sheet-phone-done")}</Text>
        </Pressable>
      </View>
      <View style={styles.editRow}>
        <Pressable
          style={styles.key}
          accessibilityRole="button"
          onPress={() => onChange(value.startsWith("=") ? value : `=${value}`)}
        >
          <Text style={styles.keyText}>{t("sheet-phone-fn-equals")}</Text>
        </Pressable>
        {FUNCTIONS.map(([key, fn]) => (
          <Pressable
            key={fn}
            style={styles.key}
            accessibilityRole="button"
            onPress={() => formula(fn)}
          >
            <Text style={styles.keyText} numberOfLines={1} adjustsFontSizeToFit>
              {t(key)}
            </Text>
          </Pressable>
        ))}
        <Pressable style={[styles.key, styles.keyWide]} accessibilityRole="button" onPress={onNext}>
          <Text style={styles.keyText} numberOfLines={1}>
            {t("sheet-phone-next")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SelectBar({
  summary,
  onSort,
  onDraw,
  onLowest,
  onAsk,
  onClose,
}: {
  summary: string;
  onSort: () => void;
  onDraw: () => void;
  onLowest: () => void;
  onAsk: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const actions: [string, () => void][] = [
    [t("sheet-phone-sort"), onSort],
    [t("sheet-draw"), onDraw],
    [t("sheet-lowest"), onLowest],
    [t("doc-act-ask"), onAsk],
  ];
  return (
    <View style={[styles.selectBar, { paddingBottom: Math.max(insets.bottom, 14) + 12 }]}>
      <View style={styles.selectHead}>
        <Text style={styles.selectSummary} numberOfLines={2}>
          {summary}
        </Text>
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("dialog-close")}
          onPress={onClose}
        >
          <CloseIcon color={dark.textMuted} size={16} />
        </Pressable>
      </View>
      <View style={styles.editRow}>
        {actions.map(([label, run]) => (
          <Pressable key={label} style={styles.selectKey} accessibilityRole="button" onPress={run}>
            <Text style={styles.selectKeyText}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function SheetScreen({ store, sheetId }: { store: HubStore; sheetId: string }) {
  const { t, locale } = useI18n();
  const { sheet } = useHubState(store);
  const book: Workbook | null = sheet?.id === sheetId ? sheet : null;
  const { width: screenWidth } = useWindowDimensions();
  const [tabId, setTabId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ r: number; c: number; value: string } | null>(null);
  const [anchor, setAnchor] = useState<Spot | null>(null);
  const [focus, setFocus] = useState<Spot | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [turn, setTurn] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const exporter = useExporter(() => setExporting(false));
  const [sorting, setSorting] = useState(false);
  const headScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const bodyScroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> | null }>({
    x: 0,
    y: 0,
    timer: null,
  });
  const holding = useRef(false);
  const reduceMotion = useReduceMotion();

  useEffect(() => {
    void store.openSheet(sheetId).catch(() => undefined);
  }, [store, sheetId]);

  useEffect(
    () => () => {
      if (press.current.timer) clearTimeout(press.current.timer);
    },
    [],
  );

  if (!book) {
    return (
      <View style={styles.screen}>
        <LifeHeader title="" />
      </View>
    );
  }

  const tab = book.tabs.find((item) => item.id === tabId) ?? book.tabs[0];
  if (!tab) {
    return (
      <View style={styles.screen}>
        <LifeHeader title={book.title} />
      </View>
    );
  }

  const threadId = book.threadId;
  const rowsCount = Math.max(tab.cells.length + 6, 12);
  const colsCount = Math.max(Math.max(0, ...tab.cells.map((row) => row.length)) + 1, 4);
  const widths = columnWidths(tab, colsCount);
  const lefts = widths.reduce<number[]>((acc, _, index) => {
    acc.push(index === 0 ? 0 : (acc[index - 1] ?? 0) + (widths[index - 1] ?? 0));
    return acc;
  }, []);
  const contentWidth = widths.reduce((sum, value) => sum + value, 0);
  const boxWidth = Math.min(screenWidth - 28, contentWidth + NUM_W);
  const marks = new Set(
    book.marks.filter((mark) => mark.tabId === tab.id).map((mark) => `${mark.row}:${mark.col}`),
  );
  const range = anchor && focus ? rangeOf(anchor, focus) : null;
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  const spotAt = (x: number, y: number): Spot => {
    let c = 0;
    while (c < colsCount - 1 && x >= (lefts[c + 1] ?? Number.POSITIVE_INFINITY)) c += 1;
    return { r: Math.max(0, Math.min(rowsCount - 1, Math.floor(y / ROW_H))), c };
  };

  const commit = (r: number, c: number, value: string) => {
    if (at(tab.cells, r, c) === value) return;
    void store.setCells(book.id, tab.id, [{ row: r, col: c, value }]).catch(() => undefined);
  };
  const change = (op: SheetOp) => store.sheetChange(book.id, tab.id, op).catch(() => undefined);
  const clearRange = () => {
    setAnchor(null);
    setFocus(null);
    setSelecting(false);
  };
  const askXiaoban = (text: string) => {
    if (!threadId) return;
    void store
      .send(threadId, text)
      .then(setTurn)
      .catch(() => undefined);
    clearRange();
  };
  const edit = (spot: Spot) => {
    clearRange();
    setEditing({ r: spot.r, c: spot.c, value: at(tab.cells, spot.r, spot.c) });
  };
  const finishEdit = () => {
    if (editing) commit(editing.r, editing.c, editing.value);
    setEditing(null);
  };
  const nextCell = () => {
    if (!editing) return;
    commit(editing.r, editing.c, editing.value);
    const r = editing.r + 1;
    setEditing({ r, c: editing.c, value: at(tab.cells, r, editing.c) });
    bodyScroll.current?.scrollTo({ y: Math.max(0, (r - 3) * ROW_H), animated: !reduceMotion });
  };

  const grant = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    holding.current = false;
    if (press.current.timer) clearTimeout(press.current.timer);
    press.current = {
      x: locationX,
      y: locationY,
      timer: setTimeout(() => {
        press.current.timer = null;
        holding.current = true;
        const spot = spotAt(press.current.x, press.current.y);
        if (editing) finishEdit();
        setAnchor(spot);
        setFocus(spot);
        setSelecting(true);
        void Haptics.selectionAsync().catch(() => undefined);
      }, HOLD_MS),
    };
  };
  const move = (event: GestureResponderEvent) => {
    const { locationX, locationY } = event.nativeEvent;
    if (holding.current) {
      const spot = spotAt(locationX, locationY);
      setFocus((current) =>
        current && current.r === spot.r && current.c === spot.c ? current : spot,
      );
      return;
    }
    if (
      press.current.timer &&
      (Math.abs(locationX - press.current.x) > SLOP || Math.abs(locationY - press.current.y) > SLOP)
    ) {
      clearTimeout(press.current.timer);
      press.current.timer = null;
    }
  };
  const release = () => {
    if (press.current.timer) {
      clearTimeout(press.current.timer);
      press.current.timer = null;
      const spot = spotAt(press.current.x, press.current.y);
      if (editing) commit(editing.r, editing.c, editing.value);
      edit(spot);
    }
    holding.current = false;
    setSelecting(false);
  };
  const cancel = () => {
    if (press.current.timer) clearTimeout(press.current.timer);
    press.current.timer = null;
    holding.current = false;
    setSelecting(false);
  };

  const addChart = (picked: Range) => {
    const values =
      picked.c2 > picked.c1
        ? `${cellName(picked.r1, picked.c2)}:${cellName(picked.r2, picked.c2)}`
        : rangeName(picked);
    const labels =
      picked.c2 > picked.c1
        ? `${cellName(picked.r1, picked.c1)}:${cellName(picked.r2, picked.c1)}`
        : `${cellName(picked.r1, 0)}:${cellName(picked.r2, 0)}`;
    const title = at(tab.values, 0, picked.c2) || t("sheet-chart");
    void change({ op: "add_chart", kind: "bar", title, labels, values });
    clearRange();
  };

  let summary = "";
  if (range) {
    const count = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
    const numbers = slice(tab, range)
      .flat()
      .map(toNumber)
      .filter((value): value is number => value !== null);
    const sum = numbers.reduce((total, value) => total + value, 0);
    summary =
      numbers.length > 0
        ? t("sheet-phone-summary", {
            count,
            sum: format.format(sum),
            avg: format.format(sum / numbers.length),
            min: format.format(Math.min(...numbers)),
          })
        : t("sheet-status-count", { count });
  }

  const box = editing ? { r1: editing.r, c1: editing.c, r2: editing.r, c2: editing.c } : range;
  const rows = Array.from({ length: rowsCount }, (_, r) => r);

  return (
    <View style={styles.screen}>
      <LifeHeader
        title={book.title}
        right={
          <HeaderLink
            label={t("sheet-phone-export")}
            onPress={() => {
              exporter.clear();
              setExporting(true);
            }}
          />
        }
      />
      <View style={styles.body}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScroll}
          contentContainerStyle={styles.tabs}
        >
          {book.tabs.map((item) => {
            const on = item.id === tab.id;
            return (
              <Pressable
                key={item.id}
                style={[styles.tab, on && styles.tabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  finishEdit();
                  clearRange();
                  setTabId(item.id);
                }}
              >
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{item.name}</Text>
              </Pressable>
            );
          })}
          <Pressable
            style={styles.tab}
            accessibilityRole="button"
            accessibilityLabel={t("sheet-tab-add")}
            onPress={() =>
              void store
                .sheetChange(book.id, tab.id, {
                  op: "add_tab",
                  name: t("sheet-tab-new", { n: book.tabs.length + 1 }),
                })
                .then((next) => setTabId(next.tabs.at(-1)?.id ?? null))
                .catch(() => undefined)
            }
          >
            <Icon name="plus" size={14} color={color.inkMid} />
          </Pressable>
        </ScrollView>
        <View style={[styles.grid, { width: boxWidth }]}>
          <ScrollView
            ref={bodyScroll}
            stickyHeaderIndices={[0]}
            scrollEnabled={!selecting}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.headRow}>
              <View style={[styles.corner, { width: NUM_W, height: HEAD_H }]} />
              <ScrollView
                ref={headScroll}
                horizontal
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
              >
                {widths.map((width, c) => (
                  <View key={c} style={[styles.headCell, { width }]}>
                    <Text style={styles.headText}>{colName(c)}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
            <View style={styles.bodyRow}>
              <View>
                {rows.map((r) => (
                  <View key={r} style={styles.rowNumber}>
                    <Text style={styles.headText}>{r + 1}</Text>
                  </View>
                ))}
              </View>
              <ScrollView
                horizontal
                scrollEnabled={!selecting}
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(event) =>
                  headScroll.current?.scrollTo({
                    x: event.nativeEvent.contentOffset.x,
                    animated: false,
                  })
                }
              >
                <View
                  style={{ width: contentWidth, height: rowsCount * ROW_H }}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponderCapture={() => holding.current}
                  onResponderTerminationRequest={() => !holding.current}
                  onResponderGrant={grant}
                  onResponderMove={move}
                  onResponderRelease={release}
                  onResponderTerminate={cancel}
                >
                  <View pointerEvents="none">
                    {rows.map((r) => (
                      <View key={r} style={styles.row}>
                        {widths.map((width, c) => {
                          const value = at(tab.values, r, c);
                          const numeric = r > 0 && toNumber(value) !== null;
                          const inRange =
                            range !== null &&
                            r >= range.r1 &&
                            r <= range.r2 &&
                            c >= range.c1 &&
                            c <= range.c2;
                          return (
                            <View
                              key={c}
                              style={[
                                styles.cell,
                                { width },
                                numeric && styles.cellNumber,
                                r === 0 && styles.cellHead,
                                marks.has(`${r}:${c}`) && styles.cellMarked,
                                inRange && styles.cellPicked,
                              ]}
                            >
                              <Text
                                style={[styles.cellText, r === 0 && styles.cellHeadText]}
                                numberOfLines={1}
                              >
                                {value}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ))}
                    {box ? (
                      <View
                        style={[
                          styles.box,
                          {
                            left: lefts[box.c1] ?? 0,
                            top: box.r1 * ROW_H,
                            width:
                              (lefts[box.c2] ?? 0) + (widths[box.c2] ?? 0) - (lefts[box.c1] ?? 0),
                            height: (box.r2 - box.r1 + 1) * ROW_H,
                          },
                        ]}
                      />
                    ) : null}
                  </View>
                </View>
              </ScrollView>
            </View>
            {tab.charts.length > 0 ? (
              <View style={styles.charts}>
                {tab.charts.map((chart) => (
                  <SheetChart
                    key={chart.id}
                    chart={chart}
                    tab={tab}
                    width={boxWidth - 24}
                    onRemove={() => void change({ op: "remove_chart", id: chart.id })}
                  />
                ))}
              </View>
            ) : null}
          </ScrollView>
        </View>
        {range ? null : <Text style={life.hint}>{t("sheet-phone-hint")}</Text>}
        {book.marks.length > 0 && !editing && !range ? (
          <View style={styles.marks}>
            <Text style={styles.marksTag}>
              {t("sheet-phone-marks", { count: book.marks.length })}
            </Text>
            <View style={life.flex} />
            <Pressable
              hitSlop={6}
              accessibilityRole="button"
              onPress={() => void store.resolveSheetMarks(book.id, true).catch(() => undefined)}
            >
              <Text style={styles.marksLink}>{t("doc-marks-keep-all")}</Text>
            </Pressable>
            <Pressable
              hitSlop={6}
              accessibilityRole="button"
              onPress={() => void store.resolveSheetMarks(book.id, false).catch(() => undefined)}
            >
              <Text style={[styles.marksLink, { color: color.dangerInk }]}>
                {t("doc-mark-undo")}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      {editing ? (
        <EditBar
          name={cellName(editing.r, editing.c)}
          value={editing.value}
          onChange={(value) => setEditing({ ...editing, value })}
          onDone={finishEdit}
          onNext={nextCell}
        />
      ) : range && !selecting ? (
        <SelectBar
          summary={summary}
          onSort={() => setSorting(true)}
          onDraw={() => addChart(range)}
          onLowest={() => askXiaoban(t("sheet-mark-lowest", { range: rangeName(range) }))}
          onAsk={() => {
            setAsking(rangeName(range));
            clearRange();
            setFocusKey((value) => value + 1);
          }}
          onClose={clearRange}
        />
      ) : range ? (
        <View style={styles.dragNote}>
          <Text style={styles.selectSummary}>{summary}</Text>
        </View>
      ) : (
        <ChatBar
          store={store}
          threadId={threadId}
          placeholder={asking ? t("doc-act-ask-placeholder") : t("sheet-chat-placeholder")}
          top={
            asking ? (
              <AskChip
                text={t("sheet-phone-asking", { range: asking })}
                closeLabel={t("dialog-close")}
                onClose={() => setAsking(null)}
              />
            ) : null
          }
          onSend={
            asking && threadId
              ? (question) => {
                  const target = asking;
                  setAsking(null);
                  return store.send(threadId, t("sheet-ask-range", { range: target, question }));
                }
              : undefined
          }
          turn={turn}
          onTurn={setTurn}
          focusKey={focusKey}
        />
      )}
      <Sheet open={sorting} onClose={() => setSorting(false)}>
        <Text style={life.sheetTitle}>{t("sheet-phone-sort")}</Text>
        {range
          ? ([false, true] as const).map((desc) => (
              <SheetAction
                key={String(desc)}
                label={t(desc ? "sheet-sort-desc" : "sheet-sort-asc")}
                onPress={() => {
                  setSorting(false);
                  void change({ op: "sort", col: range.c1, desc });
                  clearRange();
                }}
              />
            ))
          : null}
      </Sheet>
      <Sheet open={exporting} onClose={() => setExporting(false)}>
        <Text style={life.sheetTitle}>{book.title}</Text>
        <SheetAction
          label={exporter.busy === "xlsx" ? t("export-phone-busy") : t("sheet-export-excel")}
          disabled={exporter.busy !== null}
          onPress={() =>
            exporter.start("xlsx", async () =>
              saveExport(await store.exportSheetData(book.id, "xlsx", tab.id)),
            )
          }
        />
        <SheetAction
          label={exporter.busy === "csv" ? t("export-phone-busy") : t("sheet-export-csv")}
          disabled={exporter.busy !== null}
          onPress={() =>
            exporter.start("csv", async () =>
              saveExport(await store.exportSheetData(book.id, "csv", tab.id)),
            )
          }
        />
        <SheetAction
          label={t("sheet-phone-share-csv")}
          onPress={() => {
            setExporting(false);
            void Share.share({ title: book.title, message: toCsv(tab.values) }).catch(
              () => undefined,
            );
          }}
        />
        <SheetAction
          label={t("sheet-format-copy")}
          onPress={() => {
            setExporting(false);
            void Clipboard.setStringAsync(toTsv(tab.values)).catch(() => undefined);
          }}
        />
        {exporter.failed ? (
          <Text style={[life.hint, styles.failed]}>{t("export-phone-failed")}</Text>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  failed: { color: color.dangerInk },
  body: { flex: 1, minHeight: 0, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 10, gap: 10 },
  tabsScroll: { flexGrow: 0 },
  tabs: { gap: 4 },
  tab: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: color.surface,
    justifyContent: "center",
  },
  tabOn: { backgroundColor: color.ink },
  tabText: { fontSize: 12, color: color.inkMid },
  tabTextOn: { color: color.surface },
  grid: {
    flexShrink: 1,
    alignSelf: "flex-start",
    backgroundColor: color.surface,
    borderRadius: 10,
    overflow: "hidden",
  },
  headRow: { flexDirection: "row", backgroundColor: color.ground },
  corner: {
    backgroundColor: color.ground,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.lineSoft,
  },
  headCell: {
    height: HEAD_H,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.lineSoft,
  },
  headText: { fontSize: 11, color: color.faded },
  bodyRow: { flexDirection: "row" },
  rowNumber: {
    width: NUM_W,
    height: ROW_H,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.ground,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.lineSoft,
  },
  row: { flexDirection: "row" },
  cell: {
    height: ROW_H,
    paddingHorizontal: 6,
    justifyContent: "center",
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: color.lineSoft,
  },
  cellNumber: { alignItems: "flex-end" },
  cellHead: { backgroundColor: color.panelSoft },
  cellMarked: {
    backgroundColor: color.diffAdded,
    borderBottomWidth: 2,
    borderBottomColor: color.diffAddedBar,
  },
  cellPicked: { backgroundColor: color.accentWash },
  cellText: { fontSize: 13, color: color.ink },
  cellHeadText: { fontWeight: "700" },
  box: { position: "absolute", borderWidth: 2, borderColor: color.accent },
  charts: { padding: 12, gap: 10, backgroundColor: color.ground },
  marks: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  marksTag: {
    fontSize: 11,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: "hidden",
    color: color.success,
    backgroundColor: color.diffAdded,
  },
  marksLink: { fontSize: 12, color: color.accent },
  editBar: {
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.line,
    paddingTop: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  editRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cellTag: {
    fontSize: 11,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: "hidden",
    color: color.inkMid,
    backgroundColor: color.lineSoft,
  },
  editInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: color.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: color.ink,
  },
  doneButton: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: color.ink,
    justifyContent: "center",
  },
  doneText: { fontSize: 13, color: color.surface },
  key: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    backgroundColor: color.ground,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  keyWide: { flex: 1.4 },
  keyText: { fontSize: 13, color: color.ink },
  selectBar: {
    backgroundColor: color.ink,
    paddingTop: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  selectHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  selectSummary: { flex: 1, fontSize: 12, color: dark.textSoft },
  selectKey: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    backgroundColor: dark.line,
    alignItems: "center",
    justifyContent: "center",
  },
  selectKeyText: { fontSize: 13, color: dark.text },
  dragNote: {
    backgroundColor: color.ink,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 30,
  },
});
