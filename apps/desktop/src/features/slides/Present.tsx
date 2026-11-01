import { useI18n } from "@xiaoban/i18n/react";
import type { Deck } from "@xiaoban/protocol";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BASE_H, BASE_W, SlideView } from "./SlideView.tsx";

const BUILDS = ["bullets", "flow", "timeline", "funnel", "icons"];

function steps(deck: Deck, index: number) {
  const slide = deck.slides[index];
  if (!slide || slide.still) return 0;
  return BUILDS.includes(slide.layout) ? Math.min(slide.items.length, 6) : 0;
}

export function Present({
  deck,
  start,
  onClose,
}: {
  deck: Deck;
  start: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(start);
  const [step, setStep] = useState(0);
  const [began] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const [notes, setNotes] = useState(true);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  const forward = () => {
    if (step < steps(deck, index)) setStep(step + 1);
    else if (index < deck.slides.length - 1) {
      setIndex(index + 1);
      setStep(0);
    }
  };
  const back = () => {
    if (index > 0) {
      setIndex(index - 1);
      setStep(steps(deck, index - 1));
    }
  };
  const keys = useRef({ forward, back });
  keys.current = { forward, back };

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const resize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", resize);
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("resize", resize);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (["ArrowRight", "ArrowDown", " ", "PageDown", "Enter"].includes(event.key)) {
        event.preventDefault();
        keys.current.forward();
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(event.key)) {
        event.preventDefault();
        keys.current.back();
      } else if (event.key.toLowerCase() === "n") setNotes((value) => !value);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const slide = deck.slides[index];
  if (!slide) return null;
  const strip = notes ? 140 : 0;
  const width = Math.min(size.w - 40, ((size.h - strip - 40) * BASE_W) / BASE_H);
  const elapsed = Math.floor((now - began) / 1000);
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const next = deck.slides[index + 1];
  const total = steps(deck, index);
  return createPortal(
    <div className="present" role="dialog" aria-label={deck.title}>
      <button
        type="button"
        className="present__stage"
        aria-label={t("slides-next")}
        onClick={forward}
      >
        <div key={slide.id} className="present__slide" data-transition={deck.transition}>
          <SlideView
            slide={slide}
            theme={deck.theme}
            width={width}
            animate
            step={total > 0 ? step : Number.POSITIVE_INFINITY}
          />
        </div>
      </button>
      {notes && (
        <div className="present__notes">
          <span className="present__clock">
            {t("slides-present-progress", { n: index + 1, total: deck.slides.length, time: clock })}
          </span>
          <p>{slide.notes || t("slides-no-notes")}</p>
          <span className="present__hint">
            {next ? t("slides-next-page", { title: next.title }) : t("slides-last-page")}
            <span>{t("slides-present-keys")}</span>
          </span>
        </div>
      )}
    </div>,
    document.body,
  );
}
