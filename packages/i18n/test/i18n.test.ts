import { describe, expect, it } from "vitest";
import { catalogs } from "../src/generated/catalogs.ts";
import { createTranslator, locales, negotiateLocale } from "../src/index.ts";

const ids = (source: string) =>
  source
    .split("\n")
    .map((line) => /^([a-zA-Z][\w-]*)\s*=/.exec(line)?.[1])
    .filter(Boolean)
    .sort();

describe("i18n", () => {
  it("ships the same keys in every locale", () => {
    const reference = ids(catalogs["zh-CN"]);
    for (const locale of locales) expect(ids(catalogs[locale])).toEqual(reference);
  });

  it("formats variables without bidi isolation marks", () => {
    expect(createTranslator("zh-CN").t("draft-elapsed", { seconds: 4 })).toBe("已想 4 秒");
    expect(createTranslator("en").t("draft-elapsed", { seconds: 4 })).toBe("Thought for 4 s");
  });

  it("negotiates from the first preferred language", () => {
    expect(negotiateLocale(["zh-Hans-CN", "en"])).toBe("zh-CN");
    expect(negotiateLocale(["en-US"])).toBe("en");
    expect(negotiateLocale(["fr-FR"])).toBe("en");
    expect(negotiateLocale([])).toBe("zh-CN");
  });
});
