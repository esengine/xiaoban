import { createContext, type ReactNode, use } from "react";
import type { Translator } from "./index.ts";

const I18nContext = createContext<Translator | null>(null);

export function I18nProvider({
  translator,
  children,
}: {
  translator: Translator;
  children: ReactNode;
}) {
  return <I18nContext value={translator}>{children}</I18nContext>;
}

export function useI18n(): Translator {
  const translator = use(I18nContext);
  if (!translator) throw new Error("useI18n must be used inside I18nProvider");
  return translator;
}
