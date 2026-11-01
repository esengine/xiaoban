import type { Sky, TipKind } from "@xiaoban/protocol";
import { color as palette } from "@xiaoban/tokens";
import Svg, { Circle, Path } from "react-native-svg";

const WET: ReadonlySet<Sky> = new Set(["light_rain", "rain", "heavy_rain", "storm"]);

function stroke(color: string, width = 1.8) {
  return {
    fill: "none",
    stroke: color,
    strokeWidth: width,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function SunIcon({ size }: { size: number }) {
  const line = stroke(palette.sun);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle {...line} cx={12} cy={12} r={4} />
      <Path
        {...line}
        d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"
      />
    </Svg>
  );
}

export function SkyIcon({ sky, size = 18 }: { sky: Sky; size?: number }) {
  if (sky === "clear") return <SunIcon size={size} />;
  if (WET.has(sky)) {
    const line = stroke(palette.rain);
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path {...line} d="M7 15a4 4 0 010-8 5 5 0 019.6 1.5A3.5 3.5 0 0117 15z" />
        <Path {...line} d="M9 18l-1 2M13 18l-1 2M17 18l-1 2" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path {...stroke(palette.faint)} d="M7 18a4 4 0 010-8 5 5 0 019.6 1.5A3.5 3.5 0 0117 18z" />
    </Svg>
  );
}

export function TipIcon({ kind, size = 16 }: { kind: TipKind; size?: number }) {
  if (kind === "rain") return <SkyIcon sky="rain" size={size} />;
  if (kind === "sun") return <SunIcon size={size} />;
  const line = stroke(palette.accent);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {kind === "cold" ? (
        <Path {...line} d="M12 3v12M8.5 13a3.5 3.5 0 107 0" />
      ) : (
        <Path {...line} d="M4 9h11a3 3 0 10-3-3M4 15h14a3 3 0 11-3 3" />
      )}
    </Svg>
  );
}

export function CloseIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path {...stroke(color, 2)} d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function TimerIcon({ color, size = 14 }: { color: string; size?: number }) {
  const line = stroke(color, 2.2);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle {...line} cx={12} cy={13} r={8} />
      <Path {...line} d="M12 9v4l2 2M9 3h6" />
    </Svg>
  );
}

export function TickIcon({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path {...stroke(color, 3.2)} d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}
