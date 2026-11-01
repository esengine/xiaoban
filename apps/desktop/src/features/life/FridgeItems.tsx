import { useI18n } from "@xiaoban/i18n/react";
import type { Ingredient } from "@xiaoban/protocol";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHub } from "../../app/hub.tsx";

function Editor({
  item,
  anchor,
  onClose,
}: {
  item: Ingredient;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const [amount, setAmount] = useState(item.amount);
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const width = box.current?.offsetWidth ?? 240;
    setPlace({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: rect.bottom + 6,
    });
  }, [anchor]);

  useEffect(() => {
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [anchor, onClose]);

  const remove = (shop: boolean) => {
    void store.removeFridgeItem(item.name, shop).catch(() => undefined);
    onClose();
  };

  return createPortal(
    <div
      ref={box}
      className="fridge-edit"
      role="dialog"
      aria-label={item.name}
      style={{ left: place.left, top: place.top }}
    >
      <b>{item.name}</b>
      <label className="fridge-edit__row">
        <span>{t("fridge-left")}</span>
        <input
          // biome-ignore lint/a11y/noAutofocus: the popover exists to edit this value
          autoFocus
          value={amount}
          placeholder={t("fridge-amount-placeholder")}
          onChange={(event) => setAmount(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              void store.setFridgeItem(item.name, amount).catch(() => undefined);
              onClose();
            }
          }}
        />
      </label>
      <div className="fridge-edit__actions">
        <button
          type="button"
          className="code-status-button"
          data-danger
          onClick={() => remove(false)}
        >
          {t("fridge-used-up")}
        </button>
        <button type="button" className="code-status-button" onClick={() => remove(true)}>
          {t("fridge-used-up-shop")}
        </button>
      </div>
      <span className="life-card__note">{t("fridge-edit-hint")}</span>
    </div>,
    document.body,
  );
}

export function FridgeItems({ items, used }: { items: Ingredient[]; used: Set<string> }) {
  const { t } = useI18n();
  const store = useHub();
  const [editing, setEditing] = useState<{ name: string; anchor: HTMLElement } | null>(null);
  return (
    <div className="kitchen-items">
      {items.map((item) => (
        <span
          key={item.name}
          className="kitchen-item"
          data-used={used.has(item.name) || undefined}
          data-open={editing?.name === item.name || undefined}
        >
          <button
            type="button"
            className="kitchen-item__name"
            onClick={(event) =>
              setEditing(
                editing?.name === item.name
                  ? null
                  : {
                      name: item.name,
                      anchor: event.currentTarget.parentElement ?? event.currentTarget,
                    },
              )
            }
          >
            {item.amount ? t("kitchen-item", { name: item.name, amount: item.amount }) : item.name}
          </button>
          <button
            type="button"
            className="kitchen-item__remove"
            aria-label={t("fridge-remove", { name: item.name })}
            title={t("fridge-remove", { name: item.name })}
            onClick={() => void store.removeFridgeItem(item.name, false).catch(() => undefined)}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <path
                d="M1 1l6 6M7 1L1 7"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {editing?.name === item.name && (
            <Editor item={item} anchor={editing.anchor} onClose={() => setEditing(null)} />
          )}
        </span>
      ))}
    </div>
  );
}
