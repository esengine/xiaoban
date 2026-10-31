import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const generated = join(root, "packages/protocol/src/generated");

rmSync(generated, { recursive: true, force: true });
mkdirSync(generated, { recursive: true });
execFileSync("cargo", ["test", "-p", "xiaoban-protocol", "--quiet", "--test", "export"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, XIAOBAN_TS_OUT: generated },
});

const rustLib = readFileSync(join(root, "crates/protocol/src/lib.rs"), "utf8");
const version = /PROTOCOL_VERSION: u32 = (\d+);/.exec(rustLib)?.[1];
if (!version) {
  throw new Error("PROTOCOL_VERSION not found in crates/protocol/src/lib.rs");
}
writeFileSync(join(generated, "version.ts"), `export const PROTOCOL_VERSION = ${version};\n`);

const names = readdirSync(generated)
  .filter((file) => file.endsWith(".ts") && file !== "index.ts" && file !== "version.ts")
  .map((file) => file.slice(0, -3))
  .sort();

writeFileSync(
  join(generated, "index.ts"),
  [
    ...names.map((name) => `export type { ${name} } from "./${name}.ts";\n`),
    'export { PROTOCOL_VERSION } from "./version.ts";\n',
  ].join(""),
);

execFileSync("pnpm", ["exec", "biome", "format", "--write", generated], {
  cwd: root,
  stdio: "inherit",
});
