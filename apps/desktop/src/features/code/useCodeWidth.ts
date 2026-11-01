import { type PointerEvent, useCallback, useEffect, useState } from "react";

const KEY = "xiaoban.code.width";
const DEFAULT = 680;
const MIN = 420;
const CHAT_MIN = 440;
const COLLAPSE_AFTER = 80;

interface Saved {
  width: number;
  chatHidden: boolean;
}

function load(): Saved {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (value && typeof value.width === "number") return value;
  } catch {}
  return { width: DEFAULT, chatHidden: false };
}

const RAIL = 72;

export function useCodeWidth(listWidth: number, label: (width: number) => string) {
  const [saved, setSaved] = useState<Saved>(load);
  const [dragging, setDragging] = useState(false);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const leftEdge = useCallback(() => RAIL + listWidth, [listWidth]);

  useEffect(() => {
    const resize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(saved));
  }, [saved]);

  const start = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      const panel = handle.parentElement;
      const shell = panel?.parentElement;
      handle.setPointerCapture(event.pointerId);
      setDragging(true);
      let next: Saved | null = null;
      const move = (moved: globalThis.PointerEvent) => {
        const wanted = window.innerWidth - moved.clientX;
        const room = window.innerWidth - leftEdge();
        const max = room - CHAT_MIN;
        next =
          wanted > max + COLLAPSE_AFTER
            ? { width: next?.width ?? saved.width, chatHidden: true }
            : { width: Math.round(Math.max(MIN, Math.min(max, wanted))), chatHidden: false };
        panel?.style.setProperty("--code-width", `${next.width}px`);
        panel?.toggleAttribute("data-full", next.chatHidden);
        shell?.toggleAttribute("data-chat-hidden", next.chatHidden);
        const tag = handle.querySelector(".code-resize__label");
        if (tag) tag.textContent = label(next.width);
      };
      const stop = () => {
        if (next) setSaved(next);
        setDragging(false);
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
    },
    [leftEdge, label, saved.width],
  );

  const reset = useCallback(() => setSaved({ width: DEFAULT, chatHidden: false }), []);

  const room = windowWidth - leftEdge() - CHAT_MIN;
  const width = Math.max(MIN, Math.min(saved.width, room));
  return { width, chatHidden: saved.chatHidden, dragging, start, reset };
}
