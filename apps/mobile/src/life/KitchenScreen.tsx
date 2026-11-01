import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Dish, Ingredient, Kitchen } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useWhen } from "../ui/useWhen.ts";
import { DishCover } from "./Gradient.tsx";
import {
  ChatBar,
  DarkButton,
  HeaderLink,
  LifeHeader,
  life,
  Sheet,
  SheetAction,
  useSwipeLeft,
} from "./LifeUI.tsx";

function FridgeChip({
  item,
  used,
  open,
  onOpen,
  onClose,
  onEdit,
  onDelete,
}: {
  item: Ingredient;
  used: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const swipe = useSwipeLeft(onOpen);
  const label = item.amount
    ? t("kitchen-item", { name: item.name, amount: item.amount })
    : item.name;
  if (open) {
    return (
      <View style={styles.chipOpen}>
        <Pressable style={[styles.chip, styles.chipOpenName]} onPress={onClose}>
          <Text style={styles.chipText}>{label}</Text>
        </Pressable>
        <Pressable
          style={styles.chipDelete}
          accessibilityRole="button"
          accessibilityLabel={t("fridge-remove", { name: item.name })}
          onPress={onDelete}
        >
          <Text style={styles.chipDeleteText}>{t("life-delete")}</Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View {...swipe}>
      <Pressable
        style={[styles.chip, used && styles.chipUsed]}
        delayLongPress={350}
        onLongPress={onEdit}
      >
        <Text style={[styles.chipText, used && styles.chipTextUsed]}>{label}</Text>
      </Pressable>
    </View>
  );
}

function FridgeSheet({
  store,
  item,
  onClose,
}: {
  store: HubStore;
  item: Ingredient | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [amount, setAmount] = useState("");
  useEffect(() => setAmount(item?.amount ?? ""), [item]);
  const save = () => {
    if (item && amount.trim() !== item.amount)
      void store.setFridgeItem(item.name, amount.trim()).catch(() => undefined);
  };
  const remove = (shop: boolean) => {
    if (item) void store.removeFridgeItem(item.name, shop).catch(() => undefined);
    onClose();
  };
  return (
    <Sheet
      open={item !== null}
      onClose={() => {
        save();
        onClose();
      }}
    >
      <Text style={life.sheetTitle}>{item?.name}</Text>
      <View style={life.fieldRow}>
        <Text style={styles.leftLabel}>{t("fridge-left")}</Text>
        <TextInput
          style={life.input}
          value={amount}
          placeholder={t("fridge-amount-placeholder")}
          placeholderTextColor={color.faint}
          returnKeyType="done"
          onChangeText={setAmount}
          onSubmitEditing={() => {
            save();
            onClose();
          }}
        />
      </View>
      <View>
        <SheetAction label={t("fridge-used-up")} danger onPress={() => remove(false)} />
        <SheetAction label={t("fridge-used-up-shop")} onPress={() => remove(true)} />
      </View>
    </Sheet>
  );
}

function Fridge({
  store,
  kitchen,
  used,
}: {
  store: HubStore;
  kitchen: Kitchen;
  used: Set<string>;
}) {
  const { t } = useI18n();
  const when = useWhen();
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const staleDays = kitchen.photoAt ? Math.floor((Date.now() - kitchen.photoAt) / 86_400_000) : 0;
  return (
    <View style={styles.fridge}>
      <View style={styles.fridgeHead}>
        <Text style={styles.fridgeTitle}>{t("kitchen-fridge")}</Text>
        {kitchen.photoAt ? (
          <Text style={life.note}>{t("kitchen-photo-when", { when: when(kitchen.photoAt) })}</Text>
        ) : null}
      </View>
      {staleDays >= 3 && kitchen.fridge.length > 0 ? (
        <Text style={styles.stale}>{t("fridge-stale-phone", { days: staleDays })}</Text>
      ) : null}
      {kitchen.fridge.length > 0 ? (
        <View style={styles.chips}>
          {kitchen.fridge.map((item) => (
            <FridgeChip
              key={item.name}
              item={item}
              used={used.has(item.name)}
              open={open === item.name}
              onOpen={() => setOpen(item.name)}
              onClose={() => setOpen(null)}
              onEdit={() => {
                setOpen(null);
                setEditing(item);
              }}
              onDelete={() => {
                setOpen(null);
                void store.removeFridgeItem(item.name, false).catch(() => undefined);
              }}
            />
          ))}
        </View>
      ) : (
        <Text style={life.hint}>{t("kitchen-fridge-empty-phone")}</Text>
      )}
      {kitchen.fridge.length > 0 ? <Text style={life.hint}>{t("fridge-hint-phone")}</Text> : null}
      <FridgeSheet store={store} item={editing} onClose={() => setEditing(null)} />
    </View>
  );
}

function DishCard({ dish, onToggle }: { dish: Dish; onToggle: () => void }) {
  const { t } = useI18n();
  const missing = dish.missing.length > 0;
  return (
    <Pressable
      style={[styles.dish, dish.selected && styles.dishOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: dish.selected }}
      onPress={onToggle}
    >
      <DishCover name={dish.name} image={dish.image} size={72} radius={12} />
      <View style={styles.dishBody}>
        <View style={styles.dishTop}>
          <Text style={styles.dishName} numberOfLines={2}>
            {dish.name}
          </Text>
          <Text style={styles.dishTime}>{t("kitchen-minutes", { minutes: dish.minutes })}</Text>
        </View>
        {dish.why ? <Text style={styles.dishWhy}>{dish.why}</Text> : null}
        <View style={styles.tags}>
          {dish.uses.length > 0 ? (
            <Text style={[styles.tag, styles.tagGood]}>
              {t("kitchen-uses-count", { count: dish.uses.length })}
            </Text>
          ) : null}
          <Text style={[styles.tag, missing ? styles.tagMiss : styles.tagGood]} numberOfLines={1}>
            {missing
              ? t("kitchen-missing", { items: dish.missing.join(t("kitchen-joiner")) })
              : t("kitchen-no-buy")}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function Summary({ store, kitchen }: { store: HubStore; kitchen: Kitchen }) {
  const { t } = useI18n();
  const picked = kitchen.dishes.filter((dish) => dish.selected);
  const missing = [...new Set(picked.flatMap((dish) => dish.missing))];
  const listed = new Set(kitchen.shopping.filter((item) => !item.done).map((item) => item.name));
  const carted = missing.length > 0 && missing.every((name) => listed.has(name));
  const cook = () => {
    if (!kitchen.cook && kitchen.threadId)
      void store
        .send(
          kitchen.threadId,
          t("kitchen-start", { dishes: picked.map((dish) => dish.name).join(t("kitchen-plus")) }),
        )
        .catch(() => undefined);
    router.push("/cook");
  };
  return (
    <View style={styles.summary}>
      <Text style={styles.summaryText}>
        {missing.length > 0
          ? t("kitchen-pick-missing", { items: missing.join(t("kitchen-joiner")) })
          : t("kitchen-pick-ready")}
      </Text>
      {missing.length > 0 ? (
        <Pressable
          style={[styles.cart, carted && styles.cartDone]}
          disabled={carted}
          accessibilityRole="button"
          onPress={() => void store.addMissingToShopping().catch(() => undefined)}
        >
          <Text style={[styles.cartText, carted && styles.cartTextDone]}>
            {carted ? t("kitchen-carted") : t("kitchen-cart")}
          </Text>
        </Pressable>
      ) : null}
      <DarkButton
        label={kitchen.cook ? t("kitchen-resume-cook") : t("kitchen-cook-go")}
        onPress={cook}
      />
    </View>
  );
}

export function KitchenScreen({ store }: { store: HubStore }) {
  const { t } = useI18n();
  const { kitchen, status } = useHubState(store);

  useEffect(() => {
    if (status === "open") void store.loadKitchen().catch(() => undefined);
  }, [store, status]);

  const startedAt = kitchen?.cook?.startedAt ?? null;
  const seen = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (kitchen === null) return;
    if (seen.current !== undefined && startedAt !== null && startedAt !== seen.current)
      router.push("/cook");
    seen.current = startedAt;
  }, [kitchen, startedAt]);

  const picked = kitchen?.dishes.filter((dish) => dish.selected) ?? [];
  const used = new Set(picked.flatMap((dish) => dish.uses));
  const rules = kitchen
    ? [
        kitchen.servings > 0 ? t("kitchen-servings", { count: kitchen.servings }) : "",
        kitchen.avoid.length > 0
          ? t("kitchen-avoid", { items: kitchen.avoid.join(t("kitchen-joiner")) })
          : "",
      ]
        .filter(Boolean)
        .join(t("daily-dot"))
    : "";
  const ask = () => {
    if (kitchen?.threadId)
      void store.send(kitchen.threadId, t("kitchen-ask-tonight")).catch(() => undefined);
  };

  return (
    <>
      <LifeHeader
        title={t("kitchen-tab-tonight")}
        sub={rules || undefined}
        right={<HeaderLink label={t("kitchen-tab-week")} onPress={() => router.push("/week")} />}
      />
      <ScrollView style={life.scroll} contentContainerStyle={life.body}>
        {kitchen && (
          <>
            <Fridge store={store} kitchen={kitchen} used={used} />
            {kitchen.dishes.length > 0 ? (
              <>
                <Text style={styles.section}>
                  {t("kitchen-suggested-phone", { minutes: kitchen.maxMinutes })}
                </Text>
                {kitchen.dishes.map((dish) => (
                  <DishCard
                    key={dish.name}
                    dish={dish}
                    onToggle={() =>
                      void store.selectDish(dish.name, !dish.selected).catch(() => undefined)
                    }
                  />
                ))}
              </>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>{t("kitchen-empty-title")}</Text>
                <Text style={life.hint}>{t("kitchen-empty-body-phone")}</Text>
                <DarkButton
                  label={t("kitchen-ask")}
                  disabled={!kitchen.threadId}
                  onPress={ask}
                  style={styles.emptyButton}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
      <ChatBar
        store={store}
        threadId={kitchen?.threadId ?? null}
        placeholder={t("kitchen-chat-placeholder")}
        top={kitchen && picked.length > 0 ? <Summary store={store} kitchen={kitchen} /> : null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fridge: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  fridgeHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  fridgeTitle: { fontSize: 14, fontWeight: "500", color: color.ink },
  stale: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: color.attentionSoft,
    color: color.attentionInk,
    fontSize: 12.5,
    lineHeight: 19,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
  },
  chipUsed: { backgroundColor: color.accentWash, borderColor: color.accentWash },
  chipText: { fontSize: 13, color: color.inkMid },
  chipTextUsed: { color: color.accentStrong },
  chipOpen: { width: "100%", flexDirection: "row", borderRadius: 10, overflow: "hidden" },
  chipOpenName: { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 },
  chipDelete: {
    width: 72,
    backgroundColor: color.dangerInk,
    alignItems: "center",
    justifyContent: "center",
  },
  chipDeleteText: { fontSize: 13, color: color.surface },
  leftLabel: { fontSize: 12, color: color.faint },
  section: { fontSize: 14, fontWeight: "700", color: color.ink, paddingHorizontal: 2 },
  dish: {
    flexDirection: "row",
    gap: 12,
    padding: 10,
    backgroundColor: color.surface,
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: 16,
  },
  dishOn: { borderColor: color.accent },
  dishBody: { flex: 1, minWidth: 0, gap: 4 },
  dishTop: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  dishName: { flex: 1, fontSize: 15, fontWeight: "700", color: color.ink },
  dishTime: { fontSize: 12, color: color.muted },
  dishWhy: { fontSize: 12, color: color.inkMid, lineHeight: 17 },
  tags: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
  tagGood: { backgroundColor: color.successSoft, color: color.success },
  tagMiss: { backgroundColor: color.attentionSoft, color: color.attentionInk, flexShrink: 1 },
  empty: {
    backgroundColor: color.surface,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: color.ink },
  emptyButton: { alignSelf: "flex-start", marginTop: 4 },
  summary: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12 },
  summaryText: { flex: 1, fontSize: 13, color: color.inkSoft },
  cart: {
    height: 38,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: color.surface,
  },
  cartDone: { backgroundColor: color.successSoft },
  cartText: { fontSize: 13, color: color.ink },
  cartTextDone: { color: color.success },
});
