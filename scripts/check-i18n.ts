import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SOURCE = /\.(rs|ts|tsx|json|html)$/;
const SKIP = [
  /^locales\//,
  /\/tests?\//,
  /\.test\.tsx?$/,
  /\/generated\//,
  /^pnpm-lock\.yaml$/,
  /node_modules/,
];
const CJK = new RegExp(
  "[" +
    [
      [0x3400, 0x9fff],
      [0xf900, 0xfaff],
      [0x3000, 0x303f],
      [0xff00, 0xffef],
    ]
      .map(([from, to]) => `\\u{${from.toString(16)}}-\\u{${to.toString(16)}}`)
      .join("") +
    "]",
  "u",
);
const USER_FACING_PROP =
  /\b(placeholder|title|alt|aria-label|aria-description|accessibilityLabel|accessibilityHint)="[^"]*\p{L}[^"]*"/u;

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((file) => SOURCE.test(file) && !SKIP.some((pattern) => pattern.test(file)))
  .filter((file) => existsSync(file));

const problems: string[] = [];
for (const file of files) {
  let text = readFileSync(file, "utf8");
  if (file.endsWith(".rs")) text = text.split("#[cfg(test)]")[0] ?? text;
  text.split("\n").forEach((line, index) => {
    const where = `${file}:${index + 1}`;
    if (CJK.test(line)) problems.push(`${where}  hard-coded CJK text: ${line.trim()}`);
    if (file.endsWith(".tsx") && USER_FACING_PROP.test(line)) {
      problems.push(`${where}  user-facing prop must use t(): ${line.trim()}`);
    }
  });
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(
    `\n${problems.length} hard-coded string(s). Add a key under locales/ and use it instead.`,
  );
  process.exit(1);
}
console.log(`i18n check passed (${files.length} files)`);
