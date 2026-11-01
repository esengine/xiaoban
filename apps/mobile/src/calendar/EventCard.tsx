import { clockOf, dayKey, monthDay, reminderText, weekday, whenText } from "@xiaoban/client";
import type { Translator } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { EventDraft } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CalendarIcon, ChevronIcon, TickIcon } from "../trip/TripIcons.tsx";
import { calendarName, SheetButtons, useCalendarTarget } from "./CalendarPicker.tsx";
import { addEvent, type EventFields, firstBusy, openEvent, removeEvent } from "./device.ts";
import { setEventRecord, useEventRecord } from "./records.ts";

type Translate = Translator["t"];

const REMINDERS: (number | null)[] = [null, 10, 30, 60, 1440];
const HOUR = 3_600_000;
const DAY = 86_400_000;

export function fieldsOf(draft: EventDraft): EventFields {
  return {
    title: draft.title,
    start: draft.start,
    end: draft.end,
    location: draft.location,
    notes: draft.notes,
    reminder: draft.reminder,
  };
}

function calendarApp(t: Translate): string {
  const brand = Platform.OS === "android" ? (Platform.constants as { Brand?: string }).Brand : "";
  return t(/xiaomi|redmi|poco/i.test(brand ?? "") ? "event-app-xiaomi" : "event-app-system");
}

function parseClock(text: string): number | null {
  const match = /^(\d{1,2})[:\uFF1A](\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * HOUR + minutes * 60_000;
}

function midnight(ms: number): number {
  const at = new Date(ms);
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function PairButtons({
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

function Editor({
  draft,
  onCancel,
  onSave,
}: {
  draft: EventDraft;
  onCancel: () => void;
  onSave: (draft: EventDraft) => void;
}) {
  const { t } = useI18n();
  const [day, setDay] = useState(midnight(draft.start));
  const [start, setStart] = useState(clockOf(draft.start));
  const [end, setEnd] = useState(clockOf(draft.end));
  const [location, setLocation] = useState(draft.location);
  const [reminder, setReminder] = useState(draft.reminder);
  const [invalid, setInvalid] = useState(false);
  const options = REMINDERS.includes(reminder) ? REMINDERS : [...REMINDERS, reminder];
  const shift = (days: number) => {
    const at = new Date(day);
    setDay(new Date(at.getFullYear(), at.getMonth(), at.getDate() + days).getTime());
  };
  const save = () => {
    const from = parseClock(start);
    const to = parseClock(end);
    if (from === null || to === null) {
      setInvalid(true);
      return;
    }
    const startAt = new Date(day + from).getTime();
    const endAt = to > from ? day + to : day + to + DAY;
    onSave({ ...draft, start: startAt, end: endAt, location: location.trim(), reminder });
  };
  const key = dayKey(day);
  return (
    <>
      <View style={styles.row}>
        <Text style={styles.label}>{t("event-date")}</Text>
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("event-day-earlier")}
          onPress={() => shift(-1)}
          style={styles.flip}
        >
          <ChevronIcon color={color.muted} size={12} />
        </Pressable>
        <Text style={styles.dayText}>
          {monthDay(t, key)} {weekday(t, key)}
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
      <View style={styles.row}>
        <Text style={styles.label}>{t("event-start")}</Text>
        <TextInput
          style={styles.input}
          value={start}
          onChangeText={setStart}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel={t("event-start")}
        />
        <Text style={styles.label}>{t("event-end")}</Text>
        <TextInput
          style={styles.input}
          value={end}
          onChangeText={setEnd}
          keyboardType="numbers-and-punctuation"
          accessibilityLabel={t("event-end")}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{t("event-card-place")}</Text>
        <TextInput
          style={[styles.input, styles.wide]}
          value={location}
          onChangeText={setLocation}
          placeholder={t("event-place-empty")}
          placeholderTextColor={color.faded}
          accessibilityLabel={t("event-card-place")}
        />
      </View>
      <View style={styles.rowTop}>
        <Text style={styles.label}>{t("event-card-remind")}</Text>
        <View style={styles.chips}>
          {options.map((option) => {
            const on = option === reminder;
            return (
              <Pressable
                key={option ?? "none"}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setReminder(option)}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {reminderText(t, option)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {invalid ? <Text style={styles.invalid}>{t("event-time-invalid")}</Text> : null}
      <SheetButtons
        cancel={t("dialog-cancel")}
        confirm={t("event-edit-done")}
        onCancel={onCancel}
        onConfirm={save}
      />
    </>
  );
}

export function EventCard({ event }: { event: EventDraft }) {
  const { t } = useI18n();
  const record = useEventRecord(event.id);
  const { ensure, sheet } = useCalendarTarget();
  const draft = record?.draft ?? event;
  const eventId = record?.eventId ?? null;
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clash, setClash] = useState<{ title: string; start: number } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (eventId) {
      setClash(null);
      return;
    }
    let live = true;
    void firstBusy(draft.start, draft.end, null).then((found) => {
      if (live) setClash(found);
    });
    return () => {
      live = false;
    };
  }, [draft.start, draft.end, eventId]);

  const add = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const target = await ensure();
      if (!target) return;
      const id = await addEvent(target.id, fieldsOf(draft));
      setEventRecord(event.id, { draft, eventId: id, choice: target.choice });
    } catch {
      Alert.alert(t("event-add-failed"));
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!eventId) return;
    await removeEvent(eventId);
    setEventRecord(event.id, { draft, eventId: null, choice: null });
    setDismissed(true);
  };

  const save = (next: EventDraft) => {
    setEventRecord(event.id, { draft: next, eventId: null, choice: null });
    setEditing(false);
  };

  const conflict = clash !== null && !eventId && !editing && !dismissed;
  const head = (
    <View style={styles.head}>
      <CalendarIcon color={color.accent} />
      <Text style={styles.title} numberOfLines={2}>
        {draft.title}
      </Text>
    </View>
  );

  if (conflict) {
    return (
      <View style={[styles.card, styles.clashCard]}>
        {head}
        <Text style={styles.plain}>{whenText(t, draft.start, draft.end)}</Text>
        <Text style={styles.clash}>
          {t("event-clash", { time: clockOf(clash.start), title: clash.title })}
        </Text>
        <PairButtons
          solid={t("event-add-anyway")}
          line={t("event-other-time")}
          busy={busy}
          onSolid={() => void add()}
          onLine={() => setEditing(true)}
        />
        {sheet}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      {head}
      {editing ? (
        <Editor draft={draft} onCancel={() => setEditing(false)} onSave={save} />
      ) : (
        <>
          <Row label={t("event-card-time")} value={whenText(t, draft.start, draft.end)} />
          {draft.location ? <Row label={t("event-card-place")} value={draft.location} /> : null}
          <Row label={t("event-card-remind")} value={reminderText(t, draft.reminder)} />
          {eventId ? (
            <View style={styles.done}>
              <TickIcon color={color.success} />
              <Text style={styles.doneText} numberOfLines={1}>
                {t("event-added", { calendar: calendarName(t, record?.choice ?? "mine") })}
              </Text>
              <View style={styles.flex} />
              <Pressable
                hitSlop={6}
                accessibilityRole="link"
                onPress={() => void openEvent(eventId, draft.start)}
              >
                <Text style={styles.view}>{t("event-view")}</Text>
              </Pressable>
              <Pressable hitSlop={6} accessibilityRole="button" onPress={() => void undo()}>
                <Text style={styles.undo}>{t("event-undo")}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <PairButtons
                solid={t("event-add")}
                line={t("event-edit")}
                busy={busy}
                onSolid={() => void add()}
                onLine={() => setEditing(true)}
              />
              <Text style={styles.foot}>{t("event-card-foot", { app: calendarApp(t) })}</Text>
            </>
          )}
        </>
      )}
      {sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    width: 300,
    maxWidth: "100%",
    backgroundColor: color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    padding: 12,
    gap: 9,
  },
  clashCard: { borderColor: color.attentionLine, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: "700", color: color.ink },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  label: { width: 28, fontSize: 13, color: color.faded },
  value: { flex: 1, fontSize: 13, color: color.ink },
  plain: { fontSize: 13, color: color.ink },
  clash: {
    fontSize: 12,
    color: color.attentionInk,
    backgroundColor: color.attentionSoft,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    overflow: "hidden",
  },
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
  foot: { fontSize: 11, color: color.faded },
  done: { flexDirection: "row", alignItems: "center", gap: 6 },
  doneText: { fontSize: 13, color: color.success, flexShrink: 1 },
  flex: { flex: 1 },
  view: { fontSize: 13, color: color.accent },
  undo: { fontSize: 13, color: color.faded, marginLeft: 4 },
  flip: { transform: [{ rotate: "180deg" }] },
  dayText: { fontSize: 13, color: color.ink, minWidth: 76, textAlign: "center" },
  input: {
    flex: 1,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.lineStrong,
    paddingHorizontal: 8,
    paddingVertical: 0,
    fontSize: 13,
    color: color.ink,
  },
  wide: { flex: 1 },
  chips: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6 },
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
