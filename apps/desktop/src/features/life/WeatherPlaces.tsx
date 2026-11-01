import { useI18n } from "@xiaoban/i18n/react";
import type { WeatherPlace } from "@xiaoban/protocol";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHub } from "../../app/hub.tsx";

export function placeName(place: WeatherPlace) {
  const where = place.district || place.city;
  return !place.label || place.label === where ? where : `${place.label} · ${where}`;
}

function where(place: WeatherPlace) {
  return [place.city, place.district].filter(Boolean).join(" ");
}

function Popover({
  anchor,
  label,
  className,
  onClose,
  children,
}: {
  anchor: HTMLElement;
  label: string;
  className: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const width = box.current?.offsetWidth ?? 380;
    setSpot({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: rect.bottom + 6,
    });
  }, [anchor]);

  useEffect(() => {
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div ref={box} className={className} role="dialog" aria-label={label} style={spot}>
      {children}
    </div>,
    document.body,
  );
}

function PlaceSearch({
  offerHere,
  picked,
  onPick,
}: {
  offerHere: boolean;
  picked: WeatherPlace | null;
  onPick: (place: WeatherPlace) => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<WeatherPlace[]>([]);
  const [here, setHere] = useState<WeatherPlace | null>(null);

  useEffect(() => {
    if (!offerHere) return;
    let live = true;
    void store
      .locatePlace()
      .then((place) => live && setHere(place))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, offerHere]);

  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setFound([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void store
        .searchPlaces(value)
        .then(setFound)
        .catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [store, query]);

  return (
    <>
      {here && (
        <button
          type="button"
          className="weather-add__here"
          aria-pressed={picked?.id === here.id}
          onClick={() => onPick(here)}
        >
          {t("weather-use-here")}
          <span>{t("weather-use-here-where", { place: where(here) })}</span>
        </button>
      )}
      <input
        // biome-ignore lint/a11y/noAutofocus: the popover exists to type a place
        autoFocus
        className="weather-add__input"
        value={query}
        placeholder={t("weather-place-placeholder")}
        onChange={(event) => setQuery(event.target.value)}
      />
      {found.length > 0 && (
        <div className="weather-add__list">
          {found.map((item) => (
            <button
              key={item.id}
              type="button"
              className="weather-add__item"
              aria-pressed={picked?.id === item.id}
              onClick={() => onPick(item)}
            >
              {item.district || item.city}
              <span>{item.region}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function AddPlace({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const [picked, setPicked] = useState<WeatherPlace | null>(null);
  const [label, setLabel] = useState("");
  const add = () => {
    if (!picked) return;
    void store
      .addPlace({ ...picked, label: label.trim() })
      .then(() => store.loadWeather(picked.id))
      .catch(() => undefined);
    onClose();
  };
  return (
    <Popover anchor={anchor} label={t("weather-add")} className="weather-add" onClose={onClose}>
      <b>{t("weather-add")}</b>
      <PlaceSearch
        offerHere
        picked={picked}
        onPick={(place) => {
          setPicked(place);
          setLabel(place.district || place.city);
        }}
      />
      {picked && (
        <div className="weather-add__name">
          <span>{t("weather-add-label")}</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) add();
            }}
          />
          <button type="button" className="code-status-button" data-dark onClick={add}>
            {t("weather-add-go")}
          </button>
        </div>
      )}
      <span className="life-card__note">{t("weather-add-note")}</span>
    </Popover>
  );
}

export function PlaceMenu({
  anchor,
  place,
  home,
  onClose,
}: {
  anchor: HTMLElement;
  place: WeatherPlace;
  home: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const [label, setLabel] = useState(place.label);
  const [moving, setMoving] = useState(false);
  const [locating, setLocating] = useState(false);
  const saveLabel = () => {
    if (label.trim() && label.trim() !== place.label)
      void store.updatePlace(place.id, label.trim(), null).catch(() => undefined);
  };
  const move = (next: WeatherPlace) => {
    void store.updatePlace(place.id, null, next).catch(() => undefined);
    onClose();
  };
  return (
    <Popover
      anchor={anchor}
      label={placeName(place)}
      className="weather-add weather-menu"
      onClose={onClose}
    >
      <label className="weather-menu__row">
        <span>{t("weather-menu-name")}</span>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onBlur={saveLabel}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) saveLabel();
          }}
        />
      </label>
      <div className="weather-menu__row weather-menu__row--top">
        <span>{t("weather-menu-where")}</span>
        <div className="weather-menu__where">
          <span>{where(place)}</span>
          <span className="life-card__note">
            {place.located ? t("weather-menu-located") : t("weather-menu-searched")}
          </span>
          <span className="weather-menu__links">
            <button type="button" className="code-link" onClick={() => setMoving(!moving)}>
              {t("weather-menu-move")}
            </button>
            {home && (
              <button
                type="button"
                className="code-link"
                disabled={locating}
                onClick={() => {
                  setLocating(true);
                  void store
                    .locatePlace()
                    .then((next) => next && move(next))
                    .catch(() => undefined)
                    .finally(() => setLocating(false));
                }}
              >
                {t("weather-menu-here")}
              </button>
            )}
          </span>
        </div>
      </div>
      {moving && <PlaceSearch offerHere={false} picked={null} onPick={move} />}
      <div className="weather-menu__foot">
        {home ? (
          <>
            <span className="keep-tag" data-keep="frozen">
              {t("weather-home")}
            </span>
            <span className="life-card__note">{t("weather-menu-home-note")}</span>
          </>
        ) : (
          <button
            type="button"
            className="code-status-button"
            onClick={() => {
              void store.setHomePlace(place.id).catch(() => undefined);
              onClose();
            }}
          >
            {t("weather-menu-make-home")}
          </button>
        )}
        <span className="life-card__spacer" />
        <button
          type="button"
          className="code-link"
          data-danger
          onClick={() => {
            void store
              .removePlace(place.id)
              .then(() => store.loadWeather())
              .catch(() => undefined);
            onClose();
          }}
        >
          {t("weather-menu-remove")}
        </button>
      </div>
    </Popover>
  );
}
