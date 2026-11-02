const pages = new Map<string, string>();
let counter = 0;

export function keepHtml(html: string): string {
  counter += 1;
  const id = `h${counter}`;
  pages.set(id, html);
  return id;
}

const notes = new Map<string, string>();

export function keepMarkdown(text: string): string {
  counter += 1;
  const id = `m${counter}`;
  notes.set(id, text);
  return id;
}

export function markdownPage(id: string): string | null {
  return notes.get(id) ?? null;
}

export function markdownOutline(text: string): { title: string | null; sections: string[] } {
  const heads = text
    .split("\n")
    .map((line) => /^#{1,3}\s+(.+?)\s*#*\s*$/.exec(line)?.[1]?.replace(/[*_`]/g, ""))
    .filter((line): line is string => Boolean(line));
  const first =
    text
      .split("\n")
      .find((line) => line.trim() !== "")
      ?.trim() ?? "";
  if (heads.length > 0 && /^#\s/.test(first))
    return { title: heads[0] ?? null, sections: heads.slice(1) };
  return { title: null, sections: heads };
}

export function htmlPage(id: string): string | null {
  return pages.get(id) ?? null;
}

