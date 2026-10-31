import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const tauri = join(root, "apps/desktop/src-tauri");
const DEVELOPMENT_REGION = "zh-Hans";
const LANGUAGES = ["zh-Hans", "en"] as const;
const DESKTOP_KEYS = [
  "CFBundleDisplayName",
  "NSLocationUsageDescription",
  "NSLocationWhenInUseUsageDescription",
  "NSMicrophoneUsageDescription",
  "NSSpeechRecognitionUsageDescription",
] as const;

type Strings = Record<(typeof DESKTOP_KEYS)[number], string>;

const load = (language: string): Strings => {
  const all: Record<string, string> = JSON.parse(
    readFileSync(join(root, "locales/native", `${language}.json`), "utf8"),
  );
  return Object.fromEntries(
    DESKTOP_KEYS.map((key) => {
      const value = all[key];
      if (!value) throw new Error(`locales/native/${language}.json is missing ${key}`);
      return [key, value];
    }),
  ) as Strings;
};

const xml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const quoted = (value: string) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

const base = load(DEVELOPMENT_REGION);
const entries = [
  ["CFBundleDevelopmentRegion", DEVELOPMENT_REGION],
  ...DESKTOP_KEYS.filter((key) => key !== "CFBundleDisplayName").map((key) => [key, base[key]]),
]
  .map(([key, value]) => `  <key>${key}</key>\n  <string>${xml(value ?? "")}</string>`)
  .join("\n");

writeFileSync(
  join(tauri, "Info.plist"),
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleAllowMixedLocalizations</key>
  <true/>
${entries}
</dict>
</plist>
`,
);

for (const language of LANGUAGES) {
  const strings = load(language);
  const directory = join(tauri, "lproj", `${language}.lproj`);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "InfoPlist.strings"),
    `${DESKTOP_KEYS.map((key) => `${quoted(key)} = ${quoted(strings[key])};`).join("\n")}\n`,
  );
}
