import type { Message } from "@xiaoban/protocol";

export type Row =
  | { kind: "user"; message: Message }
  | { kind: "answer"; root: string; versions: Message[] };

export function toRows(messages: Message[]): Row[] {
  const rows: Row[] = [];
  const answers = new Map<string, Extract<Row, { kind: "answer" }>>();
  for (const message of messages) {
    if (message.role === "user") {
      rows.push({ kind: "user", message });
      continue;
    }
    const group = message.replaces ? answers.get(message.replaces) : undefined;
    if (group) {
      group.versions.push(message);
      continue;
    }
    const row = { kind: "answer" as const, root: message.id, versions: [message] };
    answers.set(message.id, row);
    rows.push(row);
  }
  return rows;
}
