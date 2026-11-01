import { dayTone, familyText, type HubStore, tripKey } from "@xiaoban/client";
import { draftsForThread, useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Trip } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Share } from "react-native";

export const dayInk = (index: number): string => color[dayTone(index)];

export function useTrip(store: HubStore, tripId: string, version: number | null): Trip | undefined {
  const state = useHubState(store);
  const latest = state.latestTrip[tripId];
  const wanted = version ?? latest ?? null;
  const trip = state.trips[tripKey(tripId, wanted ?? 0)];
  useEffect(() => {
    if (!trip) void store.loadTrip(tripId, wanted).catch(() => undefined);
  }, [store, trip, tripId, wanted]);
  return wanted === null ? undefined : trip;
}

export function openTrip(tripId: string, version: number | null) {
  router.push({
    pathname: "/trip/[id]",
    params: version === null ? { id: tripId } : { id: tripId, version: String(version) },
  });
}

export function parseVersion(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : null;
}

export const openLink = (url: string) => void Linking.openURL(url).catch(() => undefined);

export async function openFirst(urls: string[]): Promise<void> {
  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return;
    } catch {}
  }
}

export function useShareTrip() {
  const { t } = useI18n();
  return (trip: Trip) => void Share.share({ message: familyText(t, trip) }).catch(() => undefined);
}

export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export type Reply = { phase: "thinking" } | { phase: "done"; text: string } | { phase: "failed" };

export function useTripSay(store: HubStore, trip: Trip | undefined, day: number) {
  const { t } = useI18n();
  const state = useHubState(store);
  const [asked, setAsked] = useState<{ turnId: string; before: string | null } | null>(null);
  const threadId = trip?.threadId ?? null;
  const busy = threadId
    ? draftsForThread(state, threadId).some((draft) => !draft.failure && !draft.background)
    : false;

  const say = async (text: string) => {
    if (!trip) return;
    const before = state.messages[trip.threadId]?.at(-1)?.id ?? null;
    const turnId = await store.send(trip.threadId, text, {
      context: [
        {
          label: t("trip-context-label"),
          body: t("trip-context-body", { title: trip.title, version: trip.version }),
        },
        { label: t("trip-context-day-label"), body: t("trip-day", { n: day + 1 }) },
      ],
    });
    setAsked({ turnId, before });
  };

  let reply: Reply | null = null;
  if (asked && threadId) {
    const draft = state.drafts[asked.turnId];
    const last = state.messages[threadId]?.at(-1);
    if (draft?.failure) reply = { phase: "failed" };
    else if (draft) reply = { phase: "thinking" };
    else if (last && last.id !== asked.before && last.role === "assistant") {
      reply = { phase: "done", text: last.text };
    } else reply = { phase: "thinking" };
  }

  return { say, reply, busy, dismiss: () => setAsked(null) };
}
