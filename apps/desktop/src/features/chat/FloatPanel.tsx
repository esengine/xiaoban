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
const EXIT_MS = 140;

export function FloatPanel({
  open,
  anchor,
  onClose,
  label,
  className,
  children,
}: {
  open: boolean;
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  label: string;
  className: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const timer = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);

  if (!mounted) return null;
  return (
    <Placed anchor={anchor} onClose={onClose} label={label} className={className} leaving={leaving}>
      {children}
    </Placed>
  );
}

function Placed({
  anchor,
  onClose,
  label,
  className,
  leaving,
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  label: string;
  className: string;
  leaving: boolean;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ right: number; bottom: number } | null>(null);
  const close = useRef(onClose);
  close.current = onClose;

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
    if (leaving) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return;
      close.current();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [anchor, leaving]);

  return createPortal(
    <div
      ref={panel}
      className={`float-panel ${className}`}
      role="dialog"
      aria-label={label}
      data-placed={place ? true : undefined}
      data-leaving={leaving || undefined}
      style={place ? { right: place.right, bottom: place.bottom } : { visibility: "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
