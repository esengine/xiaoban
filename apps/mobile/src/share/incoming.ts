import { shareKind } from "@xiaoban/client";
import type { ShareKind } from "@xiaoban/protocol";
import { XiaobanHub } from "../../modules/xiaoban-hub/index.ts";

export interface IncomingFile {
  uri: string;
  name: string;
  size: number;
  mime: string;
  image: boolean;
}

export interface Incoming {
  kind: ShareKind;
  text: string | null;
  subject: string | null;
  files: IncomingFile[];
  skipped: number;
}

const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseIncoming(raw: string | null): Incoming | null {
  if (!raw) return null;
  const data = JSON.parse(raw) as {
    text?: unknown;
    subject?: unknown;
    files?: { uri: string; name: string; size: number; mime: string }[];
    skipped?: number;
  };
  const files = (data.files ?? []).map((file) => ({
    ...file,
    image: file.mime.startsWith("image/") || IMAGE.test(file.name),
  }));
  const text = textOf(data.text);
  return {
    kind: shareKind({ text, files }),
    text,
    subject: textOf(data.subject),
    files,
    skipped: data.skipped ?? 0,
  };
}

export async function takeIncoming(): Promise<Incoming | null> {
  if (!XiaobanHub?.takeShare) return null;
  return parseIncoming(await XiaobanHub.takeShare());
}
