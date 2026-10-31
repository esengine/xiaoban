import { useI18n } from "@xiaoban/i18n/react";
import type { Thread } from "@xiaoban/protocol";
import { useEffect, useState } from "react";
import { firstGrapheme, orderThreads, toneOf } from "./threads.ts";
import { recency } from "./time.ts";

interface Props {
  threads: Thread[];
  primaryId: string | null;
  activeId: string | null;
  onSelect: (id: string) => void;
}

function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function ThreadList({ threads, primaryId, activeId, onSelect }: Props) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const now = useMinute();

  const titleOf = (thread: Thread) =>
    thread.id === primaryId ? t("app-name") : (thread.title ?? t("thread-untitled"));
  const when = (time: number) => {
    const value = recency(time, now, locale);
    switch (value.kind) {
      case "now":
        return t("time-just-now");
      case "yesterday":
        return t("time-yesterday");
      default:
        return value.text;
    }
  };

  const needle = query.trim().toLocaleLowerCase(locale);
  const visible = orderThreads(threads, primaryId).filter(
    (thread) =>
      !needle ||
      [titleOf(thread), thread.lastMessage ?? ""].some((text) =>
        text.toLocaleLowerCase(locale).includes(needle),
      ),
  );

  return (
    <aside className="threads">
      <div className="threads__search">
        <label className="search">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span className="visually-hidden">{t("search-label")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search-placeholder")}
            autoComplete="off"
          />
        </label>
      </div>
      <ul className="threads__list">
        {visible.map((thread) => {
          const primary = thread.id === primaryId;
          const title = titleOf(thread);
          return (
            <li key={thread.id}>
              <button
                type="button"
                className="thread-row"
                aria-current={thread.id === activeId}
                onClick={() => onSelect(thread.id)}
              >
                <span
                  className={`thread-row__mark thread-row__mark--${primary ? "primary" : toneOf(thread.id)}`}
                  aria-hidden="true"
                >
                  {primary ? t("app-mark") : firstGrapheme(title)}
                </span>
                <span className="thread-row__body">
                  <span className="thread-row__top">
                    <span className="thread-row__title">{title}</span>
                    <time
                      className="thread-row__time"
                      dateTime={new Date(thread.updatedAt).toISOString()}
                    >
                      {when(thread.updatedAt)}
                    </time>
                  </span>
                  {thread.lastMessage && (
                    <span className="thread-row__last">{thread.lastMessage}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!needle && threads.length <= 1 && <p className="threads__hint">{t("thread-list-hint")}</p>}
    </aside>
  );
}
