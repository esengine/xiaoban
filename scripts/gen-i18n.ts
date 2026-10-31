import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Expression,
  type InlineExpression,
  Message,
  type Pattern,
  Placeable,
  parse,
  SelectExpression,
  VariableReference,
} from "@fluent/syntax";

const root = join(import.meta.dirname, "..");
const locales = ["zh-CN", "en"] as const;
const out = join(root, "packages/i18n/src/generated");

function variables(pattern: Pattern | null, found = new Set<string>()): Set<string> {
  for (const element of pattern?.elements ?? []) {
    if (element instanceof Placeable) visit(element.expression, found);
  }
  return found;
}

function visit(expression: Expression | InlineExpression, found: Set<string>): void {
  if (expression instanceof VariableReference) found.add(expression.id.name);
  else if (expression instanceof Placeable) visit(expression.expression, found);
  else if (expression instanceof SelectExpression) {
    visit(expression.selector, found);
    for (const variant of expression.variants) variables(variant.value, found);
  }
}

const sources = Object.fromEntries(
  locales.map((locale) => [
    locale,
    readFileSync(join(root, "locales", locale, "main.ftl"), "utf8"),
  ]),
) as Record<(typeof locales)[number], string>;

const catalogs = locales.map((locale) => {
  const resource = parse(sources[locale], {});
  const junk = resource.body.filter((entry) => entry.type === "Junk");
  if (junk.length > 0) throw new Error(`${locale}: invalid Fluent syntax`);
  const messages = new Map<string, string[]>();
  for (const entry of resource.body) {
    if (entry instanceof Message) {
      messages.set(entry.id.name, [...variables(entry.value)].sort());
    }
  }
  return { locale, messages };
});

const [base, ...rest] = catalogs;
if (!base) throw new Error("no locales");
for (const { locale, messages } of rest) {
  const same =
    messages.size === base.messages.size &&
    [...base.messages].every(([key, vars]) => messages.get(key)?.join() === vars.join());
  if (!same)
    throw new Error(`locale ${locale} does not match ${base.locale}: keys or variables differ`);
}

const keys = [...base.messages.keys()].sort();
const argTypes = keys.map((key) => {
  const vars = base.messages.get(key) ?? [];
  const shape = vars.length
    ? `{ ${vars.map((name) => `${name}: string | number`).join("; ")} }`
    : "undefined";
  return `  ${JSON.stringify(key)}: ${shape};`;
});

mkdirSync(out, { recursive: true });
writeFileSync(
  join(out, "catalogs.ts"),
  [
    `export const catalogs = ${JSON.stringify(sources, null, 2)} as const;`,
    "",
    `export type MessageKey = ${keys.map((key) => JSON.stringify(key)).join(" | ")};`,
    "",
    "export interface MessageArgs {",
    ...argTypes,
    "}",
    "",
  ].join("\n"),
);

execFileSync("pnpm", ["exec", "biome", "format", "--write", out], { cwd: root, stdio: "inherit" });
