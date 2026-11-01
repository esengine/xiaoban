import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { DoneItem, Insight, InsightPage } from "@xiaoban/protocol";
import { useHub } from "../../app/hub.tsx";
import { plain } from "../chat/plain.ts";
import { recency } from "../chat/time.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export type InsightNav = {
  onOpenThread: (threadId: string) => void;
  onOpenPage: (page: Exclude<InsightPage, "thread">) => void;
};

function useWhen() {
  const { t, locale } = useI18n();
  return (time: number) => {
    const value = recency(time, Date.now(), locale);
    if (value.kind === "now") return t("time-just-now");
    if (value.kind === "yesterday") return t("time-yesterday");
    return value.text;
  };
}

function useAgo() {
  const { t } = useI18n();
  const when = useWhen();
  return (time: number) => {
    const gap = Date.now() - time;
    if (gap >= MINUTE && gap < HOUR) return t("time-minutes-ago", { count: Math.floor(gap / MINUTE) });
    if (gap >= HOUR && gap < 12 * HOUR) return t("time-hours-ago", { count: Math.floor(gap / HOUR) });
    return when(time);
  };
}

export function useInsightAct(nav: InsightNav) {
  const store = useHub();
  const { preferences } = useHubState(store);
  const primary = preferences?.primaryThreadId ?? null;
  return (insight: Insight) => {
    void store.resolveInsight(insight.id, false).catch(() => undefined);
    const action = insight.action;
    if (action.kind === "say") {
      const target = action.threadId ?? primary;
      if (!target) return;
      void store.send(target, action.text).catch(() => undefined);
      nav.onOpenThread(target);
      return;
    }
    if (action.page === "thread") {
      if (action.threadId) nav.onOpenThread(action.threadId);
      return;
    }
    nav.onOpenPage(action.page);
  };
}

export function NoticedCard({ insights, nav }: { insights: Insight[]; nav: InsightNav }) {
  const { t } = useI18n();
  const store = useHub();
  const ago = useAgo();
  const act = useInsightAct(nav);
  const first = insights[0];
  if (!first) return null;
  return (
    <section className="life-card daily__noticed">
      <div className="life-card__head">
        <b>{t("insight-tag")}</b>
        <span className="life-card__note">{ago(first.at)}</span>
      </div>
      {insights.map((insight) => (
        <div key={insight.id} className="daily__insight">
          <p>{insight.text}</p>
          <div className="daily__insight-actions">
            <button
              type="button"
              className="code-status-button"
              data-dark
              onClick={() => act(insight)}
            >
              {insight.actionLabel}
            </button>
            <button
              type="button"
              className="code-status-button"
              onClick={() => void store.resolveInsight(insight.id, true).catch(() => undefined)}
            >
              {t("insight-mute")}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function DoneRow({ item, onOpen }: { item: DoneItem; onOpen: (threadId: string) => void }) {
  const { t } = useI18n();
  const when = useWhen();
  const running = item.status === "running";
  const summary = plain(item.summary);
  const threadId = item.threadId;
  return (
    <button
      type="button"
      className="daily__done-row"
      disabled={!threadId}
      onClick={() => threadId && onOpen(threadId)}
    >
      <span className="daily__done-time">{when(item.at)}</span>
      <span className="daily__done-text">
        {item.title || t("thread-untitled")}
        {summary && <small>{summary}</small>}
      </span>
      <span className="daily__done-state" data-running={running || undefined}>
        {running ? t("daily-done-running") : t("daily-done-finished")}
      </span>
    </button>
  );
}

export function DoneCard({
  items,
  onOpen,
}: {
  items: DoneItem[];
  onOpen: (threadId: string) => void;
}) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <section className="life-card daily__done">
      <div className="life-card__head">
        <b>{t("daily-done")}</b>
        <span className="life-card__note">{t("daily-done-note")}</span>
      </div>
      <div className="daily__done-list">
        {items.map((item) => (
          <DoneRow key={item.id} item={item} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

export function LedgerNoticed({ insights, nav }: { insights: Insight[]; nav: InsightNav }) {
  const { t } = useI18n();
  const store = useHub();
  const act = useInsightAct(nav);
  if (insights.length === 0) return null;
  return (
    <section className="life-card ledger-noticed">
      <b>{t("ledger-noticed")}</b>
      {insights.map((insight) => (
        <div key={insight.id} className="ledger-noticed__item">
          <p>{insight.text}</p>
          <div className="ledger-noticed__actions">
            {!(insight.action.kind === "open" && insight.action.page === "ledger") && (
              <button type="button" className="code-status-button" onClick={() => act(insight)}>
                {insight.actionLabel}
              </button>
            )}
            <button
              type="button"
              className="code-link"
              onClick={() => void store.resolveInsight(insight.id, true).catch(() => undefined)}
            >
              {t("ledger-mute")}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

export function MutedTray() {
  const { t } = useI18n();
  const store = useHub();
  const { dailyFeed } = useHubState(store);
  const muted = dailyFeed?.muted ?? [];
  if (muted.length === 0) return null;
  return (
    <div className="daily-tray">
      <span className="life-card__note">{t("daily-muted")}</span>
      {muted.map((item) => (
        <button
          key={`${item.kind}:${item.subject}`}
          type="button"
          className="code-status-button"
          title={t("notify-muted-restore")}
          onClick={() => void store.unmuteInsight(item.kind, item.subject).catch(() => undefined)}
        >
          {t("daily-muted-restore", { label: item.label })}
        </button>
      ))}
    </div>
  );
}
