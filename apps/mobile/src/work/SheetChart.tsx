import { parseRange, toNumber } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { SheetChart as Chart, SheetTab } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Polyline, Rect } from "react-native-svg";

const PALETTE = [
  color.ledger1,
  color.ledger2,
  color.ledger3,
  color.dish0,
  color.dish1,
  color.dish3,
];

function at(grid: string[][], r: number, c: number) {
  return grid[r]?.[c] ?? "";
}

export function SheetChart({
  chart,
  tab,
  width,
  onRemove,
}: {
  chart: Chart;
  tab: SheetTab;
  width: number;
  onRemove?: () => void;
}) {
  const { t } = useI18n();
  const values = parseRange(chart.values);
  const labels = parseRange(chart.labels);
  if (!values) return null;
  const points: { label: string; value: number }[] = [];
  for (let r = values.r1; r <= values.r2; r += 1) {
    for (let c = values.c1; c <= values.c2; c += 1) {
      const index = points.length;
      const label = labels
        ? at(
            tab.values,
            labels.r1 + (labels.r1 === labels.r2 ? 0 : index),
            labels.c1 + (labels.r1 === labels.r2 ? index : 0),
          )
        : String(index + 1);
      points.push({ label, value: toNumber(at(tab.values, r, c)) ?? 0 });
    }
  }
  const height = 130;
  const max = Math.max(1, ...points.map((point) => Math.abs(point.value)));
  const step = width / Math.max(1, points.length);
  const y = (value: number) => height - 8 - (Math.max(0, value) / max) * (height - 16);
  let body = null;
  if (chart.kind === "pie") {
    const total = points.reduce((sum, point) => sum + Math.max(0, point.value), 0) || 1;
    const radius = height / 2 - 4;
    const cx = width / 2;
    const cy = height / 2;
    let angle = -Math.PI / 2;
    body = points.map((point, index) => {
      const share = Math.max(0, point.value) / total;
      if (share >= 0.999)
        return <Circle key={point.label + index} cx={cx} cy={cy} r={radius} fill={color.ledger1} />;
      const start = angle;
      angle += share * Math.PI * 2;
      const large = share > 0.5 ? 1 : 0;
      const x1 = cx + radius * Math.cos(start);
      const y1 = cy + radius * Math.sin(start);
      const x2 = cx + radius * Math.cos(angle);
      const y2 = cy + radius * Math.sin(angle);
      return (
        <Path
          key={index}
          d={`M${cx},${cy} L${x1},${y1} A${radius},${radius} 0 ${large} 1 ${x2},${y2} Z`}
          fill={PALETTE[index % PALETTE.length] ?? color.accent}
        />
      );
    });
  } else if (chart.kind === "line") {
    body = (
      <Polyline
        points={points
          .map((point, index) => `${step * index + step / 2},${y(point.value)}`)
          .join(" ")}
        fill="none"
        stroke={color.accent}
        strokeWidth={2}
      />
    );
  } else {
    body = points.map((point, index) => (
      <Rect
        key={index}
        x={step * index + step * 0.2}
        y={y(point.value)}
        width={step * 0.6}
        height={height - 8 - y(point.value)}
        rx={3}
        fill={PALETTE[index % PALETTE.length] ?? color.accent}
      />
    ));
  }
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title} numberOfLines={1}>
          {chart.title || t("sheet-chart")}
        </Text>
        {onRemove ? (
          <Pressable hitSlop={8} accessibilityRole="button" onPress={onRemove}>
            <Text style={styles.remove}>{t("sheet-chart-remove")}</Text>
          </Pressable>
        ) : null}
      </View>
      <Svg width={width} height={height}>
        {body}
      </Svg>
      {chart.kind === "pie" ? null : (
        <View style={styles.labels}>
          {points.map((point, index) => (
            <Text key={index} style={[styles.label, { width: step }]} numberOfLines={1}>
              {point.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 13, fontWeight: "700", color: color.ink },
  remove: { fontSize: 12, color: color.dangerInk },
  labels: { flexDirection: "row" },
  label: { fontSize: 10, color: color.faint, textAlign: "center" },
});
