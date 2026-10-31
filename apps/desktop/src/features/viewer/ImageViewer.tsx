import { invoke, isTauri } from "@tauri-apps/api/core";
import { useI18n } from "@xiaoban/i18n/react";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { openExternal } from "../../lib/external.ts";

export interface ViewerImage {
  src: string;
  name: string;
  source?: string | null;
}

interface Open {
  images: ViewerImage[];
  index: number;
  from: DOMRect | null;
}

type Show = (images: ViewerImage[], index: number, from: Element | null) => void;

const ViewerContext = createContext<Show | null>(null);

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const CLOSE_MS = 200;
const TOAST_MS = 1_600;

async function bytesOf(src: string): Promise<{ bytes: number[]; blob: Blob }> {
  const blob = await (await fetch(src)).blob();
  return { blob, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
}

function site(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function Viewer({ open, onClose }: { open: Open; onClose: () => void }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(open.index);
  const [scale, setScale] = useState<number | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [closing, setClosing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);
  const image: ViewerImage = open.images[index] ?? open.images[0] ?? { src: "", name: "" };
  const picture = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [from, setFrom] = useState<string | null>(null);

  useLayoutEffect(() => {
    const target = picture.current?.getBoundingClientRect();
    const start = open.from;
    if (!target || !start || target.width === 0) {
      setEntered(true);
      return;
    }
    const dx = start.left + start.width / 2 - (target.left + target.width / 2);
    const dy = start.top + start.height / 2 - (target.top + target.height / 2);
    const ratio = Math.max(start.width / target.width, start.height / target.height);
    setFrom(`translate(${dx}px, ${dy}px) scale(${ratio})`);
    requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
  }, [open.from]);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, CLOSE_MS);
  }, [onClose]);

  const go = useCallback(
    (step: number) => {
      setIndex((current) => (current + step + open.images.length) % open.images.length);
      setScale(null);
      setOffset({ x: 0, y: 0 });
      setFrom(null);
    },
    [open.images.length],
  );

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      else if (event.key === "ArrowLeft" && open.images.length > 1) go(-1);
      else if (event.key === "ArrowRight" && open.images.length > 1) go(1);
      else return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [close, go, open.images.length]);

  const fitScale = () => {
    const node = picture.current;
    if (!node?.naturalWidth) return 1;
    return node.getBoundingClientRect().width / node.naturalWidth / (scale ?? 1);
  };
  const current = scale ?? 1;
  const shownPercent = Math.round((picture.current?.naturalWidth ? fitScale() : 1) * current * 100);

  const zoom = (factor: number) =>
    setScale((value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, (value ?? 1) * factor)));

  const flash = (text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), TOAST_MS);
  };
  const copy = async () => {
    try {
      const { blob } = await bytesOf(image.src);
      const png = blob.type === "image/png" ? blob : await toPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      flash(t("viewer-copied"));
    } catch {
      flash(t("viewer-failed"));
    }
  };
  const save = async () => {
    if (!isTauri()) return;
    try {
      const { bytes } = await bytesOf(image.src);
      await invoke<string>("save_image", { name: image.name, bytes });
      flash(t("viewer-saved"));
    } catch {
      flash(t("viewer-failed"));
    }
  };
  const preview = async () => {
    if (!isTauri()) return;
    try {
      const { bytes } = await bytesOf(image.src);
      await invoke("preview_image", { name: image.name, bytes });
    } catch {
      flash(t("viewer-failed"));
    }
  };

  const stage = useRef<HTMLDivElement>(null);
  const handlers = useRef({
    wheel: (_event: WheelEvent) => undefined as void,
    dblclick: () => undefined as void,
    down: (_event: PointerEvent) => undefined as void,
    move: (_event: PointerEvent) => undefined as void,
  });
  handlers.current = {
    wheel: (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1);
    },
    dblclick: () => {
      if (scale === null) {
        const fit = fitScale();
        setScale(fit > 0 ? 1 / fit : 2);
      } else {
        setScale(null);
        setOffset({ x: 0, y: 0 });
      }
    },
    down: (event) => {
      if (scale === null || scale <= 1) return;
      (event.target as Element).setPointerCapture?.(event.pointerId);
      drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    },
    move: (event) => {
      const start = drag.current;
      if (!start) return;
      setOffset({ x: start.ox + event.clientX - start.x, y: start.oy + event.clientY - start.y });
    },
  };
  useEffect(() => {
    const node = stage.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => handlers.current.wheel(event);
    const dblclick = () => handlers.current.dblclick();
    const down = (event: PointerEvent) => handlers.current.down(event);
    const move = (event: PointerEvent) => handlers.current.move(event);
    const up = () => {
      drag.current = null;
    };
    node.addEventListener("wheel", wheel, { passive: false });
    node.addEventListener("dblclick", dblclick);
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    return () => {
      node.removeEventListener("wheel", wheel);
      node.removeEventListener("dblclick", dblclick);
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
    };
  }, []);

  const source = site(image.source);
  return (
    <div
      className="viewer"
      data-entered={(entered && !closing) || undefined}
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
    >
      <button
        type="button"
        className="viewer__backdrop"
        aria-label={t("viewer-close")}
        onClick={close}
      />
      <header className="viewer__bar">
        <span className="viewer__title">
          {image.name}
          {open.images.length > 1 && (
            <span className="viewer__count">{` · ${index + 1} / ${open.images.length}`}</span>
          )}
        </span>
        {image.source && (
          <button
            type="button"
            className="viewer__tool"
            onClick={() => void openExternal(image.source ?? "")}
          >
            {t("viewer-open-page", { site: source ?? "" })}
          </button>
        )}
        <button type="button" className="viewer__tool" onClick={() => void copy()}>
          {t("viewer-copy")}
        </button>
        <button type="button" className="viewer__tool" onClick={() => void save()}>
          {t("viewer-save")}
        </button>
        <button type="button" className="viewer__tool" onClick={() => void preview()}>
          {t("viewer-preview")}
        </button>
        <button
          type="button"
          className="viewer__close"
          aria-label={t("viewer-close")}
          onClick={close}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <div
        ref={stage}
        className="viewer__stage"
        data-zoomed={(scale !== null && scale > 1) || undefined}
      >
        <img
          key={image.src}
          ref={picture}
          src={image.src}
          alt={image.name}
          draggable={false}
          className="viewer__image"
          style={{
            transform:
              !entered && from ? from : `translate(${offset.x}px, ${offset.y}px) scale(${current})`,
          }}
        />
      </div>
      {open.images.length > 1 && (
        <>
          <button
            type="button"
            className="viewer__nav"
            data-side="left"
            aria-label={t("viewer-previous")}
            onClick={() => go(-1)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            className="viewer__nav"
            data-side="right"
            aria-label={t("viewer-next")}
            onClick={() => go(1)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
          <div className="viewer__strip">
            {open.images.map((item, position) => (
              <button
                key={item.src}
                type="button"
                className="viewer__thumb"
                data-current={position === index || undefined}
                aria-label={item.name}
                onClick={() => go(position - index)}
              >
                <img src={item.src} alt="" />
              </button>
            ))}
          </div>
        </>
      )}
      <span className="viewer__scale">{`${shownPercent}%`}</span>
      {toast && <span className="viewer__toast">{toast}</span>}
    </div>
  );
}

async function toPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("png"))), "image/png"),
  );
}

export function ImageViewerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const show = useCallback<Show>((images, index, from) => {
    if (images.length === 0) return;
    setOpen({ images, index, from: from?.getBoundingClientRect() ?? null });
  }, []);
  const close = useCallback(() => setOpen(null), []);
  return (
    <ViewerContext value={show}>
      {children}
      {open && createPortal(<Viewer open={open} onClose={close} />, document.body)}
    </ViewerContext>
  );
}

export function useImageViewer(): Show {
  const show = use(ViewerContext);
  if (!show) throw new Error("useImageViewer must be used inside ImageViewerProvider");
  return show;
}
