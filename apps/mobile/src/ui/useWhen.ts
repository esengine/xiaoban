import { useI18n } from "@xiaoban/i18n/react";
import { recency } from "./format.ts";

export function useWhen() {
  const { t, locale } = useI18n();
  return (time: number) => {
    const value = recency(time, Date.now(), locale);
    if (value.kind === "now") return t("time-just-now");
    if (value.kind === "yesterday") return t("time-yesterday");
    return value.text;
  };
}
