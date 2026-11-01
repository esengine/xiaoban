import { useI18n } from "@xiaoban/i18n/react";
import { use, useRef, useState } from "react";
import { Badge, RefCard, RefsContext, useGithubRef } from "./RefChip.tsx";

function PinIcon({ pull }: { pull: boolean }) {
  return pull ? (
    <svg className="code-side-icon" aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="8" r="2" />
      <path d="M6 7v10M18 10c0 4-6 3-12 7" />
    </svg>
  ) : (
    <svg className="code-side-icon" aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  );
}

function Pin({ number, repo }: { number: number; repo: string | null }) {
  const { t } = useI18n();
  const refs = use(RefsContext);
  const item = useGithubRef(refs?.workspaceId ?? null, number);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  if (!item || (repo && item.repo.toLowerCase() !== repo.toLowerCase())) return null;
  return (
    <div className="ref-pin" ref={box}>
      <button
        type="button"
        className="ref-pin__row"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="ref-pin__icon" data-state={item.state}>
          <PinIcon pull={item.pull} />
        </span>
        <span className="ref-pin__label">
          {t(item.pull ? "ref-pr-label" : "ref-issue-label", { number: String(item.number) })}
        </span>
        <span className="ref-pin__title">{item.title}</span>
        <Badge item={item} />
      </button>
      {open && <RefCard item={item} anchor={box.current} onClose={() => setOpen(false)} />}
    </div>
  );
}

const SHOWN = 3;

export function Pins({ items }: { items: { number: number; repo: string | null }[] }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, SHOWN);
  return (
    <div className="ref-pins">
      {shown.map((item) => (
        <Pin key={item.number} number={item.number} repo={item.repo} />
      ))}
      {items.length > SHOWN && (
        <button type="button" className="code-link ref-pins__more" onClick={() => setAll(!all)}>
          {all ? t("ref-pins-less") : t("ref-pins-more", { count: items.length - SHOWN })}
        </button>
      )}
    </div>
  );
}
