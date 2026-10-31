import { color, radius } from "@xiaoban/tokens";
import { useEffect, useRef } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";

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
  tile: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
