import { useI18n } from "@xiaoban/i18n/react";
import type { Message, Quote } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sheet } from "../life/LifeUI.tsx";
import { useReduceMotion } from "../ui/useReduceMotion.ts";
import { Bubble } from "./Bubble.tsx";
import { quoteOf } from "./rows.ts";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MenuTarget {
  message: Message;
  root: string | null;
  rect: Rect;
}

export interface MenuActions {
  onCopy: (text: string) => void;
  onQuote: (quote: Quote) => void;
  onSpeak: (text: string) => void;
  onRegenerate: (root: string) => void;
  onNewThreadWith: (quote: Quote) => void;
  onLookUp: (quote: Quote) => void;
}

const GAP = 12;

function Lifted({ target, sheetHeight }: { target: MenuTarget; sheetHeight: number }) {
  const reduced = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const lift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      lift.setValue(1);
      return;
    }
    Animated.spring(lift, {
      toValue: 1,
      friction: 6,
      tension: 160,
      useNativeDriver: true,
    }).start();
  }, [lift, reduced]);
  const { rect, message } = target;
  const floor = sheetHeight > 0 ? height - sheetHeight - GAP : height;
  const ceiling = insets.top + GAP;
  const top = Math.max(ceiling, Math.min(rect.y, floor - rect.height));
  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.lifted,
        {
          top,
          left: rect.x,
          width: rect.width,
          transform: [{ scale }],
        },
      ]}
    >
      <View style={[styles.liftedClip, { maxHeight: Math.max(80, floor - ceiling) }]}>
        <Bubble from={message.role} text={message.text} quote={message.quote} />
      </View>
    </Animated.View>
  );
}

function MenuRow({
  label,
  note,
  disabled = false,
  onPress,
}: {
  label: string;
  note?: string | undefined;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && !disabled && styles.rowPressed]}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
    >
      <Text style={[styles.rowText, disabled && styles.rowDisabled]}>{label}</Text>
      {note ? <Text style={styles.rowNote}>{note}</Text> : null}
    </Pressable>
  );
}

function SelectText({
  message,
  running,
  actions,
  onDone,
}: {
  message: Message;
  running: boolean;
  actions: MenuActions;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [range, setRange] = useState({ start: 0, end: 0 });
  const picked = message.text.slice(range.start, range.end).trim();
  const run = (action: (quote: Quote) => void) => {
    action(quoteOf(message, picked));
    onDone();
  };
  return (
    <View style={styles.select}>
      {picked ? (
        <View style={styles.bar}>
          <Pressable
            style={styles.barItem}
            accessibilityRole="button"
            onPress={() => {
              actions.onCopy(picked);
              onDone();
            }}
          >
            <Text style={styles.barText}>{t("menu-copy")}</Text>
          </Pressable>
          <View style={styles.barRule} />
          <Pressable
            style={styles.barItem}
            accessibilityRole="button"
            onPress={() => run(actions.onQuote)}
          >
            <Text style={styles.barText}>{t("menu-quote-selection")}</Text>
          </Pressable>
          <View style={styles.barRule} />
          <Pressable
            style={styles.barItem}
            accessibilityRole="button"
            onPress={() => run(actions.onNewThreadWith)}
          >
            <Text style={styles.barText}>{t("menu-new-thread-with")}</Text>
          </Pressable>
          <View style={styles.barRule} />
          <Pressable
            style={styles.barItem}
            accessibilityRole="button"
            disabled={running}
            onPress={() => run(actions.onLookUp)}
          >
            <Text style={[styles.barText, running && styles.barDisabled]}>{t("menu-look-up")}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.hint}>{t("select-text-hint")}</Text>
      )}
      <TextInput
        style={styles.selectInput}
        value={message.text}
        multiline
        scrollEnabled
        autoFocus
        showSoftInputOnFocus={false}
        contextMenuHidden
        caretHidden
        autoCorrect={false}
        spellCheck={false}
        onChangeText={() => undefined}
        onSelectionChange={(event) => setRange(event.nativeEvent.selection)}
      />
    </View>
  );
}

export function MessageMenu({
  target,
  latest,
  running,
  speaking,
  actions,
  onClose,
}: {
  target: MenuTarget | null;
  latest: boolean;
  running: boolean;
  speaking: boolean;
  actions: MenuActions;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [selecting, setSelecting] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const [shown, setShown] = useState<MenuTarget | null>(target);
  if (target && target !== shown) {
    setShown(target);
    setSelecting(false);
    setSheetHeight(0);
  }
  const current = target ?? shown;
  if (!current) return null;
  const { message, root } = current;
  const act = (action: () => void) => {
    action();
    onClose();
  };
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      onSheetHeight={setSheetHeight}
      above={selecting ? null : <Lifted target={current} sheetHeight={sheetHeight} />}
    >
      {selecting ? (
        <SelectText message={message} running={running} actions={actions} onDone={onClose} />
      ) : (
        <View>
          <MenuRow label={t("menu-copy")} onPress={() => act(() => actions.onCopy(message.text))} />
          <MenuRow label={t("menu-select-text")} onPress={() => setSelecting(true)} />
          <MenuRow
            label={t("menu-quote")}
            onPress={() => act(() => actions.onQuote(quoteOf(message, message.text)))}
          />
          {root !== null && (
            <>
              <MenuRow
                label={speaking ? t("menu-stop-reading") : t("menu-read-aloud")}
                onPress={() => act(() => actions.onSpeak(message.text))}
              />
              <MenuRow
                label={t("menu-regenerate")}
                note={latest ? undefined : t("menu-regenerate-last-only")}
                disabled={!latest || running}
                onPress={() => act(() => actions.onRegenerate(root))}
              />
            </>
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  liftedClip: { overflow: "hidden" },
  lifted: {
    position: "absolute",
    borderRadius: 18,
    shadowColor: color.ink,
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 50,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: color.lineSoft,
  },
  rowPressed: { backgroundColor: color.ground },
  rowText: { fontSize: 16, color: color.ink },
  rowDisabled: { color: color.faint },
  rowNote: { fontSize: 12, color: color.faint },
  select: { gap: 10 },
  hint: { fontSize: 12, color: color.muted, textAlign: "center", paddingVertical: 10 },
  bar: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: color.ink,
    paddingHorizontal: 4,
  },
  barItem: { paddingVertical: 10, paddingHorizontal: 10 },
  barText: { fontSize: 13, color: color.surface },
  barDisabled: { color: color.faded },
  barRule: { width: 1, height: 14, backgroundColor: color.inkMid },
  selectInput: {
    maxHeight: 360,
    minHeight: 120,
    padding: 12,
    borderRadius: 12,
    backgroundColor: color.ground,
    fontSize: 15,
    lineHeight: 24,
    color: color.ink,
    textAlignVertical: "top",
  },
});
