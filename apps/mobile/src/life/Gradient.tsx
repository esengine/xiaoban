import { color } from "@xiaoban/tokens";
import { useId, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

const TONES = [color.dish0, color.dish1, color.dish2, color.dish3, color.dish4] as const;

export function toneOf(name: string): number {
  let value = 0;
  for (const char of name) value = (value * 31 + (char.codePointAt(0) ?? 0)) % 997;
  return value % TONES.length;
}

function useSvgId() {
  return `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

export function DishCover({
  name,
  image,
  size,
  radius,
}: {
  name: string;
  image: string | null;
  size: number;
  radius: number;
}) {
  const id = useSvgId();
  const [broken, setBroken] = useState(false);
  const tone = TONES[toneOf(name)] ?? color.dish0;
  return (
    <View style={[styles.cover, { width: size, height: size, borderRadius: radius }]}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color.surface} />
            <Stop offset="0.8" stopColor={tone} />
          </LinearGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
      {image && !broken ? (
        <Image
          source={{ uri: image }}
          style={StyleSheet.absoluteFill}
          onError={() => setBroken(true)}
        />
      ) : null}
    </View>
  );
}

export function TempBar({ left, width }: { left: number; width: number }) {
  const id = useSvgId();
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { left: `${left}%`, width: `${width}%` }]}>
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={color.accentBright} />
              <Stop offset="1" stopColor={color.dish0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { overflow: "hidden", flexShrink: 0 },
  track: { flex: 1, height: 5, borderRadius: 3, backgroundColor: color.lineSoft },
  fill: { position: "absolute", top: 0, bottom: 0, borderRadius: 3, overflow: "hidden" },
});
