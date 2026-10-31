import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Draft } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { motion } from "@xiaoban/tokens";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { isBetweenSteps, stepText } from "../chat/Steps.tsx";
import { ConfirmCard } from "../operate/ConfirmCard.tsx";

type Mode = "idle" | "compact" | "medium" | "done" | "confirm";

const SIZES: Record<Mode, readonly [number, number]> = {
  idle: [132, 36],
  compact: [132, 36],
  medium: [440, 48],
  done: [320, 44],
  confirm: [440, 196],
};
const DRAG_THRESHOLD = 4;
const FLASH_MS = 3_000;
const DONE_MS = 3_000;
const LEAVE_MS = 80;
const HOVER_GRACE_MS = 150;

interface Finished {
  threadId: string;
  steps: number;
}

function latestRunning(drafts: Readonly<Record<string, Draft>>): Draft | null {
  return (
    Object.values(drafts)
      .filter((draft) => !draft.failure)
      .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null
  );
}

function Face() {
  return (
    <span className="island__face" aria-hidden="true">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <g className="island__eyes">
          <circle cx="9" cy="11" r="1.1" />
          <circle cx="15" cy="11" r="1.1" />
        </g>
      </svg>
    </span>
  );
}

export function Island() {
  const { t } = useI18n();
  const store = useHub();
  const state = useHubState(store);
  const running = latestRunning(state.drafts);
  const [hover, setHover] = useState(false);
  const leaveTimer = useRef<number | undefined>(undefined);
  const enter = useCallback(() => {
    window.clearTimeout(leaveTimer.current);
    setHover(true);
  }, []);
  const leave = useCallback(() => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setHover(false), HOVER_GRACE_MS);
  }, []);
  const [flash, setFlash] = useState(false);
  const [finished, setFinished] = useState<Finished | null>(null);
  const tracked = useRef<Draft | null>(null);
  const lastStep = running?.steps.at(-1)?.callId;

  useEffect(() => {
    const previous = tracked.current;
    tracked.current = running;
    if (!previous || previous.turnId === running?.turnId) return;
    const stillThere = state.drafts[previous.turnId];
    if (stillThere?.failure) return;
    setFinished({ threadId: previous.threadId, steps: previous.steps.length });
    const timer = window.setTimeout(() => setFinished(null), DONE_MS);
    return () => window.clearTimeout(timer);
  }, [running, state.drafts]);

  useEffect(() => {
    if (!lastStep) return;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [lastStep]);

  const previous = tracked.current;
  const justFinished: Finished | null =
    previous && previous.turnId !== running?.turnId && !state.drafts[previous.turnId]?.failure
      ? { threadId: previous.threadId, steps: previous.steps.length }
      : null;
  const done = finished ?? justFinished;

  const confirm = state.confirms[0] ?? null;
  const mode: Mode = confirm
    ? "confirm"
    : done
      ? "done"
      : running
        ? hover || flash
          ? "medium"
          : "compact"
        : "idle";

  const [dragging, setDragging] = useState(false);
  const press = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  useEffect(() => {
    const stops = [
      listen("island://dropped", () => setDragging(false)),
      listen<boolean>("island://hover", ({ payload }) => (payload ? enter() : leave())),
    ];
    return () => {
      for (const stop of stops) void stop.then((unlisten) => unlisten());
    };
  }, [enter, leave]);

  const shownSize = useRef<readonly [number, number]>(SIZES.idle);
  useEffect(() => {
    const next = SIZES[mode];
    const [width, height] = shownSize.current;
    void invoke("island_resize", {
      width: Math.max(width, next[0]),
      height: Math.max(height, next[1]),
    });
    shownSize.current = next;
    const timer = window.setTimeout(
      () => void invoke("island_resize", { width: next[0], height: next[1] }),
      motion.island,
    );
    return () => window.clearTimeout(timer);
  }, [mode]);

  const [leaving, setLeaving] = useState<{ mode: Mode; node: ReactNode } | null>(null);
  const previousContent = useRef<{ mode: Mode; node: ReactNode } | null>(null);

  const threadTitle = (threadId: string) => {
    const thread = state.threads.find((candidate) => candidate.id === threadId);
    return threadId === state.preferences?.primaryThreadId
      ? t("app-name")
      : (thread?.title ?? t("thread-untitled"));
  };
  const open = (threadId: string | null) => void invoke("island_open_main", { threadId });

  let content: ReactNode = null;
  if (mode === "idle") {
    content = (
      <span className="island__row island__row--compact">
        <Face />
        {hover && !dragging && <span className="island__count">{t("island-open")}</span>}
      </span>
    );
  } else if (mode === "compact" && running) {
    content = (
      <span className="island__row island__row--compact">
        <Face />
        {running.steps.length > 0 && (
          <span className="island__count">
            {t("island-step-count", { n: running.steps.length })}
          </span>
        )}
      </span>
    );
  } else if (mode === "medium" && running) {
    const current = running.steps.at(-1);
    const text =
      !current || isBetweenSteps(running.steps) ? t("step-thinking") : stepText(t, current);
    content = (
      <span className="island__row island__row--medium">
        <Face />
        <span className="island__text">
          {running.steps.length > 0
            ? t("island-step-line", { text, n: running.steps.length })
            : text}
        </span>
        <button
          type="button"
          className="island__stop"
          onMouseEnter={enter}
          onMouseLeave={leave}
          onClick={(event) => {
            event.stopPropagation();
            void store.cancel(running.turnId);
          }}
        >
          {t("island-stop")}
        </button>
      </span>
    );
  } else if (mode === "confirm" && confirm) {
    content = (
      <span className="island__row island__row--confirm">
        <ConfirmCard confirm={confirm} />
      </span>
    );
  } else if (mode === "done" && done) {
    content = (
      <span className="island__row island__row--done">
        <span className="island__tick" aria-hidden="true">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span className="island__text">
          {done.steps > 0
            ? t("island-done", { title: threadTitle(done.threadId), count: done.steps })
            : t("island-done-reply", { title: threadTitle(done.threadId) })}
        </span>
      </span>
    );
  }

  useEffect(() => {
    const previous = previousContent.current;
    if (previous && previous.mode !== mode) {
      setLeaving(previous);
      const timer = window.setTimeout(() => setLeaving(null), LEAVE_MS);
      previousContent.current = { mode, node: content };
      return () => window.clearTimeout(timer);
    }
    previousContent.current = { mode, node: content };
  });

  const size = SIZES[mode];
  const target = confirm?.threadId ?? done?.threadId ?? running?.threadId ?? null;

  return (
    <div className="island-stage">
      <div
        className="island"
        data-idle={(mode === "idle" && !hover && !dragging) || undefined}
        data-dragging={dragging || undefined}
        data-confirm={mode === "confirm" || undefined}
        style={{ width: size[0], height: size[1], borderRadius: size[1] / 2 }}
      >
        <button
          type="button"
          className="island__open"
          aria-label={t("island-open")}
          onPointerDown={(event) => {
            press.current = { x: event.screenX, y: event.screenY, dragged: false };
          }}
          onPointerMove={(event) => {
            const start = press.current;
            if (!start || start.dragged || event.buttons !== 1) return;
            const moved = Math.hypot(event.screenX - start.x, event.screenY - start.y);
            if (moved < DRAG_THRESHOLD) return;
            start.dragged = true;
            setDragging(true);
            void invoke("island_drag");
          }}
          onClick={() => {
            const dragged = press.current?.dragged ?? false;
            press.current = null;
            if (!dragged) open(target);
          }}
          onMouseEnter={enter}
          onMouseLeave={leave}
        />
        {leaving && (
          <span key={`leave-${leaving.mode}`} className="island__content island__content--leaving">
            {leaving.node}
          </span>
        )}
        <span key={mode} className="island__content">
          {content}
        </span>
      </div>
    </div>
  );
}

export function IslandSlot() {
  return (
    <div className="island-stage">
      <div className="island-slot" />
    </div>
  );
}
