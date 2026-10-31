#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const IDENTIFIER = "app.xiaoban.desktop";
const BINARY = "xiaoban-desktop";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);

const cargo = (cargoArgs: string[]) => {
  const { status } = spawnSync("cargo", cargoArgs, { stdio: "inherit" });
  if (status !== 0) process.exit(status ?? 1);
};

const signingIdentity = (): string | undefined => {
  const configured = process.env.XIAOBAN_DEV_SIGNING_IDENTITY;
  if (configured) return configured;
  const identities = execFileSync("security", ["find-identity", "-v", "-p", "codesigning"], {
    encoding: "utf8",
  });
  return /"(Apple Development: [^"]+)"/.exec(identities)?.[1];
};

const sign = (binary: string) => {
  const identity = signingIdentity();
  if (!identity) {
    console.warn(
      "dev-runner: no Apple Development identity found; the keychain will ask again after every rebuild",
    );
    return;
  }
  execFileSync("codesign", ["--force", "--sign", identity, "--identifier", IDENTIFIER, binary], {
    stdio: "inherit",
  });
};

if (process.platform !== "darwin" || args[0] !== "run") {
  cargo(args);
  process.exit(0);
}

const separator = args.indexOf("--");
const buildArgs = ["build", ...(separator === -1 ? args.slice(1) : args.slice(1, separator))];
cargo(buildArgs);

const targetDir = process.env.CARGO_TARGET_DIR ?? join(root, "target");
const profile = buildArgs.includes("--release") ? "release" : "debug";
const binary = join(targetDir, profile, BINARY);
if (!existsSync(binary)) throw new Error(`dev-runner: ${binary} was not built`);
sign(binary);
const appArgs = separator === -1 ? [] : args.slice(separator + 1);
const app = spawnSync(binary, appArgs, { stdio: "inherit" });
process.exit(app.status ?? 1);
