import { useI18n } from "@xiaoban/i18n/react";
import type { Sky } from "@xiaoban/protocol";

export function useSky() {
  const { t } = useI18n();
  return (sky: Sky) =>
    ({
      clear: t("weather-sky-clear"),
      cloudy: t("weather-sky-cloudy"),
      overcast: t("weather-sky-overcast"),
      fog: t("weather-sky-fog"),
      light_rain: t("weather-sky-light-rain"),
      rain: t("weather-sky-rain"),
      heavy_rain: t("weather-sky-heavy-rain"),
      snow: t("weather-sky-snow"),
      storm: t("weather-sky-storm"),
    })[sky];
}
