import {
  intervalText,
  MIN_EVERY,
  minuteText,
  NOTIFY_OPTIONS,
  notifyText,
  outputText,
  parseMinute,
  ruleText,
  SCHEDULE_WEEKDAYS,
  scheduleWhen,
  stateText,
  stopText,
} from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Schedule, ScheduleRule } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { type ReactNode, useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useHubContext, useHubStore } from "../hub/HubProvider.tsx";
import { openScene } from "../life/LifeUI.tsx";
import { ChevronIcon, TickIcon } from "../trip/TripIcons.tsx";

const INTERVALS = [30, 60, 120, 240, 360, 720];

export function ClockIcon({ tint = color.accent, size = 16 }: { tint?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} fill="none" stroke={tint} strokeWidth={2} />
      <Path
        d="M12 7v5l3 2"
        fill="none"
        stroke={tint}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function Row({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: (() => void) | undefined;
}) {
  return (
    <Pressable
      style={styles.row}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
    >
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      {onPress ? <ChevronIcon color={color.faint} size={11} /> : null}
    </Pressable>
  );
}

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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.rowTop}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.fieldBody}>{children}</View>
    </View>
  );
}

function midnight(ms: number): number {
  const at = new Date(ms);
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

function minuteOf(rule: ScheduleRule): number {
  if (rule.kind === "once") {
    const at = new Date(rule.at);
    return at.getHours() * 60 + at.getMinutes();
  }
  if (rule.kind === "every") return rule.from ?? 8 * 60;
  return rule.minute;
}

export function ScheduleEditor({
  schedule,
  onCancel,
  onSaved,
}: {
  schedule: Schedule;
  onCancel: () => void;
  onSaved: (schedule: Schedule) => void;
}) {
  const { t } = useI18n();
  const store = useHubStore();
  const rule = schedule.rule;
  const [title, setTitle] = useState(schedule.title);
  const [task, setTask] = useState(schedule.task);
  const [time, setTime] = useState(minuteText(minuteOf(rule)));
  const [day, setDay] = useState(rule.kind === "once" ? midnight(rule.at) : midnight(Date.now()));
  const [weekdays, setWeekdays] = useState(rule.kind === "weekly" ? rule.weekdays : [1]);
  const [days, setDays] = useState(rule.kind === "monthly" ? rule.days.join(", ") : "1");
  const [minutes, setMinutes] = useState(rule.kind === "every" ? rule.minutes : 120);
  const [windowed, setWindowed] = useState(rule.kind === "every" && rule.from !== null);
  const [from, setFrom] = useState(
    minuteText(rule.kind === "every" && rule.from !== null ? rule.from : 8 * 60),
  );
  const [to, setTo] = useState(
    minuteText(rule.kind === "every" && rule.to !== null ? rule.to : 22 * 60),
  );
  const [output, setOutput] = useState(schedule.output);
  const [notify, setNotify] = useState(schedule.notify);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const intervals = INTERVALS.includes(minutes) ? INTERVALS : [...INTERVALS, minutes];

  const nextRule = (): ScheduleRule | null => {
    const minute = parseMinute(time);
    switch (rule.kind) {
      case "once":
        return minute === null ? null : { kind: "once", at: day + minute * 60_000 };
      case "daily":
        return minute === null ? null : { kind: "daily", minute };
      case "weekly":
        return minute === null || weekdays.length === 0
          ? null
          : { kind: "weekly", weekdays: [...weekdays].sort(), minute };
      case "monthly": {
        const picked = days
          .split(/[^\d]+/)
          .map(Number)
          .filter((value) => value >= 1 && value <= 31);
        return minute === null || picked.length === 0
          ? null
          : { kind: "monthly", days: [...new Set(picked)].sort((a, b) => a - b), minute };
      }
      case "every": {
        if (!windowed) return { kind: "every", minutes, from: null, to: null };
        const start = parseMinute(from);
        const end = parseMinute(to);
        return start === null || end === null
          ? null
          : { kind: "every", minutes, from: start, to: end };
      }
    }
  };

  const save = async () => {
    const next = nextRule();
    if (!next || !title.trim() || !task.trim()) {
      setInvalid(true);
      return;
    }
    setBusy(true);
    try {
      onSaved(
        await store.updateSchedule({
          ...schedule,
          title: title.trim(),
          task: task.trim(),
          rule: next,
          output,
          notify,
        }),
      );
    } catch {
      setInvalid(true);
    } finally {
      setBusy(false);
    }
  };

  const shift = (by: number) => {
    const at = new Date(day);
    setDay(new Date(at.getFullYear(), at.getMonth(), at.getDate() + by).getTime());
  };

  const timeInput = (
    <TextInput
      style={styles.input}
      value={time}
      onChangeText={setTime}
      keyboardType="numbers-and-punctuation"
      accessibilityLabel={t("schedule-card-when")}
    />
  );

  return (
    <>
      <Field label={t("schedule-edit-name")}>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          accessibilityLabel={t("schedule-edit-name")}
        />
      </Field>
      <Field label={t("schedule-card-task")}>
        <TextInput
          style={[styles.input, styles.multi]}
          value={task}
          onChangeText={setTask}
          multiline
          accessibilityLabel={t("schedule-card-task")}
        />
      </Field>
      {rule.kind === "once" ? (
        <Field label={t("schedule-card-when")}>
          <View style={styles.inline}>
            <Pressable
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("event-day-earlier")}
              style={styles.flip}
              onPress={() => shift(-1)}
            >
              <ChevronIcon color={color.muted} size={12} />
            </Pressable>
            <Text style={styles.dayText}>
              {ruleText(t, { kind: "once", at: day + (parseMinute(time) ?? 0) * 60_000 })}
            </Text>
            <Pressable
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("event-day-later")}
              onPress={() => shift(1)}
            >
              <ChevronIcon color={color.muted} size={12} />
            </Pressable>
          </View>
          {timeInput}
        </Field>
      ) : null}
      {rule.kind === "daily" ? <Field label={t("schedule-card-when")}>{timeInput}</Field> : null}
      {rule.kind === "weekly" ? (
        <Field label={t("schedule-card-when")}>
          <View style={styles.chips}>
            {SCHEDULE_WEEKDAYS.map((key, index) => {
              const value = index + 1;
              const on = weekdays.includes(value);
              return (
                <Chip
                  key={key}
                  text={t(key)}
                  on={on}
                  onPress={() =>
                    setWeekdays(
                      on ? weekdays.filter((item) => item !== value) : [...weekdays, value],
                    )
                  }
                />
              );
            })}
          </View>
          {timeInput}
        </Field>
      ) : null}
      {rule.kind === "monthly" ? (
        <Field label={t("schedule-edit-days")}>
          <TextInput
            style={styles.input}
            value={days}
            onChangeText={setDays}
            placeholder={t("schedule-edit-days-hint")}
            placeholderTextColor={color.faded}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel={t("schedule-edit-days")}
          />
          {timeInput}
        </Field>
      ) : null}
      {rule.kind === "every" ? (
        <>
          <Field label={t("schedule-card-every")}>
            <View style={styles.chips}>
              {intervals
                .filter((value) => value >= MIN_EVERY)
                .map((value) => (
                  <Chip
                    key={value}
                    text={intervalText(t, value)}
                    on={value === minutes}
                    onPress={() => setMinutes(value)}
                  />
                ))}
            </View>
          </Field>
          <Field label={t("schedule-edit-window")}>
            <View style={styles.chips}>
              <Chip
                text={t("schedule-window-all")}
                on={!windowed}
                onPress={() => setWindowed(false)}
              />
              <Chip
                text={t("schedule-rule-window", { from, to })}
                on={windowed}
                onPress={() => setWindowed(true)}
              />
            </View>
            {windowed ? (
              <View style={styles.inline}>
                <TextInput
                  style={styles.input}
                  value={from}
                  onChangeText={setFrom}
                  keyboardType="numbers-and-punctuation"
                  accessibilityLabel={t("schedule-edit-window")}
                />
                <TextInput
                  style={styles.input}
                  value={to}
                  onChangeText={setTo}
                  keyboardType="numbers-and-punctuation"
                  accessibilityLabel={t("schedule-edit-window")}
                />
              </View>
            ) : null}
          </Field>
        </>
      ) : null}
      <Field label={t("schedule-card-output")}>
        <View style={styles.chips}>
          <Chip
            text={t("schedule-output-new", { title: title.trim() || schedule.title })}
            on={output === "new_thread"}
            onPress={() => setOutput("new_thread")}
          />
          <Chip
            text={t("schedule-output-same")}
            on={output === "same_thread"}
            onPress={() => setOutput("same_thread")}
          />
        </View>
      </Field>
      <Field label={t("schedule-card-notify")}>
        <View style={styles.chips}>
          {NOTIFY_OPTIONS.map((option) => (
            <Chip
              key={option}
              text={notifyText(t, option)}
              on={option === notify}
              onPress={() => setNotify(option)}
            />
          ))}
        </View>
      </Field>
      {invalid ? <Text style={styles.invalid}>{t("schedule-time-invalid")}</Text> : null}
      <PairButtons
        solid={t("schedule-edit-done")}
        line={t("dialog-cancel")}
        busy={busy}
        onSolid={() => void save()}
        onLine={onCancel}
      />
    </>
  );
}

export function PairButtons({
  solid,
  line,
  busy,
  onSolid,
  onLine,
}: {
  solid: string;
  line: string;
  busy: boolean;
  onSolid: () => void;
  onLine: () => void;
}) {
  return (
    <View style={styles.buttons}>
      <Pressable
        style={[styles.button, styles.solid, busy && styles.disabled]}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onSolid}
      >
        <Text style={styles.solidText}>{solid}</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.line]} accessibilityRole="button" onPress={onLine}>
        <Text style={styles.lineText}>{line}</Text>
      </Pressable>
    </View>
  );
}

export function ScheduleRows({
  schedule,
  onEdit,
}: {
  schedule: Schedule;
  onEdit?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const every = schedule.rule.kind === "every";
  return (
    <>
      <Row
        label={t(every ? "schedule-card-every" : "schedule-card-when")}
        value={ruleText(t, schedule.rule)}
        onPress={onEdit}
      />
      {every ? null : (
        <Row label={t("schedule-card-task")} value={schedule.task} onPress={onEdit} />
      )}
      {schedule.stop.kind === "never" ? null : (
        <Row label={t("schedule-card-stop")} value={stopText(t, schedule.stop)} onPress={onEdit} />
      )}
      {every ? null : (
        <Row label={t("schedule-card-output")} value={outputText(t, schedule)} onPress={onEdit} />
      )}
      <Row
        label={t("schedule-card-notify")}
        value={notifyText(t, schedule.notify)}
        onPress={onEdit}
      />
    </>
  );
}

export function ScheduleCard({ scheduleId }: { scheduleId: string }) {
  const { t } = useI18n();
  const store = useHubStore();
  const { onComputer } = useHubContext();
  const { schedules, status } = useHubState(store);
  const schedule = schedules[scheduleId];
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "open" && !schedule) void store.loadSchedule(scheduleId).catch(() => undefined);
  }, [status, schedule, store, scheduleId]);

  if (!schedule) return null;
  const draft = schedule.state === "draft";

  const start = async () => {
    setBusy(true);
    try {
      await store.startSchedule(schedule.id);
    } catch {
      Alert.alert(t("schedule-start-failed"));
    } finally {
      setBusy(false);
    }
  };

  const target = schedule.threadId;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <ClockIcon />
        <Text style={styles.title} numberOfLines={2}>
          {schedule.title}
        </Text>
      </View>
      {editing ? (
        <ScheduleEditor
          schedule={schedule}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <>
          <ScheduleRows schedule={schedule} onEdit={draft ? () => setEditing(true) : undefined} />
          {draft ? (
            <>
              <Text style={styles.foot}>
                {t(onComputer ? "schedule-foot-computer" : "schedule-foot-phone")}
              </Text>
              <PairButtons
                solid={t("schedule-start")}
                line={t("schedule-edit")}
                busy={busy}
                onSolid={() => void start()}
                onLine={() => setEditing(true)}
              />
            </>
          ) : (
            <View style={styles.done}>
              <TickIcon color={color.success} />
              <Text style={styles.doneText} numberOfLines={1}>
                {schedule.state === "active" && schedule.nextAt !== null
                  ? t("schedule-started", { next: scheduleWhen(t, schedule.nextAt) })
                  : stateText(t, schedule)}
              </Text>
              <View style={styles.flex} />
              {target ? (
                <Pressable hitSlop={6} accessibilityRole="link" onPress={() => openScene(target)}>
                  <Text style={styles.link}>{t("schedule-open")}</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    width: 320,
    maxWidth: "100%",
    backgroundColor: color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    padding: 12,
    gap: 9,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: "700", color: color.ink },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  label: { width: 56, fontSize: 13, lineHeight: 19, color: color.faded },
  value: { flex: 1, fontSize: 13, lineHeight: 19, color: color.ink },
  fieldBody: { flex: 1, gap: 6 },
  inline: { flexDirection: "row", alignItems: "center", gap: 8 },
  foot: { fontSize: 11, color: color.faded },
  buttons: { flexDirection: "row", gap: 8 },
  button: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  solid: { backgroundColor: color.ink },
  solidText: { fontSize: 13, fontWeight: "600", color: color.surface },
  line: { borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.surface },
  lineText: { fontSize: 13, color: color.ink },
  disabled: { opacity: 0.5 },
  done: { flexDirection: "row", alignItems: "center", gap: 6 },
  doneText: { fontSize: 13, color: color.success, flexShrink: 1 },
  flex: { flex: 1 },
  link: { fontSize: 13, color: color.accent },
  flip: { transform: [{ rotate: "180deg" }] },
  dayText: { fontSize: 13, color: color.ink, textAlign: "center" },
  input: {
    flex: 1,
    minHeight: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.lineStrong,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    color: color.ink,
  },
  multi: { minHeight: 56, textAlignVertical: "top" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.lineStrong,
  },
  chipOn: { backgroundColor: color.ink, borderColor: color.ink },
  chipText: { fontSize: 12, color: color.ink },
  chipTextOn: { color: color.surface },
  invalid: { fontSize: 12, color: color.dangerInk },
});
