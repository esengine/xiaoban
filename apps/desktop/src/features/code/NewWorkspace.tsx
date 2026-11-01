import { invoke, isTauri } from "@tauri-apps/api/core";
import { useI18n } from "@xiaoban/i18n/react";
import type { GitInfo } from "@xiaoban/protocol";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { dismiss, dismissOnCancel } from "../../lib/dialog.ts";

interface Folder {
  raw: string;
  path: string;
  exists: boolean;
  git: GitInfo;
}

export function NewWorkspace({
  onCreated,
  onClose,
}: {
  onCreated: (workspaceId: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const dialog = useRef<HTMLDialogElement>(null);
  const [folder, setFolder] = useState<Folder | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const choose = async () => {
    if (!isTauri()) return;
    const raw = await invoke<string | null>("pick_folder").catch(() => null);
    if (!raw) return;
    setFailure(null);
    const found = await store.inspectFolder(raw).catch(() => null);
    if (found) setFolder({ raw, path: found.path, exists: found.exists, git: found.git });
  };

  const start = async () => {
    if (!folder) return;
    try {
      const workspace = await store.createWorkspace(folder.raw);
      onCreated(workspace.id);
      dismiss(dialog.current);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <dialog
      ref={dialog}
      onCancel={dismissOnCancel}
      onClose={onClose}
      className="dialog new-workspace"
      aria-labelledby="new-workspace-title"
    >
      <h2 id="new-workspace-title" className="dialog__title">
        {t("workspace-new-title")}
      </h2>
      <div className="new-workspace__pick">
        <span className="new-workspace__path" data-empty={!folder || undefined}>
          {folder?.path ?? t("workspace-new-empty")}
        </span>
        <button type="button" className="dialog__secondary" onClick={() => void choose()}>
          {t("workspace-new-choose")}
        </button>
      </div>
      <ul className="new-workspace__rules">
        <li>{t("workspace-rule-inside")}</li>
        <li>{t("workspace-rule-ask")}</li>
        <li>{t("workspace-rule-undo")}</li>
      </ul>
      {folder && (
        <p className="new-workspace__git" data-tone={folder.git.repository ? "ok" : "muted"}>
          {folder.git.repository
            ? t("workspace-new-git", { branch: folder.git.branch ?? "" })
            : folder.git.installed
              ? t("workspace-new-no-repo")
              : t("workspace-new-no-git")}
        </p>
      )}
      {failure && <p className="commit-dialog__failure">{failure}</p>}
      <div className="dialog__actions">
        <button type="button" className="dialog__secondary" onClick={() => dismiss(dialog.current)}>
          {t("dialog-cancel")}
        </button>
        <button
          type="button"
          className="dialog__primary"
          disabled={!folder?.exists}
          onClick={() => void start()}
        >
          {t("workspace-new-start")}
        </button>
      </div>
      <p className="new-workspace__hint">{t("workspace-new-hint")}</p>
    </dialog>
  );
}
