import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ICONS } from "./SlideView.tsx";

export async function iconPng(name: string, color: string): Promise<string | null> {
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
