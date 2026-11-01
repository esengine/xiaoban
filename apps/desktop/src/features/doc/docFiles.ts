import { invoke, isTauri } from "@tauri-apps/api/core";
import { downloadDir, join } from "@tauri-apps/api/path";
import type { HubStore } from "@xiaoban/client";
import { fileName } from "@xiaoban/client";
import type { DocFormat } from "@xiaoban/protocol";

export async function exportDoc(
  store: HubStore,
  id: string,
  title: string,
  format: DocFormat,
): Promise<string | null> {
  if (!isTauri()) return null;
  const dir = await downloadDir();
  const path = await join(dir, fileName(title, format === "docx" ? "docx" : "md"));
  return store.exportDoc(id, format, path);
}

export async function revealExport(store: HubStore, id: string, title: string, format: DocFormat) {
  const path = await exportDoc(store, id, title, format);
  if (path) await invoke("file_reveal", { path });
}

export async function openInWord(store: HubStore, id: string, title: string) {
  const path = await exportDoc(store, id, title, "docx");
  if (path) await invoke("file_open", { path });
}

export { countChars, fileName, plainText } from "@xiaoban/client";
