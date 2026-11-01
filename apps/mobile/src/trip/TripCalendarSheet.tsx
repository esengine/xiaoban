import { amapPlace, type HubStore, range, reminderText, stopCount } from "@xiaoban/client";
import type { Translator } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { Trip } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { calendarName, grantAndChoose, SheetButtons } from "../calendar/CalendarPicker.tsx";
import {
  addEvent,
  allowed,
  type CalendarChoice,
  choose,
  removeEvent,
  savedCalendar,
  type Target,
  updateEvent,
} from "../calendar/device.ts";
import { setTripRecord, tripRecord, useTripRecord } from "../calendar/records.ts";
import { Sheet } from "../life/LifeUI.tsx";
import { ChevronIcon } from "./TripIcons.tsx";

type Translate = Translator["t"];

const REMINDERS: (number | null)[] = [15, 30, 60, null];
const UID = /-(\d+)-(\d+)@xiaoban$/;

function linkFor(trip: Trip, uid: string): string | undefined {
  const match = UID.exec(uid);
  const stop = match ? trip.days[Number(match[1])]?.stops[Number(match[2])] : undefined;
  return stop ? amapPlace(trip, stop) : undefined;
}

export async function syncTrip(
  store: HubStore,
  trip: Trip,
  target: Target,
  reminder: number | null,
  t: Translate,
): Promise<number> {
  const calendar = await store.tripCalendar(trip.id, trip.version);
  const previous = tripRecord(trip.id);
  const same = previous?.calendarId === target.id;
  if (previous && !same) {
    for (const id of Object.values(previous.events)) await removeEvent(id);
  }
  const kept: Record<string, string> = {};
  for (const event of calendar.events) {
    const url = linkFor(trip, event.uid);
    const fields = {
      title: event.title,
      start: event.start,
      end: event.end,
      location: event.location,
      notes: [event.notes, url ? t("trip-calendar-nav", { url }) : ""].filter(Boolean).join("\n"),
      reminder,
      url,
    };
    const known = same ? previous?.events[event.uid] : undefined;
    if (known && (await updateEvent(known, fields))) {
      kept[event.uid] = known;
      continue;
    }
    kept[event.uid] = await addEvent(target.id, fields);
  }
  if (previous && same) {
    for (const [uid, id] of Object.entries(previous.events)) {
      if (!(uid in kept)) await removeEvent(id);
    }
  }
  setTripRecord(trip.id, {
    calendarId: target.id,
    choice: target.choice,
    version: trip.version,
    reminder,
    events: kept,
  });
  return calendar.events.length;
}

export function useTripFollow(
  store: HubStore,
  trip: Trip | null | undefined,
  latest: boolean,
): void {
  const { t } = useI18n();
  const record = useTripRecord(trip?.id ?? "");
  const started = useRef("");
  useEffect(() => {
    if (!trip || !latest || !record || record.version >= trip.version) return;
    const key = `${trip.id}:${trip.version}`;
    if (started.current === key) return;
    started.current = key;
    void allowed().then((granted) => {
      if (!granted) return;
      const target = { id: record.calendarId, choice: record.choice };
      return syncTrip(store, trip, target, record.reminder, t).catch(() => undefined);
    });
  }, [store, trip, latest, record, t]);
}

function Setting({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable style={styles.setting} accessibilityRole="button" onPress={onPress}>
      <Text style={styles.settingLabel}>{label}</Text>
      <View style={styles.settingValue}>
        <Text style={styles.settingText}>{value}</Text>
        <ChevronIcon color={color.faded} size={12} />
      </View>
    </Pressable>
  );
}

export function TripCalendarSheet({
  store,
  trip,
  open,
  onClose,
  onDone,
}: {
  store: HubStore;
  trip: Trip;
  open: boolean;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const { t } = useI18n();
  const record = useTripRecord(trip.id);
  const [reminder, setReminder] = useState<number | null>(15);
  const [choice, setChoice] = useState<CalendarChoice>("mine");
  const [busy, setBusy] = useState(false);
  const count = stopCount(trip);

  useEffect(() => {
    if (!open) return;
    const current = tripRecord(trip.id);
    if (current) {
      setReminder(current.reminder);
      setChoice(current.choice);
      return;
    }
    void savedCalendar().then((saved) => {
      if (saved) setChoice(saved.choice);
    });
  }, [open, trip.id]);

  const cycleReminder = () => {
    const index = REMINDERS.indexOf(reminder);
    setReminder(REMINDERS[(index + 1) % REMINDERS.length] ?? null);
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const target = (await allowed())
        ? await choose(choice, t("calendar-xiaoban"))
        : await grantAndChoose(t, choice);
      if (!target) return;
      const added = await syncTrip(store, trip, target, reminder, t);
      onClose();
      onDone(t("trip-calendar-done", { calendar: calendarName(t, target.choice), count: added }));
    } catch {
      Alert.alert(t("event-add-failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <Text style={styles.title}>{t("trip-calendar-title")}</Text>
      <Text style={styles.sub}>{t("trip-calendar-sub", { range: range(t, trip), count })}</Text>
      <Setting
        label={t("trip-calendar-remind")}
        value={reminderText(t, reminder)}
        onPress={cycleReminder}
      />
      <Setting
        label={t("trip-calendar-target")}
        value={calendarName(t, choice)}
        onPress={() => setChoice(choice === "mine" ? "xiaoban" : "mine")}
      />
      <Text style={styles.note}>{t("trip-calendar-note")}</Text>
      <SheetButtons
        cancel={t("dialog-cancel")}
        confirm={
          busy
            ? t("trip-calendar-adding")
            : record
              ? t("trip-calendar-update", { count })
              : t("trip-calendar-add", { count })
        }
        disabled={busy}
        onCancel={onClose}
        onConfirm={() => void confirm()}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "700", color: color.ink },
  sub: { fontSize: 13, color: color.muted },
  setting: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 12,
    backgroundColor: color.ground,
  },
  settingLabel: { fontSize: 14, color: color.ink },
  settingValue: { flexDirection: "row", alignItems: "center", gap: 4 },
  settingText: { fontSize: 14, fontWeight: "600", color: color.ink },
  note: { fontSize: 12, lineHeight: 19, color: color.faded },
});
