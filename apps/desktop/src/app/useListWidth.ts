import { type PointerEvent, useCallback, useEffect, useState } from "react";

const KEY = "xiaoban.list.width";
const DEFAULT = 300;
const MIN = 240;
const MAX = 420;
const RAIL = 72;

export function useListWidth(label: (width: number) => string) {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(KEY));
    return saved >= MIN && saved <= MAX ? saved : DEFAULT;
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    localStorage.setItem(KEY, String(width));
  }, [width]);

  const start = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      const panel = handle.parentElement;
      handle.setPointerCapture(event.pointerId);
      setDragging(true);
      let next: number | null = null;
      let frame = 0;
      let latest = 0;
      const move = (moved: globalThis.PointerEvent) => {
        latest = moved.clientX;
        if (!frame) frame = requestAnimationFrame(apply);
      };
      const apply = () => {
        frame = 0;
        next = Math.round(Math.max(MIN, Math.min(MAX, latest - RAIL)));
        panel?.style.setProperty("--list-width", `${next}px`);
        const tag = handle.querySelector(".code-resize__label");
        if (tag) tag.textContent = label(next);
      };
      const stop = () => {
        if (frame) cancelAnimationFrame(frame);
        if (next !== null) setWidth(next);
        setDragging(false);
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
    },
    [label],
  );

  const reset = useCallback(() => setWidth(DEFAULT), []);
  return { width, dragging, start, reset };
}
