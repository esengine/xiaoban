import {
  COST_TONES,
  type CostGroup,
  type CostSummary,
  categoryText,
  costMoney,
  costSummary,
  groupItems,
  groupSource,
  type HubStore,
  type Money,
  pendingText,
  placeLinks,
  priceAmount,
  priceKnown,
  SOURCE_TONES,
  savedTotal,
  sourceDetail,
  sourceText,
  stayKm,
} from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { StayOption, Trip, TripCosts } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { openFirst } from "./useTrip.ts";

interface Props {
  store: HubStore;
  trip: Trip;
  readOnly: boolean;
  busy: boolean;
  onSay: (text: string) => void;
}

export function useMoney(): Money {
  const { locale } = useI18n();
  return useMemo(() => costMoney(locale), [locale]);
}

export function CostBar({ summary }: { summary: CostSummary }) {
  if (summary.cents <= 0) return null;
  return (
    <View style={styles.bar}>
      {summary.groups
        .filter((group) => group.cents > 0)
        .map((group) => (
          <View
            key={group.category}
            style={{ flex: group.cents, backgroundColor: color[COST_TONES[group.category]] }}
          />
        ))}
    </View>
  );
}

export function TripCostView({ store, trip, readOnly, busy, onSay }: Props) {
  const { t } = useI18n();
  const money = useMoney();
  const costs = trip.costs;
  if (!costs || (costs.lines.length === 0 && costs.stays.length === 0)) {
    return (
      <View style={styles.empty}>
        <Text style={styles.muted}>{t("trip-cost-empty")}</Text>
        {readOnly ? null : (
          <Pressable
            style={[styles.button, styles.buttonDark]}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onSay(t("trip-cost-ask-message"))}
          >
            <Text style={styles.buttonDarkText}>{t("trip-cost-ask")}</Text>
          </Pressable>
        )}
      </View>
    );
  }
  const summary = costSummary(costs);
  const over = summary.over !== null && summary.over > 0 ? summary.over : null;
  const pending = pendingText(t, summary);
  return (
    <View style={styles.view}>
      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>
          {t(summary.pending.length > 0 ? "trip-cost-found" : "trip-cost-total")}
        </Text>
        <Text style={styles.total}>{money(summary.cents)}</Text>
        <View style={styles.flex} />
        {over !== null && costs.budgetCents !== null ? (
          <Text style={styles.warn}>
            {t("trip-cost-over", { budget: money(costs.budgetCents), over: money(over) })}
          </Text>
        ) : pending ? (
          <Text style={styles.warn} numberOfLines={2}>
            {pending}
          </Text>
        ) : summary.perPerson !== null ? (
          <Text style={styles.muted}>
            {t("trip-cost-per-person", { amount: money(summary.perPerson) })}
          </Text>
        ) : null}
      </View>
      <CostBar summary={summary} />
      {over !== null && costs.savings.length > 0 ? (
        <Savings costs={costs} readOnly={readOnly || busy} money={money} onSay={onSay} />
      ) : null}
      {summary.groups.map((group) => (
        <Group
          key={group.category}
          store={store}
          trip={trip}
          costs={costs}
          group={group}
          money={money}
          readOnly={readOnly}
          busy={busy}
          onSay={onSay}
        />
      ))}
      <Text style={styles.footnote}>{t("trip-cost-footnote")}</Text>
    </View>
  );
}

function Savings({
  costs,
  readOnly,
  money,
  onSay,
}: {
  costs: TripCosts;
  readOnly: boolean;
  money: Money;
  onSay: (text: string) => void;
}) {
  const { t } = useI18n();
  const first = costs.savings[0];
  const titles = costs.savings.map((saving) => saving.title).join(t("trip-cost-items-joiner"));
  return (
    <View style={styles.savings}>
      <Text style={styles.savingLead}>
        {t("trip-saving-lead", { total: money(savedTotal(costs, costs.savings)) })}
      </Text>
      {costs.savings.map((saving) => (
        <View key={saving.title} style={styles.saving}>
          <View style={styles.flex}>
            <Text style={styles.savingTitle}>{saving.title}</Text>
            {saving.detail ? <Text style={styles.detail}>{saving.detail}</Text> : null}
          </View>
          {saving.savesCents !== null ? (
            <Text style={styles.saves}>
              {t("trip-saving-saves", { amount: money(saving.savesCents) })}
            </Text>
          ) : null}
        </View>
      ))}
      {readOnly ? null : (
        <View style={styles.buttons}>
          <Pressable
            style={[styles.button, styles.buttonDark, styles.flex]}
            accessibilityRole="button"
            onPress={() => onSay(t("trip-saving-all-message", { items: titles }))}
          >
            <Text style={styles.buttonDarkText}>{t("trip-saving-all")}</Text>
          </Pressable>
          {costs.savings.length > 1 && first ? (
            <Pressable
              style={[styles.button, styles.flex]}
              accessibilityRole="button"
              onPress={() => onSay(t("trip-saving-only-message", { item: first.title }))}
            >
              <Text style={styles.buttonText} numberOfLines={1}>
                {t("trip-saving-only", { category: categoryText(t, first.category) })}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.button, styles.flex]}
            accessibilityRole="button"
            onPress={() => onSay(t("trip-saving-skip-message"))}
          >
            <Text style={styles.buttonText}>{t("trip-saving-skip")}</Text>
          </Pressable>
        </View>
      )}
      <Text style={styles.footnote}>{t("trip-saving-note")}</Text>
    </View>
  );
}

function Group({
  store,
  trip,
  costs,
  group,
  money,
  readOnly,
  busy,
  onSay,
}: {
  store: HubStore;
  trip: Trip;
  costs: TripCosts;
  group: CostGroup;
  money: Money;
  readOnly: boolean;
  busy: boolean;
  onSay: (text: string) => void;
}) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [filling, setFilling] = useState(false);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const stays = group.category === "stay" && costs.stays.length > 1;
  const missing = group.entries.find((entry) => priceKnown(entry.price) === null) ?? null;
  const item = missing?.price.label || categoryText(t, group.category);
  const save = async () => {
    const value = Number(amount.replace(/[^\d.]/g, ""));
    if (!missing || !Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    try {
      await store.fillTripPrice(trip.id, missing, Math.round(value * 100));
      setFilling(false);
      setAmount("");
    } catch {
    } finally {
      setSaving(false);
    }
  };
  const head = (
    <>
      <View style={styles.groupHead}>
        <View style={[styles.dot, { backgroundColor: color[COST_TONES[group.category]] }]} />
        <Text style={styles.groupName}>{categoryText(t, group.category)}</Text>
        {group.kinds.map((kind) => (
          <Text
            key={kind}
            style={[
              styles.tag,
              {
                backgroundColor: color[SOURCE_TONES[kind].soft],
                color: color[SOURCE_TONES[kind].ink],
              },
            ]}
          >
            {sourceText(t, kind)}
          </Text>
        ))}
        <View style={styles.flex} />
        <Text style={styles.groupAmount}>
          {group.cents > 0 || !group.missing ? money(group.cents) : "—"}
        </Text>
      </View>
      <Text style={styles.items}>{groupItems(t, money, group)}</Text>
      <Text style={styles.detail}>{groupSource(t, locale, group)}</Text>
    </>
  );
  return (
    <View style={styles.group}>
      {stays ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
        >
          {head}
        </Pressable>
      ) : (
        head
      )}
      {stays && open ? (
        <View style={styles.stays}>
          {costs.stays.map((stay, index) => (
            <Stay
              key={stay.name}
              trip={trip}
              stay={stay}
              money={money}
              readOnly={readOnly}
              onUse={() => void store.chooseTripStay(trip.id, index).catch(() => undefined)}
            />
          ))}
          {group.entries[0] ? (
            <Text style={styles.footnote}>
              {[sourceDetail(t, locale, group.entries[0].price), t("trip-stay-footnote")].join(
                t("trip-cost-items-joiner"),
              )}
            </Text>
          ) : null}
        </View>
      ) : null}
      {missing && !readOnly ? (
        filling ? (
          <View style={styles.fill}>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={t("trip-cost-fill-placeholder")}
              placeholderTextColor={color.faint}
              accessibilityLabel={t("trip-cost-fill-label", { item })}
              autoFocus
              onSubmitEditing={() => void save()}
            />
            <Pressable
              style={[styles.button, styles.buttonDark]}
              accessibilityRole="button"
              disabled={saving}
              onPress={() => void save()}
            >
              <Text style={styles.buttonDarkText}>{t("trip-cost-fill-save")}</Text>
            </Pressable>
            <Pressable
              style={styles.button}
              accessibilityRole="button"
              onPress={() => setFilling(false)}
            >
              <Text style={styles.buttonText}>{t("trip-cost-fill-cancel")}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, styles.buttonDark]}
              accessibilityRole="button"
              disabled={busy}
              onPress={() => onSay(t("trip-cost-check-message", { item }))}
            >
              <Text style={styles.buttonDarkText}>{t("trip-cost-check-app")}</Text>
            </Pressable>
            <Pressable
              style={styles.button}
              accessibilityRole="button"
              onPress={() => setFilling(true)}
            >
              <Text style={styles.buttonText}>{t("trip-cost-fill")}</Text>
            </Pressable>
          </View>
        )
      ) : null}
    </View>
  );
}

function Stay({
  trip,
  stay,
  money,
  readOnly,
  onUse,
}: {
  trip: Trip;
  stay: StayOption;
  money: Money;
  readOnly: boolean;
  onUse: () => void;
}) {
  const { t } = useI18n();
  const price = stay.price;
  const nightly =
    price.unitCents !== null && priceKnown(price) !== null
      ? t("trip-stay-per-night", { amount: money(price.unitCents) })
      : priceAmount(t, money, price);
  const facts = [
    stay.meters !== null ? t("trip-stay-meters", { km: stayKm(stay.meters) }) : "",
    stay.note ?? "",
  ]
    .filter(Boolean)
    .join(t("daily-dot"));
  const map = () =>
    void openFirst(
      placeLinks(trip, {
        name: stay.name,
        time: "",
        note: "",
        location: stay.location,
        next: null,
        detail: null,
      }),
    );
  return (
    <View style={[styles.stay, stay.chosen && styles.stayOn]}>
      <View style={styles.stayHead}>
        <Text style={styles.stayName} numberOfLines={1}>
          {stay.name}
        </Text>
        <Text style={styles.stayPrice}>{nightly ?? t("trip-source-none")}</Text>
      </View>
      {facts ? <Text style={styles.detail}>{facts}</Text> : null}
      <View style={styles.stayLinks}>
        {stay.chosen ? (
          <Text style={styles.link}>{t("trip-stay-chosen")}</Text>
        ) : readOnly ? null : (
          <Pressable accessibilityRole="button" hitSlop={6} onPress={onUse}>
            <Text style={styles.link}>{t("trip-stay-use")}</Text>
          </Pressable>
        )}
        <Text style={styles.link}>{t("daily-dot")}</Text>
        <Pressable accessibilityRole="link" hitSlop={6} onPress={map}>
          <Text style={styles.link}>{t("trip-stay-map")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  view: { gap: 4, paddingBottom: 8 },
  flex: { flex: 1, minWidth: 0 },
  empty: { alignItems: "flex-start", gap: 10, paddingVertical: 16, paddingHorizontal: 4 },
  muted: { fontSize: 12, color: color.muted },
  warn: { fontSize: 12, color: color.attentionInk, flexShrink: 1, textAlign: "right" },
  totalRow: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingTop: 4 },
  totalLabel: { fontSize: 12, color: color.muted },
  total: { fontSize: 24, fontWeight: "700", color: color.ink },
  bar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    gap: 2,
    marginVertical: 8,
  },
  group: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: color.lineSoft, gap: 3 },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  groupName: { fontSize: 14, fontWeight: "700", color: color.ink },
  tag: {
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
  groupAmount: { fontSize: 14, fontWeight: "700", color: color.ink },
  items: { fontSize: 12, color: color.inkMid, lineHeight: 17 },
  detail: { fontSize: 11, color: color.muted, lineHeight: 16 },
  footnote: { fontSize: 11, color: color.faint, lineHeight: 16, marginTop: 6 },
  buttons: { flexDirection: "row", gap: 8, marginTop: 8 },
  button: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.lineStrong,
    backgroundColor: color.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDark: { backgroundColor: color.ink, borderColor: color.ink },
  buttonText: { fontSize: 13, color: color.ink },
  buttonDarkText: { fontSize: 13, fontWeight: "600", color: color.surface },
  fill: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" },
  input: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.lineStrong,
    paddingHorizontal: 10,
    fontSize: 14,
    color: color.ink,
  },
  stays: { gap: 8, marginTop: 8 },
  stay: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.line,
    padding: 10,
    gap: 3,
  },
  stayOn: { borderColor: color.accent, backgroundColor: color.accentWash },
  stayHead: { flexDirection: "row", gap: 8, alignItems: "center" },
  stayName: { flex: 1, fontSize: 13, fontWeight: "700", color: color.ink },
  stayPrice: { fontSize: 13, fontWeight: "700", color: color.ink },
  stayLinks: { flexDirection: "row", gap: 4, marginTop: 2 },
  link: { fontSize: 11, color: color.accent },
  savings: { gap: 8, paddingVertical: 8 },
  savingLead: { fontSize: 13, color: color.ink },
  saving: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: color.ground,
    padding: 10,
  },
  savingTitle: { fontSize: 13, fontWeight: "700", color: color.ink },
  saves: { fontSize: 13, fontWeight: "700", color: color.success },
});
