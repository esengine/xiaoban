import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";
import { Icon } from "../ui/Icon.tsx";
import { DishCover } from "./Gradient.tsx";
import { openScene } from "./LifeUI.tsx";

const PREVIEW_STEPS = 3;

export function RecipeCard({
  recipeId,
  inKitchen = false,
}: {
  recipeId: string;
  inKitchen?: boolean;
}) {
  const { t } = useI18n();
  const store = useHubStore();
  const { recipes, kitchen } = useHubState(store);
  const view = recipes[recipeId];
  const { width: screen } = useWindowDimensions();
  const width = inKitchen ? undefined : Math.min(380, Math.round((screen - 28) * 0.86));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const known = view !== undefined;
  useEffect(() => {
    if (known && !kitchen) return;
    void store.recipe(recipeId).catch(() => undefined);
  }, [store, recipeId, kitchen, known]);

  if (!view) return null;
  const { recipe } = view;
  const have = new Set(view.have);
  const missing = recipe.ingredients.filter((item) => !have.has(item.name));
  const listed = new Set(view.listed);
  const carted = missing.length > 0 && missing.every((item) => listed.has(item.name));
  const meta = [
    recipe.minutes > 0 ? t("kitchen-minutes", { minutes: recipe.minutes }) : "",
    recipe.servings > 0 ? t("kitchen-servings", { count: recipe.servings }) : "",
    recipe.style,
  ]
    .filter(Boolean)
    .join(t("daily-dot"));
  const titles = recipe.steps
    .slice(0, PREVIEW_STEPS)
    .map((step) => step.title || step.text)
    .join(t("recipe-arrow"));
  const cook = () => {
    if (busy) return;
    setBusy(true);
    void store
      .cookRecipe(recipeId)
      .then(() => {
        if (!inKitchen) router.push("/cook");
      })
      .catch(() => undefined)
      .finally(() => setBusy(false));
  };
  const another = () => {
    if (!recipe.threadId) return;
    void store
      .send(recipe.threadId, t("recipe-another-message", { dish: recipe.dish }))
      .catch(() => undefined);
    if (inKitchen) openScene(recipe.threadId);
  };
  const coverWidth = width ?? Math.max(0, screen - 34);

  return (
    <View style={[styles.card, width !== undefined && { width }]}>
      <View>
        <DishCover
          name={recipe.dish}
          image={recipe.image}
          size={coverWidth}
          height={120}
          radius={0}
        />
        {recipe.image ? <Text style={styles.credit}>{t("recipe-photo-credit")}</Text> : null}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={2}>
            {recipe.dish}
          </Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
        {recipe.ingredients.length > 0 ? (
          <View style={styles.chips}>
            {recipe.ingredients.map((item) => {
              const ok = have.has(item.name);
              return (
                <Text key={item.name} style={[styles.chip, ok ? styles.chipHave : styles.chipMiss]}>
                  {ok ? item.name : t("recipe-missing", { name: item.name })}
                </Text>
              );
            })}
          </View>
        ) : null}
        {recipe.steps.length > 0 ? (
          <Pressable
            style={styles.preview}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={open ? t("recipe-hide-steps") : t("recipe-show-steps")}
            onPress={() => setOpen(!open)}
          >
            <Text style={styles.previewText}>
              {t("recipe-steps", { count: recipe.steps.length, titles })}
            </Text>
            <View style={open && styles.flip}>
              <Icon name="chevronDown" size={12} color={color.faded} width={2.4} />
            </View>
          </Pressable>
        ) : null}
        {open ? (
          <View style={styles.steps}>
            {recipe.steps.map((step, index) => (
              <View key={`${index}-${step.text}`} style={styles.step}>
                <Text style={styles.stepNo}>{index + 1}</Text>
                <View style={styles.stepBody}>
                  <Text style={styles.stepText}>{step.text}</Text>
                  {step.tip ? <Text style={styles.stepTip}>{step.tip}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.button, styles.go, (pressed || busy) && styles.pressed]}
            accessibilityRole="button"
            disabled={busy}
            onPress={cook}
          >
            <Text style={styles.goText}>{t("kitchen-cook-go")}</Text>
          </Pressable>
          {missing.length > 0 ? (
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.cart,
                carted && styles.cartDone,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              disabled={carted}
              onPress={() => void store.recipeToShopping(recipeId).catch(() => undefined)}
            >
              <Text style={[styles.cartText, carted && styles.cartTextDone]} numberOfLines={1}>
                {carted ? t("recipe-carted") : t("recipe-cart")}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {recipe.threadId ? (
          <Pressable style={styles.another} accessibilityRole="button" onPress={another}>
            <Text style={styles.anotherText}>{t("recipe-another")}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    overflow: "hidden",
  },
  credit: {
    position: "absolute",
    left: 10,
    bottom: 8,
    fontSize: 11,
    color: color.surface,
    opacity: 0.8,
  },
  body: { padding: 12, gap: 8 },
  titleRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 8 },
  name: { fontSize: 16, fontWeight: "700", color: color.ink, flexShrink: 1 },
  meta: { fontSize: 12, color: color.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
    overflow: "hidden",
    fontSize: 12,
  },
  chipHave: { backgroundColor: color.successSoft, color: color.success },
  chipMiss: { backgroundColor: color.attentionSoft, color: color.attentionInk },
  preview: { flexDirection: "row", alignItems: "center", gap: 4 },
  previewText: { flexShrink: 1, fontSize: 12, color: color.accent },
  flip: { transform: [{ rotate: "180deg" }] },
  steps: { gap: 8 },
  step: { flexDirection: "row", gap: 8 },
  stepNo: {
    width: 18,
    height: 18,
    borderRadius: 9,
    overflow: "hidden",
    textAlign: "center",
    lineHeight: 18,
    fontSize: 11,
    fontWeight: "700",
    backgroundColor: color.accentSoft,
    color: color.accentStrong,
  },
  stepBody: { flex: 1, minWidth: 0, gap: 2 },
  stepText: { fontSize: 13, lineHeight: 19, color: color.inkSoft },
  stepTip: { fontSize: 12, lineHeight: 17, color: color.faint },
  actions: { flexDirection: "row", gap: 8 },
  button: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  pressed: { opacity: 0.85 },
  go: { backgroundColor: color.ink },
  goText: { fontSize: 13, fontWeight: "600", color: color.surface },
  cart: { borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.surface },
  cartDone: { backgroundColor: color.successSoft, borderColor: color.successSoft },
  cartText: { fontSize: 13, color: color.ink },
  cartTextDone: { color: color.success },
  another: { alignSelf: "center", paddingVertical: 2, paddingHorizontal: 8 },
  anotherText: { fontSize: 12, color: color.faded },
});
