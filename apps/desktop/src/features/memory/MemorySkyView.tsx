import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Memory, MemoryCategory } from "@xiaoban/protocol";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useHub } from "../../app/hub.tsx";
import { CLUSTER_LABELS, MemorySky } from "./MemorySky.tsx";
import { CLUSTERS } from "./sky.ts";

export const COMPOSE_EVENT = "xiaoban:compose";

const CARD_WIDTH = 260;

function MemoryCard({
  memory,
  at,
  onClose,
}: {
  memory: Memory;
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const store = useHub();
  const date = (time: number) =>
    new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(time);
  return (
    <div
      className="memory-card"
      style={{
        left: `min(${at.x + 16}px, calc(100% - ${CARD_WIDTH + 16}px))`,
        top: `min(${at.y}px, calc(100% - 220px))`,
      }}
    >
      <span className="memory-card__path">
        {[
          t(CLUSTER_LABELS[memory.category]),
          memory.galaxy,
          memory.kind === "constraint" ? t("memory-card-constraint") : null,
          memory.pinned ? t("memory-card-pinned") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      <b>{memory.value}</b>
      <span className="memory-card__meta">
        {t("memory-card-meta", { uses: memory.uses, date: date(memory.updatedAt) })}
      </span>
      {memory.aliases.length > 0 && (
        <span className="memory-card__aliases">
          {t("memory-card-aliases", {
            aliases: memory.aliases.slice(0, 8).join(t("memory-card-separator")),
          })}
        </span>
      )}
      <span className="memory-card__actions">
        <button type="button" onClick={() => void store.pinMemory(memory.id, !memory.pinned)}>
          {memory.pinned ? t("memory-card-unpin") : t("memory-card-pin")}
        </button>
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent(COMPOSE_EVENT, {
                detail: t("memory-card-edit-prompt", { subject: memory.subject }),
              }),
            );
            onClose();
          }}
        >
          {t("memory-card-edit")}
        </button>
        <button
          type="button"
          data-danger
          onClick={() => void store.forgetMemory(memory.subject).then(onClose)}
        >
          {t("memory-card-forget")}
        </button>
      </span>
    </div>
  );
}

export function MemorySkyView({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const { memories, galaxies, usedMemories } = useHubState(store);
  const [query, setQuery] = useState("");
  const [only, setOnly] = useState<MemoryCategory | null>(null);
  const [picked, setPicked] = useState<{ memory: Memory; at: { x: number; y: number } } | null>(
    null,
  );
  const live = picked ? memories.find((memory) => memory.id === picked.memory.id) : null;

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const counts = CLUSTERS.map((cluster) => ({
    ...cluster,
    count: memories.filter((memory) => memory.category === cluster.id).length,
  })).filter((cluster) => cluster.count > 0);

  return createPortal(
    <div
      className="memory-sky-view"
      role="dialog"
      aria-modal="true"
      aria-label={t("memory-sky-title")}
    >
      <div className="memory-sky-view__bar">
        <label className="memory-sky-view__search">
          <span className="visually-hidden">{t("memory-sky-search")}</span>
          <input
            value={query}
            placeholder={t("memory-sky-search-placeholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {counts.map((cluster) => (
          <button
            key={cluster.id}
            type="button"
            className="memory-sky-view__chip"
            data-on={only === cluster.id || undefined}
            style={{ ["--chip" as string]: `var(${cluster.color})` }}
            onClick={() => setOnly(only === cluster.id ? null : cluster.id)}
          >
            {t("memory-graph-legend", {
              count: cluster.count,
              category: t(CLUSTER_LABELS[cluster.id]),
            })}
          </button>
        ))}
        <span className="memory-sky-view__spacer" />
        <button
          type="button"
          className="memory-sky-view__close"
          aria-label={t("viewer-close")}
          onClick={onClose}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <MemorySky
        memories={memories}
        galaxies={galaxies}
        used={usedMemories}
        full
        query={query}
        only={only}
        onPick={(memory, at) => setPicked(memory && at ? { memory, at } : null)}
      />
      {live && picked && (
        <MemoryCard memory={live} at={picked.at} onClose={() => setPicked(null)} />
      )}
      <span className="memory-sky-view__hint">{t("memory-sky-hint")}</span>
    </div>,
    document.body,
  );
}
