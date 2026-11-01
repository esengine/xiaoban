import { router } from "expo-router";

export function openDoc(id: string) {
  router.push({ pathname: "/doc/[id]", params: { id } });
}

export function openSheet(id: string) {
  router.push({ pathname: "/sheet/[id]", params: { id } });
}

export function openDeck(id: string) {
  router.push({ pathname: "/deck/[id]", params: { id } });
}

export function themeKey(theme: string) {
  return `slides-theme-${theme === "green" || theme === "orange" || theme === "night" ? theme : "blue"}` as const;
}
