import {
  areaText,
  centroid,
  FLOOR_WALL,
  type FloorView,
  itemTransform,
  labelSize,
  pointsAttr,
  roomSize,
  viewBox,
} from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { FloorLayout, FloorRoom } from "@xiaoban/protocol";

export function FloorCanvas({
  layout,
  view,
  selected = null,
  marked = [],
  focus = null,
  thumbnail = false,
  className,
  label,
  onPick,
}: {
  layout: FloorLayout;
  view: FloorView;
  selected?: string | null;
  marked?: readonly string[];
  focus?: string | null;
  thumbnail?: boolean;
  className?: string;
  label: string;
  onPick?: (room: FloorRoom) => void;
}) {
  const { t } = useI18n();
  const wall = thumbnail ? FLOOR_WALL * 2.2 : FLOOR_WALL;
  const sub = (room: FloorRoom) =>
    view === "size"
      ? t("floorplan-size", roomSize(room))
      : t("floorplan-area", { area: areaText(room.area) });
  const pending =
    view === "size" ? layout.measures.filter((measure) => measure.value === null) : [];
  return (
    <svg
      className={className ?? "floor-canvas"}
      viewBox={viewBox(layout)}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
    >
      {layout.rooms.map((room) => (
        // biome-ignore lint/a11y/noStaticElementInteractions: rooms are also listed as buttons in the side panel
        <polygon
          key={room.id}
          className="floor-room"
          data-selected={room.id === selected || undefined}
          data-marked={marked.includes(room.name) || undefined}
          data-clickable={onPick ? true : undefined}
          points={pointsAttr(room.points)}
          strokeWidth={wall}
          onClick={onPick ? () => onPick(room) : undefined}
        />
      ))}
      {view === "furniture" && !thumbnail
        ? layout.rooms.flatMap((room) =>
            room.items.map((item, index) => (
              <rect
                key={`${room.id}-${index}`}
                className="floor-item"
                data-selected={room.id === selected || undefined}
                x={item.rect.x}
                y={item.rect.y}
                width={item.rect.w}
                height={item.rect.h}
                rx={0.06}
                strokeWidth={0.02}
                transform={itemTransform(item)}
              />
            )),
          )
        : null}
      {layout.rooms.flatMap((room) =>
        room.openings.map((opening, index) => (
          <line
            key={`${room.id}-o${index}`}
            className={opening.kind === "door" ? "floor-door" : "floor-window"}
            x1={opening.from.x}
            y1={opening.from.y}
            x2={opening.to.x}
            y2={opening.to.y}
            strokeWidth={opening.kind === "door" ? wall * 1.4 : wall * 0.8}
          />
        )),
      )}
      {thumbnail
        ? null
        : layout.rooms.map((room) => {
            const center = centroid(room);
            const font = labelSize(room);
            return (
              <g
                key={`${room.id}-label`}
                className="floor-label"
                data-selected={room.id === selected || undefined}
              >
                <text
                  x={center.x}
                  y={center.y}
                  textAnchor="middle"
                  fontSize={font}
                  className="floor-label__name"
                >
                  {room.name}
                </text>
                <text
                  x={center.x}
                  y={center.y + font * 1.25}
                  textAnchor="middle"
                  fontSize={font * 0.78}
                  className="floor-label__sub"
                >
                  {sub(room)}
                </text>
              </g>
            );
          })}
      {pending.map((measure) => {
        const mid = {
          x: (measure.from.x + measure.to.x) / 2,
          y: (measure.from.y + measure.to.y) / 2,
        };
        return (
          <g
            key={measure.id}
            className="floor-measure"
            data-dim={(focus !== null && measure.id !== focus) || undefined}
          >
            <line
              x1={measure.from.x}
              y1={measure.from.y}
              x2={measure.to.x}
              y2={measure.to.y}
              strokeWidth={0.14}
              strokeLinecap="round"
            />
            <circle cx={mid.x} cy={mid.y} r={0.24} />
            <text x={mid.x} y={mid.y + 0.1} textAnchor="middle" fontSize={0.28}>
              {t("floorplan-unclear-mark")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
