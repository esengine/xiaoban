import { cssVariables } from "@xiaoban/tokens";
import { useLayoutEffect } from "react";

export function useDomStyle(css: string) {
  useLayoutEffect(() => {
    const element = document.createElement("style");
    element.textContent = `${cssVariables()}${css}`;
    document.head.appendChild(element);
    return () => element.remove();
  }, [css]);
}
