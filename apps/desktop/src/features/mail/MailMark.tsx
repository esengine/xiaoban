const OTHER = { bg: "#ECEDF0", fg: "#4A505C" };

const TINTS: Record<string, { bg: string; fg: string }> = {
  qq: { bg: "#E3F0FD", fg: "#1B6FD1" },
  netease: { bg: "#FBE4E2", fg: "#C8352B" },
  gmail: { bg: "#FDEAE7", fg: "#D2412F" },
  outlook: { bg: "#E2EEFB", fg: "#1F62B5" },
  other: OTHER,
};

export function MailMark({ provider }: { provider: string | null }) {
  const tint = (provider && TINTS[provider]) || OTHER;
  return (
    <span
      className="mail-provider__mark"
      aria-hidden="true"
      style={{ background: tint.bg, color: tint.fg }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
        <path d="M4.5 7.5l7.5 5.5 7.5-5.5" />
      </svg>
    </span>
  );
}
