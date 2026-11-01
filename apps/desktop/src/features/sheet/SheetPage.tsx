import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { ChartKind, SheetChart, SheetOp, SheetTab, Workbook } from "@xiaoban/protocol";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHub } from "../../app/hub.tsx";
import { SideChat } from "../chat/SideChat.tsx";
import { useContextMenu } from "../menu/ContextMenu.tsx";
import { cellName, colName, openInExcel, parseRange, revealSheet, toNumber } from "./sheetFiles.ts";

type Spot = { r: number; c: number };
type Range = { r1: number; c1: number; r2: number; c2: number };

const PALETTE = [
  "var(--color-ledger1)",
  "var(--color-ledger2)",
  "var(--color-ledger3)",
  "var(--color-dish0)",
  "var(--color-dish1)",
  "var(--color-dish3)",
];

function rangeOf(a: Spot, b: Spot): Range {
  return {
    r1: Math.min(a.r, b.r),
    c1: Math.min(a.c, b.c),
    r2: Math.max(a.r, b.r),
    c2: Math.max(a.c, b.c),
  };
}

function inRange(range: Range, r: number, c: number) {
  return r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
}

function rangeName(range: Range) {
  const a = cellName(range.r1, range.c1);
  const b = cellName(range.r2, range.c2);
  return a === b ? a : `${a}:${b}`;
}

function at(grid: string[][], r: number, c: number) {
  return grid[r]?.[c] ?? "";
}

function RangeBox({
  grid,
  range,
  version,
}: {
  grid: React.RefObject<HTMLElement | null>;
  range: Range;
  version: string;
}) {
  const [box, setBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  useLayoutEffect(() => {
    void version;
    const root = grid.current;
    const first = root?.querySelector<HTMLElement>(`[data-cell="${range.r1}:${range.c1}"]`);
    const last = root?.querySelector<HTMLElement>(`[data-cell="${range.r2}:${range.c2}"]`);
    if (!root || !first || !last) return setBox(null);
    const base = root.getBoundingClientRect();
    const a = first.getBoundingClientRect();
    const b = last.getBoundingClientRect();
    setBox({
      left: a.left - base.left,
      top: a.top - base.top,
      width: b.right - a.left,
      height: b.bottom - a.top,
    });
  }, [grid, range.r1, range.c1, range.r2, range.c2, version]);
  if (!box) return null;
  return <span className="sheet-range" style={box} aria-hidden="true" />;
}

function Popover({
  anchor,
  onClose,
  className,
  children,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  className: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const width = box.current?.offsetWidth ?? 300;
    setSpot({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: rect.bottom + 6,
    });
  }, [anchor]);
  useEffect(() => {
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={box} className={className} style={spot}>
      {children}
    </div>,
    document.body,
  );
}

function Chart({
  chart,
  tab,
  onKind,
  onRemove,
}: {
  chart: SheetChart;
  tab: SheetTab;
  onKind: (kind: ChartKind) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const values = parseRange(chart.values);
  const labels = parseRange(chart.labels);
  if (!values) return null;
  const points: { label: string; value: number }[] = [];
  for (let r = values.r1; r <= values.r2; r += 1) {
    for (let c = values.c1; c <= values.c2; c += 1) {
      const value = toNumber(at(tab.values, r, c)) ?? 0;
      const index = points.length;
      const label = labels
        ? at(
            tab.values,
            labels.r1 + (labels.r1 === labels.r2 ? 0 : index),
            labels.c1 + (labels.r1 === labels.r2 ? index : 0),
          )
        : String(index + 1);
      points.push({ label, value });
    }
  }
  const max = Math.max(1, ...points.map((point) => Math.abs(point.value)));
  const width = 420;
  const height = 150;
  const step = width / Math.max(1, points.length);
  const total = points.reduce((sum, point) => sum + Math.max(0, point.value), 0) || 1;
  let angle = -Math.PI / 2;
  return (
    <div className="sheet-chart">
      <div className="sheet-chart__head">
        <b>{chart.title || t("sheet-chart")}</b>
        <span className="life-card__spacer" />
        {chart.kind !== "line" && (
          <button type="button" className="code-link" onClick={() => onKind("line")}>
            {t("sheet-chart-line")}
          </button>
        )}
        {chart.kind !== "bar" && (
          <button type="button" className="code-link" onClick={() => onKind("bar")}>
            {t("sheet-chart-bar")}
          </button>
        )}
        {chart.kind !== "pie" && (
          <button type="button" className="code-link" onClick={() => onKind("pie")}>
            {t("sheet-chart-pie")}
          </button>
        )}
        <button type="button" className="code-link" data-danger onClick={onRemove}>
          {t("sheet-chart-remove")}
        </button>
      </div>
      <svg width={width} height={height + 34} role="img" aria-label={chart.title}>
        {chart.kind === "pie"
          ? points.map((point, index) => {
              const share = Math.max(0, point.value) / total;
              const start = angle;
              angle += share * Math.PI * 2;
              const large = share > 0.5 ? 1 : 0;
              const [cx, cy, r] = [90, 90, 78];
              const path = `M${cx},${cy} L${cx + r * Math.cos(start)},${cy + r * Math.sin(start)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)} Z`;
              return (
                <g key={`${point.label}-${index}`}>
                  <path d={path} fill={PALETTE[index % PALETTE.length]} />
                  <text className="sheet-chart__legend" x={200} y={20 + index * 18}>
                    {`${point.label} ${Math.round(share * 100)}%`}
                  </text>
                </g>
              );
            })
          : null}
        {chart.kind === "bar" &&
          points.map((point, index) => {
            const h = (Math.max(0, point.value) / max) * height;
            const x = index * step + step / 2;
            return (
              <g key={`${point.label}-${index}`}>
                <rect
                  className="sheet-chart__bar"
                  x={x - Math.min(14, step / 3)}
                  y={height - h + 14}
                  width={Math.min(28, (step * 2) / 3)}
                  height={h}
                  rx={3}
                />
                <text className="sheet-chart__value" x={x} y={height - h + 10} textAnchor="middle">
                  {point.value}
                </text>
                <text className="sheet-chart__label" x={x} y={height + 30} textAnchor="middle">
                  {point.label.slice(0, 6)}
                </text>
              </g>
            );
          })}
        {chart.kind === "line" && (
          <>
            <polyline
              className="sheet-chart__line"
              points={points
                .map(
                  (point, index) =>
                    `${index * step + step / 2},${height - (point.value / max) * height + 14}`,
                )
                .join(" ")}
            />
            {points.map((point, index) => (
              <g key={`${point.label}-${index}`}>
                <circle
                  className="sheet-chart__dot"
                  cx={index * step + step / 2}
                  cy={height - (point.value / max) * height + 14}
                  r={3}
                />
                <text
                  className="sheet-chart__label"
                  x={index * step + step / 2}
                  y={height + 30}
                  textAnchor="middle"
                >
                  {point.label.slice(0, 6)}
                </text>
              </g>
            ))}
          </>
        )}
      </svg>
    </div>
  );
}

export function SheetPage({ sheetId, onBack }: { sheetId: string; onBack: () => void }) {
  const { t, locale } = useI18n();
  const store = useHub();
  const { sheet } = useHubState(store);
  const openMenu = useContextMenu();
  const book: Workbook | null = sheet?.id === sheetId ? sheet : null;
  const [tabId, setTabId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Spot>({ r: 0, c: 0 });
  const [focus, setFocus] = useState<Spot>({ r: 0, c: 0 });
  const [editing, setEditing] = useState<{ r: number; c: number; value: string } | null>(null);
  const [formula, setFormula] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [versions, setVersions] = useState<HTMLElement | null>(null);
  const [exporting, setExporting] = useState<HTMLElement | null>(null);
  const [sortMenu, setSortMenu] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [compare, setCompare] = useState<{
    version: number;
    tabs: SheetTab[];
    previous: SheetTab[];
  } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const grid = useRef<HTMLElement>(null);

  useEffect(() => {
    void store.openSheet(sheetId).catch(() => undefined);
  }, [store, sheetId]);

  useEffect(() => {
    const up = () => setDragging(false);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  if (!book) return <main className="life-page sheet" />;

  const tabs = compare ? compare.tabs : book.tabs;
  const tab = tabs.find((item) => item.id === tabId) ?? tabs[0];
  if (!tab) return <main className="life-page sheet" />;
  const previousTab = compare?.previous.find((item) => item.id === tab.id);
  const rowsCount = Math.max(tab.cells.length + 20, 40);
  const colsCount = Math.max(Math.max(0, ...tab.cells.map((row) => row.length)) + 3, 10);
  const range = rangeOf(anchor, focus);
  const multi = range.r1 !== range.r2 || range.c1 !== range.c2;
  const marks = new Set(
    book.marks.filter((mark) => mark.tabId === tab.id).map((mark) => `${mark.row}:${mark.col}`),
  );
  const readOnly = Boolean(compare);

  const numbers: number[] = [];
  for (let r = range.r1; r <= range.r2; r += 1)
    for (let c = range.c1; c <= range.c2; c += 1) {
      const value = toNumber(at(tab.values, r, c));
      if (value !== null) numbers.push(value);
    }
  const sum = numbers.reduce((total, value) => total + value, 0);
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });

  const commit = (r: number, c: number, value: string) => {
    if (at(tab.cells, r, c) === value) return;
    void store.setCells(book.id, tab.id, [{ row: r, col: c, value }]).catch(() => undefined);
  };
  const change = (op: SheetOp) =>
    void store.sheetChange(book.id, tab.id, op).catch(() => undefined);
  const move = (dr: number, dc: number, extend = false) => {
    const next = { r: Math.max(0, focus.r + dr), c: Math.max(0, focus.c + dc) };
    setFocus(next);
    if (!extend) setAnchor(next);
    window.setTimeout(
      () =>
        grid.current
          ?.querySelector(`[data-cell="${next.r}:${next.c}"]`)
          ?.scrollIntoView({ block: "nearest", inline: "nearest" }),
      0,
    );
  };
  const tsv = () => {
    const lines: string[] = [];
    for (let r = range.r1; r <= range.r2; r += 1) {
      const line: string[] = [];
      for (let c = range.c1; c <= range.c2; c += 1) line.push(at(tab.values, r, c));
      lines.push(line.join("\t"));
    }
    return lines.join("\n");
  };
  const paste = (text: string) => {
    const edits = text
      .replace(/\r/g, "")
      .replace(/\n$/, "")
      .split("\n")
      .flatMap((line, dr) =>
        line.split("\t").map((value, dc) => ({ row: range.r1 + dr, col: range.c1 + dc, value })),
      );
    if (edits.length > 0) void store.setCells(book.id, tab.id, edits).catch(() => undefined);
  };
  const clear = () => {
    const edits = [];
    for (let r = range.r1; r <= range.r2; r += 1)
      for (let c = range.c1; c <= range.c2; c += 1)
        if (at(tab.cells, r, c)) edits.push({ row: r, col: c, value: "" });
    if (edits.length > 0) void store.setCells(book.id, tab.id, edits).catch(() => undefined);
  };
  const askXiaoban = (text: string) => {
    if (book.threadId) void store.send(book.threadId, text).catch(() => undefined);
  };

  const onGridKey = (event: React.KeyboardEvent) => {
    if (editing || readOnly) return;
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key === "c") {
      event.preventDefault();
      void navigator.clipboard.writeText(tsv()).catch(() => undefined);
      return;
    }
    if (meta) return;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const step = moves[event.key];
    if (step) {
      event.preventDefault();
      move(step[0], step[1], event.shiftKey);
    } else if (event.key === "Enter") {
      event.preventDefault();
      setEditing({ r: focus.r, c: focus.c, value: at(tab.cells, focus.r, focus.c) });
    } else if (event.key === "Tab") {
      event.preventDefault();
      move(0, event.shiftKey ? -1 : 1);
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      clear();
    } else if (event.key.length === 1 && !event.altKey) {
      event.preventDefault();
      setEditing({ r: focus.r, c: focus.c, value: event.key });
    }
  };

  const rowMenu = (event: React.MouseEvent, r: number) => {
    event.preventDefault();
    const from = inRange(range, r, range.c1) ? range.r1 : r;
    const to = inRange(range, r, range.c1) ? range.r2 : r;
    openMenu(event, [
      {
        label: t("sheet-row-above"),
        onSelect: () => change({ op: "insert_rows", at: r, count: 1 }),
      },
      {
        label: t("sheet-row-below"),
        onSelect: () => change({ op: "insert_rows", at: r + 1, count: 1 }),
      },
      "separator",
      {
        label: t("sheet-row-delete", { count: to - from + 1 }),
        danger: true,
        onSelect: () => change({ op: "delete_rows", from, to }),
      },
    ]);
  };
  const colMenu = (event: React.MouseEvent, c: number) => {
    event.preventDefault();
    const from = inRange(range, range.r1, c) ? range.c1 : c;
    const to = inRange(range, range.r1, c) ? range.c2 : c;
    openMenu(event, [
      { label: t("sheet-sort-asc"), onSelect: () => change({ op: "sort", col: c, desc: false }) },
      { label: t("sheet-sort-desc"), onSelect: () => change({ op: "sort", col: c, desc: true }) },
      "separator",
      {
        label: t("sheet-col-left"),
        onSelect: () => change({ op: "insert_cols", at: c, count: 1 }),
      },
      {
        label: t("sheet-col-right"),
        onSelect: () => change({ op: "insert_cols", at: c + 1, count: 1 }),
      },
      {
        label: t("sheet-col-delete", { count: to - from + 1 }),
        danger: true,
        onSelect: () => change({ op: "delete_cols", from, to }),
      },
    ]);
  };
  const addChart = () => {
    const values =
      range.c2 > range.c1
        ? `${cellName(range.r1, range.c2)}:${cellName(range.r2, range.c2)}`
        : rangeName(range);
    const labels =
      range.c2 > range.c1
        ? `${cellName(range.r1, range.c1)}:${cellName(range.r2, range.c1)}`
        : `${cellName(range.r1, 0)}:${cellName(range.r2, 0)}`;
    const title = at(tab.values, 0, range.c2) || t("sheet-chart");
    change({ op: "add_chart", kind: "bar", title, labels, values });
  };
  const openCompare = async (version: number) => {
    const current = await store.sheetVersionTabs(book.id, version);
    const previous = version > 1 ? await store.sheetVersionTabs(book.id, version - 1) : [];
    setCompare({ version, tabs: current, previous });
    setVersions(null);
  };

  const activeRaw = at(tab.cells, focus.r, focus.c);
  const activeIsFormula = activeRaw.startsWith("=");
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const toolbarCell = multi
    ? grid.current?.querySelector<HTMLElement>(`[data-cell="${range.r1}:${range.c2}"]`)
    : null;
  const toolbarRect = toolbarCell?.getBoundingClientRect();

  return (
    <main className="life-page sheet">
      <header className="doc-top">
        <button type="button" className="code-link" onClick={onBack}>
          {t("doc-back")}
        </button>
        <b className="doc-top__title">{book.title}</b>
        {book.version > 0 && (
          <button
            type="button"
            className="doc-top__version"
            onClick={(event) => setVersions(versions ? null : event.currentTarget)}
          >
            {t("doc-version", { version: book.version })}
          </button>
        )}
        <span className="life-card__note">{t("sheet-saved", { tabs: book.tabs.length })}</span>
        <span className="life-card__spacer" />
        <button
          type="button"
          className="code-status-button"
          onClick={() => void openInExcel(store, book.id, book.title).catch(() => undefined)}
        >
          {t("sheet-open-excel")}
        </button>
        <button
          type="button"
          className="code-status-button"
          data-dark
          onClick={(event) => setExporting(exporting ? null : event.currentTarget)}
        >
          {t("doc-export")}
        </button>
      </header>
      <div className="doc__body">
        <section className="sheet__main" aria-label={book.title}>
          <div className="sheet-formula">
            <span className="sheet-formula__name">
              {rangeName(multi ? range : { r1: focus.r, c1: focus.c, r2: focus.r, c2: focus.c })}
            </span>
            <input
              className="sheet-formula__input"
              data-formula={activeIsFormula || undefined}
              value={formula ?? activeRaw}
              readOnly={readOnly}
              aria-label={t("sheet-formula")}
              onFocus={() => setFormula(activeRaw)}
              onChange={(event) => setFormula(event.target.value)}
              onBlur={() => {
                if (formula !== null) commit(focus.r, focus.c, formula);
                setFormula(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.currentTarget.blur();
                  grid.current?.focus();
                }
                if (event.key === "Escape") {
                  setFormula(null);
                  grid.current?.focus();
                }
              }}
            />
            {activeIsFormula && <span className="life-card__note">{t("sheet-computed")}</span>}
          </div>
          {compare && (
            <div className="doc-compare sheet-compare">
              {t("doc-comparing", { version: compare.version, previous: compare.version - 1 })}
              <button type="button" className="code-link" onClick={() => setCompare(null)}>
                {t("doc-compare-exit")}
              </button>
            </div>
          )}
          {!compare && book.marks.length >= 3 && (
            <div className="doc-marks sheet-marks">
              <span>{t("sheet-marks-count", { count: book.marks.length })}</span>
              <button
                type="button"
                className="code-link"
                onClick={() => void store.resolveSheetMarks(book.id, true).catch(() => undefined)}
              >
                {t("doc-marks-keep-all")}
              </button>
              <button
                type="button"
                className="code-link"
                data-danger
                onClick={() => void store.resolveSheetMarks(book.id, false).catch(() => undefined)}
              >
                {t("doc-marks-undo-all")}
              </button>
            </div>
          )}
          <div className="sheet__scroll">
            <section
              ref={grid}
              className="sheet-grid"
              // biome-ignore lint/a11y/noNoninteractiveTabindex: the spreadsheet takes keyboard focus to move between cells
              tabIndex={0}
              aria-label={tab.name}
              onKeyDown={onGridKey}
              onPaste={(event) => {
                if (editing || readOnly) return;
                event.preventDefault();
                paste(event.clipboardData.getData("text/plain"));
              }}
            >
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th className="sheet-grid__corner" />
                    {Array.from({ length: colsCount }, (_, c) => (
                      <th
                        key={`h${c}`}
                        className="sheet-grid__col"
                        data-on={c >= range.c1 && c <= range.c2 ? true : undefined}
                        onContextMenu={(event) => !readOnly && colMenu(event, c)}
                      >
                        {colName(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: rowsCount }, (_, r) => (
                    <tr key={`r${r}`}>
                      <th
                        scope="row"
                        className="sheet-grid__num"
                        data-on={r >= range.r1 && r <= range.r2 ? true : undefined}
                        onContextMenu={(event) => !readOnly && rowMenu(event, r)}
                      >
                        {r + 1}
                      </th>
                      {Array.from({ length: colsCount }, (_, c) => {
                        const value = at(tab.values, r, c);
                        const isEditing = editing && editing.r === r && editing.c === c;
                        const changed = compare
                          ? at(previousTab?.cells ?? [], r, c) !== at(tab.cells, r, c)
                          : marks.has(`${r}:${c}`);
                        return (
                          <td
                            key={`${r}:${c}`}
                            className="sheet-cell"
                            data-cell={`${r}:${c}`}
                            data-header={r === 0 || undefined}
                            data-number={toNumber(value) !== null || undefined}
                            data-error={value.startsWith("#") || undefined}
                            data-selected={inRange(range, r, c) && multi ? true : undefined}
                            data-active={focus.r === r && focus.c === c ? true : undefined}
                            data-marked={changed || undefined}
                            onMouseDown={(event) => {
                              if (event.button !== 0) return;
                              if (!(event.target instanceof HTMLInputElement))
                                event.preventDefault();
                              if (editing) {
                                commit(editing.r, editing.c, editing.value);
                                setEditing(null);
                              }
                              const spot = { r, c };
                              setFocus(spot);
                              if (!event.shiftKey) setAnchor(spot);
                              setDragging(true);
                              setSortMenu(false);
                              setAsking(null);
                              grid.current?.focus();
                            }}
                            onMouseEnter={() => dragging && setFocus({ r, c })}
                            onDoubleClick={() =>
                              !readOnly && setEditing({ r, c, value: at(tab.cells, r, c) })
                            }
                          >
                            {isEditing ? (
                              <input
                                // biome-ignore lint/a11y/noAutofocus: editing a cell starts typing at once
                                autoFocus
                                className="sheet-cell__input"
                                value={editing.value}
                                onChange={(event) =>
                                  setEditing({ ...editing, value: event.target.value })
                                }
                                onBlur={() => {
                                  commit(editing.r, editing.c, editing.value);
                                  setEditing(null);
                                }}
                                onKeyDown={(event) => {
                                  if (event.nativeEvent.isComposing) return;
                                  if (event.key === "Enter" || event.key === "Tab") {
                                    event.preventDefault();
                                    commit(editing.r, editing.c, editing.value);
                                    setEditing(null);
                                    grid.current?.focus();
                                    move(
                                      event.key === "Enter" ? 1 : 0,
                                      event.key === "Tab" ? 1 : 0,
                                    );
                                  }
                                  if (event.key === "Escape") {
                                    setEditing(null);
                                    grid.current?.focus();
                                  }
                                }}
                              />
                            ) : (
                              value
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {multi && (
                <RangeBox
                  grid={grid}
                  range={range}
                  version={`${tab.id}:${tab.values.length}:${colsCount}`}
                />
              )}
            </section>
            {tab.charts.length > 0 && (
              <div className="sheet__charts">
                {tab.charts.map((chart) => (
                  <Chart
                    key={chart.id}
                    chart={chart}
                    tab={tab}
                    onKind={(kind) =>
                      void store
                        .sheetChange(book.id, tab.id, { op: "remove_chart", id: chart.id })
                        .then(() =>
                          store.sheetChange(book.id, tab.id, {
                            op: "add_chart",
                            kind,
                            title: chart.title,
                            labels: chart.labels,
                            values: chart.values,
                          }),
                        )
                        .catch(() => undefined)
                    }
                    onRemove={() => change({ op: "remove_chart", id: chart.id })}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="sheet-tabs" role="tablist">
            {tabs.map((item) =>
              renaming === item.id ? (
                <input
                  key={item.id}
                  // biome-ignore lint/a11y/noAutofocus: renaming a sheet starts typing at once
                  autoFocus
                  className="sheet-tabs__rename"
                  defaultValue={item.name}
                  onBlur={(event) => {
                    if (event.target.value.trim())
                      void store
                        .sheetChange(book.id, item.id, {
                          op: "rename_tab",
                          name: event.target.value.trim(),
                        })
                        .catch(() => undefined);
                    setRenaming(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  className="sheet-tabs__tab"
                  aria-selected={item.id === tab.id}
                  onClick={() => setTabId(item.id)}
                  onDoubleClick={() => !readOnly && setRenaming(item.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    if (readOnly) return;
                    openMenu(event, [
                      { label: t("sheet-tab-rename"), onSelect: () => setRenaming(item.id) },
                      {
                        label: t("sheet-tab-delete"),
                        danger: true,
                        disabled: book.tabs.length < 2,
                        onSelect: () =>
                          void store
                            .sheetChange(book.id, item.id, { op: "delete_tab" })
                            .catch(() => undefined),
                      },
                    ]);
                  }}
                >
                  {item.name}
                </button>
              ),
            )}
            {!readOnly && (
              <button
                type="button"
                className="sheet-tabs__tab"
                aria-label={t("sheet-tab-add")}
                onClick={() =>
                  void store
                    .sheetChange(book.id, tab.id, {
                      op: "add_tab",
                      name: t("sheet-tab-new", { n: book.tabs.length + 1 }),
                    })
                    .catch(() => undefined)
                }
              >
                {t("sheet-tab-plus")}
              </button>
            )}
          </div>
          <div className="sheet-status">
            {numbers.length > 0 && multi ? (
              <>
                <span>
                  {t("sheet-status-count", {
                    count: (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1),
                  })}
                </span>
                <span>{t("sheet-status-sum", { value: format.format(sum) })}</span>
                <span>{t("sheet-status-avg", { value: format.format(sum / numbers.length) })}</span>
                <span>{t("sheet-status-min", { value: format.format(Math.min(...numbers)) })}</span>
              </>
            ) : (
              <span>{t("sheet-status-hint")}</span>
            )}
            <span className="life-card__spacer" />
            <span className="life-card__note">{rangeName(range)}</span>
          </div>
        </section>
        {book.threadId && (
          <SideChat
            threadId={book.threadId}
            labels={{
              title: t("kitchen-chat"),
              note: t("sheet-chat-note"),
              hint: t("sheet-chat-hint"),
              placeholder: t("sheet-chat-placeholder"),
            }}
          />
        )}
      </div>
      {multi &&
        toolbarRect &&
        !editing &&
        !readOnly &&
        !dragging &&
        createPortal(
          <div
            className="doc-toolbar"
            role="toolbar"
            style={{ left: toolbarRect.right + 8, top: toolbarRect.top - 4 }}
          >
            {asking !== null ? (
              <input
                // biome-ignore lint/a11y/noAutofocus: opened to type a question
                autoFocus
                className="doc-toolbar__input"
                value={asking}
                placeholder={t("doc-act-ask-placeholder")}
                onChange={(event) => setAsking(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing && asking.trim()) {
                    askXiaoban(
                      t("sheet-ask-range", { range: rangeName(range), question: asking.trim() }),
                    );
                    setAsking(null);
                  }
                  if (event.key === "Escape") setAsking(null);
                }}
              />
            ) : (
              <>
                <span className="doc-toolbar__tone">
                  <button type="button" onClick={() => setSortMenu(!sortMenu)}>
                    {t("sheet-sort")}
                  </button>
                  {sortMenu && (
                    <span className="doc-toolbar__menu">
                      <button
                        type="button"
                        onClick={() => change({ op: "sort", col: range.c1, desc: false })}
                      >
                        {t("sheet-sort-asc")}
                      </button>
                      <button
                        type="button"
                        onClick={() => change({ op: "sort", col: range.c1, desc: true })}
                      >
                        {t("sheet-sort-desc")}
                      </button>
                    </span>
                  )}
                </span>
                <button type="button" onClick={addChart}>
                  {t("sheet-draw")}
                </button>
                <button
                  type="button"
                  onClick={() => askXiaoban(t("sheet-mark-lowest", { range: rangeName(range) }))}
                >
                  {t("sheet-lowest")}
                </button>
                <button type="button" onClick={() => setAsking("")}>
                  {t("doc-act-ask-more")}
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
      {versions && (
        <Popover
          anchor={versions}
          onClose={() => setVersions(null)}
          className="doc-pop doc-versions"
        >
          {[...book.versions].reverse().map((version) => (
            <button
              key={version.version}
              type="button"
              className="doc-versions__item"
              aria-pressed={(picked ?? book.version) === version.version}
              onClick={() => setPicked(version.version)}
            >
              <span>
                <b>{t("doc-version-name", { version: version.version })}</b>
                <span className="life-card__note">{version.note}</span>
              </span>
              <span className="life-card__note">{time.format(new Date(version.at))}</span>
            </button>
          ))}
          <div className="doc-versions__actions">
            <button
              type="button"
              className="code-link"
              disabled={(picked ?? book.version) <= 1}
              onClick={() => void openCompare(picked ?? book.version).catch(() => undefined)}
            >
              {t("doc-compare")}
            </button>
            <button
              type="button"
              className="code-link"
              disabled={(picked ?? book.version) === book.version}
              onClick={() => {
                void store
                  .restoreSheetVersion(book.id, picked ?? book.version)
                  .catch(() => undefined);
                setVersions(null);
                setPicked(null);
              }}
            >
              {t("doc-restore")}
            </button>
          </div>
        </Popover>
      )}
      {exporting && (
        <Popover
          anchor={exporting}
          onClose={() => setExporting(null)}
          className="doc-pop doc-export"
        >
          {(
            [
              [
                t("sheet-format-xlsx"),
                ".xlsx",
                () => revealSheet(store, book.id, book.title, "xlsx"),
              ],
              [
                t("sheet-format-csv"),
                ".csv",
                () => revealSheet(store, book.id, `${book.title} ${tab.name}`, "csv", tab.id),
              ],
              [
                t("sheet-format-copy"),
                "",
                () =>
                  navigator.clipboard.writeText(tab.values.map((row) => row.join("\t")).join("\n")),
              ],
            ] as const
          ).map(([label, ext, run]) => (
            <button
              key={label}
              type="button"
              className="doc-export__item"
              onClick={() => {
                setExporting(null);
                void run().catch(() => undefined);
              }}
            >
              <span>{label}</span>
              <span className="life-card__note">{ext}</span>
            </button>
          ))}
          <span className="life-card__note">{t("sheet-export-note")}</span>
        </Popover>
      )}
    </main>
  );
}
