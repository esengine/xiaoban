import { color, motion } from "@xiaoban/tokens";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { useReduceMotion } from "../ui/useReduceMotion.ts";

export const springEasing = Easing.bezier(0.34, 1.56, 0.64, 1);
export const standardEasing = Easing.bezier(0.2, 0.8, 0.2, 1);

export function FadeIn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduced = useReduceMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: motion.standard,
      easing: standardEasing,
      useNativeDriver: true,
    }).start();
  }, [opacity, reduced]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

export function Pulse({ size = 8, period = 900 }: { size?: number; period?: number }) {
  const reduced = useReduceMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    const half = period / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: half,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: half,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced, period]);
  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color.accent,
        opacity,
      }}
    />
  );
}

export function Caret() {
  const reduced = useReduceMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(500),
        Animated.timing(opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(500),
        Animated.timing(opacity, { toValue: 1, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);
  return <Animated.View style={[styles.caret, { opacity }]} />;
}

const BAND = 28;

export function Shimmer({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const reduced = useReduceMotion();
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(-BAND)).current;
  useEffect(() => {
    if (reduced || width === 0) return;
    x.setValue(-BAND);
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: width,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [x, width, reduced]);
  return (
    <View>
      <Text
        style={[style, styles.shimmerBase]}
        onLayout={(event) => setWidth(Math.ceil(event.nativeEvent.layout.width))}
      >
        {text}
      </Text>
      {width > 0 && !reduced && (
        <Animated.View
          pointerEvents="none"
          style={[styles.band, { transform: [{ translateX: x }] }]}
          accessible={false}
        >
          <Animated.Text
            style={[
              style,
              styles.shimmerLit,
              { width, transform: [{ translateX: Animated.multiply(x, -1) }] },
            ]}
          >
            {text}
          </Animated.Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caret: {
    width: 2,
    height: 16,
    marginLeft: 2,
    marginBottom: -3,
    backgroundColor: color.accent,
  },
  shimmerBase: { color: color.faint },
  shimmerLit: { color: color.ink },
  band: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: BAND,
    overflow: "hidden",
  },
});
