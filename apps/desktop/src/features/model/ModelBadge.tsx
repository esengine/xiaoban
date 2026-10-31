import { providerKey } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { ModelInfo } from "@xiaoban/protocol";
import { providerSvgDataUri } from "@xiaoban/provider-icons";

export function ModelBadge({ model }: { model: ModelInfo | null }) {
  const { t } = useI18n();
  if (!model) {
    return <p className="model-badge model-badge--missing">{t("model-not-connected")}</p>;
  }
  return (
    <p className="model-badge" title={t("model-current")}>
      <img className="model-badge__icon" src={providerSvgDataUri(model.provider)} alt="" />
      <span className="model-badge__name">{t(providerKey(model.provider))}</span>
      <span className="model-badge__model">{model.model}</span>
    </p>
  );
}
