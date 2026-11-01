import { isTauri } from "@tauri-apps/api/core";
import { downloadDir, join } from "@tauri-apps/api/path";
import type { HubStore } from "@xiaoban/client";
import type { Deck } from "@xiaoban/protocol";
import { iconPng } from "@xiaoban/slides/icon-png";
import { buildPptxBase64 } from "@xiaoban/slides/pptx";
import { fileName } from "../doc/docFiles.ts";

async function target(title: string, ext: string) {
  return join(await downloadDir(), fileName(title, ext));
}

export async function exportPptx(store: HubStore, deck: Deck): Promise<string | null> {
  if (!isTauri()) return null;
  const data = await buildPptxBase64(deck, { icon: iconPng });
  return store.saveExport(await target(deck.title, "pptx"), data);
}

export async function exportPngs(
  store: HubStore,
  deck: Deck,
  nodes: HTMLElement[],
): Promise<string | null> {
  if (!isTauri()) return null;
  const { toPng } = await import("html-to-image");
  let last: string | null = null;
  for (const [index, node] of nodes.entries()) {
    const url = await toPng(node, { pixelRatio: 2, cacheBust: true });
    last = await store.saveExport(
      await target(`${deck.title} ${index + 1}`, "png"),
      url.split(",")[1] ?? "",
    );
  }
  return last;
}
