import type { Translator } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Sheet } from "../life/LifeUI.tsx";
import {
  allowed,
  askAccess,
  type CalendarChoice,
  choose,
  currentTarget,
  savedCalendar,
  sourceName,
  type Target,
} from "./device.ts";

type Translate = Translator["t"];

export function calendarName(t: Translate, choice: CalendarChoice): string {
  return t(choice === "xiaoban" ? "calendar-xiaoban" : "calendar-mine");
}

export function deniedAlert(t: Translate): void {
  Alert.alert(t("calendar-denied-title"), t("calendar-denied-body"), [
    { text: t("dialog-cancel"), style: "cancel" },
    { text: t("calendar-open-settings"), onPress: () => void Linking.openSettings() },
  ]);
}

export async function grantAndChoose(t: Translate, choice: CalendarChoice): Promise<Target | null> {
  if (!(await allowed()) && !(await askAccess())) {
    deniedAlert(t);
    return null;
  }
  return choose(choice, t("calendar-xiaoban")).catch(() => null);
}

export function useSourceName(open: boolean): string | null {
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void sourceName().then((name) => {
      if (live) setSource(name);
    });
    return () => {
      live = false;
    };
  }, [open]);
  return source;
}

export function ChoiceList({
  choice,
  source,
  onPick,
}: {
  choice: CalendarChoice;
  source: string | null;
  onPick: (choice: CalendarChoice) => void;
}) {
  const { t } = useI18n();
  const options: { value: CalendarChoice; note: string }[] = [
    {
      value: "mine",
      note: source ? t("calendar-mine-note-source", { source }) : t("calendar-mine-note"),
    },
    { value: "xiaoban", note: t("calendar-xiaoban-note") },
  ];
  return (
    <View style={styles.options}>
      {options.map((option) => {
        const on = option.value === choice;
        return (
          <Pressable
            key={option.value}
            style={[styles.option, on && styles.optionOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onPick(option.value)}
          >
            <View style={[styles.radio, on && styles.radioOn]}>
              {on ? <View style={styles.radioDot} /> : null}
            </View>
            <View style={styles.optionBody}>
              <Text style={styles.optionName}>{calendarName(t, option.value)}</Text>
              <Text style={styles.optionNote}>{option.note}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SheetButtons({
  cancel,
  confirm,
  disabled = false,
  onCancel,
  onConfirm,
}: {
  cancel: string;
  confirm: string;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <View style={styles.buttons}>
      <Pressable style={[styles.button, styles.line]} accessibilityRole="button" onPress={onCancel}>
        <Text style={styles.lineText}>{cancel}</Text>
      </Pressable>
      <Pressable
        style={[styles.button, styles.solid, disabled && styles.disabled]}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onConfirm}
      >
        <Text style={styles.solidText}>{confirm}</Text>
      </Pressable>
    </View>
  );
}

function PickSheet({
  open,
  choice,
  granted,
  onPick,
  onCancel,
  onNext,
}: {
  open: boolean;
  choice: CalendarChoice;
  granted: boolean;
  onPick: (choice: CalendarChoice) => void;
  onCancel: () => void;
  onNext: () => void;
}) {
  const { t } = useI18n();
  const source = useSourceName(open);
  return (
    <Sheet open={open} onClose={onCancel}>
      <Text style={styles.title}>{t("calendar-pick-title")}</Text>
      <Text style={styles.body}>{t("calendar-pick-body")}</Text>
      <ChoiceList choice={choice} source={source} onPick={onPick} />
      <SheetButtons
        cancel={t("dialog-cancel")}
        confirm={t(granted ? "calendar-pick-use" : "calendar-pick-next")}
        onCancel={onCancel}
        onConfirm={onNext}
      />
      <Text style={styles.foot}>{t("calendar-pick-foot")}</Text>
    </Sheet>
  );
}

export function useCalendarTarget(): { ensure: () => Promise<Target | null>; sheet: ReactNode } {
  const { t } = useI18n();
  const pending = useRef<((target: Target | null) => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<CalendarChoice>("mine");
  const [granted, setGranted] = useState(false);

  const ensure = useCallback(async (): Promise<Target | null> => {
    const saved = await savedCalendar();
    const access = await allowed();
    if (saved && access) {
      const target = await currentTarget(t("calendar-xiaoban")).catch(() => null);
      if (target) return target;
    }
    setGranted(access);
    setChoice(saved?.choice ?? "mine");
    pending.current?.(null);
    setOpen(true);
    return new Promise((resolve) => {
      pending.current = resolve;
    });
  }, [t]);

  const finish = (picked: CalendarChoice | null) => {
    const resolve = pending.current;
    pending.current = null;
    setOpen(false);
    if (!resolve) return;
    if (!picked) {
      resolve(null);
      return;
    }
    void grantAndChoose(t, picked).then(resolve);
  };

  const sheet = (
    <PickSheet
      open={open}
      choice={choice}
      granted={granted}
      onPick={setChoice}
      onCancel={() => finish(null)}
      onNext={() => finish(choice)}
    />
  );
  return { ensure, sheet };
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "700", color: color.ink },
  body: { fontSize: 13, lineHeight: 21, color: color.muted },
  options: { gap: 12 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.line,
  },
  optionOn: { borderColor: color.accent },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: color.checkOff,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: color.accent },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent },
  optionBody: { flex: 1, minWidth: 0 },
  optionName: { fontSize: 14, fontWeight: "600", color: color.ink },
  optionNote: { fontSize: 12, color: color.faded, marginTop: 2 },
  buttons: { flexDirection: "row", gap: 8, marginTop: 4 },
  button: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  line: { borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.surface },
  lineText: { fontSize: 13, color: color.ink },
  solid: { backgroundColor: color.ink },
  solidText: { fontSize: 13, fontWeight: "600", color: color.surface },
  disabled: { opacity: 0.5 },
  foot: { fontSize: 11, color: color.faded, textAlign: "center" },
});
