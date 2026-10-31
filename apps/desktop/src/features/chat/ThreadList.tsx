import type { ConnectionStatus } from "@xiaoban/client";
import type { Thread } from "@xiaoban/protocol";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: "未连接",
  connecting: "连接中",
  open: "已连接",
  reconnecting: "重新连接中",
  closed: "已断开",
};

interface Props {
  threads: Thread[];
  activeId: string | null;
  status: ConnectionStatus;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function ThreadList({ threads, activeId, status, onSelect, onCreate }: Props) {
  return (
    <aside className="threads">
      <header className="threads__header">
        <h1>小伴</h1>
        <button type="button" className="icon-button" aria-label="新对话" onClick={onCreate}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </header>
      <p className={`threads__status threads__status--${status}`}>{STATUS_LABEL[status]}</p>
      <ul className="threads__list">
        {threads.map((thread) => (
          <li key={thread.id}>
            <button
              type="button"
              className="threads__item"
              aria-current={thread.id === activeId}
              onClick={() => onSelect(thread.id)}
            >
              {thread.title}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
