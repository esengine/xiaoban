import { describeError } from "@xiaoban/client";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import { color, dark, radius } from "@xiaoban/tokens";
import { type BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";
import { router, Stack } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { useHubContext } from "../src/hub/HubProvider.tsx";

const BOX = 240;

interface Link {
  address: string;
  code: string;
  name: string | null;
}

function readLink(data: string): Link | null {
  const [head, query] = data.split("?");
  if (head !== "xiaoban://pair" || !query) return null;
  const params: Record<string, string> = {};
  for (const part of query.split("&")) {
    const [key, value = ""] = part.split("=");
    if (key) params[key] = decodeURIComponent(value.replace(/\+/g, " "));
  }
  const { host, port, code, name } = params;
  if (!host || !code) return null;
  return { address: port ? `${host}:${port}` : host, code, name: name || null };
}

function Back({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable
      style={styles.back}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Svg
        width={22}
        height={22}
        viewBox="0 0 24 24"
        fill="none"
        stroke={dark.text}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M15 5l-7 7 7 7" />
      </Svg>
    </Pressable>
  );
}

function Corners({ tint }: { tint: string }) {
  return (
    <>
      <View style={[styles.corner, styles.topLeft, { borderColor: tint }]} />
      <View style={[styles.corner, styles.topRight, { borderColor: tint }]} />
      <View style={[styles.corner, styles.bottomLeft, { borderColor: tint }]} />
      <View style={[styles.corner, styles.bottomRight, { borderColor: tint }]} />
    </>
  );
}

function ScanLine() {
  const move = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced) return;
      loop = Animated.loop(
        Animated.timing(move, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      );
      loop.start();
    });
    return () => loop?.stop();
  }, [move]);
  const translateY = move.interpolate({ inputRange: [0, 1], outputRange: [24, BOX - 24] });
  return <Animated.View style={[styles.line, { transform: [{ translateY }] }]} />;
}

export default function ScanScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { pair } = useHubContext();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [found, setFound] = useState<Link | null>(null);
  const [error, setError] = useState<PlainMessageKey | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  const manual = () => router.replace("/pair");
  const leave = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const scanned = ({ data }: BarcodeScanningResult) => {
    if (busy.current) return;
    const link = readLink(data);
    if (!link) return;
    busy.current = true;
    setFound(link);
    setError(null);
    pair(link.address, link.code)
      .then(() => router.replace("/"))
      .catch((cause: unknown) => setError(describeError(cause)));
  };

  const retry = () => {
    busy.current = false;
    setFound(null);
    setError(null);
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <Back onPress={leave} label={t("onboarding-back")} />
      <Text style={styles.title} accessibilityRole="header">
        {t("scan-title")}
      </Text>
      <View style={styles.back} />
    </View>
  );

  if (permission && !permission.granted && !permission.canAskAgain) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ headerShown: false }} />
        {header}
        <View style={styles.denied}>
          <View style={styles.deniedIcon}>
            <Svg
              width={30}
              height={30}
              viewBox="0 0 24 24"
              fill="none"
              stroke={dark.textSoft}
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <Circle cx={12} cy={13} r={3.5} />
              <Path d="M3 3l18 18" />
            </Svg>
          </View>
          <Text style={styles.deniedTitle}>{t("scan-denied-title")}</Text>
          <Text style={styles.deniedBody}>{t("scan-denied-body")}</Text>
          <Pressable
            style={styles.primary}
            onPress={() => void Linking.openSettings()}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{t("scan-open-settings")}</Text>
          </Pressable>
          <Pressable onPress={manual} accessibilityRole="button">
            <Text style={styles.link}>{t("scan-manual")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      {permission?.granted && (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={found ? undefined : scanned}
        />
      )}
      {header}
      <View style={styles.box}>
        <Corners tint={found ? dark.found : dark.text} />
        {found ? (
          <View style={styles.check}>
            <Svg
              width={34}
              height={34}
              viewBox="0 0 24 24"
              fill="none"
              stroke={dark.text}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Path d="M5 12.5l4.5 4.5L19 7.5" />
            </Svg>
          </View>
        ) : (
          <ScanLine />
        )}
      </View>
      {found ? (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 28 }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>
            {found.name ? t("scan-found", { name: found.name }) : t("scan-found-unnamed")}
          </Text>
          {error ? (
            <>
              <Text style={styles.error}>{t(error)}</Text>
              <Pressable style={styles.retry} onPress={retry} accessibilityRole="button">
                <Text style={styles.retryText}>{t("scan-retry")}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.connecting}>
                <ActivityIndicator color={color.accent} />
                <Text style={styles.connectingText}>{t("scan-connecting")}</Text>
              </View>
              <Text style={styles.sheetNote}>{t("scan-found-note")}</Text>
            </>
          )}
        </View>
      ) : (
        <>
          <Text style={styles.hint}>{t("scan-hint")}</Text>
          <View style={[styles.bottom, { paddingBottom: insets.bottom + 40 }]}>
            <Pressable
              style={[styles.torch, torch && styles.torchOn]}
              onPress={() => setTorch((value) => !value)}
              accessibilityRole="switch"
              accessibilityState={{ checked: torch }}
              accessibilityLabel={t("scan-torch")}
            >
              <Svg
                width={22}
                height={22}
                viewBox="0 0 24 24"
                fill="none"
                stroke={torch ? color.ink : dark.text}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M8 3h8l-1 5H9zM9 8l1 13h4l1-13M12 12v3" />
              </Svg>
            </Pressable>
            <Pressable onPress={manual} accessibilityRole="button">
              <Text style={styles.manual}>{t("scan-manual")}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const CORNER = 34;
const EDGE = 4;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: dark.ground },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: dark.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: dark.text },
  box: { position: "absolute", top: 180, alignSelf: "center", width: BOX, height: BOX },
  corner: { position: "absolute", width: CORNER, height: CORNER },
  topLeft: {
    left: 0,
    top: 0,
    borderLeftWidth: EDGE,
    borderTopWidth: EDGE,
    borderTopLeftRadius: 18,
  },
  topRight: {
    right: 0,
    top: 0,
    borderRightWidth: EDGE,
    borderTopWidth: EDGE,
    borderTopRightRadius: 18,
  },
  bottomLeft: {
    left: 0,
    bottom: 0,
    borderLeftWidth: EDGE,
    borderBottomWidth: EDGE,
    borderBottomLeftRadius: 18,
  },
  bottomRight: {
    right: 0,
    bottom: 0,
    borderRightWidth: EDGE,
    borderBottomWidth: EDGE,
    borderBottomRightRadius: 18,
  },
  line: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 0,
    height: 2,
    borderRadius: 1,
    backgroundColor: dark.link,
  },
  check: {
    position: "absolute",
    left: BOX / 2 - 32,
    top: BOX / 2 - 32,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: dark.found,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    position: "absolute",
    top: 446,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 22,
    color: dark.text,
  },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 22 },
  torch: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: dark.glass,
    alignItems: "center",
    justifyContent: "center",
  },
  torchOn: { backgroundColor: color.surface },
  manual: { fontSize: 14, color: dark.textSoft },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 12,
    paddingHorizontal: 22,
    gap: 12,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.lineStrong,
  },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: color.ink },
  connecting: { flexDirection: "row", alignItems: "center", gap: 10 },
  connectingText: { fontSize: 14, color: color.inkMid },
  sheetNote: { fontSize: 12, lineHeight: 19, color: color.faint },
  error: {
    borderRadius: radius.md,
    backgroundColor: color.attentionSoft,
    color: color.attentionInk,
    padding: 12,
    fontSize: 13,
    overflow: "hidden",
  },
  retry: {
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: { fontSize: 15, fontWeight: "500", color: color.surface },
  denied: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 40,
  },
  deniedIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: dark.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  deniedTitle: { fontSize: 18, fontWeight: "700", color: dark.text },
  deniedBody: { fontSize: 14, lineHeight: 22, color: dark.textMuted, textAlign: "center" },
  primary: {
    marginTop: 10,
    alignSelf: "stretch",
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontSize: 16, fontWeight: "500", color: color.ink },
  link: { fontSize: 14, color: dark.link },
});
