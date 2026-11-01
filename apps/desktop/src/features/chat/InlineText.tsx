import { keyLabel } from "@xiaoban/client";
import { createElement, type ReactNode } from "react";

const TAG = /<(\/?)(sup|sub|kbd|mark|u|ins|del)>|<br\s*\/?>/gi;

interface Frame {
  tag: string;
  children: ReactNode[];
}

export function InlineText({ text }: { text: string }) {
  const stack: Frame[] = [{ tag: "", children: [] }];
  const top = () => stack[stack.length - 1] as Frame;
  let at = 0;
  let key = 0;
  const close = () => {
    const frame = stack.pop() as Frame;
    const label =
      frame.tag === "kbd" && frame.children.length === 1 && typeof frame.children[0] === "string"
        ? keyLabel(frame.children[0])
        : frame.children;
    key += 1;
    top().children.push(
      createElement(
        frame.tag,
        { key, className: frame.tag === "kbd" ? "rich__kbd" : undefined },
        label,
      ),
    );
  };
  for (const match of text.matchAll(TAG)) {
    if (match.index > at) top().children.push(text.slice(at, match.index));
    at = match.index + match[0].length;
    const [, slash, name] = match;
    const tag = name?.toLowerCase();
    if (!tag) {
      key += 1;
      top().children.push(<br key={key} />);
    } else if (!slash) {
      stack.push({ tag, children: [] });
    } else if (stack.some((frame) => frame.tag === tag)) {
      while (stack.length > 1 && top().tag !== tag) close();
      close();
    } else {
      top().children.push(match[0]);
    }
  }
  if (at < text.length) top().children.push(text.slice(at));
  while (stack.length > 1) close();
  return <>{stack[0]?.children}</>;
}
