import { type PointerEvent, useCallback, useEffect, useState } from "react";

const KEY = "xiaoban.code.width";
const DEFAULT = 680;
const MIN = 420;
const CHAT_MIN = 360;
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

export function useCodeWidth(leftEdge: () => number) {
  const [saved, setSaved] = useState<Saved>(load);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(saved));
  }, [saved]);

  const start = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      setDragging(true);
      const move = (moved: globalThis.PointerEvent) => {
        const wanted = window.innerWidth - moved.clientX;
        const room = window.innerWidth - leftEdge();
        const max = room - CHAT_MIN;
        if (wanted > max + COLLAPSE_AFTER) {
          setSaved((current) => ({ ...current, chatHidden: true }));
          return;
        }
        setSaved({ width: Math.max(MIN, Math.min(max, wanted)), chatHidden: false });
      };
      const stop = () => {
        setDragging(false);
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
    },
    [leftEdge],
  );

  const reset = useCallback(() => setSaved({ width: DEFAULT, chatHidden: false }), []);

  return { width: saved.width, chatHidden: saved.chatHidden, dragging, start, reset };
}
