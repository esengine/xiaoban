import { dayTone } from "@xiaoban/client";

export {
  amapFood,
  amapPlace,
  amapRoute,
  familyText,
  legText,
  monthDay,
  range,
  stopCount,
  stopsText,
  weatherText,
  weekday,
} from "@xiaoban/client";

const cssVar = (tone: string) =>
  `var(--color-${tone.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)})`;

export const dayColor = (index: number): string => cssVar(dayTone(index));

export const toneColor = (tone: string): string => cssVar(tone);
