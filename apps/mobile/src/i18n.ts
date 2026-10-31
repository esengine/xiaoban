import { createTranslator, negotiateLocale } from "@xiaoban/i18n";
import { getLocales } from "expo-localization";

export const translator = createTranslator(
  negotiateLocale(getLocales().map((locale) => locale.languageTag)),
);
