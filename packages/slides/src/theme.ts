import { type SlideThemeName, slideThemes } from "@xiaoban/tokens";

export type SlideTheme = (typeof slideThemes)[SlideThemeName];

export function themeOf(name: string): SlideTheme {
  return slideThemes[(name in slideThemes ? name : "blue") as SlideThemeName];
}
