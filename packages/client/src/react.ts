import { useSyncExternalStore } from "react";
import type { HubState } from "./state.ts";
import type { HubStore } from "./store.ts";

export function useHubState(store: HubStore): HubState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export { draftsForThread } from "./state.ts";
