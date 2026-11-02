import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import { type ReactNode, useState } from "react";
import { MailDialog } from "../mail/MailDialog.tsx";
import { MascotFace } from "../onboarding/Mascot.tsx";
import { SchedulesDialog } from "../schedule/SchedulesDialog.tsx";

interface Destination {
  id: string;
  label: PlainMessageKey;
  icon: ReactNode;
  ready: boolean;
}

const DESTINATIONS: readonly Destination[] = [
  {
    id: "chat",
    label: "nav-chat",
    ready: true,
    icon: <path d="M4 5h16v11H9l-5 4z" strokeLinejoin="round" />,
  },
  {
    id: "daily",
    label: "nav-daily",
    ready: true,
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
  },
  {
    id: "skills",
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
    id: "me",
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

export type View = "chat" | "daily";

export function Rail({
  current = "chat",
  onNavigate,
  onOpenThread,
}: {
  current?: View;
  onNavigate?: (view: View) => void;
  onOpenThread?: (threadId: string) => void;
}) {
  const { t } = useI18n();
  const [schedules, setSchedules] = useState(false);
  const [services, setServices] = useState(false);
  return (
    <nav className="rail" aria-label={t("nav-main")}>
      <div className="rail__logo" role="img" aria-label={t("app-name")}>
        <MascotFace />
      </div>
      {DESTINATIONS.map((destination) => (
        <button
          key={destination.label}
          type="button"
          className="rail__item"
          data-nav={destination.id}
          aria-label={t(destination.label)}
          aria-current={destination.id === current ? "page" : undefined}
          disabled={!destination.ready}
          onClick={() => onNavigate?.(destination.id as View)}
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
      <button
        type="button"
        className="rail__item"
        data-nav="schedules"
        aria-label={t("schedules-title")}
        aria-expanded={schedules}
        title={t("schedules-title")}
        onClick={() => setSchedules(true)}
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
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        className="rail__item"
        data-nav="services"
        aria-label={t("services-title")}
        aria-expanded={services}
        title={t("services-title")}
        onClick={() => setServices(true)}
      >
        <svg
          aria-hidden="true"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        >
          <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
          <path d="M4 7l8 6 8-6" />
        </svg>
      </button>
      {services && (
        <MailDialog
          onClose={() => setServices(false)}
          onOpenThread={(threadId) => onOpenThread?.(threadId)}
        />
      )}
      {schedules && (
        <SchedulesDialog
          onClose={() => setSchedules(false)}
          onOpenThread={(threadId) => onOpenThread?.(threadId)}
        />
      )}
    </nav>
  );
}
