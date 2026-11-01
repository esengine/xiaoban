import { invoke, isTauri } from "@tauri-apps/api/core";
import type { TripCalendar } from "@xiaoban/protocol";

export type CalendarOutcome = { added: number } | { handed: number } | "denied" | "failed";

export const CALENDAR_APP = "ical://";
export const CALENDAR_SETTINGS =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars";

export async function syncCalendar(
  load: () => Promise<TripCalendar>,
  name: string,
): Promise<CalendarOutcome> {
  if (!isTauri()) return "failed";
  return load()
    .then((calendar) => invoke<CalendarOutcome>("calendar_sync", { calendar, name }))
    .catch((): CalendarOutcome => "failed");
}
