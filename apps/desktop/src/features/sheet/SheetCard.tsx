import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useEffect } from "react";
import { useHub } from "../../app/hub.tsx";
import { openInExcel, revealSheet } from "./sheetFiles.ts";

export function SheetCard({ sheetId, onOpen }: { sheetId: string; onOpen: (id: string) => void }) {
  const { t } = useI18n();
  const store = useHub();
  const { sheets } = useHubState(store);
  const summary = sheets[sheetId];

  useEffect(() => {
    if (!summary) void store.sheetSummary(sheetId).catch(() => undefined);
  }, [store, sheetId, summary]);

  if (!summary) return null;
  const [head, ...body] = summary.preview;
  const more = Math.max(0, summary.rows - summary.preview.length);
  return (
    <div className="doc-card sheet-card">
      <div className="doc-card__main">
        <span className="doc-card__icon sheet-card__icon">{t("sheet-icon")}</span>
        <div className="doc-card__text">
          <b>{summary.title}</b>
          <span>
            {t("sheet-meta", { rows: summary.rows, cols: summary.cols, tabs: summary.tabs })}
          </span>
        </div>
        <button
          type="button"
          className="code-status-button"
          data-dark
          onClick={() => onOpen(sheetId)}
        >
          {t("doc-open")}
        </button>
      </div>
      {head && (
        <table className="sheet-card__preview">
          <thead>
            <tr>
              {head.map((cell, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: preview cells are positional
                <th key={index}>{cell}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: preview rows are positional
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: preview cells are positional
                  <td key={index}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {more > 0 && (
        <span className="sheet-card__more">{t("sheet-more-rows", { count: more })}</span>
      )}
      <div className="doc-card__actions">
        <button
          type="button"
          className="code-link"
          onClick={() =>
            void revealSheet(store, sheetId, summary.title, "xlsx").catch(() => undefined)
          }
        >
          {t("sheet-export-excel")}
        </button>
        <button
          type="button"
          className="code-link"
          onClick={() =>
            void revealSheet(store, sheetId, summary.title, "csv").catch(() => undefined)
          }
        >
          {t("sheet-export-csv")}
        </button>
        <button
          type="button"
          className="code-link"
          onClick={() => void openInExcel(store, sheetId, summary.title).catch(() => undefined)}
        >
          {t("sheet-open-excel")}
        </button>
      </div>
    </div>
  );
}
