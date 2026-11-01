import type { DocBlock } from "@xiaoban/protocol";

export function plainText(blocks: DocBlock[]) {
  let number = 0;
  return blocks
    .map((block) => {
      number = block.kind === "number" ? number + 1 : 0;
      const text = block.text.replaceAll("**", "");
      if (block.kind === "bullet") return `• ${text}`;
      if (block.kind === "number") return `${number}. ${text}`;
      return text;
    })
    .join("\n\n");
}

export function countChars(blocks: DocBlock[]) {
  return blocks.reduce((sum, block) => sum + block.text.replaceAll("**", "").length, 0);
}

export function colName(index: number) {
  let name = "";
  let value = index;
  do {
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return name;
}

export function cellName(row: number, col: number) {
  return `${colName(col)}${row + 1}`;
}

export function parseRange(text: string) {
  const match = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/i.exec(text.trim());
  if (!match) return null;
  const col = (letters: string) =>
    letters
      .toUpperCase()
      .split("")
      .reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
  const r1 = Number(match[2]) - 1;
  const c1 = col(match[1] ?? "A");
  const r2 = match[4] ? Number(match[4]) - 1 : r1;
  const c2 = match[3] ? col(match[3]) : c1;
  return { r1: Math.min(r1, r2), c1: Math.min(c1, c2), r2: Math.max(r1, r2), c2: Math.max(c1, c2) };
}

export function toNumber(text: string) {
  const cleaned = text.replace(/[,¥$\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned.endsWith("%") ? cleaned.slice(0, -1) : cleaned);
  if (!Number.isFinite(value)) return null;
  return cleaned.endsWith("%") ? value / 100 : value;
}

export function toCsv(grid: string[][]) {
  return grid
    .map((row) =>
      row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell)).join(","),
    )
    .join("\n");
}

export function toTsv(grid: string[][]) {
  return grid.map((row) => row.join("\t")).join("\n");
}

const UNSAFE_NAME = /[\\/:*?"<>|\n\r\t]/g;

export function fileName(title: string, ext: string) {
  const base = title.replace(UNSAFE_NAME, " ").trim().slice(0, 60);
  return `${base || "document"}.${ext}`;
}
