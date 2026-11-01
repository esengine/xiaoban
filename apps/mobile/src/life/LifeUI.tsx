import type { HubStore } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { Keep } from "@xiaoban/protocol";
import { color, dark } from "@xiaoban/tokens";
import { router } from "expo-router";
import { type ReactNode, useMemo, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../ui/Icon.tsx";
import { CloseIcon, TickIcon } from "./LifeIcons.tsx";

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

export function openScene(threadId: string) {
  router.push({ pathname: "/thread/[id]", params: { id: threadId } });
}

export function LifeHeader({
  title,
  sub,
  right,
  onDark = false,
  close = false,
  center = true,
}: {
  title: string;
  sub?: string | undefined;
  right?: ReactNode;
  onDark?: boolean;
  close?: boolean;
  center?: boolean;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const ink = onDark ? dark.text : color.ink;
  return (
    <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
      <Pressable
        style={styles.back}
        accessibilityRole="button"
        accessibilityLabel={t("chat-back")}
        onPress={goBack}
      >
        {close ? <CloseIcon color={ink} /> : <Icon name="back" color={ink} />}
      </Pressable>
      <View style={[styles.headText, center && styles.headCenter]}>
        <Text style={[styles.title, { color: ink }]} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={[styles.sub, onDark && { color: dark.textMuted }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

export function HeaderLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable hitSlop={8} onPress={onPress} accessibilityRole="button">
      <Text style={styles.headerLink}>{label}</Text>
    </Pressable>
  );
}

export function ChatBar({
  store,
  threadId,
  placeholder,
  top,
  disabled = false,
  onSend,
}: {
  store: HubStore;
  threadId: string | null;
  placeholder: string;
  top?: ReactNode;
  disabled?: boolean;
  onSend?: (text: string) => Promise<unknown>;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const send = () => {
    const value = text.trim();
    if (!value || !threadId || disabled) return;
    setText("");
    const sent = onSend
      ? onSend(value)
      : store.send(threadId, value).then(() => openScene(threadId));
    void sent.catch(() => setText(value));
  };
  const ready = Boolean(text.trim() && threadId && !disabled);
  return (
    <View style={[styles.bar, top ? styles.barRaised : null]}>
      {top}
      <View style={[styles.barRow, { paddingBottom: Math.max(insets.bottom, 14) + 4 }]}>
        <TextInput
          style={styles.barInput}
          value={text}
          placeholder={placeholder}
          placeholderTextColor={color.faint}
          returnKeyType="send"
          editable={threadId !== null}
          onChangeText={setText}
          onSubmitEditing={send}
        />
        <Pressable
          style={[styles.barSend, !ready && styles.barSendIdle]}
          accessibilityRole="button"
          accessibilityLabel={t("composer-send")}
          disabled={!ready}
          onPress={send}
        >
          <Icon name="send" size={18} color={color.surface} />
        </Pressable>
      </View>
    </View>
  );
}

export function Sheet({
  open,
  onClose,
  children,
  style,
  above,
  onSheetHeight,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  style?: ViewStyle;
  above?: ReactNode;
  onSheetHeight?: (height: number) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={styles.sheetRoot} behavior="padding">
        <Pressable style={styles.scrim} onPress={onClose} />
        {above}
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) + 16 }, style]}
          onLayout={
            onSheetHeight ? (event) => onSheetHeight(event.nativeEvent.layout.height) : undefined
          }
        >
          <View style={styles.grabber} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SheetAction({
  label,
  danger = false,
  disabled = false,
  onPress,
}: {
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.sheetAction}
      disabled={disabled}
      accessibilityRole="button"
      onPress={onPress}
    >
      <Text
        style={[
          styles.sheetActionText,
          danger && { color: color.dangerInk },
          disabled && { color: color.faint },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function horizontal(dx: number, dy: number) {
  return Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5;
}

export function useSwipeLeft(onSwipe: () => void) {
  const latest = useRef(onSwipe);
  latest.current = onSwipe;
  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dx < 0 && horizontal(gesture.dx, gesture.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -30) latest.current();
        },
      }).panHandlers,
    [],
  );
}

export function SwipeRow({
  action,
  actionColor,
  width,
  background = color.surface,
  enabled = true,
  onAction,
  children,
}: {
  action: string;
  actionColor: string;
  width: number;
  background?: string;
  enabled?: boolean;
  onAction: () => void;
  children: ReactNode;
}) {
  const offset = useRef(new Animated.Value(0)).current;
  const opened = useRef(false);
  const settle = (open: boolean) => {
    opened.current = open;
    Animated.spring(offset, {
      toValue: open ? -width : 0,
      useNativeDriver: true,
      bounciness: 0,
    }).start();
  };
  const handlers = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => enabled && horizontal(gesture.dx, gesture.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, gesture) => {
          const base = opened.current ? -width : 0;
          offset.setValue(Math.max(-width, Math.min(0, base + gesture.dx)));
        },
        onPanResponderRelease: (_, gesture) => {
          const base = opened.current ? -width : 0;
          settle(base + gesture.dx < -width / 2);
        },
        onPanResponderTerminate: () => settle(opened.current),
      }).panHandlers,
    [enabled, width, offset],
  );
  return (
    <View style={styles.swipe}>
      <Pressable
        style={[styles.swipeAction, { width, backgroundColor: actionColor }]}
        accessibilityRole="button"
        onPress={() => {
          settle(false);
          onAction();
        }}
      >
        <Text style={styles.swipeActionText}>{action}</Text>
      </Pressable>
      <Animated.View
        style={{ backgroundColor: background, transform: [{ translateX: offset }] }}
        {...handlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function CardHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={styles.cardHead}>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.flex} />
      {children}
    </View>
  );
}

export function Segment<T extends string>({
  value,
  options,
  onChange,
  style,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.segment, style]} accessibilityRole="tablist">
      {options.map((option) => {
        const on = option.id === value;
        return (
          <Pressable
            key={option.id}
            style={[styles.segmentItem, on && styles.segmentOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(option.id)}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <Pressable
      style={[styles.toggle, on && styles.toggleOn]}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={() => onChange(!on)}
    >
      <View style={[styles.knob, on && styles.knobOn]} />
    </Pressable>
  );
}

export function Checkbox({ on, size = 20 }: { on: boolean; size?: number }) {
  return (
    <View
      style={[
        styles.check,
        { width: size, height: size, borderRadius: size > 18 ? 6 : 5 },
        on ? styles.checkOn : null,
      ]}
    >
      {on ? <TickIcon color={color.surface} /> : null}
    </View>
  );
}

export function KeepTag({ keep }: { keep: Keep }) {
  const { t } = useI18n();
  if (keep === "none") return null;
  const tone =
    keep === "frozen"
      ? { color: color.accentStrong, backgroundColor: color.accentWash }
      : keep === "chilled"
        ? { color: color.success, backgroundColor: color.successSoft }
        : { color: color.inkMid, backgroundColor: color.lineSoft };
  return <Text style={[styles.keep, tone]}>{t(`keep-${keep}`)}</Text>;
}

export function DarkButton({
  label,
  onPress,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      style={[styles.darkButton, disabled && styles.disabled, style]}
      disabled={disabled}
      accessibilityRole="button"
      onPress={onPress}
    >
      <Text style={styles.darkButtonText}>{label}</Text>
    </Pressable>
  );
}

export const life = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 10 },
  note: { fontSize: 12, color: color.faint },
  hint: { fontSize: 12, color: color.faint, lineHeight: 18 },
  link: { fontSize: 12, color: color.accent },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: color.ink },
  input: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: color.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: color.ink,
  },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  fieldLabel: { fontSize: 12, color: color.faint, width: 36 },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 8,
    paddingBottom: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  back: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headText: { flex: 1, minWidth: 0 },
  headCenter: { alignItems: "center" },
  title: { fontSize: 16, fontWeight: "700" },
  sub: { fontSize: 11, color: color.muted, marginTop: 1 },
  right: { minWidth: 44, alignItems: "flex-end", paddingRight: 8 },
  headerLink: { fontSize: 13, color: color.accent },
  bar: {
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.line,
  },
  barRaised: {
    borderTopWidth: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 14,
    paddingHorizontal: 2,
    shadowColor: color.ink,
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
    gap: 2,
  },
  barRow: { flexDirection: "row", gap: 8, paddingTop: 10, paddingHorizontal: 12 },
  barInput: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    backgroundColor: color.ground,
    paddingHorizontal: 14,
    fontSize: 14,
    color: color.ink,
  },
  barSend: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  barSendIdle: { opacity: 0.35 },
  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: color.sheetScrim,
  },
  sheet: {
    maxHeight: "86%",
    backgroundColor: color.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 18,
    gap: 12,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.lineStrong,
  },
  sheetAction: {
    paddingVertical: 13,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
  },
  sheetActionText: { fontSize: 15, color: color.ink },
  swipe: { overflow: "hidden" },
  swipeAction: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  swipeActionText: { fontSize: 13, color: color.surface },
  card: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 13, fontWeight: "700", color: color.ink },
  segment: {
    flexDirection: "row",
    backgroundColor: color.line,
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    height: 36,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentOn: { backgroundColor: color.surface },
  segmentText: { fontSize: 13, fontWeight: "500", color: color.inkMid },
  segmentTextOn: { color: color.ink },
  toggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: color.lineStrong,
    padding: 2,
  },
  toggleOn: { backgroundColor: color.accent, alignItems: "flex-end" },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: color.surface },
  knobOn: {},
  check: {
    borderWidth: 2,
    borderColor: color.checkOff,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: color.accent, borderColor: color.accent },
  keep: {
    fontSize: 11,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
  darkButton: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  darkButtonText: { fontSize: 13, color: color.surface, fontWeight: "500" },
  disabled: { opacity: 0.4 },
});
