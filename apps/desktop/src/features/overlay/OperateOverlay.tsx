import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { isOperating } from "../operate/tools.ts";

interface Pointer {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  typing: boolean;
  real: boolean;
  visible: boolean;
}

export function OperateOverlay() {
  const { t } = useI18n();
  const store = useHub();
  const { drafts, confirms } = useHubState(store);
  const [pointer, setPointer] = useState<(Pointer & { seq: number }) | null>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const window = getCurrentWindow();
    const measure = async () => {
      const [position, scale] = await Promise.all([window.outerPosition(), window.scaleFactor()]);
      const logical = position.toLogical(scale);
      setOrigin({ x: logical.x, y: logical.y });
    };
    void measure();
    const stops = [window.onMoved(() => void measure()), window.onResized(() => void measure())];
    return () => {
      for (const stop of stops) void stop.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    let seq = 0;
    const stop = listen<Pointer>("operate://pointer", ({ payload }) => {
      seq += 1;
      setPointer(payload.visible ? { ...payload, seq } : null);
    });
    return () => void stop.then((unlisten) => unlisten());
  }, []);

  const active = Object.values(drafts).find((draft) => !draft.failure && isOperating(draft));
  const waiting = confirms.length > 0;
  const edge = waiting ? "confirm" : active ? (active.paused ? "paused" : "working") : null;

  useEffect(() => {
    if (!active) setPointer(null);
  }, [active]);

  const step = active?.steps.length ?? 0;
  const caption = pointer
    ? t(
        pointer.real
          ? pointer.typing
            ? "overlay-type-real"
            : "overlay-click-real"
          : pointer.typing
            ? "overlay-type"
            : "overlay-click",
        {
          label: pointer.label || t("overlay-unnamed"),
          n: step,
        },
      )
    : null;

  return (
    <div className="overlay" data-edge={edge ?? undefined}>
      {pointer && (
        <div
          className="overlay__pointer"
          style={{
            transform: `translate(${pointer.x + pointer.width / 2 - origin.x}px, ${pointer.y + pointer.height / 2 - origin.y}px)`,
          }}
        >
          <span key={`ripple-${pointer.seq}`} className="overlay__ripple" />
          <svg
            key={`cursor-${pointer.seq}`}
            className="overlay__cursor"
            aria-hidden="true"
            viewBox="0 0 24 24"
          >
            <path d="M3 2l7 19 2.5-8L21 10z" />
          </svg>
          <span key={`caption-${pointer.seq}`} className="overlay__caption">
            {caption}
          </span>
        </div>
      )}
    </div>
  );
}
