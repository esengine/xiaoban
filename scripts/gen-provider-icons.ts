import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const SOURCES = {
  deepseek: "deepseek-color",
  mimo: "xiaomimimo",
} as const;

const OWN = {
  custom:
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#3451D1" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7V3M15 7V3"/><path d="M6 7h12v4a6 6 0 0 1-12 0z"/><path d="M12 17v4"/></svg>',
} as const;

const root = join(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const library = join(dirname(require.resolve("@lobehub/icons-static-svg/package.json")), "icons");
const out = join(root, "packages/provider-icons/src/generated");

function clean(svg: string): string {
  return svg
    .replace(/<title>[^<]*<\/title>/g, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .trim();
}

const entries = [
  ...Object.entries(SOURCES).map(([id, file]) => {
    const svg = clean(readFileSync(join(library, `${file}.svg`), "utf8"));
    return `  ${id}: ${JSON.stringify(svg)},`;
  }),
  ...Object.entries(OWN).map(([id, svg]) => `  ${id}: ${JSON.stringify(svg)},`),
];

mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "icons.ts"),
  [
    'import type { ProviderId } from "@xiaoban/protocol";',
    "",
    "export const providerSvgs = {",
    ...entries,
    "} as const satisfies Record<ProviderId, string>;",
    "",
  ].join("\n"),
);

execFileSync("pnpm", ["exec", "biome", "format", "--write", out], { cwd: root, stdio: "inherit" });
