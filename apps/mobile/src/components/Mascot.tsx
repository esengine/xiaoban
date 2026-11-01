import { color, radius } from "@xiaoban/tokens";
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { useReduceMotion } from "../ui/useReduceMotion.ts";

export function Mascot() {
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(bob, {
            toValue: -4,
            duration: 1600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(bob, {
            toValue: 0,
            duration: 1600,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [bob]);

  return (
    <Animated.View style={[styles.tile, { transform: [{ translateY: bob }] }]} accessible={false}>
      <Svg
        width={38}
        height={38}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color.surface}
        strokeWidth={1.6}
        strokeLinecap="round"
      >
        <Circle cx={12} cy={12} r={8} />
        <G fill={color.surface}>
          <Circle cx={9} cy={11} r={0.8} />
          <Circle cx={15} cy={11} r={0.8} />
        </G>
        <Path d="M9 15c1.6 1.2 4.4 1.2 6 0" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  eyes: { position: "absolute", left: 0 },
  tile: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});

const LOOK = 1.6;

function lookLoop(value: Animated.Value) {
  const move = (toValue: number, duration: number) =>
    Animated.timing(value, {
      toValue,
      duration,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    });
  return Animated.loop(
    Animated.sequence([
      Animated.delay(480),
      move(-LOOK, 240),
      Animated.delay(360),
      move(LOOK, 240),
      Animated.delay(360),
      move(0, 240),
      Animated.delay(480),
    ]),
  );
}

function blinkLoop(value: Animated.Value) {
  return Animated.loop(
    Animated.sequence([
      Animated.delay(3240),
      Animated.timing(value, { toValue: 0.1, duration: 144, useNativeDriver: true }),
      Animated.timing(value, { toValue: 1, duration: 216, useNativeDriver: true }),
    ]),
  );
}

export function MascotFace({ thinking = false, size = 24 }: { thinking?: boolean; size?: number }) {
  const reduced = useReduceMotion();
  const look = useRef(new Animated.Value(0)).current;
  const lids = useRef(new Animated.Value(1)).current;
  const scale = size / 24;

  useEffect(() => {
    if (reduced) {
      look.setValue(0);
      lids.setValue(1);
      return;
    }
    const loops = [blinkLoop(lids), ...(thinking ? [lookLoop(look)] : [])];
    for (const loop of loops) loop.start();
    return () => {
      for (const loop of loops) loop.stop();
    };
  }, [reduced, thinking, look, lids]);

  return (
    <Animated.View style={{ width: size, height: size }} accessible={false}>
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color.surface}
        strokeWidth={1.6}
        strokeLinecap="round"
      >
        <Circle cx={12} cy={12} r={8} />
        <Path d={thinking ? "M10 15.5h4" : "M9 15c1.6 1.2 4.4 1.2 6 0"} />
      </Svg>
      <Animated.View
        style={[
          styles.eyes,
          {
            top: -scale,
            width: size,
            height: size,
            transform: [{ translateX: Animated.multiply(look, scale) }, { scaleY: lids }],
          },
        ]}
      >
        <Svg width={size} height={size} viewBox="0 -1 24 24">
          <G fill={color.surface}>
            <Circle cx={9} cy={11} r={thinking ? 0.9 : 0.8} />
            <Circle cx={15} cy={11} r={thinking ? 0.9 : 0.8} />
          </G>
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}
