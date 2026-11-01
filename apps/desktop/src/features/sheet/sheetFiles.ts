import { invoke, isTauri } from "@tauri-apps/api/core";
import { downloadDir, join } from "@tauri-apps/api/path";
import type { HubStore } from "@xiaoban/client";
import type { SheetFormat } from "@xiaoban/protocol";
import { fileName } from "../doc/docFiles.ts";

export async function exportSheet(
  store: HubStore,
  id: string,
  title: string,
  format: SheetFormat,
  tabId = "",
): Promise<string | null> {
  if (!isTauri()) return null;
  const dir = await downloadDir();
  const path = await join(dir, fileName(title, format));
  return store.exportSheet(id, format, tabId, path);
}

export async function revealSheet(
  store: HubStore,
  id: string,
  title: string,
  format: SheetFormat,
  tabId = "",
) {
  const path = await exportSheet(store, id, title, format, tabId);
  if (path) await invoke("file_reveal", { path });
}

export async function openInExcel(store: HubStore, id: string, title: string) {
  const path = await exportSheet(store, id, title, "xlsx");
  if (path) await invoke("file_open", { path });
}

export { cellName, colName, parseRange, toNumber } from "@xiaoban/client";
