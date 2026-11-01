import { useI18n } from "@xiaoban/i18n/react";
import type { GitInfo, Workspace } from "@xiaoban/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { dismiss, dismissOnCancel } from "../../lib/dialog.ts";

export function CommitDialog({
  workspace,
  git,
  onDone,
  onClose,
}: {
  workspace: Workspace;
  git: GitInfo;
  onDone?: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const dialog = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(git.changed.map((file) => file.path)),
  );
  const [message, setMessage] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const touched = useRef(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const draft = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) return;
      setDrafting(true);
      void store
        .draftCommit(workspace.id, paths)
        .then((text) => {
          if (text && !touched.current) setMessage(text);
        })
        .catch(() => undefined)
        .finally(() => setDrafting(false));
    },
    [store, workspace.id],
  );

  useEffect(() => {
    draft(git.changed.map((file) => file.path));
  }, [draft, git.changed]);

  const toggle = (path: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const submit = async (push: boolean) => {
    setBusy(true);
    setFailure(null);
    try {
      await store.commit(workspace.id, message, [...picked], push);
      onDone?.();
      dismiss(dialog.current);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const ready = picked.size > 0 && message.trim().length > 0 && !busy;

  return (
    <dialog
      ref={dialog}
      onCancel={dismissOnCancel}
      onClose={onClose}
      className="dialog commit-dialog"
      aria-labelledby="commit-title"
    >
      <h2 id="commit-title" className="dialog__title">
        {t("commit-title", { count: picked.size })}
      </h2>
      <ul className="commit-dialog__files">
        {git.changed.map((file) => (
          <li key={file.path}>
            <label>
              <input
                type="checkbox"
                checked={picked.has(file.path)}
                onChange={() => toggle(file.path)}
              />
              <span className="commit-dialog__path">{file.path}</span>
            </label>
          </li>
        ))}
      </ul>
      <textarea
        className="commit-dialog__message"
        value={message}
        rows={4}
        spellCheck={false}
        placeholder={drafting ? t("commit-drafting") : t("commit-placeholder")}
        aria-label={t("commit-message")}
        onChange={(event) => {
          touched.current = true;
          setMessage(event.target.value);
        }}
      />
      <p className="commit-dialog__hint">
        {drafting ? t("commit-drafting") : t("commit-hint")}{" "}
        <button
          type="button"
          className="code-link"
          disabled={drafting || picked.size === 0}
          onClick={() => {
            touched.current = false;
            draft([...picked]);
          }}
        >
          {t("commit-redraft")}
        </button>
      </p>
      {failure && (
        <p className="commit-dialog__failure">{t("branch-failed", { detail: failure })}</p>
      )}
      <div className="dialog__actions">
        <button type="button" className="dialog__secondary" onClick={() => dismiss(dialog.current)}>
          {t("dialog-cancel")}
        </button>
        <button
          type="button"
          className="dialog__secondary"
          disabled={!ready}
          onClick={() => void submit(false)}
        >
          {t("commit-only")}
        </button>
        <button
          type="button"
          className="dialog__primary"
          disabled={!ready}
          onClick={() => void submit(true)}
        >
          {t("commit-push")}
        </button>
      </div>
    </dialog>
  );
}
