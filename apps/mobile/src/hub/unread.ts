import { useSyncExternalStore } from "react";

let marked = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function markUnread(id: string) {
  marked = new Set([...marked, id]);
  emit();
}

export function markRead(id: string) {
  if (!marked.has(id)) return;
  const next = new Set(marked);
  next.delete(id);
  marked = next;
  emit();
}

export function useUnread(): ReadonlySet<string> {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => marked,
  );
}
