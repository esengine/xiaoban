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

export function colName(index: number) {
  let name = "";
  let value = index;
  do {
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return name;
}

export function cellName(row: number, col: number) {
  return `${colName(col)}${row + 1}`;
}

export function parseRange(text: string) {
  const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(text.trim());
  if (!match) return null;
  const col = (letters: string) =>
    letters
      .toUpperCase()
      .split("")
      .reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
  const r1 = Number(match[2]) - 1;
  const c1 = col(match[1] ?? "A");
  const r2 = match[4] ? Number(match[4]) - 1 : r1;
  const c2 = match[3] ? col(match[3]) : c1;
  return { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
}

export function toNumber(text: string) {
  const cleaned = text.replace(/[,¥$\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned.endsWith("%") ? cleaned.slice(0, -1) : cleaned);
  if (!Number.isFinite(value)) return null;
  return cleaned.endsWith("%") ? value / 100 : value;
}
