import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { SlideView } from "@xiaoban/slides";
import { useEffect } from "react";
import { useHub } from "../../app/hub.tsx";

export function DeckCard({
  deckId,
  onOpen,
}: {
  deckId: string;
  onOpen: (id: string, action?: "present" | "pptx" | "pdf") => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const { decks } = useHubState(store);
  const summary = decks[deckId];

  useEffect(() => {
    if (!summary) void store.deckSummary(deckId).catch(() => undefined);
  }, [store, deckId, summary]);

  if (!summary) return null;
  const themeName = t(
    `slides-theme-${summary.theme === "green" || summary.theme === "orange" || summary.theme === "night" ? summary.theme : "blue"}`,
  );
  return (
    <div className="doc-card deck-card">
      <div className="doc-card__main">
        <span className="doc-card__icon deck-card__icon">{t("slides-icon")}</span>
        <div className="doc-card__text">
          <b>{summary.title}</b>
          <span>
            {summary.writing
              ? t("slides-writing", {
                  n: Math.min(summary.pages + 1, summary.total),
                  total: summary.total,
                })
              : t("slides-meta", { pages: summary.pages, theme: themeName })}
          </span>
        </div>
        <button
          type="button"
          className="code-status-button"
          data-dark={!summary.writing || undefined}
          onClick={() => onOpen(deckId)}
        >
          {summary.writing ? t("doc-watch") : t("doc-open")}
        </button>
      </div>
      {summary.writing ? (
        <span className="doc-card__bar">
          <span
            style={{ width: `${Math.max(4, (summary.pages / Math.max(1, summary.total)) * 100)}%` }}
          />
        </span>
      ) : (
        <>
          <div className="deck-card__thumbs">
            {summary.preview.map((slide) => (
              <SlideView key={slide.id} slide={slide} theme={summary.theme} width={128} />
            ))}
          </div>
          <div className="doc-card__actions">
            <button type="button" className="code-link" onClick={() => onOpen(deckId, "present")}>
              {t("slides-present")}
            </button>
            <button type="button" className="code-link" onClick={() => onOpen(deckId, "pptx")}>
              {t("slides-export-pptx")}
            </button>
            <button type="button" className="code-link" onClick={() => onOpen(deckId, "pdf")}>
              {t("slides-export-pdf")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function WritingDecks({
  threadId,
  onOpen,
}: {
  threadId: string;
  onOpen: (id: string) => void;
}) {
  const store = useHub();
  const { decks } = useHubState(store);
  const writing = Object.values(decks).filter(
    (deck) => deck.writing && deck.sourceThreadId === threadId,
  );
  if (writing.length === 0) return null;
  return (
    <li className="doc-writing">
      {writing.map((deck) => (
        <DeckCard key={deck.id} deckId={deck.id} onOpen={onOpen} />
      ))}
    </li>
  );
}
