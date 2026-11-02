import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import { type ReactNode, useState } from "react";
import { MailDialog } from "../mail/MailDialog.tsx";
import { MascotFace } from "../onboarding/Mascot.tsx";
import { SchedulesDialog } from "../schedule/SchedulesDialog.tsx";
import { TodosDialog } from "../todo/TodoLists.tsx";

export type View = "chat" | "daily";

interface Entry {
  id: string;
  label: PlainMessageKey;
  title: PlainMessageKey;
  icon: ReactNode;
}

/** Pages: the rail switches the whole window to these. */
const PAGES: readonly (Entry & { id: View })[] = [
  {
    id: "chat",
    label: "nav-chat",
    title: "nav-chat",
    icon: <path d="M4 5h16v11H9l-5 4z" strokeLinejoin="round" />,
  },
  {
    id: "daily",
    label: "nav-daily",
    title: "nav-daily",
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
  },
];

/** Tools: each opens a dialog over whatever page is showing. */
const TOOLS: readonly Entry[] = [
  {
    id: "todos",
    label: "nav-todos",
    title: "todo-title",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M8.5 12.2l2.4 2.4 4.6-5" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: "schedules",
    label: "nav-schedules",
    title: "schedules-title",
    icon: (
      <>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: "mail",
    label: "nav-mail",
    title: "services-title",
    icon: (
      <>
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <path d="M4 7l8 6 8-6" />
      </>
    ),
  },
];

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

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
  const [open, setOpen] = useState<string | null>(null);
  const close = () => setOpen(null);
  return (
    <nav className="rail" aria-label={t("nav-main")}>
      <div className="rail__logo" role="img" aria-label={t("app-name")}>
        <MascotFace />
      </div>
      {PAGES.map((page) => (
        <button
          key={page.id}
          type="button"
          className="rail__item"
          data-nav={page.id}
          aria-current={page.id === current ? "page" : undefined}
          title={t(page.title)}
          onClick={() => onNavigate?.(page.id)}
        >
          <Glyph>{page.icon}</Glyph>
          <span className="rail__label">{t(page.label)}</span>
        </button>
      ))}
      <hr className="rail__divider" />
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className="rail__item"
          data-nav={tool.id}
          aria-expanded={open === tool.id}
          aria-haspopup="dialog"
          title={t(tool.title)}
          onClick={() => setOpen(tool.id)}
        >
          <Glyph>{tool.icon}</Glyph>
          <span className="rail__label">{t(tool.label)}</span>
        </button>
      ))}
      {open === "todos" && <TodosDialog onClose={close} />}
      {open === "schedules" && (
        <SchedulesDialog onClose={close} onOpenThread={(threadId) => onOpenThread?.(threadId)} />
      )}
      {open === "mail" && (
        <MailDialog onClose={close} onOpenThread={(threadId) => onOpenThread?.(threadId)} />
      )}
    </nav>
  );
}
