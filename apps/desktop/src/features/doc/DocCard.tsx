import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useEffect } from "react";
import { useHub } from "../../app/hub.tsx";
import { openInWord, revealExport } from "./docFiles.ts";

export function DocCard({
  docId,
  onOpen,
}: {
  docId: string;
  onOpen: (id: string, print?: boolean) => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const { docs } = useHubState(store);
  const summary = docs[docId];

  useEffect(() => {
    if (!summary) void store.docSummary(docId).catch(() => undefined);
  }, [store, docId, summary]);

  if (!summary) return null;
  if (summary.writing) {
    const share = summary.total > 0 ? (summary.written / summary.total) * 100 : 0;
    return (
      <div className="doc-card">
        <div className="doc-card__main">
          <span className="doc-card__icon">{t("doc-icon")}</span>
          <div className="doc-card__text">
            <b>{summary.title}</b>
            <span>
              {t("doc-writing", {
                n: Math.min(summary.written + 1, summary.total),
                total: summary.total,
              })}
            </span>
          </div>
          <button type="button" className="code-status-button" onClick={() => onOpen(docId)}>
            {t("doc-watch")}
          </button>
        </div>
        <span className="doc-card__bar">
          <span style={{ width: `${Math.max(4, share)}%` }} />
        </span>
      </div>
    );
  }
  const shown = summary.sections.slice(0, 3);
  const more = summary.sections.length - shown.length;
  return (
    <div className="doc-card">
      <div className="doc-card__main">
        <span className="doc-card__icon">{t("doc-icon")}</span>
        <div className="doc-card__text">
          <b>{summary.title}</b>
          <span>{t("doc-meta", { chars: summary.chars, sections: summary.sections.length })}</span>
        </div>
        <button
          type="button"
          className="code-status-button"
          data-dark
          onClick={() => onOpen(docId)}
        >
          {t("doc-open")}
        </button>
      </div>
      {shown.length > 0 && (
        <div className="doc-card__sections">
          {shown.map((section) => (
            <span key={section}>{section}</span>
          ))}
          {more > 0 && (
            <span className="life-card__note">{t("doc-more-sections", { count: more })}</span>
          )}
        </div>
      )}
      <div className="doc-card__actions">
        <button
          type="button"
          className="code-link"
          onClick={() =>
            void revealExport(store, docId, summary.title, "docx").catch(() => undefined)
          }
        >
          {t("doc-export-word")}
        </button>
        <button type="button" className="code-link" onClick={() => onOpen(docId, true)}>
          {t("doc-export-pdf")}
        </button>
        <button
          type="button"
          className="code-link"
          onClick={() => void openInWord(store, docId, summary.title).catch(() => undefined)}
        >
          {t("doc-open-word")}
        </button>
      </div>
    </div>
  );
}

export function WritingDocs({
  threadId,
  onOpen,
}: {
  threadId: string;
  onOpen: (id: string) => void;
}) {
  const store = useHub();
  const { docs } = useHubState(store);
  const writing = Object.values(docs).filter(
    (doc) => doc.writing && doc.sourceThreadId === threadId,
  );
  if (writing.length === 0) return null;
  return (
    <li className="doc-writing">
      {writing.map((doc) => (
        <DocCard key={doc.id} docId={doc.id} onOpen={onOpen} />
      ))}
    </li>
  );
}
