import { color } from "@xiaoban/tokens";
import {
  CalendarAccessLevel,
  createCalendar,
  EntityTypes,
  type ExpoCalendar,
  ExpoCalendarEvent,
  getCalendarPermissions,
  getCalendars,
  getDefaultCalendarSync,
  listEvents,
  requestCalendarPermissions,
  SourceType,
} from "expo-calendar";
import * as SecureStore from "expo-secure-store";
import { Linking, Platform } from "react-native";

export type CalendarChoice = "mine" | "xiaoban";

export interface SavedCalendar {
  choice: CalendarChoice;
  calendarId: string;
}

export interface Target {
  id: string;
  choice: CalendarChoice;
}

export interface EventFields {
  title: string;
  start: number;
  end: number;
  location: string;
  notes: string;
  reminder: number | null;
  url?: string | undefined;
  allDay?: boolean;
}

const KEY = "xiaoban.calendar";
const LOCAL_ACCOUNT = "Xiaoban";

export async function savedCalendar(): Promise<SavedCalendar | null> {
  const raw = await SecureStore.getItemAsync(KEY).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SavedCalendar;
  } catch {
    return null;
  }
}

async function remember(saved: SavedCalendar): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(saved));
}

export async function allowed(): Promise<boolean> {
  try {
    return (await getCalendarPermissions()).granted;
  } catch {
    return false;
  }
}

export async function askAccess(): Promise<boolean> {
  try {
    return (await requestCalendarPermissions()).granted;
  } catch {
    return false;
  }
}

const writable = (calendar: ExpoCalendar): boolean =>
  calendar.allowsModifications &&
  calendar.isVisible !== false &&
  (calendar.accessLevel === undefined ||
    calendar.accessLevel === CalendarAccessLevel.OWNER ||
    calendar.accessLevel === CalendarAccessLevel.ROOT ||
    calendar.accessLevel === CalendarAccessLevel.EDITOR ||
    calendar.accessLevel === CalendarAccessLevel.CONTRIBUTOR);

const ours = (calendar: ExpoCalendar): boolean =>
  calendar.source?.name === LOCAL_ACCOUNT || calendar.ownerAccount === LOCAL_ACCOUNT;

export async function phoneCalendar(): Promise<ExpoCalendar | null> {
  if (Platform.OS === "ios") {
    try {
      return getDefaultCalendarSync();
    } catch {
      return null;
    }
  }
  const calendars = (await getCalendars(EntityTypes.EVENT)).filter(
    (calendar) => writable(calendar) && !ours(calendar),
  );
  const synced = calendars.filter((calendar) => !calendar.source?.isLocalAccount);
  return (
    synced.find((calendar) => calendar.isPrimary) ??
    calendars.find((calendar) => calendar.isPrimary) ??
    synced[0] ??
    calendars[0] ??
    null
  );
}

async function xiaobanCalendar(title: string): Promise<ExpoCalendar | null> {
  const existing = (await getCalendars(EntityTypes.EVENT)).find(
    (calendar) => ours(calendar) && writable(calendar),
  );
  if (existing) return existing;
  const base = {
    title,
    name: LOCAL_ACCOUNT,
    color: color.accent,
    entityType: EntityTypes.EVENT,
    ownerAccount: LOCAL_ACCOUNT,
    accessLevel: CalendarAccessLevel.OWNER,
  };
  if (Platform.OS !== "ios") {
    return createCalendar({
      ...base,
      source: { isLocalAccount: true, name: LOCAL_ACCOUNT, type: "LOCAL" },
    });
  }
  const sourceId = (await phoneCalendar())?.source?.id;
  return createCalendar({
    ...base,
    ...(sourceId ? { sourceId } : {}),
    source: { type: SourceType.LOCAL, name: LOCAL_ACCOUNT },
  });
}

export async function choose(choice: CalendarChoice, xiaobanTitle: string): Promise<Target | null> {
  const calendar =
    choice === "xiaoban" ? await xiaobanCalendar(xiaobanTitle) : await phoneCalendar();
  if (!calendar) return null;
  await remember({ choice, calendarId: calendar.id });
  return { id: calendar.id, choice };
}

export async function currentTarget(xiaobanTitle: string): Promise<Target | null> {
  const saved = await savedCalendar();
  if (!saved) return null;
  const calendars = await getCalendars(EntityTypes.EVENT).catch(() => []);
  if (calendars.some((calendar) => calendar.id === saved.calendarId && writable(calendar))) {
    return { id: saved.calendarId, choice: saved.choice };
  }
  return choose(saved.choice, xiaobanTitle);
}

export async function sourceName(): Promise<string | null> {
  if (!(await allowed())) return null;
  const calendar = await phoneCalendar().catch(() => null);
  return calendar?.source?.name ?? null;
}

function details(fields: EventFields) {
  return {
    title: fields.title,
    startDate: new Date(fields.start),
    endDate: new Date(Math.max(fields.end, fields.start)),
    location: fields.location,
    notes: fields.notes,
    ...(fields.allDay ? { allDay: true } : {}),
    ...(fields.url ? { url: fields.url } : {}),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    alarms: fields.reminder === null ? [] : [{ relativeOffset: -fields.reminder }],
  };
}

export async function addEvent(calendarId: string, fields: EventFields): Promise<string> {
  const calendars = await getCalendars(EntityTypes.EVENT);
  const calendar = calendars.find((item) => item.id === calendarId);
  if (!calendar) throw new Error("calendar is gone");
  const event = await calendar.createEvent(details(fields));
  return event.id;
}

export async function updateEvent(eventId: string, fields: EventFields): Promise<boolean> {
  try {
    const event = await ExpoCalendarEvent.get(eventId);
    await event.update(details(fields));
    return true;
  } catch {
    return false;
  }
}

export async function removeEvent(eventId: string): Promise<void> {
  try {
    const event = await ExpoCalendarEvent.get(eventId);
    await event.delete();
  } catch {}
}

export async function openEvent(eventId: string, at: number): Promise<void> {
  try {
    const event = await ExpoCalendarEvent.get(eventId);
    await event.openInCalendar();
    return;
  } catch {}
  const url =
    Platform.OS === "ios"
      ? `calshow:${Math.floor(at / 1000 - 978_307_200)}`
      : `content://com.android.calendar/time/${at}`;
  await Linking.openURL(url).catch(() => undefined);
}

export async function firstBusy(
  start: number,
  end: number,
  skip: string | null,
): Promise<{ title: string; start: number } | null> {
  if (!(await allowed())) return null;
  try {
    const calendars = (await getCalendars(EntityTypes.EVENT)).filter(
      (calendar) => calendar.isVisible !== false,
    );
    if (calendars.length === 0) return null;
    const events = await listEvents(calendars, new Date(start), new Date(end));
    const clash = events
      .filter((event) => event.id !== skip && !event.allDay)
      .map((event) => ({
        title: event.title,
        start: new Date(event.startDate).getTime(),
        end: new Date(event.endDate).getTime(),
      }))
      .filter((event) => event.start < end && event.end > start)
      .sort((a, b) => a.start - b.start)[0];
    return clash ? { title: clash.title, start: clash.start } : null;
  } catch {
    return null;
  }
}
