import type { HubStore } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { GithubRef } from "@xiaoban/protocol";
import {
  createContext,
  type ReactNode,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useHub } from "../../app/hub.tsx";
import { openExternal } from "../../lib/external.ts";

const FRESH_MS = 5 * 60_000;

interface Entry {
  ref: GithubRef | null | undefined;
  at: number;
}

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
const queued = new Map<string, Set<number>>();
let timer: number | null = null;
let version = 0;

function notify() {
  version += 1;
  for (const listener of listeners) listener();
}

function flush(store: HubStore) {
  timer = null;
  for (const [workspaceId, numbers] of queued) {
    const list = [...numbers];
    queued.delete(workspaceId);
    void store
      .githubRefs(workspaceId, list)
      .then((refs) => {
        const now = Date.now();
        for (const number of list) {
          const found = refs.find((item) => item.number === number) ?? null;
          cache.set(`${workspaceId}#${number}`, { ref: found, at: now });
        }
        notify();
      })
      .catch(() => {
        for (const number of list)
          cache.set(`${workspaceId}#${number}`, { ref: null, at: Date.now() });
        notify();
      });
  }
}

function want(store: HubStore, workspaceId: string, number: number) {
  const key = `${workspaceId}#${number}`;
  const known = cache.get(key);
  if (known && (known.ref === undefined || Date.now() - known.at < FRESH_MS)) return;
  cache.set(key, { ref: known?.ref, at: Date.now() });
  const set = queued.get(workspaceId) ?? new Set<number>();
  set.add(number);
  queued.set(workspaceId, set);
  if (timer === null) timer = window.setTimeout(() => flush(store), 30);
}

export function useGithubRef(
  workspaceId: string | null,
  number: number,
): GithubRef | null | undefined {
  const store = useHub();
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
  useEffect(() => {
    if (workspaceId) want(store, workspaceId, number);
  }, [store, workspaceId, number]);
  if (!workspaceId) return null;
  return cache.get(`${workspaceId}#${number}`)?.ref;
}

export interface RefsValue {
  workspaceId: string;
  threadId: string;
  pinned: number[];
  onPin: (number: number, pinned: boolean) => void;
  onAsk: (text: string) => void;
}

export const RefsContext = createContext<RefsValue | null>(null);

export type Tone = "open" | "failed" | "pending" | "merged" | "muted";

export function badgeOf(item: GithubRef): Tone {
  if (item.state === "merged") return "merged";
  if (item.state === "closed" || item.state === "draft") return "muted";
  if (item.checks.some((check) => check.outcome === "failed")) return "failed";
  if (item.checks.some((check) => check.outcome === "pending")) return "pending";
  return "open";
}

export function Badge({ item }: { item: GithubRef }) {
  const { t } = useI18n();
  const tone = badgeOf(item);
  const failed = item.checks.filter((check) => check.outcome === "failed").length;
  const pending = item.checks.filter((check) => check.outcome === "pending").length;
  const counted = item.checks.filter((check) => check.outcome !== "skipped").length;
  const label =
    item.state === "merged"
      ? t("ref-merged")
      : item.state === "closed"
        ? t("ref-closed")
        : item.state === "draft"
          ? t("ref-draft")
          : failed > 0
            ? t("ref-checks-failed", { count: failed })
            : pending > 0
              ? t("ref-checks-pending", { done: counted - pending, total: counted })
              : item.pull && counted > 0
                ? t("ref-checks-passed")
                : t("ref-open");
  return (
    <span className="ref-badge" data-tone={tone}>
      {label}
    </span>
  );
}

const GAP = 6;
const EDGE = 8;

function useFloating(anchor: HTMLElement | null) {
  const card = useRef<HTMLSpanElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!anchor) return;
    const update = () => {
      const box = anchor.getBoundingClientRect();
      const width = card.current?.offsetWidth ?? 340;
      const height = card.current?.offsetHeight ?? 220;
      const below = box.bottom + GAP;
      const top =
        below + height > window.innerHeight - EDGE && box.top - GAP - height > EDGE
          ? box.top - GAP - height
          : below;
      const left = Math.min(Math.max(EDGE, box.left), window.innerWidth - width - EDGE);
      setPlace({ top, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchor]);
  return { card, place };
}

export function RefCard({
  item,
  anchor,
  onClose,
  onHover,
}: {
  item: GithubRef;
  anchor: HTMLElement | null;
  onClose: () => void;
  onHover?: (on: boolean) => void;
}) {
  const { card, place } = useFloating(anchor);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!card.current?.contains(target) && !anchor?.contains(target)) onClose();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", away);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", away);
    };
  }, [onClose, anchor, card]);
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: hovering keeps the preview open while reading it
    <span
      ref={card}
      className="ref-card"
      style={place ? { top: place.top, left: place.left } : { visibility: "hidden" }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
    >
      <RefCardBody item={item} onClose={onClose} />
    </span>,
    document.body,
  );
}

function RefCardBody({ item, onClose }: { item: GithubRef; onClose: () => void }) {
  const { t } = useI18n();
  const refs = use(RefsContext);
  const pinned = refs?.pinned.includes(item.number) ?? false;
  const failed = item.checks.filter((check) => check.outcome === "failed");
  const ordered = [
    ...failed,
    ...item.checks.filter((check) => check.outcome === "pending"),
    ...item.checks.filter((check) => check.outcome === "passed"),
  ];
  const shown = ordered.slice(0, 6);
  return (
    <span className="ref-card__inner" role="dialog" aria-label={item.title}>
      <span className="ref-card__top">
        <Badge item={item} />
        <span className="ref-card__where">
          {t(item.pull ? "ref-pr-where" : "ref-issue-where", {
            number: item.number,
            repo: item.repo,
          })}
        </span>
      </span>
      <b className="ref-card__title">{item.title}</b>
      <span className="ref-card__meta">
        {[
          item.author,
          item.head && item.base ? `${item.head} → ${item.base}` : null,
          item.files !== null ? t("ref-files", { count: item.files }) : null,
          t("ref-comments", { count: item.comments }),
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {shown.length > 0 && (
        <span className="ref-card__checks">
          {shown.map((check) => (
            <span key={check.name} data-outcome={check.outcome}>
              <span className="ref-card__mark" aria-hidden="true" />
              {check.name}
            </span>
          ))}
          {ordered.length > shown.length && (
            <span className="ref-card__more">
              {t("ref-more-checks", { count: ordered.length - shown.length })}
            </span>
          )}
        </span>
      )}
      <span className="ref-card__actions">
        {failed.length > 0 && refs && (
          <button
            type="button"
            data-primary
            onClick={() => {
              refs.onAsk(t("ref-ask-failure", { number: item.number }));
              onClose();
            }}
          >
            {t("ref-look-failure")}
          </button>
        )}
        {refs && (
          <button type="button" onClick={() => refs.onPin(item.number, !pinned)}>
            {pinned ? t("ref-unpin") : t("ref-pin")}
          </button>
        )}
        <button type="button" onClick={() => void openExternal(item.url)}>
          {t("ref-open-browser")}
        </button>
      </span>
    </span>
  );
}

export function RefChip({
  number,
  original,
  children,
}: {
  number: string;
  original: string;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const refs = use(RefsContext);
  const value = Number(number);
  const item = useGithubRef(refs?.workspaceId ?? null, value);
  const [open, setOpen] = useState(false);
  const leave = useRef<number | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  if (!refs || item === null) return <>{children ?? original}</>;
  const hover = (on: boolean) => {
    if (leave.current) window.clearTimeout(leave.current);
    if (on) setOpen(true);
    else leave.current = window.setTimeout(() => setOpen(false), 180);
  };
  if (item === undefined) {
    return (
      <span className="ref-chip" data-loading>
        <span className="ref-chip__dot" aria-hidden="true" />
        {t("ref-number", { number: value })}
      </span>
    );
  }
  const tone = badgeOf(item);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover only previews; the button opens the same card
    <span
      ref={anchor}
      className="ref-chip__anchor"
      onMouseEnter={() => hover(true)}
      onMouseLeave={() => hover(false)}
    >
      <button
        type="button"
        className="ref-chip"
        data-tone={tone}
        aria-expanded={open}
        title={item.title}
        onClick={() => setOpen(!open)}
      >
        <span className="ref-chip__dot" aria-hidden="true" />
        {t("ref-number", { number: value })}
      </button>
      {open && (
        <RefCard
          item={item}
          anchor={anchor.current}
          onClose={() => setOpen(false)}
          onHover={hover}
        />
      )}
    </span>
  );
}
