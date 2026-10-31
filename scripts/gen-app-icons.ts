import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { color } from "../packages/tokens/src/index.ts";

const root = join(import.meta.dirname, "..");
const master = readFileSync(join(root, "assets/brand/app-icon.svg"), "utf8");
const mark = /<g id="mark"[\s\S]*?<\/g>/.exec(master)?.[0];
if (!mark) throw new Error('assets/brand/app-icon.svg must contain <g id="mark">');

const SIZE = 1024;
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${body}</svg>`;
const scaled = (factor: number) =>
  `<g transform="translate(512 512) scale(${factor}) translate(-512 -512)">${mark}</g>`;

function render(source: string, file: string): void {
  const png = new Resvg(source, { fitTo: { mode: "width", value: SIZE } }).render().asPng();
  writeFileSync(join(root, file), png);
}

render(master, "apps/desktop/src-tauri/app-icon.png");
render(
  svg(`<rect width="${SIZE}" height="${SIZE}" fill="${color.accent}"/>${scaled(SIZE / 824)}`),
  "apps/mobile/assets/icon.png",
);
render(svg(scaled(1)), "apps/mobile/assets/adaptive-icon.png");

const icons = join(root, "apps/desktop/src-tauri/icons");
execFileSync(
  "pnpm",
  [
    "--filter",
    "@xiaoban/desktop",
    "tauri",
    "icon",
    "src-tauri/app-icon.png",
    "-o",
    "src-tauri/icons",
  ],
  {
    cwd: root,
    stdio: "inherit",
  },
);
for (const platform of ["android", "ios"])
  rmSync(join(icons, platform), { recursive: true, force: true });
