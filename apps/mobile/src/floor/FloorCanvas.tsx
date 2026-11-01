import {
  areaText,
  centroid,
  FLOOR_WALL,
  type FloorView,
  itemTransform,
  labelSize,
  layoutBox,
  pointsAttr,
  roomSize,
} from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { FloorLayout, FloorRoom } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import Svg, { Circle, G, Line, Polygon, Rect, Text as SvgText } from "react-native-svg";

const PAD = 0.3;

export function canvasSize(layout: FloorLayout, width: number, maxHeight: number) {
  const box = layoutBox(layout);
  const w = box.w + PAD * 2;
  const h = box.h + PAD * 2;
  if (w <= 0 || h <= 0) return { width, height: Math.min(width, maxHeight) };
  const height = (width * h) / w;
  if (height <= maxHeight) return { width, height };
  return { width: (maxHeight * w) / h, height: maxHeight };
}

export function FloorCanvas({
  layout,
  view,
  width,
  maxHeight,
  selected = null,
  marked = [],
  focus = null,
  thumbnail = false,
  onPick,
}: {
  layout: FloorLayout;
  view: FloorView;
  width: number;
  maxHeight: number;
  selected?: string | null;
  marked?: readonly string[];
  focus?: string | null;
  thumbnail?: boolean;
  onPick?: (room: FloorRoom) => void;
}) {
  const { t } = useI18n();
  const box = layoutBox(layout);
  const size = canvasSize(layout, width, maxHeight);
  const wall = thumbnail ? FLOOR_WALL * 2.2 : FLOOR_WALL;
  const sub = (room: FloorRoom) => {
    if (view !== "size") return t("floorplan-area", { area: areaText(room.area) });
    return t("floorplan-size", roomSize(room));
  };
  const fill = (room: FloorRoom) =>
    room.id === selected
      ? color.codePick
      : marked.includes(room.name)
        ? color.attentionSoft
        : color.surface;
  const pending =
    view === "size" ? layout.measures.filter((measure) => measure.value === null) : [];
  return (
    <Svg
      width={size.width}
      height={size.height}
      viewBox={`${box.x - PAD} ${box.y - PAD} ${box.w + PAD * 2} ${box.h + PAD * 2}`}
    >
      {layout.rooms.map((room) => (
        <Polygon
          key={room.id}
          points={pointsAttr(room.points)}
          fill={fill(room)}
          stroke={color.ink}
          strokeWidth={wall}
          strokeLinejoin="miter"
          {...(onPick ? { onPress: () => onPick(room) } : {})}
        />
      ))}
      {view === "furniture" && !thumbnail
        ? layout.rooms.flatMap((room) =>
            room.items.map((item, index) => (
              <Rect
                key={`${room.id}-${index}`}
                x={item.rect.x}
                y={item.rect.y}
                width={item.rect.w}
                height={item.rect.h}
                rx={0.06}
                fill={room.id === selected ? color.floorPickItem : color.neutralSoft}
                stroke={color.checkOff}
                strokeWidth={0.02}
                {...(item.rotation ? { transform: itemTransform(item) ?? "" } : {})}
                {...(onPick ? { onPress: () => onPick(room) } : {})}
              />
            )),
          )
        : null}
      {layout.rooms.flatMap((room) =>
        room.openings.map((opening, index) => (
          <Line
            key={`${room.id}-o${index}`}
            x1={opening.from.x}
            y1={opening.from.y}
            x2={opening.to.x}
            y2={opening.to.y}
            stroke={opening.kind === "door" ? color.surface : color.accentBright}
            strokeWidth={opening.kind === "door" ? wall * 1.4 : wall * 0.8}
          />
        )),
      )}
      {thumbnail
        ? null
        : layout.rooms.map((room) => {
            const center = centroid(room);
            const font = labelSize(room);
            const on = room.id === selected;
            return (
              <G key={`${room.id}-label`} pointerEvents="none">
                <SvgText
                  x={center.x}
                  y={center.y}
                  textAnchor="middle"
                  fontSize={font}
                  fontWeight="700"
                  fill={on ? color.accentStrong : color.ink}
                >
                  {room.name}
                </SvgText>
                <SvgText
                  x={center.x}
                  y={center.y + font * 1.25}
                  textAnchor="middle"
                  fontSize={font * 0.78}
                  fill={on ? color.accentStrong : color.muted}
                >
                  {sub(room)}
                </SvgText>
              </G>
            );
          })}
      {pending.map((measure) => {
        const dim = focus !== null && measure.id !== focus;
        const mid = {
          x: (measure.from.x + measure.to.x) / 2,
          y: (measure.from.y + measure.to.y) / 2,
        };
        return (
          <G key={measure.id} opacity={dim ? 0.45 : 1} pointerEvents="none">
            <Line
              x1={measure.from.x}
              y1={measure.from.y}
              x2={measure.to.x}
              y2={measure.to.y}
              stroke={color.attention}
              strokeWidth={0.14}
              strokeLinecap="round"
            />
            <Circle cx={mid.x} cy={mid.y} r={0.24} fill={color.attention} />
            <SvgText
              x={mid.x}
              y={mid.y + 0.1}
              textAnchor="middle"
              fontSize={0.28}
              fontWeight="700"
              fill={color.surface}
            >
              {t("floorplan-unclear-mark")}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
