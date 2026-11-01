import type { TripStop } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Ellipse, Path, Polyline, Rect } from "react-native-svg";

export interface MapArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Point {
  index: number;
  x: number;
  y: number;
}

const PIN = 26;
const PIN_ON = 34;

function project(stops: TripStop[], area: MapArea): Point[] {
  const width = Math.max(1, area.right - area.left);
  const height = Math.max(1, area.bottom - area.top);
  const located = stops.flatMap((stop, index) =>
    stop.location ? [{ index, at: stop.location }] : [],
  );
  if (located.length === 0 || (located.length === 1 && stops.length > 1)) {
    return stops.map((_, index) => ({
      index,
      x: area.left + (width * (index + 0.5)) / stops.length,
      y: area.top + height / 2 + Math.sin(index * 1.4) * height * 0.28,
    }));
  }
  const meanLat = located.reduce((sum, item) => sum + item.at.lat, 0) / located.length;
  const squash = Math.cos((meanLat * Math.PI) / 180);
  const xs = located.map((item) => item.at.lng * squash);
  const ys = located.map((item) => -item.at.lat);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const scale = Math.min(
    spanX > 1e-9 ? width / spanX : Number.POSITIVE_INFINITY,
    spanY > 1e-9 ? height / spanY : Number.POSITIVE_INFINITY,
  );
  const finite = Number.isFinite(scale) ? scale : 0;
  const offsetX = area.left + (width - spanX * finite) / 2;
  const offsetY = area.top + (height - spanY * finite) / 2;
  return located.map((item, order) => ({
    index: item.index,
    x: offsetX + ((xs[order] ?? minX) - minX) * finite,
    y: offsetY + ((ys[order] ?? minY) - minY) * finite,
  }));
}

export function MapGround({ width, height }: { width: number; height: number }) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 390 844"
      preserveAspectRatio="xMidYMin slice"
      style={StyleSheet.absoluteFill}
    >
      <Rect x={0} y={0} width={390} height={844} fill={color.mapGround} />
      <Rect x={0} y={60} width={110} height={110} rx={20} fill={color.mapPark} />
      <Rect x={10} y={190} width={90} height={190} rx={24} fill={color.mapPark} />
      <Ellipse cx={150} cy={215} rx={68} ry={84} fill={color.mapWater} />
      <Path
        d="M0 470 C 120 430, 260 520, 390 440 L 390 500 C 260 580, 120 490, 0 530 Z"
        fill={color.mapWater}
      />
      <Path
        d="M0 140 L390 110 M220 0 L240 844 M0 330 L390 360 M300 0 L330 460 M60 844 L170 400"
        stroke={color.surface}
        strokeWidth={7}
        fill="none"
      />
    </Svg>
  );
}

export function TripMap({
  stops,
  tone,
  area,
  width,
  height,
  selected,
  passed = -1,
  onSelect,
}: {
  stops: TripStop[];
  tone: string;
  area: MapArea;
  width: number;
  height: number;
  selected: number | null;
  passed?: number;
  onSelect?: (index: number) => void;
}) {
  const points = project(stops, area);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <MapGround width={width} height={height} />
      {points.length > 1 ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Polyline
            points={points.map((point) => `${point.x},${point.y - 4}`).join(" ")}
            fill="none"
            stroke={tone}
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
      {points.map((point) => {
        const stop = stops[point.index];
        if (!stop) return null;
        const on = point.index === selected;
        const size = on ? PIN_ON : PIN;
        const fill = on ? color.ink : point.index <= passed ? color.faded : tone;
        return (
          <View
            key={`${point.index}-${stop.name}`}
            pointerEvents="box-none"
            style={[styles.anchor, { left: point.x - 80, top: point.y - 120 }]}
          >
            <Pressable
              style={styles.pinWrap}
              accessibilityRole="button"
              accessibilityLabel={stop.name}
              disabled={!onSelect}
              onPress={() => onSelect?.(point.index)}
            >
              {on ? (
                <Text style={styles.label} numberOfLines={1}>
                  {stop.name}
                </Text>
              ) : null}
              <View
                style={[
                  styles.pin,
                  {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: fill,
                    marginBottom: size * 0.2,
                  },
                ]}
              >
                <Text style={styles.pinText}>{point.index + 1}</Text>
              </View>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: "absolute",
    width: 160,
    height: 120,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  pinWrap: { alignItems: "center" },
  label: {
    marginBottom: 6,
    maxWidth: 160,
    backgroundColor: color.ink,
    color: color.surface,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: "hidden",
  },
  pin: {
    borderBottomLeftRadius: 0,
    borderWidth: 2,
    borderColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-45deg" }],
    shadowColor: color.ink,
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  pinText: {
    color: color.surface,
    fontSize: 12,
    fontWeight: "700",
    transform: [{ rotate: "45deg" }],
  },
});
