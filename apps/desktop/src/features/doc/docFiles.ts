import { invoke, isTauri } from "@tauri-apps/api/core";
import { downloadDir, join } from "@tauri-apps/api/path";
import type { HubStore } from "@xiaoban/client";
import type { DocBlock, DocFormat } from "@xiaoban/protocol";

const UNSAFE = /[\\/:*?"<>|\n\r\t]/g;

export function fileName(title: string, ext: string) {
  const base = title.replace(UNSAFE, " ").trim().slice(0, 60);
  return `${base || "document"}.${ext}`;
}

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

export function plainText(blocks: DocBlock[]) {
  let number = 0;
  return blocks
    .map((block) => {
      number = block.kind === "number" ? number + 1 : 0;
      const text = block.text.replaceAll("**", "");
      if (block.kind === "bullet") return `• ${text}`;
      if (block.kind === "number") return `${number}. ${text}`;
      return text;
    })
    .join("\n\n");
}

export function countChars(blocks: DocBlock[]) {
  return blocks.reduce((sum, block) => sum + block.text.replaceAll("**", "").length, 0);
}
