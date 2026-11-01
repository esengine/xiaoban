import type { EventDraft } from "@xiaoban/protocol";
import { File, Paths } from "expo-file-system";
import { useCallback, useEffect, useState } from "react";
import type { CalendarChoice } from "./device.ts";

export interface EventRecord {
  draft: EventDraft;
  eventId: string | null;
  choice: CalendarChoice | null;
}

export interface TripRecord {
  calendarId: string;
  choice: CalendarChoice;
  version: number;
  reminder: number | null;
  events: Record<string, string>;
}

interface Records {
  events: Record<string, EventRecord>;
  trips: Record<string, TripRecord>;
}

const listeners = new Set<() => void>();
let cache: Records | null = null;

function file(): File {
  return new File(Paths.document, "calendar-links.json");
}

function load(): Records {
  if (cache) return cache;
  try {
    const stored = file();
    cache = stored.exists ? (JSON.parse(stored.textSync()) as Records) : { events: {}, trips: {} };
  } catch {
    cache = { events: {}, trips: {} };
  }
  return cache;
}

function save(next: Records): void {
  cache = next;
  try {
    const stored = file();
    if (!stored.exists) stored.create();
    stored.write(JSON.stringify(next));
  } catch {}
  for (const listener of listeners) listener();
}

export function eventRecord(id: string): EventRecord | null {
  return load().events[id] ?? null;
}

export function setEventRecord(id: string, record: EventRecord): void {
  const current = load();
  save({ ...current, events: { ...current.events, [id]: record } });
}

export function tripRecord(id: string): TripRecord | null {
  return load().trips[id] ?? null;
}

export function setTripRecord(id: string, record: TripRecord): void {
  const current = load();
  save({ ...current, trips: { ...current.trips, [id]: record } });
}

function useRecords<T>(read: () => T): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const listener = () => setValue(read());
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, [read]);
  return value;
}

export function useEventRecord(id: string): EventRecord | null {
  const read = useCallback(() => eventRecord(id), [id]);
  return useRecords(read);
}

export function useTripRecord(id: string): TripRecord | null {
  const read = useCallback(() => tripRecord(id), [id]);
  return useRecords(read);
}
