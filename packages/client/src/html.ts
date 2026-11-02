export function isHtmlBlock(lang: string | null | undefined, code: string): boolean {
  if (lang && /^(html|htm|xhtml)$/i.test(lang)) return true;
  return /^\s*(<!doctype html|<html[\s>])/i.test(code);
}

function decode(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function clean(text: string): string {
  return decode(text.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

export function htmlTitle(code: string): string | null {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(code)?.[1];
  if (title && clean(title)) return clean(title).slice(0, 60);
  const heading = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(code)?.[1];
  if (heading && clean(heading)) return clean(heading).slice(0, 60);
  return null;
}

export function htmlLines(code: string): number {
  return code.replace(/\n+$/, "").split("\n").length;
}

export function htmlFileName(title: string | null): string {
  const base = (title ?? "page").replace(/[\\/:*?"<>|\s]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "page"}.html`;
}
