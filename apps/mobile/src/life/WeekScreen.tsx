import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Kitchen, WeekPlan } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { isoDay, mondayOf } from "./dates.ts";
import {
  ChatBar,
  Checkbox,
  DarkButton,
  HeaderLink,
  KeepTag,
  LifeHeader,
  life,
  Segment,
  SwipeRow,
} from "./LifeUI.tsx";

function daysOf(monday: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  });
}

function Buy({
  store,
  plan,
  onSay,
}: {
  store: HubStore;
  plan: WeekPlan;
  onSay: (text: string) => void;
}) {
  const { t } = useI18n();
  const left = plan.buy.filter((item) => !item.have).length;
  if (plan.buy.length === 0) return null;
  return (
    <View style={styles.buy}>
      <View style={styles.buyHead}>
        <Text style={styles.buyTitle}>{t("week-buy", { count: left })}</Text>
        <View style={life.flex} />
        <Pressable
          hitSlop={8}
          disabled={plan.added || left === 0}
          onPress={() => void store.weekToShopping(plan.start).catch(() => undefined)}
        >
          <Text style={[life.link, (plan.added || left === 0) && styles.linkOff]}>
            {plan.added ? t("week-buy-added") : t("week-buy-add")}
          </Text>
        </Pressable>
      </View>
      {plan.buy.map((item, index) => {
        const note = item.have
          ? t("week-have")
          : [item.amount, item.note].filter(Boolean).join(t("daily-dot"));
        return (
          <View key={item.name} style={index > 0 && styles.buyLine}>
            <SwipeRow
              action={t("week-gone")}
              actionColor={color.accent}
              width={104}
              enabled={item.have}
              onAction={() => {
                void store.weekItemGone(plan.start, item.name).catch(() => undefined);
                onSay(t("week-gone-message", { name: item.name }));
              }}
            >
              <View style={styles.buyRow}>
                <Text style={[styles.buyName, item.have && styles.faded]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.buyNote} numberOfLines={1}>
                  {note}
                </Text>
                {item.have ? null : <KeepTag keep={item.keep} />}
              </View>
            </SwipeRow>
          </View>
        );
      })}
      {plan.buy.some((item) => item.have) ? (
        <Text style={[life.hint, styles.buyHint]}>{t("week-gone-hint")}</Text>
      ) : null}
    </View>
  );
}

function Menu({
  store,
  kitchen,
  offset,
  onSay,
}: {
  store: HubStore;
  kitchen: Kitchen;
  offset: number;
  onSay: (text: string) => void;
}) {
  const { t, locale } = useI18n();
  const now = new Date();
  const monday = mondayOf(now, offset);
  const start = isoDay(monday);
  const dates = daysOf(monday);
  const plan = kitchen.weeks.find((week) => week.start === start) ?? null;
  const short = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const range = `${short.format(dates[0] ?? monday)}–${short.format(dates[6] ?? monday)}`;
  const label = (date: Date) =>
    t("week-day-label", { weekday: weekday.format(date), date: short.format(date) });

  if (!plan) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>{t("week-empty-title")}</Text>
        <Text style={life.hint}>{t("week-empty-body")}</Text>
        <DarkButton
          label={t("week-empty-start")}
          style={styles.emptyButton}
          onPress={() => onSay(t("week-plan-message", { range, start }))}
        />
      </View>
    );
  }
  return (
    <>
      {dates.map((date) => {
        const key = isoDay(date);
        const day = plan.days.find((item) => item.date === key);
        return (
          <View key={key} style={styles.day}>
            <View style={styles.dayDate}>
              <Text style={styles.weekday}>{weekday.format(date)}</Text>
              <Text style={life.note}>{short.format(date)}</Text>
            </View>
            {day ? (
              <>
                <View style={life.flex}>
                  <Text style={styles.dish} numberOfLines={1}>
                    {day.dish}
                  </Text>
                  <Text style={styles.meta} numberOfLines={2}>
                    {[
                      day.minutes > 0 && !day.takeout
                        ? t("kitchen-minutes", { minutes: day.minutes })
                        : "",
                      day.why,
                    ]
                      .filter(Boolean)
                      .join(t("daily-dot"))}
                  </Text>
                </View>
                <Pressable
                  style={styles.swap}
                  accessibilityRole="button"
                  onPress={() =>
                    onSay(t("week-swap-message", { day: label(date), dish: day.dish }))
                  }
                >
                  <Text style={styles.swapText}>{t("week-swap-short")}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={life.flex}
                onPress={() => onSay(t("week-fill-message", { day: label(date) }))}
              >
                <Text style={life.link}>{t("week-fill")}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
      <Buy store={store} plan={plan} onSay={onSay} />
    </>
  );
}

function Shopping({ store, kitchen }: { store: HubStore; kitchen: Kitchen }) {
  const { t } = useI18n();
  const left = kitchen.shopping.filter((item) => !item.done);
  const bought = kitchen.shopping.filter((item) => item.done);
  return (
    <View style={styles.list}>
      <View style={styles.listHead}>
        <Text style={life.note}>{t("kitchen-shopping-left", { count: left.length })}</Text>
        <View style={life.flex} />
        {bought.length > 0 ? (
          <Pressable hitSlop={8} onPress={() => void store.clearBought().catch(() => undefined)}>
            <Text style={life.link}>{t("kitchen-clear-bought")}</Text>
          </Pressable>
        ) : null}
      </View>
      {kitchen.shopping.length === 0 ? (
        <Text style={[life.hint, styles.listEmpty]}>{t("kitchen-shopping-empty-phone")}</Text>
      ) : (
        [...left, ...bought].map((item) => (
          <Pressable
            key={item.name}
            style={styles.item}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.done }}
            onPress={() => void store.toggleShopping(item.name, !item.done).catch(() => undefined)}
          >
            <Checkbox on={item.done} />
            <Text style={[styles.itemName, item.done && styles.itemDone]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={styles.itemNote} numberOfLines={1}>
              {[item.amount, item.note].filter(Boolean).join(t("daily-dot"))}
            </Text>
            {!item.done ? <KeepTag keep={item.keep} /> : null}
          </Pressable>
        ))
      )}
    </View>
  );
}

export function WeekScreen({ store }: { store: HubStore }) {
  const { t, locale } = useI18n();
  const { kitchen, status } = useHubState(store);
  const [tab, setTab] = useState<"menu" | "list">("menu");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (status === "open") void store.loadKitchen().catch(() => undefined);
  }, [store, status]);

  const threadId = kitchen?.threadId ?? null;
  const say = (text: string) => {
    if (threadId) void store.send(threadId, text).catch(() => undefined);
  };
  const monday = mondayOf(new Date(), offset);
  const short = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  const range = `${short.format(monday)}–${short.format(daysOf(monday)[6] ?? monday)}`;
  const left = kitchen?.shopping.filter((item) => !item.done).length ?? 0;

  return (
    <>
      <LifeHeader
        title={offset === 0 ? t("week-title-this") : t("week-title-next")}
        sub={kitchen ? t("week-subtitle", { range, minutes: kitchen.maxMinutes }) : undefined}
        right={
          tab === "menu" ? (
            <HeaderLink
              label={offset === 0 ? t("week-next") : t("week-prev")}
              onPress={() => setOffset(offset === 0 ? 1 : 0)}
            />
          ) : null
        }
      />
      <Segment
        value={tab}
        style={styles.segment}
        options={[
          { id: "menu", label: t("week-tab-menu") },
          { id: "list", label: t("week-tab-shopping", { count: left }) },
        ]}
        onChange={setTab}
      />
      <ScrollView style={life.scroll} contentContainerStyle={styles.body}>
        {kitchen &&
          (tab === "menu" ? (
            <Menu store={store} kitchen={kitchen} offset={offset} onSay={say} />
          ) : (
            <Shopping store={store} kitchen={kitchen} />
          ))}
      </ScrollView>
      <ChatBar store={store} threadId={threadId} placeholder={t("week-chat-placeholder")} />
    </>
  );
}

const styles = StyleSheet.create({
  segment: { marginHorizontal: 16, marginTop: 4, marginBottom: 10 },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  day: {
    backgroundColor: color.surface,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dayDate: { width: 38, alignItems: "center" },
  weekday: { fontSize: 15, fontWeight: "700", color: color.ink },
  dish: { fontSize: 14, fontWeight: "500", color: color.ink },
  meta: { fontSize: 12, color: color.inkMid, marginTop: 2 },
  swap: {
    height: 32,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: 9,
    justifyContent: "center",
    backgroundColor: color.surface,
  },
  swapText: { fontSize: 12, color: color.ink },
  empty: { backgroundColor: color.surface, borderRadius: 16, padding: 16, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: color.ink },
  emptyButton: { alignSelf: "flex-start", marginTop: 4 },
  buy: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    padding: 12,
    marginTop: 2,
  },
  buyHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  buyTitle: { fontSize: 13, fontWeight: "700", color: color.ink },
  linkOff: { color: color.faint },
  buyLine: { borderTopWidth: 1, borderTopColor: color.lineSoft },
  buyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  buyName: { flex: 1, fontSize: 14, color: color.ink },
  faded: { color: color.faded },
  buyNote: { fontSize: 12, color: color.faint, flexShrink: 1 },
  buyHint: { marginTop: 8 },
  list: {
    backgroundColor: color.surface,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  listHead: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  listEmpty: { paddingVertical: 8 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
  },
  itemName: { flex: 1, fontSize: 14, color: color.ink },
  itemDone: { color: color.faint, textDecorationLine: "line-through" },
  itemNote: { fontSize: 12, color: color.muted, flexShrink: 1 },
});
