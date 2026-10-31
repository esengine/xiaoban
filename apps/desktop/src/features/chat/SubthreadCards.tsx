import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useHub } from "../../app/hub.tsx";
import { plain } from "./plain.ts";

export function SubthreadCards({
  threadIds,
  onOpen,
}: {
  threadIds: string[];
  onOpen: (threadId: string) => void;
}) {
  const { t } = useI18n();
  const { threads, drafts, confirms } = useHubState(useHub());
  const items = threadIds.flatMap((id) => {
    const thread = threads.find((candidate) => candidate.id === id);
    return thread ? [thread] : [];
  });
  if (items.length === 0) return null;
  return (
    <div className="subthreads">
      <span className="subthreads__hint">{t("subthread-cards-hint")}</span>
      {items.map((thread) => {
        const confirm = confirms.find((item) => item.threadId === thread.id);
        const draft = Object.values(drafts).find(
          (item) => item.threadId === thread.id && !item.failure,
        );
        const status = confirm ? "need" : draft ? "running" : "done";
        const line = confirm
          ? confirm.kind.kind === "action"
            ? confirm.kind.title
            : t("thread-status-need")
          : draft
            ? t("island-step-count", { n: draft.steps.length })
            : plain(thread.lastMessage ?? "");
        return (
          <button
            key={thread.id}
            type="button"
            className="subthreads__item"
            data-status={status}
            onClick={() => onOpen(thread.id)}
          >
            <span className="subthreads__dot" aria-hidden="true" />
            <b>{thread.title ?? t("thread-untitled")}</b>
            <span className="subthreads__line">{line}</span>
            <span className="subthreads__state">{t(`thread-status-${status}`)}</span>
            <span aria-hidden="true">{t("subthread-open-arrow")}</span>
          </button>
        );
      })}
    </div>
  );
}
