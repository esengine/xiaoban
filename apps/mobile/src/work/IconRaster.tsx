"use dom";

import { iconPng } from "@xiaoban/slides/icon-png";
import type { DOMProps } from "expo/dom";
import { useEffect } from "react";

export default function IconRaster({
  icons,
  onDone,
}: {
  icons: { name: string; color: string }[];
  onDone: (pngs: (string | null)[]) => Promise<void>;
  dom?: DOMProps;
}) {
  useEffect(() => {
    let live = true;
    void Promise.all(icons.map((icon) => iconPng(icon.name, icon.color).catch(() => null))).then(
      (pngs) => {
        if (live) void onDone(pngs);
      },
    );
    return () => {
      live = false;
    };
  }, [icons, onDone]);
  return null;
}
