import type { ProviderId } from "@xiaoban/protocol";
import { providerSvgs } from "./generated/icons.ts";

export { providerSvgs };

export function providerSvg(id: ProviderId): string {
  return providerSvgs[id];
}

export function providerSvgDataUri(id: ProviderId): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(providerSvgs[id])}`;
}
