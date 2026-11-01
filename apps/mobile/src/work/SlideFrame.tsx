"use dom";

import "@xiaoban/slides/slides.css";
import type { Slide } from "@xiaoban/protocol";
import { SlideView } from "@xiaoban/slides";
import type { DOMProps } from "expo/dom";
import { useDomStyle } from "./domStyle.ts";

const RESET = "html,body,#root{margin:0;padding:0;background:transparent;overflow:hidden}";

export default function SlideFrame({
  slide,
  theme,
  width,
}: {
  slide: Slide;
  theme: string;
  width: number;
  dom?: DOMProps;
}) {
  useDomStyle(RESET);
  return <SlideView slide={slide} theme={theme} width={width} />;
}
