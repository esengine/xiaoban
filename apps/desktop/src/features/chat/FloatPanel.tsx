import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

const GAP = 8;
const EDGE = 8;

export function FloatPanel({
  anchor,
  onClose,
  label,
  className,
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  label: string;
  className: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ right: number; bottom: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const width = panel.current?.offsetWidth ?? 0;
      const right = Math.min(window.innerWidth - rect.right, window.innerWidth - width - EDGE);
      setPlace({ right: Math.max(EDGE, right), bottom: window.innerHeight - rect.top + GAP });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anchor]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={panel}
      className={`float-panel ${className}`}
      role="dialog"
      aria-label={label}
      style={place ? { right: place.right, bottom: place.bottom } : { visibility: "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
