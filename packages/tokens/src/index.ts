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
  dangerInk: "#B42318",
  sun: "#C77A12",
  rain: "#2F6FB5",
  tripGreen: "#2F8A5B",
  tripPurple: "#6A2C7A",
  tripRust: "#B5541C",
  tripTeal: "#1F7A8C",
  scrim: "#15171C14",
  memoryLikes: "#8E5BD1",
  memoryPlans: "#C9A227",
  memoryOther: "#8A90A0",
  dangerSoft: "#FBE7E7",
  diffAdded: "#E9F6EE",
  diffRemoved: "#FCEDED",
  diffAddedBar: "#6BBF8E",
  changeInk: "#8A5A00",
  changeSoft: "#FBF0D9",
  codePick: "#DCE3FA",
  panelSoft: "#FBFBFC",
  neutralSoft: "#ECEDF0",
  purpleSoft: "#F3E8F6",
  chipSoft: "#E9EBEF",
  synKeyword: "#7A3E9D",
  merged: "#5B3FC4",
  dish0: "#E8775A",
  dish1: "#6BAF6A",
  dish2: "#B98352",
  dish3: "#D9A23A",
  dish4: "#8E7BC9",
  ledger0: "#1E2B6E",
  ledger1: "#3451D1",
  ledger2: "#6B82DB",
  ledger3: "#9AAAE6",
  ledger4: "#C9D2F2",
  mergedSoft: "#EFEBFC",
  accentBright: "#6B82DB",
  faded: "#8A90A0",
  checkOff: "#C4C8D2",
  sheetScrim: "#15171C55",
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
  island: "#0B0C0F",
  attentionText: "#F3C9A1",
  islandRing: "#FFFFFF14",
  scrim: "#00000055",
  glass: "#FFFFFF26",
  found: "#3FB37F",
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

export const slideThemes = {
  blue: {
    accent: "#3451D1",
    soft: "#EEF1FB",
    bg: "#FFFFFF",
    ink: "#15171C",
    muted: "#6B7180",
    onAccent: "#FFFFFF",
    deco: "circles",
    dark: "#15171C",
    onDark: "#FFFFFF",
  },
  green: {
    accent: "#1E6A44",
    soft: "#E3F1EA",
    bg: "#FFFFFF",
    ink: "#15171C",
    muted: "#6B7180",
    onAccent: "#FFFFFF",
    deco: "band",
    dark: "#15171C",
    onDark: "#FFFFFF",
  },
  orange: {
    accent: "#C77A12",
    soft: "#FDEBD9",
    bg: "#FFFDF8",
    ink: "#15171C",
    muted: "#6B7180",
    onAccent: "#FFFFFF",
    deco: "glow",
    dark: "#15171C",
    onDark: "#FFFFFF",
  },
  night: {
    accent: "#9AAAE6",
    soft: "#2A2D35",
    bg: "#15171C",
    ink: "#FFFFFF",
    muted: "#B9BECB",
    onAccent: "#15171C",
    deco: "lines",
    dark: "#2A2D35",
    onDark: "#FFFFFF",
  },
} as const;

export type SlideThemeName = keyof typeof slideThemes;

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
    ["--motion-island", `${motion.island}ms`],
    ["--ease-standard", motion.easeStandard],
    ["--ease-spring", motion.easeSpring],
  ];
  return `:root{${entries.map(([key, value]) => `${key}:${value}`).join(";")}}`;
}
