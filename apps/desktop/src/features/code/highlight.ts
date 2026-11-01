import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import scss from "highlight.js/lib/languages/scss";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

const LANGUAGES = {
  bash,
  c,
  cpp,
  csharp,
  css,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  php,
  python,
  ruby,
  rust,
  scss,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};

for (const [name, language] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, language);

const BY_EXTENSION: Record<string, keyof typeof LANGUAGES> = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  rs: "rust",
  py: "python",
  go: "go",
  css: "css",
  scss: "scss",
  less: "scss",
  json: "json",
  jsonc: "json",
  md: "markdown",
  html: "xml",
  htm: "xml",
  xml: "xml",
  svg: "xml",
  vue: "xml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  toml: "ini",
  ini: "ini",
  yaml: "yaml",
  yml: "yaml",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  hpp: "cpp",
  cs: "csharp",
  rb: "ruby",
  php: "php",
  sql: "sql",
};

const MAX_CHARS = 300_000;

export function languageOf(path: string): string | null {
  const name = path.split("/").pop() ?? path;
  const ext = name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
  return BY_EXTENSION[ext] ?? null;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function splitLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let current = "";
  const pattern = /<span class="[^"]*">|<\/span>|\n/g;
  let last = 0;
  for (const match of html.matchAll(pattern)) {
    current += html.slice(last, match.index);
    last = match.index + match[0].length;
    const token = match[0];
    if (token === "\n") {
      lines.push(current + "</span>".repeat(open.length));
      current = open.join("");
    } else if (token === "</span>") {
      open.pop();
      current += token;
    } else {
      open.push(token);
      current += token;
    }
  }
  lines.push(current + html.slice(last));
  return lines;
}

export function highlightLines(text: string, path: string): string[] {
  const language = languageOf(path);
  if (!language || text.length > MAX_CHARS) return text.split("\n").map(escapeHtml);
  try {
    return splitLines(hljs.highlight(text, { language, ignoreIllegals: true }).value);
  } catch {
    return text.split("\n").map(escapeHtml);
  }
}

export function highlightLine(text: string, path: string): string {
  return highlightLines(text, path)[0] ?? "";
}
