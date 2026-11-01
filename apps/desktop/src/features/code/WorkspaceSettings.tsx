import { invoke, isTauri } from "@tauri-apps/api/core";
import { useI18n } from "@xiaoban/i18n/react";
import type { Allowance, Workspace, WorkspaceSettings } from "@xiaoban/protocol";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { dismiss, dismissOnCancel } from "../../lib/dialog.ts";
import { tilde } from "../chat/ThreadList.tsx";
import { ConfirmDialog } from "../dialog/ConfirmDialog.tsx";
import { rememberEditor } from "./editor.ts";

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const LABELS: Record<string, string> = { "Visual Studio Code": "VS Code" };

function List({
  items,
  mono,
  onRemove,
}: {
  items: string[];
  mono: boolean;
  onRemove: (item: string) => void;
}) {
  const { t } = useI18n();
  if (items.length === 0)
    return <p className="ws-settings__none">{t("workspace-settings-none")}</p>;
  return (
    <ul className="ws-settings__list">
      {items.map((item) => (
        <li key={item}>
          <span data-mono={mono || undefined}>{item}</span>
          <button type="button" className="code-link" onClick={() => onRemove(item)}>
            {t("workspace-settings-remove")}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function WorkspaceSettingsDialog({
  workspace,
  onClose,
}: {
  workspace: Workspace;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const dialog = useRef<HTMLDialogElement>(null);
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [editors, setEditors] = useState<string[]>([]);
  const [name, setName] = useState(workspace.name);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    void store
      .workspaceSettings(workspace.id)
      .then(setSettings)
      .catch(() => undefined);
    if (isTauri())
      void invoke<string[]>("list_editors")
        .then(setEditors)
        .catch(() => undefined);
  }, [store, workspace.id]);

  const saveName = () => {
    const next = name.trim();
    if (next && next !== workspace.name) void store.renameWorkspace(workspace.id, next);
  };
  const remove = (kind: Allowance, value: string) =>
    void store
      .removeAllowance(workspace.id, kind, value)
      .then(setSettings)
      .catch(() => undefined);
  const pickEditor = (editor: string) => {
    rememberEditor(workspace.id, editor);
    void store
      .setEditor(workspace.id, editor)
      .then(setSettings)
      .catch(() => undefined);
  };
  const close = () => {
    saveName();
    dismiss(dialog.current);
  };

  return (
    <dialog
      ref={dialog}
      onCancel={dismissOnCancel}
      onClose={onClose}
      className="dialog ws-settings"
      aria-labelledby="ws-settings-title"
    >
      <div className="ws-settings__head">
        <h2 id="ws-settings-title" className="dialog__title">
          {t("workspace-settings-title")}
        </h2>
        <button
          type="button"
          className="dialog__close"
          aria-label={t("dialog-close")}
          onClick={close}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M7 7l10 10M17 7L7 17" />
          </svg>
        </button>
      </div>
      <section className="ws-settings__section">
        <h3>{t("workspace-settings-name")}</h3>
        <input
          className="ws-settings__input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={saveName}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) saveName();
          }}
        />
      </section>
      <section className="ws-settings__section">
        <h3>{t("workspace-settings-place")}</h3>
        <div className="ws-settings__row">
          <span data-mono>{tilde(workspace.path)}</span>
          <button
            type="button"
            className="code-link"
            onClick={() => {
              if (isTauri())
                void invoke("file_reveal", { path: workspace.path }).catch(() => undefined);
            }}
          >
            {MAC ? t("file-menu-reveal-mac") : t("file-menu-reveal-windows")}
          </button>
        </div>
        <p className="ws-settings__hint">{t("workspace-settings-place-hint")}</p>
      </section>
      <section className="ws-settings__section">
        <h3>{t("workspace-settings-editor")}</h3>
        <span className="code-segment">
          {["auto", ...editors, "system"].map((editor) => (
            <button
              key={editor}
              type="button"
              aria-pressed={(settings?.editor ?? "auto") === editor}
              onClick={() => pickEditor(editor)}
            >
              {editor === "auto"
                ? t("workspace-settings-editor-auto")
                : editor === "system"
                  ? t("workspace-settings-editor-system")
                  : (LABELS[editor] ?? editor)}
            </button>
          ))}
        </span>
        <p className="ws-settings__hint">{t("workspace-settings-editor-hint")}</p>
      </section>
      <section className="ws-settings__section">
        <h3>{t("workspace-settings-commands")}</h3>
        <List items={settings?.commands ?? []} mono onRemove={(item) => remove("command", item)} />
        <p className="ws-settings__hint">{t("workspace-settings-commands-hint")}</p>
      </section>
      <section className="ws-settings__section">
        <h3>{t("workspace-settings-read")}</h3>
        <List items={settings?.read ?? []} mono onRemove={(item) => remove("read", item)} />
      </section>
      <section className="ws-settings__section">
        <h3>{t("workspace-settings-write")}</h3>
        <List items={settings?.write ?? []} mono onRemove={(item) => remove("write", item)} />
        <p className="ws-settings__hint">{t("workspace-settings-write-hint")}</p>
      </section>
      <div className="ws-settings__foot">
        <button type="button" className="ws-settings__danger" onClick={() => setRemoving(true)}>
          {t("workspace-remove")}
        </button>
        <button type="button" className="dialog__primary" onClick={close}>
          {t("workspace-settings-done")}
        </button>
      </div>
      {removing && (
        <ConfirmDialog
          title={t("workspace-remove-title", { name: workspace.name })}
          body={t("workspace-remove-body")}
          confirm={t("workspace-remove")}
          onConfirm={() => {
            void store.removeWorkspace(workspace.id);
            dismiss(dialog.current);
          }}
          onClose={() => setRemoving(false)}
        />
      )}
    </dialog>
  );
}
