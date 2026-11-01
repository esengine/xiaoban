import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import { XiaobanHub } from "../../modules/xiaoban-hub/index.ts";

const KEY = "plan-ball";
let current: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const planBallSupported = typeof XiaobanHub?.planBall === "function";

export function loadPlanBall() {
  if (loaded || !planBallSupported) return;
  loaded = true;
  void SecureStore.getItemAsync(KEY)
    .then((value) => {
      if (value && current === null) {
        current = value;
        emit();
      }
    })
    .catch(() => undefined);
}

export function setPlanBall(threadId: string | null) {
  loaded = true;
  if (current === threadId) return;
  current = threadId;
  emit();
  const saved = threadId
    ? SecureStore.setItemAsync(KEY, threadId)
    : SecureStore.deleteItemAsync(KEY);
  void saved.catch(() => undefined);
}

export function usePlanBall(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
