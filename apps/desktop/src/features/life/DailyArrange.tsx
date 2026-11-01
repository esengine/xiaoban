import { useI18n } from "@xiaoban/i18n/react";
import type { DailyCard } from "@xiaoban/protocol";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";

export type DailyItem = {
  id: string;
  title: string;
  wide: boolean;
  node: ReactNode | null;
};

type Drag = {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
};

function merge(saved: DailyCard[], items: DailyItem[]): DailyCard[] {
  const known = new Set(items.map((item) => item.id));
  const kept = saved.filter((card) => known.has(card.id));
  const have = new Set(kept.map((card) => card.id));
  const added = items
    .filter((item) => !have.has(item.id))
    .map((item) => ({ id: item.id, wide: item.wide, hidden: false }));
  return [...kept, ...added];
}

function Grip({ onDown, label }: { onDown: (event: React.PointerEvent) => void; label: string }) {
  return (
    <button
      type="button"
      className="daily-slot__grip"
      aria-label={label}
      title={label}
      onPointerDown={onDown}
    >
      <svg viewBox="0 0 8 14" aria-hidden="true">
        {[2, 7, 12].map((y) => (
          <g key={y}>
            <circle cx="2" cy={y} r="1.2" />
            <circle cx="6" cy={y} r="1.2" />
          </g>
        ))}
      </svg>
    </button>
  );
}

export function DailyArranged({ items, editing }: { items: DailyItem[]; editing: boolean }) {
  const { t } = useI18n();
  const store = useHub();
  const [cards, setCards] = useState<DailyCard[] | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef<DailyCard[]>([]);

  useEffect(() => {
    let alive = true;
    void store
      .dailyLayout()
      .then((layout) => alive && setCards(layout.cards))
      .catch(() => alive && setCards([]));
    return () => {
      alive = false;
    };
  }, [store]);

  const list = cards ? merge(cards, items) : null;
  live.current = list ?? [];

  const save = useCallback(
    (next: DailyCard[]) => {
      setCards(next);
      void store.setDailyLayout({ cards: next }).catch(() => undefined);
    },
    [store],
  );

  const update = (id: string, change: Partial<DailyCard>) =>
    save(live.current.map((card) => (card.id === id ? { ...card, ...change } : card)));

  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      setDrag((current) =>
        current ? { ...current, x: event.clientX, y: event.clientY } : current,
      );
      const over = document
        .elementsFromPoint(event.clientX, event.clientY)
        .map((element) => element.closest<HTMLElement>("[data-slot]"))
        .find((element) => element && element.dataset.slot !== drag.id);
      const target = over?.dataset.slot;
      if (!over || !target) return;
      const rect = over.getBoundingClientRect();
      const after = event.clientX > rect.left + rect.width / 2;
      const current = live.current;
      const moving = current.find((card) => card.id === drag.id);
      if (!moving) return;
      const rest = current.filter((card) => card.id !== drag.id);
      const at = rest.findIndex((card) => card.id === target) + (after ? 1 : 0);
      const next = [...rest.slice(0, at), moving, ...rest.slice(at)];
      if (next.map((card) => card.id).join() !== current.map((card) => card.id).join())
        setCards(next);
    };
    const up = () => {
      setDrag(null);
      save(live.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag?.id, save]);

  if (!list) return null;
  const byId = new Map(items.map((item) => [item.id, item]));
  const shown = list.filter((card) => !card.hidden && byId.get(card.id)?.node);
  const hidden = list.filter((card) => card.hidden && byId.get(card.id));
  const dragged = drag ? byId.get(drag.id) : null;
  const draggedCard = drag ? list.find((card) => card.id === drag.id) : null;

  const start = (id: string) => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const slot = (event.currentTarget as HTMLElement).closest<HTMLElement>("[data-slot]");
    if (!slot) return;
    event.preventDefault();
    const rect = slot.getBoundingClientRect();
    setDrag({
      id,
      x: event.clientX,
      y: event.clientY,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      width: rect.width,
    });
  };

  return (
    <>
      <div className="daily__grid" data-dragging={drag ? true : undefined}>
        {shown.map((card) => {
          const item = byId.get(card.id);
          if (!item) return null;
          const placeholder = drag?.id === card.id;
          return (
            <div
              key={card.id}
              className="daily-slot"
              data-slot={card.id}
              data-wide={card.wide || undefined}
              data-editing={editing || undefined}
              data-placeholder={placeholder || undefined}
            >
              {placeholder ? (
                <div className="daily-slot__hole">{t("daily-drop-here")}</div>
              ) : (
                <>
                  <Grip onDown={start(card.id)} label={t("daily-drag", { title: item.title })} />
                  {editing && (
                    <span className="daily-slot__tools">
                      <fieldset className="daily-slot__size" aria-label={t("daily-size")}>
                        <button
                          type="button"
                          aria-pressed={!card.wide}
                          onClick={() => update(card.id, { wide: false })}
                        >
                          {t("daily-narrow")}
                        </button>
                        <button
                          type="button"
                          aria-pressed={card.wide}
                          onClick={() => update(card.id, { wide: true })}
                        >
                          {t("daily-wide")}
                        </button>
                      </fieldset>
                      <button
                        type="button"
                        className="code-link"
                        onClick={() => update(card.id, { hidden: true })}
                      >
                        {t("daily-hide")}
                      </button>
                    </span>
                  )}
                  {item.node}
                </>
              )}
            </div>
          );
        })}
      </div>
      {editing && (
        <div className="daily-tray">
          <span className="life-card__note">{t("daily-hidden")}</span>
          {hidden.length === 0 && <span className="life-card__note">{t("daily-hidden-none")}</span>}
          {hidden.map((card) => (
            <button
              key={card.id}
              type="button"
              className="code-status-button"
              onClick={() => update(card.id, { hidden: false })}
            >
              {t("daily-show", { title: byId.get(card.id)?.title ?? card.id })}
            </button>
          ))}
          <span className="life-card__spacer" />
          <button
            type="button"
            className="code-link"
            onClick={() =>
              save(items.map((item) => ({ id: item.id, wide: item.wide, hidden: false })))
            }
          >
            {t("daily-reset")}
          </button>
        </div>
      )}
      {drag && dragged?.node && (
        <div
          className="daily-slot daily-slot--lifted"
          data-editing={editing || undefined}
          style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.width }}
          data-wide={draggedCard?.wide || undefined}
        >
          {dragged.node}
        </div>
      )}
    </>
  );
}
