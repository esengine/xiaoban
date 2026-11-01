import type { Message, Quote } from "@xiaoban/protocol";

export type Group =
  | { kind: "user"; message: Message }
  | { kind: "answer"; root: string; versions: Message[] };

export function toGroups(messages: readonly Message[]): Group[] {
  const groups: Group[] = [];
  const answers = new Map<string, Extract<Group, { kind: "answer" }>>();
  for (const message of messages) {
    if (message.role === "user") {
      groups.push({ kind: "user", message });
      continue;
    }
    const group = message.replaces ? answers.get(message.replaces) : undefined;
    if (group) {
      group.versions.push(message);
      continue;
    }
    const answer = { kind: "answer" as const, root: message.id, versions: [message] };
    answers.set(message.id, answer);
    groups.push(answer);
  }
  return groups;
}

export function quoteOf(message: Message, text: string): Quote {
  return { text, from: message.role, at: message.createdAt, messageId: message.id };
}

export function isCancel(text: string, words: string): boolean {
  const cleaned = text.trim().replace(/[\s\p{P}]+$/u, "");
  return words.split("|").some((word) => word && cleaned.toLowerCase() === word.toLowerCase());
}
