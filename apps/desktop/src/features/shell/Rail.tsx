import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { ReactNode } from "react";
import { MascotFace } from "../onboarding/Mascot.tsx";

interface Destination {
  label: PlainMessageKey;
  icon: ReactNode;
  ready: boolean;
}

const DESTINATIONS: readonly Destination[] = [
  {
    label: "nav-chat",
    ready: true,
    icon: <path d="M4 5h16v11H9l-5 4z" strokeLinejoin="round" />,
  },
  {
    label: "nav-daily",
    ready: false,
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
  },
  {
    label: "nav-skills",
    ready: false,
    icon: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="2" />
        <rect x="13" y="4" width="7" height="7" rx="2" />
        <rect x="4" y="13" width="7" height="7" rx="2" />
        <rect x="13" y="13" width="7" height="7" rx="2" />
      </>
    ),
  },
  {
    label: "nav-me",
    ready: false,
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </>
    ),
  },
];

export function Rail() {
  const { t } = useI18n();
  return (
    <nav className="rail" aria-label={t("nav-main")}>
      <div className="rail__logo" role="img" aria-label={t("app-name")}>
        <MascotFace />
      </div>
      {DESTINATIONS.map((destination, position) => (
        <button
          key={destination.label}
          type="button"
          className="rail__item"
          aria-label={t(destination.label)}
          aria-current={position === 0 ? "page" : undefined}
          disabled={!destination.ready}
          title={destination.ready ? t(destination.label) : t("nav-soon")}
        >
          <svg
            aria-hidden="true"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            {destination.icon}
          </svg>
        </button>
      ))}
    </nav>
  );
}
