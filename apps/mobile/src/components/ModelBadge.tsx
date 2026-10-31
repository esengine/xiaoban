import { providerKey } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { ModelInfo } from "@xiaoban/protocol";
import { providerSvg } from "@xiaoban/provider-icons";
import { color, radius, space } from "@xiaoban/tokens";
import { Platform, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";

export function ModelBadge({ model }: { model: ModelInfo | null }) {
  const { t } = useI18n();
  if (!model) {
    return (
      <View style={[styles.badge, styles.missing]}>
        <Text style={styles.missingText}>{t("model-not-connected")}</Text>
      </View>
    );
  }
  return (
    <View style={styles.badge} accessibilityLabel={t("model-current")}>
      <SvgXml xml={providerSvg(model.provider)} width={18} height={18} color={color.ink} />
      <Text style={styles.name}>{model.label ?? t(providerKey(model.provider))}</Text>
      <Text style={styles.model} numberOfLines={1}>
        {model.model}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  missing: {
    backgroundColor: color.attentionSoft,
  },
  missingText: {
    fontSize: 13,
    color: color.attentionInk,
  },
  name: {
    fontSize: 13,
    fontWeight: "500",
    color: color.ink,
  },
  model: {
    flexShrink: 1,
    fontSize: 12,
    color: color.muted,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
  },
});
