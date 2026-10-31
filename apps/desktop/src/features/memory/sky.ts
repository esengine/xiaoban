import type { Memory, MemoryCategory, MemoryGalaxy } from "@xiaoban/protocol";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const CLUSTERS: { id: MemoryCategory; color: string }[] = [
  { id: "family", color: "--color-trip-green" },
  { id: "home_work", color: "--color-accent" },
  { id: "food", color: "--color-attention" },
  { id: "likes", color: "--color-memory-likes" },
  { id: "plans", color: "--color-memory-plans" },
  { id: "other", color: "--color-memory-other" },
];

const CLUSTER_RADIUS = 420;
const GALAXY_RADIUS = 150;
const PLANET_RADIUS = 46;
const STALE_MS = 30 * 86_400_000;

export interface ClusterNode {
  id: MemoryCategory;
  color: string;
  at: Vec3;
  count: number;
}

export interface GalaxyNode {
  name: string;
  cluster: MemoryCategory;
  summary: string;
  at: Vec3;
  count: number;
}

export interface PlanetNode {
  memory: Memory;
  cluster: MemoryCategory;
  galaxy: string;
  at: Vec3;
  size: number;
  dim: boolean;
}

export interface Sky {
  clusters: ClusterNode[];
  galaxies: GalaxyNode[];
  planets: PlanetNode[];
}

function hash(text: string): number {
  let value = 2166136261;
  for (const char of text) {
    value ^= char.codePointAt(0) ?? 0;
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0) / 4294967295;
}

function onSphere(seed: string, radius: number): Vec3 {
  const u = hash(`${seed}#u`);
  const v = hash(`${seed}#v`);
  const theta = u * Math.PI * 2;
  const phi = Math.acos(2 * v - 1);
  const r = radius * (0.55 + 0.45 * hash(`${seed}#r`));
  return {
    x: r * Math.sin(phi) * Math.cos(theta),
    y: r * Math.cos(phi) * 0.7,
    z: r * Math.sin(phi) * Math.sin(theta),
  };
}

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

export function clusterAt(index: number): Vec3 {
  const angle = (index / CLUSTERS.length) * Math.PI * 2;
  return {
    x: Math.cos(angle) * CLUSTER_RADIUS,
    y: (index % 2 === 0 ? -1 : 1) * 70,
    z: Math.sin(angle) * CLUSTER_RADIUS,
  };
}

export function buildSky(memories: Memory[], galaxies: MemoryGalaxy[], now: number): Sky {
  const clusterOf = (memory: Memory): MemoryCategory => {
    const galaxy = galaxies.find((item) => item.name === memory.galaxy);
    return galaxy?.cluster ?? memory.category;
  };
  const clusters: ClusterNode[] = CLUSTERS.map((cluster, index) => ({
    ...cluster,
    at: clusterAt(index),
    count: memories.filter((memory) => clusterOf(memory) === cluster.id).length,
  }));
  const names = new Map<string, MemoryCategory>();
  for (const memory of memories) {
    names.set(memory.galaxy ?? "", clusterOf(memory));
  }
  const galaxyNodes: GalaxyNode[] = [...names.entries()].map(([name, cluster]) => {
    const home = clusters.find((item) => item.id === cluster) ?? clusters[clusters.length - 1];
    const count = memories.filter((memory) => (memory.galaxy ?? "") === name).length;
    const spread = GALAXY_RADIUS * Math.min(1.4, 0.5 + Math.sqrt(names.size) * 0.12);
    return {
      name,
      cluster,
      summary: galaxies.find((item) => item.name === name)?.summary ?? "",
      at: add(home?.at ?? { x: 0, y: 0, z: 0 }, onSphere(`g:${name}`, spread)),
      count,
    };
  });
  const planets: PlanetNode[] = memories.map((memory) => {
    const name = memory.galaxy ?? "";
    const galaxy = galaxyNodes.find((item) => item.name === name);
    const last = memory.lastUsedAt ?? memory.updatedAt;
    return {
      memory,
      cluster: galaxy?.cluster ?? memory.category,
      galaxy: name,
      at: add(
        galaxy?.at ?? { x: 0, y: 0, z: 0 },
        onSphere(`p:${memory.id}`, PLANET_RADIUS * (0.6 + Math.sqrt(galaxy?.count ?? 1) * 0.15)),
      ),
      size: 1.6 + Math.min(memory.uses, 20) * 0.25 + (memory.importance - 2) * 0.6,
      dim: now - last > STALE_MS,
    };
  });
  return { clusters, galaxies: galaxyNodes, planets };
}

export interface Camera {
  yaw: number;
  pitch: number;
  distance: number;
  target: Vec3;
}

export interface Projected {
  x: number;
  y: number;
  scale: number;
  depth: number;
}

const FOCAL = 700;

export function project(
  point: Vec3,
  camera: Camera,
  width: number,
  height: number,
): Projected | null {
  const px = point.x - camera.target.x;
  const py = point.y - camera.target.y;
  const pz = point.z - camera.target.z;
  const cosY = Math.cos(camera.yaw);
  const sinY = Math.sin(camera.yaw);
  const x1 = px * cosY - pz * sinY;
  const z1 = px * sinY + pz * cosY;
  const cosP = Math.cos(camera.pitch);
  const sinP = Math.sin(camera.pitch);
  const y2 = py * cosP - z1 * sinP;
  const z2 = py * sinP + z1 * cosP;
  const depth = z2 + camera.distance;
  if (depth <= 20) return null;
  const scale = FOCAL / depth;
  return { x: width / 2 + x1 * scale, y: height / 2 + y2 * scale, scale, depth };
}

export function center(points: Vec3[]): Vec3 {
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  const sum = points.reduce(add, { x: 0, y: 0, z: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length };
}

export function terms(text: string): string[] {
  const lower = text.toLowerCase().trim();
  if (!lower) return [];
  const words = lower.split(/[\s,\uff0c\u3002\u3001]+/).filter(Boolean);
  return words.flatMap((word) =>
    [...word].every((char) => (char.codePointAt(0) ?? 0) < 128)
      ? [word]
      : word.length <= 2
        ? [word]
        : Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2)),
  );
}

export function matches(memory: Memory, query: string[]): boolean {
  if (query.length === 0) return false;
  const text =
    `${memory.subject} ${memory.value} ${memory.galaxy ?? ""} ${memory.aliases.join(" ")}`.toLowerCase();
  return query.some((term) => text.includes(term));
}
