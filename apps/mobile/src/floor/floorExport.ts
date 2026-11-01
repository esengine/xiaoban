import {
  activeScheme,
  areaText,
  currentLayout,
  fileName,
  floorSvg,
  latestVersion,
  planArea,
  roomSize,
} from "@xiaoban/client";
import type { useI18n } from "@xiaoban/i18n/react";
import type { FloorPlan } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import * as Print from "expo-print";
import { keepFile, MIME, type ReadyFile } from "../work/exportFile.ts";

type Translate = ReturnType<typeof useI18n>["t"];

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function floorHtml(t: Translate, plan: FloorPlan): string {
  const layout = currentLayout(plan);
  const version = latestVersion(activeScheme(plan))?.number ?? 1;
  const meta = [
    t("floorplan-area", { area: areaText(planArea(plan, layout)) }),
    plan.kind,
    t("floorplan-scheme-version", { scheme: plan.scheme, version }),
  ]
    .filter(Boolean)
    .join(t("daily-dot"));
  const svg = floorSvg(
    layout,
    {
      wall: color.ink,
      room: color.surface,
      item: color.neutralSoft,
      itemLine: color.checkOff,
      ink: color.ink,
      muted: color.muted,
      window: color.accentBright,
    },
    (room) => t("floorplan-size", roomSize(room)),
  );
  const rows = layout.rooms
    .map((room) => {
      const facing = room.facing ? t(`floorplan-facing-${room.facing}`) : "";
      const head = [
        t("floorplan-area", { area: areaText(room.area) }),
        t("floorplan-size", roomSize(room)),
        facing,
      ]
        .filter(Boolean)
        .join(t("daily-dot"));
      const items = room.items.map((item) => item.name).join(t("floorplan-compare-joiner"));
      return `<tr><td class="name">${escapeHtml(room.name)}</td><td><div>${escapeHtml(head)}</div>${
        items ? `<div class="soft">${escapeHtml(items)}</div>` : ""
      }${room.advice ? `<div>${escapeHtml(room.advice)}</div>` : ""}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:-apple-system,"PingFang SC","Noto Sans SC",sans-serif;color:${color.ink};padding:28px;margin:0}
h1{font-size:22px;margin:0}
.meta{font-size:12px;color:${color.muted};margin:4px 0 18px}
.plan{border:1px solid ${color.line};border-radius:12px;padding:16px}
table{width:100%;border-collapse:collapse;margin-top:18px;font-size:12px;line-height:1.6}
td{border-top:1px solid ${color.lineSoft};padding:8px 6px;vertical-align:top}
td.name{font-weight:700;width:72px}
.soft{color:${color.muted}}
</style></head><body><h1>${escapeHtml(plan.title)}</h1><div class="meta">${escapeHtml(meta)}</div><div class="plan">${svg}</div><table>${rows}</table></body></html>`;
}

export async function floorPdf(t: Translate, plan: FloorPlan): Promise<ReadyFile> {
  const { uri } = await Print.printToFileAsync({ html: floorHtml(t, plan) });
  return keepFile(uri, fileName(plan.title, "pdf"), MIME.pdf);
}
