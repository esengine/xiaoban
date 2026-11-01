import { useI18n } from "@xiaoban/i18n/react";
import type { CommandRun, Workspace } from "@xiaoban/protocol";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { Chevron } from "../chat/ThreadList.tsx";
import { useCommands } from "./useCode.ts";

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function Status({ run, onStop }: { run: CommandRun; onStop: () => void }) {
  const { t } = useI18n();
  const running = run.durationMs === null;
  const now = useNow(running);
  if (running) {
    const seconds = Math.max(1, Math.round((now - run.startedAt) / 1000));
    return (
      <>
        <span className="terminal__state" data-tone="running">
          <span className="terminal__pulse" aria-hidden="true" />
          {t("code-terminal-running-for", { seconds })}
        </span>
        <button
          type="button"
          className="terminal__stop"
          onClick={(event) => {
            event.stopPropagation();
            onStop();
          }}
        >
          {t("code-terminal-stop")}
        </button>
      </>
    );
  }
  const seconds = t("code-seconds", {
    seconds: Math.max(1, Math.round((run.durationMs ?? 0) / 1000)),
  });
  if (run.exitCode === 0) {
    return (
      <span className="terminal__state" data-tone="ok">
        {t("code-terminal-ok")} <span>{seconds}</span>
      </span>
    );
  }
  return (
    <span className="terminal__state" data-tone="failed">
      {run.exitCode === null
        ? t("code-terminal-stopped")
        : t("code-terminal-failed", { code: run.exitCode })}{" "}
      <span>{seconds}</span>
    </span>
  );
}

export function Terminal({ workspace }: { workspace: Workspace }) {
  const { t } = useI18n();
  const store = useHub();
  const runs = useCommands(workspace);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [command, setCommand] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const list = useRef<HTMLDivElement>(null);
  const latest = runs.at(-1);
  const busy = runs.some((run) => run.byUser && run.durationMs === null);

  const isOpen = (run: CommandRun) =>
    toggled[run.id] ??
    (run.id === latest?.id ||
      (run.exitCode !== 0 && run.durationMs !== null && run.exitCode !== null));

  const lastOutput = latest?.output.length ?? 0;
  useEffect(() => {
    void lastOutput;
    const box = list.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lastOutput, runs.length]);

  useEffect(() => {
    if (busy || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    if (next) void store.runCommand(workspace.id, next).catch(() => undefined);
  }, [busy, queue, store, workspace.id]);

  const submit = () => {
    const text = command.trim();
    if (!text) return;
    setCommand("");
    setQueue((current) => [...current, text]);
  };

  return (
    <div className="terminal">
      <div className="terminal__list" ref={list}>
        {runs.length === 0 && <p className="terminal__hint">{t("code-terminal-empty")}</p>}
        {runs.map((run) => {
          const open = isOpen(run);
          return (
            <div
              key={run.id}
              className="terminal__run"
              data-running={run.durationMs === null || undefined}
            >
              <button
                type="button"
                className="terminal__row"
                aria-expanded={open}
                onClick={() => setToggled((current) => ({ ...current, [run.id]: !open }))}
              >
                <span className="terminal__who" data-you={run.byUser || undefined}>
                  {run.byUser ? t("code-terminal-you") : t("code-terminal-agent")}
                </span>
                <span className="terminal__command">{run.command}</span>
                <Status
                  run={run}
                  onStop={() => void store.stopCommand(run.id).catch(() => undefined)}
                />
                <Chevron open={open} />
              </button>
              {open && (
                <pre className="terminal__output">
                  {run.output}
                  {run.durationMs === null && (
                    <span className="terminal__cursor" aria-hidden="true" />
                  )}
                </pre>
              )}
            </div>
          );
        })}
        {queue.map((text, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: queued commands may repeat
          <div key={index} className="terminal__row" data-queued>
            <span className="terminal__who" data-you>
              {t("code-terminal-you")}
            </span>
            <span className="terminal__command">{text}</span>
            <span className="terminal__state">{t("code-terminal-queued")}</span>
          </div>
        ))}
      </div>
      <label className="terminal__input">
        <span className="terminal__who" data-you>
          {t("code-terminal-you")}
        </span>
        <input
          value={command}
          placeholder={busy ? t("code-terminal-input-busy") : t("code-terminal-input")}
          spellCheck={false}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) submit();
          }}
        />
      </label>
    </div>
  );
}
