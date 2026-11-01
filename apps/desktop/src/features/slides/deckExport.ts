import { isTauri } from "@tauri-apps/api/core";
import { downloadDir, join } from "@tauri-apps/api/path";
import type { HubStore } from "@xiaoban/client";
import type { Deck, Slide } from "@xiaoban/protocol";
import { ICONS, type SlideTheme, themeOf } from "@xiaoban/slides";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileName } from "../doc/docFiles.ts";

const IN = 96;
const px = (value: number) => value / IN;
const hex = (color: string) => color.replace("#", "").slice(0, 6);

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function iconPng(name: string, color: string): Promise<string | null> {
  const Icon = ICONS[name];
  if (!Icon) return null;
  const svg = renderToStaticMarkup(createElement(Icon, { size: 96, color, strokeWidth: 1.8 }));
  const image = new Image();
  image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}

async function imageData(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function decorate(pptx: PptxGenJS, page: PptxGenJS.Slide, theme: SlideTheme, strong: boolean) {
  const fill = (color: string) => ({ color: hex(color) });
  if (theme.deco === "circles") {
    const size = strong ? 380 : 220;
    page.addShape(pptx.ShapeType.ellipse, {
      x: px(960 + 90 - size),
      y: px(-90),
      w: px(size),
      h: px(size),
      fill: fill(theme.soft),
      line: { type: "none" },
    });
  } else if (theme.deco === "band") {
    page.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: px(strong ? 300 : 14),
      h: px(540),
      fill: fill(theme.accent),
      line: { type: "none" },
    });
  } else if (theme.deco === "lines") {
    for (let index = 0; index < 16; index += 1)
      page.addShape(pptx.ShapeType.line, {
        x: px(60 + index * 60),
        y: 0,
        w: 0,
        h: px(540),
        line: { color: hex(theme.soft), width: 0.75 },
      });
  }
}

async function addSlide(pptx: PptxGenJS, slide: Slide, theme: SlideTheme) {
  const page = pptx.addSlide();
  const ink = hex(theme.ink);
  const accent = hex(theme.accent);
  const muted = hex(theme.muted);
  const font = "PingFang SC";
  const strong = slide.layout === "title" || slide.layout === "section";
  page.background = { color: hex(slide.layout === "quote" ? theme.dark : theme.bg) };
  if (slide.notes) page.addNotes(slide.notes);
  if (slide.layout === "quote") {
    page.addText(slide.title, {
      x: px(120),
      y: px(170),
      w: px(720),
      h: px(160),
      fontFace: font,
      fontSize: 30,
      bold: true,
      color: hex(theme.onDark),
    });
    if (slide.subtitle)
      page.addText(`—— ${slide.subtitle}`, {
        x: px(120),
        y: px(350),
        w: px(720),
        h: px(40),
        fontFace: font,
        fontSize: 16,
        color: hex(theme.onDark),
      });
    return;
  }
  decorate(pptx, page, theme, strong);
  if (strong) {
    const left = theme.deco === "band" ? 380 : 84;
    page.addShape(pptx.ShapeType.rect, {
      x: px(left),
      y: px(186),
      w: px(70),
      h: px(6),
      fill: { color: accent },
      line: { type: "none" },
    });
    page.addText(slide.title, {
      x: px(left),
      y: px(200),
      w: px(960 - left - 60),
      h: px(90),
      fontFace: font,
      fontSize: 40,
      bold: true,
      color: ink,
    });
    if (slide.subtitle)
      page.addText(slide.subtitle, {
        x: px(left),
        y: px(300),
        w: px(700),
        h: px(40),
        fontFace: font,
        fontSize: 18,
        color: muted,
      });
    return;
  }
  page.addText(slide.title, {
    x: px(64),
    y: px(40),
    w: px(832),
    h: px(60),
    fontFace: font,
    fontSize: 28,
    bold: true,
    color: ink,
  });
  page.addShape(pptx.ShapeType.rect, {
    x: px(64),
    y: px(104),
    w: px(48),
    h: px(5),
    fill: { color: accent },
    line: { type: "none" },
  });
  const items = slide.items;
  switch (slide.layout) {
    case "number":
      page.addText(items[0]?.value || items[0]?.text || slide.subtitle, {
        x: px(80),
        y: px(170),
        w: px(800),
        h: px(130),
        fontFace: font,
        fontSize: 72,
        bold: true,
        color: accent,
      });
      page.addText(items[0]?.value ? items[0]?.text : slide.subtitle, {
        x: px(84),
        y: px(310),
        w: px(800),
        h: px(40),
        fontFace: font,
        fontSize: 20,
        color: muted,
      });
      break;
    case "chart":
      if (slide.chart) {
        const kind =
          slide.chart.kind === "line"
            ? pptx.ChartType.line
            : slide.chart.kind === "pie"
              ? pptx.ChartType.pie
              : pptx.ChartType.bar;
        page.addChart(
          kind,
          [
            {
              name: slide.title,
              labels: slide.chart.labels,
              values: slide.chart.values.map(
                (value) => Number(value.replace(/[,¥$%\s]/g, "")) || 0,
              ),
            },
          ],
          {
            x: px(80),
            y: px(130),
            w: px(800),
            h: px(370),
            chartColors: [accent, muted, hex(theme.soft)],
            showValue: true,
            showLegend: slide.chart.kind === "pie",
            dataLabelFontSize: 11,
            catAxisLabelFontSize: 11,
            valAxisHidden: true,
            valGridLine: { style: "none" },
          },
        );
      }
      break;
    case "two":
    case "compare":
      slide.columns.slice(0, 2).forEach((column, index) => {
        const filled = slide.layout === "compare" && index === 1;
        const x = 64 + index * 430;
        if (slide.layout === "compare")
          page.addShape(pptx.ShapeType.roundRect, {
            x: px(x),
            y: px(140),
            w: px(400),
            h: px(330),
            fill: { color: hex(filled ? theme.accent : theme.soft) },
            line: { type: "none" },
            rectRadius: 0.15,
          });
        page.addText(
          [
            {
              text: column.title,
              options: {
                bold: true,
                color: filled ? hex(theme.onAccent) : accent,
                fontSize: 20,
                breakLine: true,
              },
            },
            ...column.items.map((line) => ({
              text: slide.layout === "compare" ? `✓ ${line}` : line,
              options: { color: filled ? hex(theme.onAccent) : ink, fontSize: 16, breakLine: true },
            })),
          ],
          {
            x: px(x + 24),
            y: px(160),
            w: px(352),
            h: px(290),
            fontFace: font,
            valign: "top",
            paraSpaceAfter: 8,
          },
        );
      });
      break;
    case "flow": {
      const steps = items.slice(0, 5);
      const width = 760 / Math.max(1, steps.length);
      steps.forEach((item, index) => {
        const last = index === steps.length - 1;
        page.addShape(pptx.ShapeType.roundRect, {
          x: px(80 + index * width),
          y: px(210),
          w: px(width - 40),
          h: px(140),
          fill: { color: hex(last ? theme.accent : theme.soft) },
          line: { type: "none" },
          rectRadius: 0.15,
        });
        page.addText(
          [
            {
              text: String(index + 1).padStart(2, "0"),
              options: { fontSize: 12, color: last ? hex(theme.onAccent) : muted, breakLine: true },
            },
            {
              text: item.text,
              options: {
                fontSize: 17,
                bold: true,
                color: last ? hex(theme.onAccent) : ink,
                breakLine: true,
              },
            },
            ...(item.note
              ? [
                  {
                    text: item.note,
                    options: { fontSize: 12, color: last ? hex(theme.onAccent) : muted },
                  },
                ]
              : []),
          ],
          {
            x: px(80 + index * width),
            y: px(210),
            w: px(width - 40),
            h: px(140),
            align: "center",
            valign: "middle",
            fontFace: font,
          },
        );
        if (!last)
          page.addText("→", {
            x: px(80 + index * width + width - 40),
            y: px(255),
            w: px(40),
            h: px(50),
            align: "center",
            fontSize: 22,
            color: accent,
          });
      });
      break;
    }
    case "timeline": {
      const nodes = items.slice(0, 6);
      const gap = nodes.length > 1 ? 760 / (nodes.length - 1) : 0;
      page.addShape(pptx.ShapeType.line, {
        x: px(100),
        y: px(300),
        w: px(760),
        h: 0,
        line: { color: hex(theme.soft), width: 3 },
      });
      nodes.forEach((item, index) => {
        const x = 100 + index * gap;
        page.addShape(pptx.ShapeType.ellipse, {
          x: px(x - 12),
          y: px(288),
          w: px(24),
          h: px(24),
          fill: { color: index < nodes.length - 1 ? accent : hex(theme.bg) },
          line: { color: accent, width: 3 },
        });
        page.addText(item.note, {
          x: px(x - 80),
          y: px(220),
          w: px(160),
          h: px(40),
          align: "center",
          fontFace: font,
          fontSize: 18,
          bold: true,
          color: accent,
        });
        page.addText(item.text, {
          x: px(x - 80),
          y: px(330),
          w: px(160),
          h: px(60),
          align: "center",
          valign: "top",
          fontFace: font,
          fontSize: 15,
          color: ink,
        });
      });
      break;
    }
    case "funnel":
      items.slice(0, 5).forEach((item, index) => {
        const width = 720 - index * 130;
        page.addText(
          [{ text: item.text, options: { bold: true } }, { text: `   ${item.note || item.value}` }],
          {
            shape: pptx.ShapeType.roundRect,
            x: px(480 - width / 2),
            y: px(140 + index * 72),
            w: px(width),
            h: px(58),
            fill: { color: accent, transparency: index * 16 },
            align: "center",
            fontFace: font,
            fontSize: 16,
            color: hex(theme.onAccent),
            rectRadius: 0.1,
          },
        );
      });
      break;
    case "icons":
      for (const [index, item] of items.slice(0, 6).entries()) {
        const x = 90 + (index % 3) * 280;
        const y = 160 + Math.floor(index / 3) * 150;
        page.addShape(pptx.ShapeType.roundRect, {
          x: px(x),
          y: px(y),
          w: px(76),
          h: px(76),
          fill: { color: hex(theme.soft) },
          line: { type: "none" },
          rectRadius: 0.15,
        });
        const data = await iconPng(item.icon || "sparkles", theme.accent);
        if (data) page.addImage({ data, x: px(x + 18), y: px(y + 18), w: px(40), h: px(40) });
        page.addText(
          [
            { text: item.text, options: { bold: true, fontSize: 17, color: ink, breakLine: true } },
            ...(item.note ? [{ text: item.note, options: { fontSize: 13, color: muted } }] : []),
          ],
          { x: px(x + 92), y: px(y), w: px(170), h: px(76), valign: "middle", fontFace: font },
        );
      }
      break;
    default: {
      const right = slide.image ? 400 : 0;
      page.addText(
        items.slice(0, 6).map((item) => ({
          text: item.note ? `${item.text}  ${item.note}` : item.text,
          options: { bullet: { code: "25CF" }, breakLine: true },
        })),
        {
          x: px(70),
          y: px(140),
          w: px(820 - right),
          h: px(340),
          fontFace: font,
          fontSize: 20,
          color: ink,
          valign: "top",
          paraSpaceAfter: 14,
        },
      );
      if (slide.image) {
        const data = await imageData(slide.image.url);
        if (data)
          page.addImage({
            data,
            x: px(520),
            y: px(130),
            w: px(380),
            h: px(300),
            sizing: { type: "cover", w: px(380), h: px(300) },
          });
        page.addText(slide.image.credit, {
          x: px(520),
          y: px(436),
          w: px(380),
          h: px(20),
          fontSize: 8,
          color: muted,
          fontFace: font,
        });
      }
    }
  }
}

const TRANSITIONS: Record<string, string> = {
  fade: '<p:transition spd="med"><p:fade/></p:transition>',
  push: '<p:transition spd="med"><p:push dir="u"/></p:transition>',
  zoom: '<p:transition spd="med"><p:zoom/></p:transition>',
};

export async function buildPptx(deck: Deck): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = deck.title;
  const theme = themeOf(deck.theme);
  for (const slide of deck.slides) await addSlide(pptx, slide, theme);
  const buffer = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  const transition = TRANSITIONS[deck.transition];
  if (!transition) return new Uint8Array(buffer);
  const zip = await JSZip.loadAsync(buffer);
  for (const name of Object.keys(zip.files).filter((file) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(file),
  )) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("string");
    if (!xml.includes("<p:transition"))
      zip.file(name, xml.replace("</p:sld>", `${transition}</p:sld>`));
  }
  return zip.generateAsync({ type: "uint8array" });
}

async function target(title: string, ext: string) {
  return join(await downloadDir(), fileName(title, ext));
}

export async function exportPptx(store: HubStore, deck: Deck): Promise<string | null> {
  if (!isTauri()) return null;
  const bytes = await buildPptx(deck);
  return store.saveExport(await target(deck.title, "pptx"), bytesToBase64(bytes));
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
