import type { Thread } from "@xiaoban/protocol";

const TONES = 3;

export function toneOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % TONES;
}

export function firstGrapheme(text: string): string {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const [first] = segmenter.segment(text.trim());
  return first?.segment ?? "";
}

export function orderThreads(threads: Thread[], primaryId: string | null): Thread[] {
  const primary = threads.find((thread) => thread.id === primaryId);
  const rest = threads.filter((thread) => thread.id !== primaryId);
  return primary ? [primary, ...rest] : rest;
}
