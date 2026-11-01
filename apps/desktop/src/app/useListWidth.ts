import { type PointerEvent, useCallback, useEffect, useState } from "react";

const KEY = "xiaoban.list.width";
const DEFAULT = 300;
const MIN = 240;
const MAX = 420;
const RAIL = 72;

export function useListWidth() {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem(KEY));
    return saved >= MIN && saved <= MAX ? saved : DEFAULT;
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    localStorage.setItem(KEY, String(width));
  }, [width]);

  const start = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    setDragging(true);
    const move = (moved: globalThis.PointerEvent) =>
      setWidth(Math.round(Math.max(MIN, Math.min(MAX, moved.clientX - RAIL))));
    const stop = () => {
      setDragging(false);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }, []);

  const reset = useCallback(() => setWidth(DEFAULT), []);
  return { width, dragging, start, reset };
}
