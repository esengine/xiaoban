export type TokenKind = "plain" | "comment" | "string" | "keyword" | "tag" | "number";

export interface Token {
  text: string;
  kind: TokenKind;
}

type Language = "markup" | "css" | "json" | "script" | "python" | "shell" | "markdown" | "plain";

const LANGUAGES: Record<string, Language> = {
  html: "markup",
  htm: "markup",
  xml: "markup",
  svg: "markup",
  vue: "markup",
  css: "css",
  scss: "css",
  json: "json",
  js: "script",
  mjs: "script",
  cjs: "script",
  jsx: "script",
  ts: "script",
  tsx: "script",
  py: "python",
  sh: "shell",
  md: "markdown",
};

const SCRIPT_WORDS = new Set(
  "const let var function return if else for while do switch case break continue new class extends import export from default async await try catch finally throw typeof instanceof in of this null undefined true false".split(
    " ",
  ),
);
const PYTHON_WORDS = new Set(
  "def class return if elif else for while in not and or import from as with try except finally raise pass break continue lambda None True False".split(
    " ",
  ),
);
const JSON_WORDS = new Set(["true", "false", "null"]);

/** One line of a file, split into pieces to colour. It reads a line at a time, so a comment or a
 *  string that runs over several lines is only coloured on the line where it starts. */
export function tokenize(line: string, extension: string): Token[] {
  const language = LANGUAGES[extension.toLowerCase()] ?? "plain";
  if (language === "plain") return [{ text: line, kind: "plain" }];
  if (language === "markdown") {
    return [{ text: line, kind: /^\s{0,3}#{1,6}\s/.test(line) ? "keyword" : "plain" }];
  }
  const out: Token[] = [];
  const push = (text: string, kind: TokenKind) => {
    if (!text) return;
    const last = out.at(-1);
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  const closing = (from: number, quote: string): number => {
    for (let at = from; at < line.length; at++) {
      if (line[at] === "\\") at++;
      else if (line[at] === quote) return at + 1;
    }
    return line.length;
  };
  let at = 0;
  while (at < line.length) {
    const char = line[at] ?? "";
    const next = line[at + 1] ?? "";
    if (language === "markup" && line.startsWith("<!--", at)) {
      const end = line.indexOf("-->", at);
      const stop = end < 0 ? line.length : end + 3;
      push(line.slice(at, stop), "comment");
      at = stop;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = line.indexOf("*/", at + 2);
      const stop = end < 0 ? line.length : end + 2;
      push(line.slice(at, stop), "comment");
      at = stop;
      continue;
    }
    if (
      (char === "/" && next === "/" && (language === "script" || language === "css")) ||
      (char === "#" && (language === "python" || language === "shell"))
    ) {
      push(line.slice(at), "comment");
      break;
    }
    if (char === '"' || char === "'" || char === "`") {
      const stop = closing(at + 1, char);
      push(line.slice(at, stop), "string");
      at = stop;
      continue;
    }
    if (language === "markup" && char === "<") {
      const end = line.indexOf(">", at);
      const stop = end < 0 ? line.length : end + 1;
      let inside = at;
      while (inside < stop) {
        const quote = line[inside] ?? "";
        if (quote === '"' || quote === "'") {
          const close = Math.min(closing(inside + 1, quote), stop);
          push(line.slice(inside, close), "string");
          inside = close;
        } else {
          let end = inside;
          while (end < stop && line[end] !== '"' && line[end] !== "'") end++;
          push(line.slice(inside, end), "tag");
          inside = end;
        }
      }
      at = stop;
      continue;
    }
    if (/\d/.test(char) && !/[\w$-]/.test(line[at - 1] ?? " ")) {
      let stop = at;
      while (stop < line.length && /[\d.a-z%]/i.test(line[stop] ?? "")) stop++;
      push(line.slice(at, stop), "number");
      at = stop;
      continue;
    }
    if (/[A-Za-z_$@]/.test(char)) {
      let stop = at + 1;
      while (stop < line.length && /[\w$-]/.test(line[stop] ?? "")) stop++;
      const word = line.slice(at, stop);
      const words =
        language === "script"
          ? SCRIPT_WORDS
          : language === "python"
            ? PYTHON_WORDS
            : language === "json"
              ? JSON_WORDS
              : null;
      push(
        word,
        words?.has(word) || (language === "css" && word.startsWith("@")) ? "keyword" : "plain",
      );
      at = stop;
      continue;
    }
    push(char, "plain");
    at++;
  }
  return out;
}

/** The part of a file name after its last dot, lower-cased. */
export function extensionOfName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}
