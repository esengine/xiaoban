export const color = {
  ground: "#F4F5F7",
  surface: "#FFFFFF",
  ink: "#15171C",
  inkSoft: "#3A3F4A",
  muted: "#5B616E",
  faint: "#6B7180",
  inkMid: "#4A505C",
  lineStrong: "#D5D9E3",
  line: "#E6E8EC",
  lineSoft: "#EEF0F3",
  accent: "#3451D1",
  accentStrong: "#23389A",
  accentSoft: "#E4E8F5",
  accentWash: "#EEF1FB",
  attention: "#F08C3A",
  attentionInk: "#8A3D05",
  attentionSoft: "#FDEBD9",
  success: "#1E6A44",
  successSoft: "#E3F1EA",
  danger: "#D93A3A",
} as const;

export const dark = {
  ground: "#15171C",
  surface: "#1C1E24",
  raised: "#23262E",
  line: "#2A2D35",
  lineStrong: "#4A505C",
  text: "#FFFFFF",
  textSoft: "#D5D9E3",
  textMuted: "#B9BECB",
  link: "#9AAAE6",
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  bubble: 18,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const font = {
  family: "'Noto Sans SC', system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
} as const;

export const motion = {
  fast: 120,
  standard: 200,
  slow: 320,
  island: 460,
  easeStandard: "cubic-bezier(.2,.8,.2,1)",
  easeSpring: "cubic-bezier(.34,1.56,.64,1)",
} as const;

export const waiting = {
  silentMs: 400,
  showElapsedMs: 3_000,
  offerBackgroundMs: 10_000,
} as const;

const kebab = (key: string) => key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

export function cssVariables(): string {
  const entries = [
    ...Object.entries(color).map(([key, value]) => [`--color-${kebab(key)}`, value]),
    ...Object.entries(dark).map(([key, value]) => [`--dark-${kebab(key)}`, value]),
    ...Object.entries(radius).map(([key, value]) => [`--radius-${kebab(key)}`, `${value}px`]),
    ...Object.entries(space).map(([key, value]) => [`--space-${kebab(key)}`, `${value}px`]),
    ["--font-family", font.family],
    ["--font-mono", font.mono],
    ["--motion-fast", `${motion.fast}ms`],
    ["--motion-standard", `${motion.standard}ms`],
    ["--motion-slow", `${motion.slow}ms`],
    ["--ease-standard", motion.easeStandard],
    ["--ease-spring", motion.easeSpring],
  ];
  return `:root{${entries.map(([key, value]) => `${key}:${value}`).join(";")}}`;
}
