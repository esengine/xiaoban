import { useEffect, useState } from "react";

const KEY = "plan-docked";
const EVENT = "xiaoban:plan-dock";

function read(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function usePlanDock(threadId: string | null) {
  const [docked, setDocked] = useState(() => (threadId ? read().includes(threadId) : false));
  useEffect(() => {
    const sync = () => setDocked(threadId ? read().includes(threadId) : false);
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [threadId]);
  const set = (next: boolean) => {
    if (!threadId) return;
    const others = read().filter((id) => id !== threadId);
    localStorage.setItem(KEY, JSON.stringify(next ? [...others, threadId] : others));
    window.dispatchEvent(new Event(EVENT));
  };
  return [docked, set] as const;
}
