import type { HubStore } from "@xiaoban/client";
import { useLocalSearchParams } from "expo-router";
import { useHubContext } from "../hub/HubProvider.tsx";

/** The hub a workspace screen talks to: the phone's own when the link says so, else the one in use. */
export function useWorkspaceStore(): HubStore {
  const { hub } = useLocalSearchParams<{ hub?: string }>();
  const { local, store } = useHubContext();
  if (hub === "local" && local) return local;
  if (!store) throw new Error("hub is not paired");
  return store;
}

export const PAGE_EXTENSIONS = ["html", "htm"];
export const NOTE_EXTENSIONS = ["md", "markdown"];
export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"];
