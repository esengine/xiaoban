import Svg, { Circle, Path } from "react-native-svg";

const stroke = (color: string, width = 1.8) => ({
  fill: "none",
  stroke: color,
  strokeWidth: width,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export function ShareIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path {...stroke(color)} d="M12 15V3M7 8l5-5 5 5M5 13v6h14v-6" />
    </Svg>
  );
}

export function NavigateIcon({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path {...stroke(color)} d="M3 11l18-8-8 18-2-8z" />
    </Svg>
  );
}

export function OutIcon({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path {...stroke(color, 2.2)} d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
    </Svg>
  );
}

export function ChevronIcon({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path {...stroke(color, 2.2)} d="M9 5l7 7-7 7" />
    </Svg>
  );
}

export function DotIcon({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10">
      <Circle cx={5} cy={5} r={4} fill={color} />
    </Svg>
  );
}
