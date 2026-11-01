import { useI18n } from "@xiaoban/i18n/react";
import type { CommandRun, Workspace } from "@xiaoban/protocol";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { useCommands } from "./useCode.ts";

function Status({ run }: { run: CommandRun }) {
  const { t } = useI18n();
  if (run.durationMs === null) {
    return <span className="terminal__state">{t("code-terminal-running")}</span>;
  }
  const seconds = t("code-seconds", { seconds: Math.max(1, Math.round(run.durationMs / 1000)) });
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
  const [open, setOpen] = useState<string | null>(null);
  const [command, setCommand] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [runs.length]);

  const submit = () => {
    const text = command.trim();
    if (!text) return;
    setCommand("");
    void store.runCommand(workspace.id, text).catch(() => undefined);
  };

  return (
    <div className="terminal">
      <div className="terminal__list">
        {runs.length === 0 && <p className="terminal__hint">{t("code-terminal-empty")}</p>}
        {runs.map((run) => (
          <div key={run.id} className="terminal__run">
            <button
              type="button"
              className="terminal__row"
              aria-expanded={open === run.id}
              onClick={() => setOpen(open === run.id ? null : run.id)}
            >
              <span className="terminal__who">
                {run.byUser ? t("code-terminal-you") : t("code-terminal-agent")}
              </span>
              <span className="terminal__command">{run.command}</span>
              <Status run={run} />
            </button>
            {open === run.id && <pre className="terminal__output">{run.output}</pre>}
          </div>
        ))}
        {runs.length > 0 && <p className="terminal__hint">{t("code-terminal-hint")}</p>}
        <div ref={end} />
      </div>
      <label className="terminal__input">
        <span className="terminal__who" data-you>
          {t("code-terminal-you")}
        </span>
        <input
          value={command}
          placeholder={t("code-terminal-input")}
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
