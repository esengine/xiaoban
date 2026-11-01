import type { Deck, Slide } from "@xiaoban/protocol";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { type SlideTheme, themeOf } from "./theme.ts";

export type PptxIcon = { name: string; color: string };

export type PptxAssets = {
  icon: (name: string, color: string) => Promise<string | null>;
  image?: (url: string) => Promise<string | null>;
};

const IN = 96;
const px = (value: number) => value / IN;
const hex = (color: string) => color.replace("#", "").slice(0, 6);
const ICON_FALLBACK = "sparkles";

export function iconKey(icon: PptxIcon) {
  return `${icon.name}|${icon.color}`;
}

export function deckIcons(deck: Deck): PptxIcon[] {
  const color = themeOf(deck.theme).accent;
  const names = new Set(
    deck.slides
      .filter((slide) => slide.layout === "icons")
      .flatMap((slide) => slide.items.slice(0, 6).map((item) => item.icon || ICON_FALLBACK)),
  );
  return [...names].map((name) => ({ name, color }));
}

export async function imageData(url: string): Promise<string | null> {
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

async function addSlide(pptx: PptxGenJS, slide: Slide, theme: SlideTheme, assets: PptxAssets) {
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
        const data = await assets.icon(item.icon || ICON_FALLBACK, theme.accent);
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
        const data = await (assets.image ?? imageData)(slide.image.url);
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

async function build<T extends "uint8array" | "base64">(
  deck: Deck,
  assets: PptxAssets,
  type: T,
): Promise<T extends "base64" ? string : Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = deck.title;
  const theme = themeOf(deck.theme);
  for (const slide of deck.slides) await addSlide(pptx, slide, theme, assets);
  const transition = TRANSITIONS[deck.transition];
  if (!transition) {
    const out = await pptx.write({ outputType: type === "base64" ? "base64" : "uint8array" });
    return out as T extends "base64" ? string : Uint8Array;
  }
  const buffer = (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
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
  return zip.generateAsync({ type }) as Promise<T extends "base64" ? string : Uint8Array>;
}

export function buildPptx(deck: Deck, assets: PptxAssets): Promise<Uint8Array> {
  return build(deck, assets, "uint8array");
}

export function buildPptxBase64(deck: Deck, assets: PptxAssets): Promise<string> {
  return build(deck, assets, "base64");
}
