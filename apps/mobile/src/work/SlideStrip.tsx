"use dom";

import "@xiaoban/slides/slides.css";
import type { Slide } from "@xiaoban/protocol";
import { SlideView } from "@xiaoban/slides";
import { color } from "@xiaoban/tokens";
import type { DOMProps } from "expo/dom";
import { useEffect, useRef } from "react";
import { useDomStyle } from "./domStyle.ts";

const RESET =
  "html,body,#root{margin:0;padding:0;background:transparent}body{overflow-x:auto;overflow-y:hidden;-webkit-tap-highlight-color:transparent}body::-webkit-scrollbar{display:none}";

export default function SlideStrip({
  slides,
  theme,
  width,
  gap,
  current = -1,
  onSelect,
}: {
  slides: Slide[];
  theme: string;
  width: number;
  gap: number;
  current?: number;
  onSelect?: (index: number) => Promise<void>;
  dom?: DOMProps;
}) {
  useDomStyle(RESET);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const item = row.current?.children[current];
    if (item instanceof HTMLElement) item.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [current]);
  return (
    <div ref={row} style={{ display: "flex", gap, padding: 2, width: "max-content" }}>
      {slides.map((slide, index) => (
        <button
          key={slide.id}
          type="button"
          onClick={() => void onSelect?.(index)}
          style={{
            padding: 0,
            border: `2px solid ${index === current ? color.accentBright : "transparent"}`,
            borderRadius: 6,
            background: "transparent",
            lineHeight: 0,
          }}
        >
          <SlideView slide={slide} theme={theme} width={width} />
        </button>
      ))}
    </div>
  );
}
