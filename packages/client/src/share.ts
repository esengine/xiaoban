import type { ShareKind } from "@xiaoban/protocol";

const LINK = /https?:\/\/[^\s"<>]+/;

export function firstLink(text: string | null | undefined): string | null {
  return text ? (LINK.exec(text)?.[0] ?? null) : null;
}

export function hostOf(link: string | null): string | null {
  if (!link) return null;
  return link.split("/")[2] ?? null;
}

export function shareKind(input: {
  text: string | null;
  files: readonly { image: boolean }[];
}): ShareKind {
  if (input.files.length > 0) return input.files.every((file) => file.image) ? "image" : "file";
  return firstLink(input.text) ? "link" : "text";
}

export function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toUpperCase() : "";
}
