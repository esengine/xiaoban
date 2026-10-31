import { type ConnectionStatus, connectionKey } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { Thread } from "@xiaoban/protocol";

interface Props {
  threads: Thread[];
  activeId: string | null;
  status: ConnectionStatus;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function ThreadList({ threads, activeId, status, onSelect, onCreate }: Props) {
  const { t } = useI18n();
  return (
    <aside className="threads">
      <header className="threads__header">
        <h1>{t("app-name")}</h1>
        <button
          type="button"
          className="icon-button"
          aria-label={t("thread-new")}
          onClick={onCreate}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </header>
      <p className={`threads__status threads__status--${status}`}>{t(connectionKey(status))}</p>
      <ul className="threads__list">
        {threads.map((thread) => (
          <li key={thread.id}>
            <button
              type="button"
              className="threads__item"
              aria-current={thread.id === activeId}
              onClick={() => onSelect(thread.id)}
            >
              {thread.title ?? t("thread-untitled")}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
