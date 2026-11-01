const pages = new Map<string, string>();
let counter = 0;

export function keepHtml(html: string): string {
  counter += 1;
  const id = `h${counter}`;
  pages.set(id, html);
  return id;
}

export function htmlPage(id: string): string | null {
  return pages.get(id) ?? null;
}

export function looksLikeHtml(lang: string | null | undefined, value: string): boolean {
  if (lang && /^(html|htm|xhtml)$/i.test(lang)) return true;
  return /^\s*(<!doctype html|<html[\s>])/i.test(value);
}
