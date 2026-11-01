import { invoke, isTauri } from "@tauri-apps/api/core";
import type { HubStore } from "@xiaoban/client";

const chosen = new Map<string, string>();

export function rememberEditor(workspaceId: string, editor: string) {
  chosen.set(workspaceId, editor);
}

export async function openInEditor(store: HubStore, workspaceId: string, path: string) {
  if (!isTauri()) return;
  let editor = chosen.get(workspaceId);
  if (!editor) {
    editor = await store
      .workspaceSettings(workspaceId)
      .then((settings) => settings.editor)
      .catch(() => "auto");
    chosen.set(workspaceId, editor);
  }
  await invoke("open_in_editor", { path, editor }).catch(() => undefined);
}
