import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Plan, Sky } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SkyIcon } from "../life/LifeIcons.tsx";
import { DoneCard, NoticedCard } from "../life/Noticed.tsx";
import { TodoDailyCard } from "../todo/TodoDailyCard.tsx";
import { moneyFormat } from "../ui/format.ts";
import { openThread } from "./ChatsTab.tsx";

function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function greetingKey(hour: number) {
  if (hour < 11) return "daily-morning" as const;
  if (hour < 18) return "daily-afternoon" as const;
  return "daily-evening" as const;
}

function Card({
  title,
  note,
  open,
  children,
}: {
  title: string;
  note?: string | undefined;
  open?: { label: string; href: "/kitchen" | "/ledger" | "/weather" } | undefined;
  children: React.ReactNode;
}) {
  const head = (
    <View style={styles.cardHead}>
      <Text style={styles.cardTitle}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {open ? (
        <>
          <View style={styles.flex} />
          <Text style={styles.open}>{open.label}</Text>
        </>
      ) : null}
    </View>
  );
  if (!open) {
    return (
      <View style={styles.card}>
        {head}
        {children}
      </View>
    );
  }
  return (
    <Pressable
      style={styles.card}
      accessibilityRole="button"
      onPress={() => router.push(open.href)}
    >
      {head}
      {children}
    </Pressable>
  );
}

function useSky() {
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

function PlanRow({ plan }: { plan: Plan }) {
  const { t } = useI18n();
  const done = plan.steps.filter(
    (step) => step.status === "done" || step.status === "skipped",
  ).length;
  const next = plan.steps.find((step) => step.status === "todo" || step.status === "running");
  const sub =
    plan.status === "draft"
      ? t("plan-sub-draft", { version: plan.version })
      : plan.status === "blocked"
        ? t("plan-sub-blocked")
        : plan.status === "paused"
          ? t("plan-sub-paused")
          : next
            ? t("plan-sub-doing", { step: next.title })
            : t("plan-sub-done");
  return (
    <Pressable style={styles.planRow} onPress={() => openThread(plan.threadId, { plan: true })}>
      <View style={styles.planRing}>
        <Text style={styles.planRingText}>
          {t("plan-ring", { done, total: plan.steps.length })}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.planTitle} numberOfLines={1}>
          {plan.title}
        </Text>
        <Text style={styles.note} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

export function DailyTab({ store }: { store: HubStore }) {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const { weather, kitchen, ledger, memories, plans, status, dailyFeed } = useHubState(store);
  const sky = useSky();
  const money = moneyFormat(locale);

  useEffect(() => {
    if (status !== "open") return;
    void store.loadWeather().catch(() => undefined);
    void store.loadKitchen().catch(() => undefined);
    void store.loadLedger(thisMonth()).catch(() => undefined);
    void store.listPlans().catch(() => undefined);
    void store.loadDailyFeed().catch(() => undefined);
  }, [store, status]);

  const now = new Date();
  const name = memories.find(
    (memory) => memory.subject === t("memory-topic-preferred-name"),
  )?.value;
  const greeting = t(greetingKey(now.getHours()));
  const date = new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(now);
  const report = weather?.report;
  const place = weather?.places.find((item) => item.id === weather.placeId) ?? weather?.places[0];
  const today = report?.days[0];
  const tip = report?.tips[0];
  const dishes = kitchen?.dishes ?? [];
  const spent =
    ledger && ledger.month === thisMonth()
      ? ledger.entries.reduce((sum, entry) => sum + entry.cents, 0)
      : null;
  const budget = ledger?.budgetCents ?? null;
  const active = Object.values(plans).filter(
    (plan): plan is Plan => plan !== null && plan.status !== "done",
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.body, { paddingTop: insets.top + 16 }]}
    >
      <View style={styles.hello}>
        <Text style={styles.greeting}>
          {name ? t("daily-hello-name", { greeting, name }) : greeting}
        </Text>
        <Text style={styles.date}>{date}</Text>
      </View>

      <TodoDailyCard store={store} />

      {!report && (
        <Card
          title={t("weather-title")}
          open={{ label: t("daily-open-weather"), href: "/weather" }}
        >
          <Text style={styles.hint}>{t("daily-weather-empty")}</Text>
        </Card>
      )}

      {report && (
        <Card
          title={t("weather-title")}
          note={place?.city}
          open={{ label: t("daily-open-weather"), href: "/weather" }}
        >
          <View style={styles.weatherNow}>
            <SkyIcon sky={report.now.sky} size={32} />
            <Text style={styles.big}>
              {t("weather-degrees", { value: String(report.now.temp) })}
            </Text>
            <Text style={styles.note}>
              {today
                ? t("weather-sky-range", {
                    sky: sky(report.now.sky),
                    low: String(today.low),
                    high: String(today.high),
                  })
                : sky(report.now.sky)}
            </Text>
          </View>
          {tip ? <Text style={styles.tip}>{tip.title}</Text> : null}
        </Card>
      )}

      {(dailyFeed?.insights ?? []).slice(0, 2).map((insight) => (
        <NoticedCard key={insight.id} store={store} insight={insight} />
      ))}

      {dailyFeed && dailyFeed.done.length > 0 ? <DoneCard items={dailyFeed.done} /> : null}

      <Card title={t("daily-food")} open={{ label: t("daily-open-kitchen"), href: "/kitchen" }}>
        {dishes.length > 0 ? (
          <View style={styles.dishes}>
            {dishes.slice(0, 3).map((dish) => (
              <View key={dish.name} style={styles.dish}>
                <Text style={styles.dishName} numberOfLines={1}>
                  {dish.name}
                </Text>
                <Text style={styles.note} numberOfLines={1}>
                  {t("kitchen-minutes", { minutes: dish.minutes })}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.hint}>{t("daily-food-empty")}</Text>
        )}
      </Card>

      <Card title={t("daily-money")} open={{ label: t("daily-open-ledger"), href: "/ledger" }}>
        {spent !== null && ledger && ledger.entries.length > 0 ? (
          <>
            <View style={styles.moneyLine}>
              <Text style={styles.big}>{money(spent)}</Text>
              {budget ? (
                <Text style={styles.note}>
                  {t("daily-money-budget", { amount: money(budget) })}
                </Text>
              ) : null}
            </View>
            {budget ? (
              <View style={styles.bar}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.min(100, (spent / budget) * 100)}%` },
                    spent > budget && styles.barOver,
                  ]}
                />
              </View>
            ) : null}
          </>
        ) : (
          <Text style={styles.hint}>{t("daily-money-empty")}</Text>
        )}
      </Card>

      <Card
        title={t("daily-plans")}
        note={active.length > 0 ? t("daily-plans-count", { count: active.length }) : undefined}
      >
        {active.length > 0 ? (
          active.slice(0, 4).map((plan) => <PlanRow key={plan.threadId} plan={plan} />)
        ) : (
          <Text style={styles.hint}>{t("daily-plans-empty")}</Text>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  body: { paddingHorizontal: 14, paddingBottom: 24, gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  hello: { paddingHorizontal: 6, marginBottom: 4 },
  greeting: { fontSize: 22, fontWeight: "700", color: color.ink },
  date: { fontSize: 12, color: color.faint, marginTop: 2 },
  card: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 13, fontWeight: "700", color: color.ink },
  note: { fontSize: 12, color: color.faint },
  open: { fontSize: 12, color: color.accent },
  hint: { fontSize: 12.5, lineHeight: 19, color: color.muted },
  weatherNow: { flexDirection: "row", alignItems: "center", gap: 10 },
  big: { fontSize: 24, fontWeight: "700", color: color.ink },
  tip: { fontSize: 12.5, color: color.inkMid },
  dishes: { flexDirection: "row", gap: 6 },
  dish: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
    backgroundColor: color.ground,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 2,
  },
  dishName: { fontSize: 13, fontWeight: "500", color: color.ink },
  moneyLine: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  bar: { height: 6, borderRadius: 3, backgroundColor: color.lineSoft, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: color.accent },
  barOver: { backgroundColor: color.attention },
  planRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  planRing: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  planRingText: { fontSize: 9, fontWeight: "700", color: color.ink },
  planTitle: { fontSize: 13, color: color.ink },
});
