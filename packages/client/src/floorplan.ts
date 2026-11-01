import type {
  FloorItem,
  FloorLayout,
  FloorMeasure,
  FloorPlan,
  FloorPoint,
  FloorRoom,
  FloorScheme,
  FloorVersion,
} from "@xiaoban/protocol";

export type FloorView = "plain" | "furniture" | "size";

export interface FloorBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FLOOR_WALL = 0.07;

const EMPTY: FloorLayout = { rooms: [], measures: [] };

export function activeScheme(plan: FloorPlan): FloorScheme | undefined {
  return plan.schemes.find((scheme) => scheme.id === plan.scheme) ?? plan.schemes.at(-1);
}

export function latestVersion(scheme: FloorScheme | undefined): FloorVersion | undefined {
  return scheme?.versions.at(-1);
}

export function currentLayout(plan: FloorPlan): FloorLayout {
  return latestVersion(activeScheme(plan))?.layout ?? EMPTY;
}

export function planArea(plan: FloorPlan, layout: FloorLayout = currentLayout(plan)): number {
  if (plan.area > 0) return plan.area;
  return Math.round(layout.rooms.reduce((sum, room) => sum + room.area, 0) * 10) / 10;
}

export function pendingMeasures(layout: FloorLayout): FloorMeasure[] {
  return layout.measures.filter((measure) => measure.value === null);
}

export function boxOf(points: readonly FloorPoint[]): FloorBox {
  if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function layoutBox(layout: FloorLayout): FloorBox {
  return boxOf(layout.rooms.flatMap((room) => room.points));
}

export function centroid(room: FloorRoom): FloorPoint {
  const box = boxOf(room.points);
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 };
}

export function meters(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

export function preciseMeters(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function roomSize(room: FloorRoom): { w: string; h: string } {
  const box = boxOf(room.points);
  return { w: meters(box.w), h: meters(box.h) };
}

export function areaText(value: number): string {
  return value >= 10 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
}

export function pointsAttr(points: readonly FloorPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function labelSize(room: FloorRoom): number {
  const box = boxOf(room.points);
  return Math.min(0.42, Math.max(0.2, Math.min(box.w, box.h) * 0.16));
}

export function itemTransform(item: FloorItem): string | undefined {
  if (!item.rotation) return undefined;
  const cx = item.rect.x + item.rect.w / 2;
  const cy = item.rect.y + item.rect.h / 2;
  return `rotate(${item.rotation} ${cx} ${cy})`;
}

export function viewBox(layout: FloorLayout, pad = 0.3): string {
  const box = layoutBox(layout);
  return `${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`;
}

export interface FloorCompare {
  scheme: string;
  version: number;
  layout: FloorLayout;
  sameScheme: boolean;
}

export function compareTarget(plan: FloorPlan): FloorCompare | null {
  const other = plan.schemes.find((scheme) => scheme.id !== plan.scheme);
  const otherLatest = latestVersion(other);
  if (other && otherLatest) {
    return {
      scheme: other.id,
      version: otherLatest.number,
      layout: otherLatest.layout,
      sameScheme: false,
    };
  }
  const versions = activeScheme(plan)?.versions ?? [];
  const previous = versions.at(-2);
  if (!previous) return null;
  return {
    scheme: plan.scheme,
    version: previous.number,
    layout: previous.layout,
    sameScheme: true,
  };
}

function roomKey(room: FloorRoom): string {
  return JSON.stringify([room.points, room.items, room.openings, room.advice]);
}

export function changedRooms(a: FloorLayout, b: FloorLayout): string[] {
  const names = new Set([...a.rooms, ...b.rooms].map((room) => room.name));
  return [...names].filter((name) => {
    const left = a.rooms.find((room) => room.name === name);
    const right = b.rooms.find((room) => room.name === name);
    return !left || !right || roomKey(left) !== roomKey(right);
  });
}

function dxfText(text: string): string {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0) ?? 63;
      return code < 128 ? char : `\\U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
    })
    .join("");
}

function mm(value: number): string {
  return String(Math.round(value * 1000));
}

function dxfLine(layer: string, a: FloorPoint, b: FloorPoint): string[] {
  return [
    "0",
    "LINE",
    "8",
    layer,
    "10",
    mm(a.x),
    "20",
    mm(-a.y),
    "30",
    "0",
    "11",
    mm(b.x),
    "21",
    mm(-b.y),
    "31",
    "0",
  ];
}

function dxfLabel(layer: string, at: FloorPoint, height: number, text: string): string[] {
  return [
    "0",
    "TEXT",
    "8",
    layer,
    "10",
    mm(at.x),
    "20",
    mm(-at.y),
    "30",
    "0",
    "40",
    mm(height),
    "1",
    dxfText(text),
    "72",
    "1",
    "11",
    mm(at.x),
    "21",
    mm(-at.y),
    "31",
    "0",
  ];
}

function corners(item: FloorItem): FloorPoint[] {
  const { x, y, w, h } = item.rect;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const angle = (item.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ].map((point) => ({
    x: cx + (point.x - cx) * cos - (point.y - cy) * sin,
    y: cy + (point.x - cx) * sin + (point.y - cy) * cos,
  }));
}

function ring(points: readonly FloorPoint[]): [FloorPoint, FloorPoint][] {
  return points.map((point, index) => [point, points[(index + 1) % points.length] ?? point]);
}

export function floorDxf(layout: FloorLayout, label: (room: FloorRoom) => string): string {
  const entities: string[] = [];
  for (const room of layout.rooms) {
    for (const [a, b] of ring(room.points)) entities.push(...dxfLine("WALLS", a, b));
    for (const opening of room.openings) {
      entities.push(
        ...dxfLine(opening.kind === "door" ? "DOORS" : "WINDOWS", opening.from, opening.to),
      );
    }
    for (const item of room.items) {
      for (const [a, b] of ring(corners(item))) entities.push(...dxfLine("FURNITURE", a, b));
    }
    entities.push(...dxfLabel("LABELS", centroid(room), labelSize(room), label(room)));
  }
  return [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$ACADVER",
    "1",
    "AC1009",
    "9",
    "$INSUNITS",
    "70",
    "4",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    ...entities,
    "0",
    "ENDSEC",
    "0",
    "EOF",
    "",
  ].join("\n");
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export interface FloorSvgColors {
  wall: string;
  room: string;
  item: string;
  itemLine: string;
  ink: string;
  muted: string;
  window: string;
}

export function floorSvg(
  layout: FloorLayout,
  colors: FloorSvgColors,
  sub: (room: FloorRoom) => string,
): string {
  const parts: string[] = [];
  for (const room of layout.rooms) {
    parts.push(
      `<polygon points="${pointsAttr(room.points)}" fill="${colors.room}" stroke="${colors.wall}" stroke-width="${FLOOR_WALL}" stroke-linejoin="miter"/>`,
    );
  }
  for (const room of layout.rooms) {
    for (const item of room.items) {
      const rotate = itemTransform(item);
      parts.push(
        `<rect x="${item.rect.x}" y="${item.rect.y}" width="${item.rect.w}" height="${item.rect.h}" rx="0.04" fill="${colors.item}" stroke="${colors.itemLine}" stroke-width="0.02"${rotate ? ` transform="${rotate}"` : ""}/>`,
      );
    }
    for (const opening of room.openings) {
      parts.push(
        `<line x1="${opening.from.x}" y1="${opening.from.y}" x2="${opening.to.x}" y2="${opening.to.y}" stroke="${opening.kind === "door" ? colors.room : colors.window}" stroke-width="${FLOOR_WALL * 1.4}"/>`,
      );
    }
  }
  for (const room of layout.rooms) {
    const center = centroid(room);
    const size = labelSize(room);
    parts.push(
      `<text x="${center.x}" y="${center.y}" text-anchor="middle" font-size="${size}" font-weight="700" fill="${colors.ink}">${escapeXml(room.name)}</text>`,
      `<text x="${center.x}" y="${center.y + size * 1.25}" text-anchor="middle" font-size="${size * 0.78}" fill="${colors.muted}">${escapeXml(sub(room))}</text>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox(layout)}" width="100%">${parts.join("")}</svg>`;
}
