import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { Memory, MemoryCategory, MemoryGalaxy } from "@xiaoban/protocol";
import { color, dark } from "@xiaoban/tokens";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSky,
  type Camera,
  CLUSTERS,
  center,
  matches,
  type PlanetNode,
  project,
  terms,
} from "./sky.ts";

type Level =
  | { kind: "all" }
  | { kind: "cluster"; cluster: MemoryCategory }
  | { kind: "galaxy"; cluster: MemoryCategory; galaxy: string };

const DISTANCE: Record<Level["kind"], number> = { all: 1400, cluster: 560, galaxy: 210 };
const FLY_MS = 700;
const IDLE_MS = 3_000;
const SPIN = 0.0017;
const HIT = 10;
const FOCAL = 700;
const NEBULA = Array.from({ length: 7 }, (_, index) => {
  const angle = index * 2.399963;
  const reach = 30 + (index % 4) * 26;
  return {
    x: Math.cos(angle) * reach,
    y: ((index % 3) - 1) * 26,
    z: Math.sin(angle) * reach,
    size: 110 + (index % 3) * 40,
  };
});
const FAR_SAMPLE = 3_000;

export const CLUSTER_LABELS: Record<MemoryCategory, PlainMessageKey> = {
  family: "memory-category-family",
  food: "memory-category-food",
  home_work: "memory-category-home_work",
  likes: "memory-category-likes",
  plans: "memory-category-plans",
  other: "memory-category-other",
};

function readColor(variable: string): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(variable).trim() ||
    color.memoryOther
  );
}

const sprites = new Map<string, HTMLCanvasElement>();
const SPRITE = 64;

function sprite(tint: string): HTMLCanvasElement {
  const cached = sprites.get(tint);
  if (cached) return cached;
  const node = document.createElement("canvas");
  node.width = SPRITE;
  node.height = SPRITE;
  const context = node.getContext("2d");
  if (context) {
    const half = SPRITE / 2;
    const gradient = context.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, tint);
    gradient.addColorStop(0.18, tint);
    gradient.addColorStop(0.45, /^#[0-9a-f]{6}$/i.test(tint) ? `${tint}59` : tint);
    gradient.addColorStop(1, "transparent");
    context.fillStyle = gradient;
    context.fillRect(0, 0, SPRITE, SPRITE);
  }
  sprites.set(tint, node);
  return node;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - (1 - t) ** 3;

export function MemorySky({
  memories,
  galaxies,
  used,
  full,
  query = "",
  only = null,
  onPick,
  onExpand,
}: {
  memories: Memory[];
  galaxies: MemoryGalaxy[];
  used: string[];
  full: boolean;
  query?: string;
  only?: MemoryCategory | null;
  onPick?: (memory: Memory | null, at: { x: number; y: number } | null) => void;
  onExpand?: () => void;
}) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const sky = useMemo(() => buildSky(memories, galaxies, Date.now()), [memories, galaxies]);
  const [level, setLevel] = useState<Level>({ kind: "all" });
  const [hovered, setHovered] = useState<{ planet: PlanetNode; x: number; y: number } | null>(null);
  const camera = useRef<Camera>({
    yaw: 0.6,
    pitch: 0.35,
    distance: DISTANCE.all,
    target: { x: 0, y: 0, z: 0 },
  });
  const flight = useRef<{ from: Camera; to: Camera; start: number } | null>(null);
  const lastInput = useRef(0);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(
    null,
  );
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const colors = useMemo(
    () => Object.fromEntries(CLUSTERS.map((cluster) => [cluster.id, readColor(cluster.color)])),
    [],
  );
  const usedSet = useMemo(() => new Set(used), [used]);
  const wanted = useMemo(() => terms(query), [query]);
  const hits = useMemo(
    () =>
      new Set(
        sky.planets
          .filter((planet) => matches(planet.memory, wanted))
          .map((planet) => planet.memory.id),
      ),
    [sky, wanted],
  );

  const overview = useCallback((): Camera => {
    const filled = sky.clusters.filter((cluster) => cluster.count > 0).map((cluster) => cluster.at);
    const target = center(filled.length > 0 ? filled : [{ x: 0, y: 0, z: 0 }]);
    const spread = Math.max(
      0,
      ...filled.map((point) =>
        Math.hypot(point.x - target.x, point.y - target.y, point.z - target.z),
      ),
    );
    const node = canvas.current;
    const half = Math.max(
      60,
      Math.min(node?.clientWidth ?? 600, node?.clientHeight ?? 400) / 2 - 24,
    );
    const distance = Math.max(DISTANCE.cluster, (FOCAL * (spread + 170)) / half);
    return { ...camera.current, target, distance };
  }, [sky]);

  useEffect(() => {
    if (level.kind === "all" && !flight.current) camera.current = overview();
  }, [overview, level.kind]);

  const flyTo = useCallback(
    (next: Level) => {
      setLevel(next);
      if (next.kind === "all") {
        const to = overview();
        if (reduced) camera.current = to;
        else flight.current = { from: { ...camera.current }, to, start: performance.now() };
        return;
      }
      const targetPoints =
        next.kind === "cluster"
          ? [
              sky.clusters.find((cluster) => cluster.id === next.cluster)?.at ?? {
                x: 0,
                y: 0,
                z: 0,
              },
            ]
          : [
              sky.galaxies.find((galaxy) => galaxy.name === next.galaxy)?.at ?? {
                x: 0,
                y: 0,
                z: 0,
              },
            ];
      const to: Camera = {
        ...camera.current,
        distance: DISTANCE[next.kind],
        target: center(targetPoints),
      };
      if (reduced) {
        camera.current = to;
        return;
      }
      flight.current = { from: { ...camera.current }, to, start: performance.now() };
      lastInput.current = performance.now();
    },
    [sky, reduced, overview],
  );

  useEffect(() => {
    if (!full || wanted.length === 0 || hits.size === 0) return;
    const counts = new Map<string, number>();
    for (const planet of sky.planets) {
      if (hits.has(planet.memory.id))
        counts.set(planet.galaxy, (counts.get(planet.galaxy) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const galaxy = sky.galaxies.find((item) => item.name === best);
    if (galaxy) flyTo({ kind: "galaxy", cluster: galaxy.cluster, galaxy: galaxy.name });
  }, [full, wanted, hits, sky, flyTo]);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const context = node.getContext("2d");
    if (!context) return;
    let frame = 0;
    const draw = (time: number) => {
      const ratio = window.devicePixelRatio || 1;
      const width = node.clientWidth;
      const height = node.clientHeight;
      if (node.width !== width * ratio || node.height !== height * ratio) {
        node.width = width * ratio;
        node.height = height * ratio;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const fly = flight.current;
      if (fly) {
        const progress = Math.min(1, (time - fly.start) / FLY_MS);
        const k = ease(progress);
        camera.current = {
          yaw: lerp(fly.from.yaw, fly.to.yaw, k),
          pitch: lerp(fly.from.pitch, fly.to.pitch, k),
          distance: lerp(fly.from.distance, fly.to.distance, k),
          target: {
            x: lerp(fly.from.target.x, fly.to.target.x, k),
            y: lerp(fly.from.target.y, fly.to.target.y, k),
            z: lerp(fly.from.target.z, fly.to.target.z, k),
          },
        };
        if (progress >= 1) flight.current = null;
      } else if (!reduced && !drag.current && time - lastInput.current > IDLE_MS) {
        camera.current = { ...camera.current, yaw: camera.current.yaw + SPIN };
      }
      const cam = camera.current;
      context.globalCompositeOperation = "lighter";
      for (const cluster of sky.clusters) {
        if (cluster.count === 0 || (only !== null && cluster.id !== only)) continue;
        const tint = colors[cluster.id] ?? color.memoryOther;
        const near = level.kind !== "all" && level.cluster === cluster.id;
        for (const puff of NEBULA) {
          const at = project(
            {
              x: cluster.at.x + puff.x,
              y: cluster.at.y + puff.y,
              z: cluster.at.z + puff.z,
            },
            cam,
            width,
            height,
          );
          if (!at) continue;
          const size = puff.size * at.scale;
          context.globalAlpha = (near ? 0.025 : 0.045) * Math.min(1, at.scale * 3);
          context.drawImage(sprite(tint), at.x - size, at.y - size, size * 2, size * 2);
        }
      }
      context.globalCompositeOperation = "source-over";
      context.globalAlpha = 1;
      const scope = (planet: PlanetNode) =>
        (only === null || planet.cluster === only) &&
        (level.kind === "all" ||
          (level.kind === "cluster" && planet.cluster === level.cluster) ||
          (level.kind === "galaxy" && planet.galaxy === level.galaxy));
      const planets =
        level.kind === "all" && sky.planets.length > FAR_SAMPLE
          ? sky.planets.filter(
              (_, index) => index % Math.ceil(sky.planets.length / FAR_SAMPLE) === 0,
            )
          : sky.planets;
      const projected = planets
        .map((planet) => ({ planet, at: project(planet.at, cam, width, height) }))
        .filter(
          (item): item is { planet: PlanetNode; at: NonNullable<typeof item.at> } =>
            item.at !== null,
        )
        .sort((a, b) => b.at.depth - a.at.depth);
      const searching = wanted.length > 0;
      for (const { planet, at } of projected) {
        const inside = scope(planet);
        const hit = hits.has(planet.memory.id);
        const radius = Math.max(
          2,
          planet.size * at.scale * 1.4 * (level.kind === "galaxy" ? 1.6 : 1),
        );
        const strength =
          (searching ? (hit ? 1 : 0.12) : inside ? (planet.dim ? 0.5 : 1) : 0.18) *
          Math.min(1, at.scale * 2.6);
        const glow = radius * (planet.memory.pinned || usedSet.has(planet.memory.id) ? 5 : 3.5);
        context.globalCompositeOperation = "lighter";
        context.globalAlpha = strength * 0.45;
        context.drawImage(
          sprite(colors[planet.cluster] ?? color.memoryOther),
          at.x - glow,
          at.y - glow,
          glow * 2,
          glow * 2,
        );
        context.globalCompositeOperation = "source-over";
        context.globalAlpha = strength * 0.8;
        context.fillStyle = dark.text;
        context.beginPath();
        context.arc(at.x, at.y, Math.max(0.8, radius * 0.45), 0, Math.PI * 2);
        context.fill();
        if (planet.memory.pinned && level.kind === "galaxy") {
          context.globalAlpha = 0.85;
          context.strokeStyle = dark.text;
          context.lineWidth = 1.2;
          context.beginPath();
          context.arc(at.x, at.y, radius + 5, 0, Math.PI * 2);
          context.stroke();
        }
        if (planet.memory.kind === "constraint" && level.kind === "galaxy") {
          context.globalAlpha = 0.9;
          context.strokeStyle = color.attention;
          context.setLineDash([3, 3]);
          context.beginPath();
          context.arc(at.x, at.y, radius + 9, 0, Math.PI * 2);
          context.stroke();
          context.setLineDash([]);
        }
        if (usedSet.has(planet.memory.id)) {
          const pulse = 0.5 + 0.5 * Math.sin(time / 380);
          context.globalAlpha = 0.25 + 0.5 * pulse;
          context.fillStyle = dark.text;
          context.beginPath();
          context.arc(at.x, at.y, radius + 2 + pulse * 3, 0, Math.PI * 2);
          context.fill();
        }
        if (level.kind === "galaxy" && inside && full) {
          context.globalAlpha = 0.9;
          context.fillStyle = dark.text;
          context.font = "11px 'Noto Sans SC', system-ui";
          context.textAlign = "center";
          context.fillText(planet.memory.subject, at.x, at.y + radius + 16);
        }
      }
      context.globalAlpha = 1;
      context.textAlign = "center";
      if (level.kind === "all") {
        for (const cluster of sky.clusters) {
          if (cluster.count === 0 || (only !== null && cluster.id !== only)) continue;
          const at = project(cluster.at, cam, width, height);
          if (!at) continue;
          context.fillStyle = dark.text;
          context.font = `700 ${full ? 13 : 11}px 'Noto Sans SC', system-ui`;
          context.fillText(t(CLUSTER_LABELS[cluster.id]), at.x, at.y + 70 * at.scale + 14);
          context.fillStyle = dark.textMuted;
          context.font = "10px 'Noto Sans SC', system-ui";
          context.fillText(
            t("memory-sky-count", { count: cluster.count }),
            at.x,
            at.y + 70 * at.scale + 28,
          );
        }
      } else if (level.kind === "cluster") {
        for (const galaxy of sky.galaxies.filter((item) => item.cluster === level.cluster)) {
          const at = project(galaxy.at, cam, width, height);
          if (!at) continue;
          context.fillStyle = dark.text;
          context.font = "700 12px 'Noto Sans SC', system-ui";
          context.fillText(galaxy.name || t("memory-sky-loose"), at.x, at.y + 46 * at.scale + 14);
          if (galaxy.summary) {
            context.fillStyle = dark.textMuted;
            context.font = "10px 'Noto Sans SC', system-ui";
            context.fillText(galaxy.summary.slice(0, 24), at.x, at.y + 46 * at.scale + 28);
          }
        }
      }
      frame = requestAnimationFrame(draw);
    };
    draw(performance.now());
    return () => cancelAnimationFrame(frame);
  }, [sky, level, colors, usedSet, hits, wanted, full, only, reduced, t]);

  const nearest = (x: number, y: number) => {
    const node = canvas.current;
    if (!node) return null;
    let best: { planet: PlanetNode; x: number; y: number; d: number } | null = null;
    for (const planet of sky.planets) {
      const at = project(planet.at, camera.current, node.clientWidth, node.clientHeight);
      if (!at) continue;
      const d = Math.hypot(at.x - x, at.y - y);
      if (d < HIT + planet.size * at.scale && (!best || d < best.d))
        best = { planet, x: at.x, y: at.y, d };
    }
    return best;
  };

  const nearestNode = (x: number, y: number): Level | null => {
    const node = canvas.current;
    if (!node) return null;
    const width = node.clientWidth;
    const height = node.clientHeight;
    if (level.kind === "all") {
      const found = sky.clusters
        .filter((cluster) => cluster.count > 0)
        .map((cluster) => ({ cluster, at: project(cluster.at, camera.current, width, height) }))
        .filter(
          (item) => item.at && Math.hypot(item.at.x - x, item.at.y - y) < 90 * item.at.scale + 20,
        )
        .sort((a, b) => (a.at?.depth ?? 0) - (b.at?.depth ?? 0))[0];
      return found ? { kind: "cluster", cluster: found.cluster.id } : null;
    }
    if (level.kind === "cluster") {
      const found = sky.galaxies
        .filter((galaxy) => galaxy.cluster === level.cluster)
        .map((galaxy) => ({ galaxy, at: project(galaxy.at, camera.current, width, height) }))
        .filter(
          (item) => item.at && Math.hypot(item.at.x - x, item.at.y - y) < 60 * item.at.scale + 18,
        )[0];
      return found ? { kind: "galaxy", cluster: level.cluster, galaxy: found.galaxy.name } : null;
    }
    return null;
  };

  const position = (event: React.PointerEvent | React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const crumbs: { label: string; level: Level }[] = [
    { label: t("memory-sky-all"), level: { kind: "all" } },
  ];
  if (level.kind !== "all") {
    crumbs.push({
      label: t(CLUSTER_LABELS[level.cluster]),
      level: { kind: "cluster", cluster: level.cluster },
    });
  }
  if (level.kind === "galaxy") crumbs.push({ label: level.galaxy || t("memory-sky-loose"), level });

  return (
    <div className="memory-sky" data-full={full || undefined}>
      <canvas
        ref={canvas}
        className="memory-sky__canvas"
        aria-label={t("memory-sky-label", { count: memories.length })}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            yaw: camera.current.yaw,
            pitch: camera.current.pitch,
            moved: false,
          };
          flight.current = null;
          lastInput.current = performance.now();
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start && event.buttons === 1) {
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (Math.hypot(dx, dy) > 3) start.moved = true;
            camera.current = {
              ...camera.current,
              yaw: start.yaw - dx * 0.006,
              pitch: Math.max(-1.2, Math.min(1.2, start.pitch - dy * 0.004)),
            };
            lastInput.current = performance.now();
            return;
          }
          const { x, y } = position(event);
          const found = level.kind === "galaxy" || full ? nearest(x, y) : null;
          setHovered(found ? { planet: found.planet, x: found.x, y: found.y } : null);
        }}
        onPointerUp={(event) => {
          const start = drag.current;
          drag.current = null;
          if (start?.moved) return;
          if (!full) {
            onExpand?.();
            return;
          }
          const { x, y } = position(event);
          const planet = level.kind === "galaxy" ? nearest(x, y) : null;
          if (planet) {
            onPick?.(planet.planet.memory, { x: planet.x, y: planet.y });
            return;
          }
          onPick?.(null, null);
          const next = nearestNode(x, y);
          if (next) flyTo(next);
        }}
        onPointerLeave={() => setHovered(null)}
        onWheel={(event) => {
          lastInput.current = performance.now();
          flight.current = null;
          const distance = camera.current.distance * Math.exp(event.deltaY * 0.0015);
          camera.current = { ...camera.current, distance: Math.max(120, Math.min(2400, distance)) };
          if (!full) return;
          const { x, y } = position(event);
          if (event.deltaY < 0 && camera.current.distance < DISTANCE[level.kind] * 0.7) {
            const next = nearestNode(x, y);
            if (next) flyTo(next);
          }
        }}
        onDoubleClick={(event) => {
          if (!full) return;
          const { x, y } = position(event);
          const planet = nearest(x, y);
          if (planet) {
            flyTo({ kind: "galaxy", cluster: planet.planet.cluster, galaxy: planet.planet.galaxy });
            return;
          }
          const next = nearestNode(x, y);
          if (next) flyTo(next);
        }}
      />
      {full && (
        <nav className="memory-sky__crumbs" aria-label={t("memory-sky-crumbs")}>
          {crumbs.map((crumb, index) => (
            <button key={crumb.label} type="button" onClick={() => flyTo(crumb.level)}>
              {index > 0 && <span aria-hidden="true">{t("memory-sky-crumb-separator")}</span>}
              {crumb.label}
            </button>
          ))}
        </nav>
      )}
      {memories.length <= 3 && <p className="memory-sky__few">{t("memory-graph-few")}</p>}
      {hovered && (
        <div
          className="memory-sky__tip"
          style={{ left: `min(${hovered.x + 12}px, calc(100% - 210px))`, top: hovered.y + 12 }}
        >
          <b>{hovered.planet.memory.subject}</b>
          <span>{hovered.planet.memory.value}</span>
        </div>
      )}
    </div>
  );
}
