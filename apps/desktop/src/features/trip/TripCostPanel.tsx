import {
  COST_TONES,
  type CostGroup,
  type CostSummary,
  categoryText,
  costMoney,
  costSummary,
  groupItems,
  groupSource,
  type Money,
  pendingText,
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
import { type FormEvent, useMemo, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { amapPlace, toneColor } from "./format.ts";
import { OutIcon } from "./icons.tsx";

interface Props {
  trip: Trip;
  readOnly: boolean;
  busy: boolean;
  onSay: (text: string) => void;
  onOpen: (url: string) => void;
}

export function useMoney(): Money {
  const { locale } = useI18n();
  return useMemo(() => costMoney(locale), [locale]);
}

export function CostBar({ summary }: { summary: CostSummary }) {
  if (summary.cents <= 0) return null;
  return (
    <div className="trip-cost__bar" aria-hidden="true">
      {summary.groups
        .filter((group) => group.cents > 0)
        .map((group) => (
          <span
            key={group.category}
            style={{ flex: group.cents, background: toneColor(COST_TONES[group.category]) }}
          />
        ))}
    </div>
  );
}

export function TripCostPanel({ trip, readOnly, busy, onSay, onOpen }: Props) {
  const { t } = useI18n();
  const money = useMoney();
  const costs = trip.costs;
  if (!costs || (costs.lines.length === 0 && costs.stays.length === 0)) {
    return (
      <section className="trip-cost trip-cost--empty">
        <p className="trip-cost__muted">{t("trip-cost-empty")}</p>
        {!readOnly && (
          <button
            type="button"
            className="button button--dark"
            disabled={busy}
            onClick={() => onSay(t("trip-cost-ask-message"))}
          >
            {t("trip-cost-ask")}
          </button>
        )}
      </section>
    );
  }
  const summary = costSummary(costs);
  const over = summary.over !== null && summary.over > 0 ? summary.over : null;
  const pending = pendingText(t, summary);
  return (
    <section className="trip-cost" aria-label={t("trip-tab-cost")}>
      <div className="trip-cost__total">
        <span className="trip-cost__muted">
          {t(summary.pending.length > 0 ? "trip-cost-found" : "trip-cost-total")}
        </span>
        <b className="trip-cost__sum">{money(summary.cents)}</b>
        <span className="trip-cost__side">
          {over !== null && costs.budgetCents !== null ? (
            <span className="trip-cost__warn">
              {t("trip-cost-over", { budget: money(costs.budgetCents), over: money(over) })}
            </span>
          ) : pending ? (
            <span className="trip-cost__warn">{pending}</span>
          ) : summary.perPerson !== null ? (
            t("trip-cost-per-person", { amount: money(summary.perPerson) })
          ) : null}
        </span>
      </div>
      <CostBar summary={summary} />
      {over !== null && costs.savings.length > 0 && (
        <Savings costs={costs} readOnly={readOnly || busy} money={money} onSay={onSay} />
      )}
      <ul className="trip-cost__groups">
        {summary.groups.map((group) => (
          <Group
            key={group.category}
            trip={trip}
            costs={costs}
            group={group}
            money={money}
            readOnly={readOnly}
            busy={busy}
            onSay={onSay}
            onOpen={onOpen}
          />
        ))}
      </ul>
      <p className="trip-cost__footnote">{t("trip-cost-footnote")}</p>
    </section>
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
    <div className="trip-cost__savings">
      <p className="trip-cost__lead">
        {t("trip-saving-lead", { total: money(savedTotal(costs, costs.savings)) })}
      </p>
      {costs.savings.map((saving) => (
        <div key={saving.title} className="trip-cost__saving">
          <span className="trip-cost__saving-text">
            <b>{saving.title}</b>
            {saving.detail && <span className="trip-cost__detail">{saving.detail}</span>}
          </span>
          {saving.savesCents !== null && (
            <b className="trip-cost__saves">
              {t("trip-saving-saves", { amount: money(saving.savesCents) })}
            </b>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="trip-cost__buttons">
          <button
            type="button"
            className="button button--dark"
            onClick={() => onSay(t("trip-saving-all-message", { items: titles }))}
          >
            {t("trip-saving-all")}
          </button>
          {costs.savings.length > 1 && first && (
            <button
              type="button"
              className="button button--line"
              onClick={() => onSay(t("trip-saving-only-message", { item: first.title }))}
            >
              {t("trip-saving-only", { category: categoryText(t, first.category) })}
            </button>
          )}
          <button
            type="button"
            className="button button--line"
            onClick={() => onSay(t("trip-saving-skip-message"))}
          >
            {t("trip-saving-skip")}
          </button>
        </div>
      )}
      <p className="trip-cost__footnote">{t("trip-saving-note")}</p>
    </div>
  );
}

function Group({
  trip,
  costs,
  group,
  money,
  readOnly,
  busy,
  onSay,
  onOpen,
}: {
  trip: Trip;
  costs: TripCosts;
  group: CostGroup;
  money: Money;
  readOnly: boolean;
  busy: boolean;
  onSay: (text: string) => void;
  onOpen: (url: string) => void;
}) {
  const { t, locale } = useI18n();
  const store = useHub();
  const [open, setOpen] = useState(false);
  const [filling, setFilling] = useState(false);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const stays = group.category === "stay" && costs.stays.length > 1;
  const missing = group.entries.find((entry) => priceKnown(entry.price) === null) ?? null;
  const item = missing?.price.label || categoryText(t, group.category);
  const save = async (event: FormEvent) => {
    event.preventDefault();
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
      <span className="trip-cost__head">
        <span
          className="trip-cost__dot"
          style={{ background: toneColor(COST_TONES[group.category]) }}
        />
        <b className="trip-cost__name">{categoryText(t, group.category)}</b>
        {group.kinds.map((kind) => (
          <span
            key={kind}
            className="trip-cost__tag"
            style={{
              background: toneColor(SOURCE_TONES[kind].soft),
              color: toneColor(SOURCE_TONES[kind].ink),
            }}
          >
            {sourceText(t, kind)}
          </span>
        ))}
        <b className="trip-cost__amount">
          {group.cents > 0 || !group.missing ? money(group.cents) : "—"}
        </b>
      </span>
      <span className="trip-cost__items">{groupItems(t, money, group)}</span>
      <span className="trip-cost__detail">{groupSource(t, locale, group)}</span>
    </>
  );
  return (
    <li className="trip-cost__group">
      {stays ? (
        <button
          type="button"
          className="trip-cost__toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {head}
        </button>
      ) : (
        <div className="trip-cost__static">{head}</div>
      )}
      {stays && open && (
        <div className="trip-cost__stays">
          {costs.stays.map((stay, index) => (
            <Stay
              key={stay.name}
              trip={trip}
              stay={stay}
              money={money}
              readOnly={readOnly}
              onUse={() => void store.chooseTripStay(trip.id, index).catch(() => undefined)}
              onOpen={onOpen}
            />
          ))}
          {group.entries[0] && (
            <p className="trip-cost__footnote">
              {[sourceDetail(t, locale, group.entries[0].price), t("trip-stay-footnote")].join(
                t("trip-cost-items-joiner"),
              )}
            </p>
          )}
        </div>
      )}
      {missing &&
        !readOnly &&
        (filling ? (
          <form className="trip-cost__fill" onSubmit={(event) => void save(event)}>
            <input
              value={amount}
              inputMode="decimal"
              placeholder={t("trip-cost-fill-placeholder")}
              aria-label={t("trip-cost-fill-label", { item })}
              onChange={(event) => setAmount(event.target.value)}
            />
            <button type="submit" className="button button--dark" disabled={saving}>
              {t("trip-cost-fill-save")}
            </button>
            <button type="button" className="button button--line" onClick={() => setFilling(false)}>
              {t("trip-cost-fill-cancel")}
            </button>
          </form>
        ) : (
          <div className="trip-cost__buttons">
            <button
              type="button"
              className="button button--dark"
              disabled={busy}
              onClick={() => onSay(t("trip-cost-check-message-desk", { item }))}
            >
              {t("trip-cost-check-app-desk")}
            </button>
            <button type="button" className="button button--line" onClick={() => setFilling(true)}>
              {t("trip-cost-fill")}
            </button>
          </div>
        ))}
    </li>
  );
}

function Stay({
  trip,
  stay,
  money,
  readOnly,
  onUse,
  onOpen,
}: {
  trip: Trip;
  stay: StayOption;
  money: Money;
  readOnly: boolean;
  onUse: () => void;
  onOpen: (url: string) => void;
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
  return (
    <div className="trip-cost__stay" data-chosen={stay.chosen || undefined}>
      <span className="trip-cost__stay-head">
        <b>{stay.name}</b>
        <b>{nightly ?? t("trip-source-none")}</b>
      </span>
      {facts && <span className="trip-cost__detail">{facts}</span>}
      <span className="trip-cost__stay-links">
        {stay.chosen ? (
          <span>{t("trip-stay-chosen")}</span>
        ) : (
          !readOnly && (
            <button type="button" className="link-button" onClick={onUse}>
              {t("trip-stay-use")}
            </button>
          )
        )}
        <button
          type="button"
          className="link-button"
          onClick={() =>
            onOpen(
              amapPlace(trip, {
                name: stay.name,
                time: "",
                note: "",
                location: stay.location,
                next: null,
                detail: null,
              }),
            )
          }
        >
          {t("trip-stay-map")}
          <OutIcon />
        </button>
      </span>
    </div>
  );
}
