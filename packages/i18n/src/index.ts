import { FluentBundle, FluentResource } from "@fluent/bundle";
import { catalogs, type MessageArgs, type MessageKey } from "./generated/catalogs.ts";

export type { MessageArgs, MessageKey };
export type Locale = keyof typeof catalogs;
export type ArgsFor<K extends MessageKey> = MessageArgs[K] extends undefined
  ? []
  : [MessageArgs[K]];
export type PlainMessageKey = {
  [K in MessageKey]: MessageArgs[K] extends undefined ? K : never;
}[MessageKey];

export const locales = Object.keys(catalogs) as Locale[];
export const defaultLocale: Locale = "zh-CN";

export function negotiateLocale(tags: readonly string[]): Locale {
  const first = tags[0];
  if (!first) return defaultLocale;
  return first.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export interface Translator {
  readonly locale: Locale;
  t<K extends MessageKey>(key: K, ...args: ArgsFor<K>): string;
}

export function createTranslator(locale: Locale): Translator {
  const bundle = new FluentBundle(locale, { useIsolating: false });
  const errors = bundle.addResource(new FluentResource(catalogs[locale]));
  if (errors.length > 0) throw new Error(`invalid ${locale} catalog: ${errors.join(", ")}`);

  return {
    locale,
    t(key, ...args) {
      const message = bundle.getMessage(key);
      if (!message?.value) return key;
      return bundle.formatPattern(message.value, args[0] ?? null);
    },
  };
}
