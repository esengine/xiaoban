import {
  createContext,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface Hotkey {
  key: string;
  command?: boolean;
  shift?: boolean;
}

export interface MenuItem {
  label: string;
  shortcut?: string | undefined;
  hotkey?: Hotkey;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export type MenuEntry = MenuItem | "separator";

interface OpenMenu {
  x: number;
  y: number;
  entries: MenuEntry[];
  closing?: boolean;
}

type Open = (event: ReactMouseEvent, entries: MenuEntry[]) => void;

const MenuContext = createContext<Open | null>(null);

const EDGE = 8;
const CLOSE_MS = 80;

function Menu({ menu, onClose }: { menu: OpenMenu; onClose: () => void }) {
  const list = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: menu.x, top: menu.y, origin: "0 0" });
  const [active, setActive] = useState(-1);
  const items = menu.entries.flatMap((entry, index) =>
    entry !== "separator" && !entry.disabled ? [index] : [],
  );

  useLayoutEffect(() => {
    const box = list.current?.getBoundingClientRect();
    if (!box) return;
    const flipX = menu.x + box.width + EDGE > window.innerWidth;
    const flipY = menu.y + box.height + EDGE > window.innerHeight;
    const left = flipX ? Math.max(EDGE, menu.x - box.width) : menu.x;
    const top = flipY ? Math.max(EDGE, menu.y - box.height) : menu.y;
    setPosition({ left, top, origin: `${flipX ? "100%" : "0"} ${flipY ? "100%" : "0"}` });
  }, [menu]);

  useEffect(() => {
    const close = () => onClose();
    const outside = (event: PointerEvent) => {
      if (!list.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close);
    };
  }, [onClose]);

  const choose = (index: number) => {
    const entry = menu.entries[index];
    if (!entry || entry === "separator" || entry.disabled) return;
    onClose();
    entry.onSelect();
  };

  const keys = useRef<(event: KeyboardEvent) => void>(() => undefined);
  keys.current = (event: KeyboardEvent) => {
    const at = items.indexOf(active);
    if (event.key === "Escape") onClose();
    else if (event.key === "ArrowDown") setActive(items[(at + 1) % items.length] ?? -1);
    else if (event.key === "ArrowUp")
      setActive(items[(at - 1 + items.length) % items.length] ?? -1);
    else if (event.key === "Enter") choose(active);
    else {
      const hit = menu.entries.findIndex(
        (entry) =>
          entry !== "separator" &&
          entry.hotkey !== undefined &&
          entry.hotkey.key === event.key.toLowerCase() &&
          Boolean(entry.hotkey.command) === (event.metaKey || event.ctrlKey) &&
          Boolean(entry.hotkey.shift) === event.shiftKey,
      );
      if (hit < 0) return;
      choose(hit);
    }
    event.preventDefault();
    event.stopPropagation();
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);

  return (
    <div
      ref={list}
      role="menu"
      className="context-menu"
      data-closing={menu.closing || undefined}
      style={{ left: position.left, top: position.top, transformOrigin: position.origin }}
      onPointerDown={(event) => event.preventDefault()}
    >
      {menu.entries.map((entry, index) =>
        entry === "separator" ? (
          <hr key={`separator-${index}`} className="context-menu__separator" />
        ) : (
          <button
            key={entry.label}
            type="button"
            role="menuitem"
            className={`context-menu__item${entry.danger ? " context-menu__item--danger" : ""}`}
            data-active={index === active || undefined}
            disabled={entry.disabled}
            onPointerEnter={() => setActive(index)}
            onClick={() => choose(index)}
          >
            <span>{entry.label}</span>
            {entry.shortcut && <span className="context-menu__shortcut">{entry.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );
}

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<OpenMenu | null>(null);
  const close = useCallback(() => {
    setMenu((open) => (open && !open.closing ? { ...open, closing: true } : open));
    window.setTimeout(() => setMenu((open) => (open?.closing ? null : open)), CLOSE_MS);
  }, []);
  const open = useCallback<Open>((event, entries) => {
    event.preventDefault();
    event.stopPropagation();
    if (entries.length === 0) return;
    setMenu({ x: event.clientX, y: event.clientY, entries });
  }, []);

  useEffect(() => {
    const suppress = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("contextmenu", suppress);
    return () => window.removeEventListener("contextmenu", suppress);
  }, []);

  return (
    <MenuContext value={open}>
      {children}
      {menu && createPortal(<Menu menu={menu} onClose={close} />, document.body)}
    </MenuContext>
  );
}

export function useContextMenu(): Open {
  const open = use(MenuContext);
  if (!open) throw new Error("useContextMenu must be used inside ContextMenuProvider");
  return open;
}
