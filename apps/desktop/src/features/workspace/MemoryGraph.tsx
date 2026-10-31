import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { Memory, MemoryCategory } from "@xiaoban/protocol";
import { useMemo, useState } from "react";

const WIDTH = 280;
const HEIGHT = 220;
const MAX_DOTS = 300;
const FEW = 3;
const RECENT = 3;
const LINK_DISTANCE = 56;
const MAX_LINKS = 3;
const STALE_MS = 30 * 86_400_000;

const CATEGORIES: {
  id: MemoryCategory;
  label: PlainMessageKey;
  color: string;
  at: [number, number];
}[] = [
  {
    id: "family",
    label: "memory-category-family",
    color: "var(--color-trip-green)",
    at: [80, 70],
  },
  { id: "food", label: "memory-category-food", color: "var(--color-attention)", at: [200, 62] },
  {
    id: "home_work",
    label: "memory-category-home_work",
    color: "var(--color-accent)",
    at: [140, 140],
  },
  {
    id: "likes",
    label: "memory-category-likes",
    color: "var(--color-memory-likes)",
    at: [62, 168],
  },
  {
    id: "plans",
    label: "memory-category-plans",
    color: "var(--color-memory-plans)",
    at: [220, 160],
  },
  {
    id: "other",
    label: "memory-category-other",
    color: "var(--color-memory-other)",
    at: [140, 40],
  },
];

const categoryOf = (id: MemoryCategory) =>
  CATEGORIES.find((category) => category.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.codePointAt(0) ?? 0;
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) / 4294967295;
}

interface Dot {
  memory: Memory;
  x: number;
  y: number;
  r: number;
  color: string;
  dim: boolean;
}

function layout(memories: Memory[], now: number): Dot[] {
  return memories.map((memory) => {
    const category = categoryOf(memory.category);
    const angle = hash(memory.id) * Math.PI * 2;
    const distance = 10 + hash(`${memory.id}#r`) * 36;
    const [cx, cy] = category?.at ?? [WIDTH / 2, HEIGHT / 2];
    const last = memory.lastUsedAt ?? memory.updatedAt;
    return {
      memory,
      x: Math.min(WIDTH - 8, Math.max(8, cx + Math.cos(angle) * distance)),
      y: Math.min(HEIGHT - 8, Math.max(8, cy + Math.sin(angle) * distance * 0.8)),
      r: 2.5 + Math.min(memory.uses, 10) * 0.45,
      color: category?.color ?? "var(--color-memory-other)",
      dim: now - last > STALE_MS,
    };
  });
}

function links(dots: Dot[]): [Dot, Dot][] {
  const pairs: [Dot, Dot][] = [];
  for (const dot of dots) {
    const near = dots
      .filter(
        (other) =>
          other !== dot &&
          other.memory.category === dot.memory.category &&
          other.memory.id > dot.memory.id &&
          Math.hypot(other.x - dot.x, other.y - dot.y) < LINK_DISTANCE,
      )
      .slice(0, MAX_LINKS);
    for (const other of near) pairs.push([dot, other]);
  }
  return pairs;
}

export function MemoryGraph({ memories, used }: { memories: Memory[]; used: string[] }) {
  const { t, locale } = useI18n();
  const [hovered, setHovered] = useState<Dot | null>(null);
  const now = Date.now();
  const shown = useMemo(
    () =>
      [...memories]
        .sort((a, b) => (b.lastUsedAt ?? b.updatedAt) - (a.lastUsedAt ?? a.updatedAt))
        .slice(0, MAX_DOTS),
    [memories],
  );
  const dots = useMemo(() => layout(shown, now), [shown, now]);
  const lines = useMemo(() => links(dots), [dots]);
  const usedSet = new Set(used);
  const glowing = dots.filter((dot) => usedSet.has(dot.memory.id));
  const counts = CATEGORIES.map((category) => ({
    ...category,
    count: memories.filter((memory) => memory.category === category.id).length,
  })).filter((category) => category.count > 0);
  const recent = [...memories].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT);
  const date = (time: number) =>
    new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(time);
  const list = glowing.length > 0 ? glowing.map((dot) => dot.memory) : recent;

  return (
    <div className="memory-graph">
      <div className="memory-graph__head">
        <h2 className="workspace__title">
          {glowing.length > 0 ? t("memory-graph-used-title") : t("workspace-memories")}
        </h2>
        <span className="memory-graph__count">
          {glowing.length > 0
            ? t("memory-graph-glowing", { count: glowing.length })
            : t("memory-graph-count", { count: memories.length })}
        </span>
      </div>
      <div className="memory-graph__sky">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
          {lines.map(([a, b]) => (
            <line key={`${a.memory.id}-${b.memory.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          ))}
          {dots.map((dot, index) => (
            <g
              key={dot.memory.id}
              className="memory-graph__dot"
              style={{
                animationDuration: `${6 + (index % 5)}s`,
                animationDelay: `${-index * 0.7}s`,
              }}
            >
              <circle
                cx={dot.x}
                cy={dot.y}
                r={dot.r + 6}
                fill="transparent"
                onPointerEnter={() => setHovered(dot)}
                onPointerLeave={() => setHovered(null)}
              />
              <circle
                className="memory-graph__star"
                cx={dot.x}
                cy={dot.y}
                r={dot.r}
                fill={dot.color}
                opacity={dot.dim ? 0.45 : 0.95}
              />
              {usedSet.has(dot.memory.id) && (
                <circle className="memory-graph__glow" cx={dot.x} cy={dot.y} r={dot.r + 2} />
              )}
            </g>
          ))}
        </svg>
        {memories.length <= FEW && <p className="memory-graph__few">{t("memory-graph-few")}</p>}
        {hovered && (
          <div
            className="memory-graph__tip"
            style={{
              left: `min(${(hovered.x / WIDTH) * 100}%, calc(100% - 200px))`,
              top: `${((hovered.y + 10) / HEIGHT) * 100}%`,
            }}
          >
            <b>
              {t("workspace-memory", {
                subject: hovered.memory.subject,
                value: hovered.memory.value,
              })}
            </b>
            <span>
              {t("memory-graph-tip", {
                category: t(categoryOf(hovered.memory.category)?.label ?? "memory-category-other"),
                uses: hovered.memory.uses,
                date: date(hovered.memory.updatedAt),
              })}
            </span>
          </div>
        )}
      </div>
      {counts.length > 0 && (
        <ul className="memory-graph__legend">
          {counts.map((category) => (
            <li key={category.id}>
              <span style={{ background: category.color }} aria-hidden="true" />
              {t("memory-graph-legend", { count: category.count, category: t(category.label) })}
            </li>
          ))}
        </ul>
      )}
      {list.length > 0 && (
        <div>
          {glowing.length === 0 && (
            <h3 className="memory-graph__sub">{t("memory-graph-recent")}</h3>
          )}
          <ul className="memory-graph__list" data-used={glowing.length > 0 || undefined}>
            {list.map((memory) => (
              <li key={memory.id}>
                <span
                  style={{ background: categoryOf(memory.category)?.color }}
                  aria-hidden="true"
                />
                <span className="memory-graph__text">
                  {t("workspace-memory", { subject: memory.subject, value: memory.value })}
                </span>
                {glowing.length === 0 && (
                  <span className="memory-graph__date">{date(memory.updatedAt)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
