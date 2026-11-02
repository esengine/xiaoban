import { minuteText, parseMinute, SCHEDULE_WEEKDAYS, TODO_SOURCE_KEYS } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { Todo, TodoRepeat } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";
import { DarkButton, life, Sheet, SheetAction } from "../life/LifeUI.tsx";
import { TickIcon } from "../trip/TripIcons.tsx";

export function TodoCircle({
  done,
  overdue = false,
  label,
  onPress,
}: {
  done: boolean;
  overdue?: boolean;
  label: string;
  onPress?: (() => void) | undefined;
}) {
  return (
    <Pressable
      hitSlop={10}
      disabled={!onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: done }}
      onPress={onPress}
      style={[styles.circle, overdue && styles.circleLate, done && styles.circleDone]}
    >
      {done ? <TickIcon color={color.surface} size={12} /> : null}
    </Pressable>
  );
}

export function TodoRow({
  todo,
  line,
  repeat,
  overdue = false,
  first = false,
  onToggle,
  onPress,
}: {
  todo: Todo;
  line: string;
  repeat?: string | null | undefined;
  overdue?: boolean;
  first?: boolean;
  onToggle?: (() => void) | undefined;
  onPress?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const done = todo.state === "done";
  return (
    <View style={[styles.row, !first && styles.divided]}>
      <TodoCircle
        done={done}
        overdue={overdue}
        label={t("todo-check", { title: todo.title })}
        onPress={onToggle}
      />
      <Pressable
        style={styles.rowText}
        disabled={!onPress}
        accessibilityRole={onPress ? "button" : undefined}
        onPress={onPress}
      >
        <Text style={[styles.title, done && styles.titleDone]} numberOfLines={2}>
          {todo.title}
        </Text>
        {line || repeat ? (
          <Text style={[styles.line, overdue && styles.lineLate]} numberOfLines={1}>
            {line}
            {repeat ? (
              <Text style={styles.repeat}>
                {`${line ? " " : ""}${t("todo-repeat-mark", { repeat })}`}
              </Text>
            ) : null}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

export function ButtonPair({
  line,
  solid,
  busy = false,
  onLine,
  onSolid,
}: {
  line: string;
  solid: string;
  busy?: boolean;
  onLine: () => void;
  onSolid: () => void;
}) {
  return (
    <View style={styles.buttons}>
      <Pressable
        style={[styles.button, styles.lineButton, busy && styles.disabled]}
        disabled={busy}
        accessibilityRole="button"
        onPress={onLine}
      >
        <Text style={styles.lineText}>{line}</Text>
      </Pressable>
      <Pressable
        style={[styles.button, styles.solidButton, busy && styles.disabled]}
        disabled={busy}
        accessibilityRole="button"
        onPress={onSolid}
      >
        <Text style={styles.solidText}>{solid}</Text>
      </Pressable>
    </View>
  );
}

type RepeatKind = "none" | TodoRepeat["kind"];

function Chip({ text, on, onPress }: { text: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{text}</Text>
    </Pressable>
  );
}

function daysOf(text: string): number[] {
  return [
    ...new Set(
      text
        .split(/[^0-9]+/)
        .map(Number)
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31),
    ),
  ].sort((a, b) => a - b);
}

export function TodoEditor({ todo, onClose }: { todo: Todo | null; onClose: () => void }) {
  const { t } = useI18n();
  const store = useHubStore();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [kind, setKind] = useState<RepeatKind>("none");
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [days, setDays] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!todo) return;
    setTitle(todo.title);
    setDate(todo.date ?? "");
    setTime(todo.minute === null ? "" : minuteText(todo.minute));
    setKind(todo.repeat?.kind ?? "none");
    setWeekdays(todo.repeat?.kind === "weekly" ? todo.repeat.weekdays : []);
    setDays(todo.repeat?.kind === "monthly" ? todo.repeat.days.join(", ") : "");
    setNote(todo.note);
  }, [todo]);

  if (!todo) return null;

  const save = async () => {
    const cleanDate = date.trim();
    if (cleanDate && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      Alert.alert(t("todo-edit-bad-date"));
      return;
    }
    const minute = time.trim() ? parseMinute(time) : null;
    if (time.trim() && minute === null) {
      Alert.alert(t("todo-edit-bad-time"));
      return;
    }
    const repeat: TodoRepeat | null =
      kind === "daily"
        ? { kind: "daily" }
        : kind === "weekly" && weekdays.length > 0
          ? { kind: "weekly", weekdays: [...weekdays].sort((a, b) => a - b) }
          : kind === "monthly" && daysOf(days).length > 0
            ? { kind: "monthly", days: daysOf(days) }
            : null;
    setBusy(true);
    try {
      await store.updateTodo({
        ...todo,
        title: title.trim() || todo.title,
        date: cleanDate || null,
        minute,
        repeat,
        note: note.trim(),
      });
      onClose();
    } catch {
      Alert.alert(t("todo-action-failed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    onClose();
    void store.deleteTodo(todo.id).catch(() => Alert.alert(t("todo-action-failed")));
  };

  const source = [t(TODO_SOURCE_KEYS[todo.source.kind]), todo.source.detail]
    .filter(Boolean)
    .join(t("todo-dot"));

  return (
    <Sheet open onClose={onClose}>
      <Text style={life.sheetTitle}>{t("todo-edit-title")}</Text>
      <View style={life.fieldRow}>
        <Text style={styles.fieldLabel}>{t("todo-edit-name")}</Text>
        <TextInput style={life.input} value={title} onChangeText={setTitle} />
      </View>
      <View style={life.fieldRow}>
        <Text style={styles.fieldLabel}>{t("todo-edit-date")}</Text>
        <TextInput
          style={life.input}
          value={date}
          placeholder={t("todo-edit-date-hint")}
          placeholderTextColor={color.faded}
          keyboardType="numbers-and-punctuation"
          onChangeText={setDate}
        />
      </View>
      <View style={life.fieldRow}>
        <Text style={styles.fieldLabel}>{t("todo-edit-time")}</Text>
        <TextInput
          style={life.input}
          value={time}
          placeholder={t("todo-edit-time-hint")}
          placeholderTextColor={color.faded}
          keyboardType="numbers-and-punctuation"
          onChangeText={setTime}
        />
      </View>
      <View style={styles.fieldTop}>
        <Text style={styles.fieldLabel}>{t("todo-edit-repeat")}</Text>
        <View style={styles.fieldBody}>
          <View style={styles.chips}>
            <Chip
              text={t("todo-repeat-none")}
              on={kind === "none"}
              onPress={() => setKind("none")}
            />
            <Chip
              text={t("todo-repeat-daily")}
              on={kind === "daily"}
              onPress={() => setKind("daily")}
            />
            <Chip
              text={t("todo-repeat-weekly-option")}
              on={kind === "weekly"}
              onPress={() => setKind("weekly")}
            />
            <Chip
              text={t("todo-repeat-monthly-option")}
              on={kind === "monthly"}
              onPress={() => setKind("monthly")}
            />
          </View>
          {kind === "weekly" ? (
            <View style={styles.chips}>
              {SCHEDULE_WEEKDAYS.map((key, index) => {
                const day = index + 1;
                const on = weekdays.includes(day);
                return (
                  <Chip
                    key={key}
                    text={t(key)}
                    on={on}
                    onPress={() =>
                      setWeekdays((list) =>
                        on ? list.filter((item) => item !== day) : [...list, day],
                      )
                    }
                  />
                );
              })}
            </View>
          ) : null}
          {kind === "monthly" ? (
            <TextInput
              style={[life.input, styles.small]}
              value={days}
              placeholder={t("todo-edit-days-hint")}
              placeholderTextColor={color.faded}
              keyboardType="numbers-and-punctuation"
              onChangeText={setDays}
            />
          ) : null}
        </View>
      </View>
      <View style={styles.fieldTop}>
        <Text style={styles.fieldLabel}>{t("todo-edit-note")}</Text>
        <TextInput
          style={[life.input, styles.note]}
          value={note}
          multiline
          onChangeText={setNote}
        />
      </View>
      {source ? (
        <View style={life.fieldRow}>
          <Text style={styles.fieldLabel}>{t("todo-edit-source")}</Text>
          <Text style={styles.source}>{source}</Text>
        </View>
      ) : null}
      <DarkButton label={t("todo-save")} disabled={busy} onPress={() => void save()} />
      <SheetAction label={t("todo-delete")} danger onPress={remove} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: color.todoRing,
    alignItems: "center",
    justifyContent: "center",
  },
  circleLate: { borderColor: color.todoOverdue },
  circleDone: { borderWidth: 0, backgroundColor: color.accent },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  divided: { borderTopWidth: 1, borderTopColor: color.lineSoft },
  rowText: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, color: color.ink },
  titleDone: { color: color.faded, textDecorationLine: "line-through" },
  line: { fontSize: 12, marginTop: 2, color: color.faded },
  lineLate: { color: color.todoOverdue },
  repeat: { fontSize: 11, color: color.faded },
  buttons: { flexDirection: "row", gap: 8 },
  button: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  solidButton: { backgroundColor: color.ink },
  solidText: { fontSize: 13, fontWeight: "600", color: color.surface },
  lineButton: { borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.surface },
  lineText: { fontSize: 13, color: color.ink },
  disabled: { opacity: 0.5 },
  fieldLabel: { fontSize: 12, color: color.faint, width: 56 },
  fieldTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  fieldBody: { flex: 1, gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.lineStrong,
  },
  chipOn: { backgroundColor: color.ink, borderColor: color.ink },
  chipText: { fontSize: 12, color: color.ink },
  chipTextOn: { color: color.surface },
  small: { flex: 0 },
  note: { minHeight: 64, height: undefined, paddingVertical: 8, textAlignVertical: "top" },
  source: { flex: 1, fontSize: 13, color: color.inkMid },
});
