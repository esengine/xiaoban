import { useI18n } from "@xiaoban/i18n/react";
import type { Branch, GitInfo, Workspace } from "@xiaoban/protocol";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { dismiss, dismissOnCancel } from "../../lib/dialog.ts";
import { recency } from "../chat/time.ts";

function SwitchDialog({
  name,
  git,
  onPick,
  onClose,
}: {
  name: string;
  git: GitInfo;
  onPick: (stash: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const pick = (stash: boolean) => {
    onPick(stash);
    dismiss(dialog.current);
  };
  return (
    <dialog
      ref={dialog}
      onCancel={dismissOnCancel}
      onClose={onClose}
      className="dialog dialog--confirm branch-switch"
      aria-labelledby="branch-switch-title"
    >
      <h2 id="branch-switch-title" className="dialog__title">
        {t("branch-switch-title", { name })}
      </h2>
      <p className="dialog__body">
        {t("branch-switch-body", { branch: git.branch ?? "", count: git.changed.length })}
      </p>
      <div className="branch-switch__choices">
        <button
          type="button"
          className="branch-switch__choice"
          data-primary
          onClick={() => pick(true)}
        >
          {t("branch-switch-stash")}
        </button>
        <button type="button" className="branch-switch__choice" onClick={() => pick(false)}>
          {t("branch-switch-carry")}
        </button>
        <button
          type="button"
          className="branch-switch__choice"
          onClick={() => dismiss(dialog.current)}
        >
          {t("dialog-cancel")}
        </button>
      </div>
      <p className="branch-switch__hint">{t("branch-switch-hint")}</p>
    </dialog>
  );
}

export function BranchMenu({
  workspace,
  git,
  onClose,
}: {
  workspace: Workspace;
  git: GitInfo;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const store = useHub();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void store
      .listBranches(workspace.id)
      .then(setBranches)
      .catch(() => undefined);
  }, [store, workspace.id]);

  useEffect(() => {
    const away = (event: PointerEvent) => {
      if (asking) return;
      if (box.current && !box.current.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !asking) onClose();
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", key);
    };
  }, [onClose, asking]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailure(null);
    try {
      await work();
      onClose();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const choose = (branch: Branch) => {
    if (branch.current) return;
    if (git.changed.length > 0) setAsking(branch.name);
    else void run(() => store.switchBranch(workspace.id, branch.name));
  };

  const needle = query.trim().toLowerCase();
  const shown = branches.filter((branch) => !needle || branch.name.toLowerCase().includes(needle));
  const note = (branch: Branch) => {
    if (branch.current) {
      return git.changed.length > 0
        ? t("branch-current", { count: git.changed.length })
        : t("branch-current-clean");
    }
    if (branch.upstream && branch.behind > 0) {
      return t("branch-remote-behind", { name: branch.upstream, count: branch.behind });
    }
    if (branch.remote) return t("branch-remote", { name: branch.name });
    const when = recency(branch.updatedAt, Date.now(), locale);
    return when.kind === "now"
      ? t("time-just-now")
      : when.kind === "yesterday"
        ? t("time-yesterday")
        : when.text;
  };

  return (
    <div className="branch-menu" ref={box} role="dialog" aria-label={t("branch-menu")}>
      <label className="branch-menu__search">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4-4" />
        </svg>
        <span className="visually-hidden">{t("branch-search")}</span>
        <input
          // biome-ignore lint/a11y/noAutofocus: the menu opens to pick a branch by typing
          autoFocus
          value={query}
          placeholder={t("branch-search")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <ul className="branch-menu__list">
        {shown.map((branch) => (
          <li key={`${branch.remote}-${branch.name}`}>
            <button
              type="button"
              className="branch-menu__row"
              aria-current={branch.current || undefined}
              disabled={busy}
              onClick={() => choose(branch)}
            >
              <span className="branch-menu__check" aria-hidden="true">
                {branch.current && (
                  <svg aria-hidden="true" viewBox="0 0 16 16">
                    <path d="M3 8.5l3 3 7-7" />
                  </svg>
                )}
              </span>
              <span className="branch-menu__text">
                <span className="branch-menu__name">{branch.name}</span>
                <span className="branch-menu__note">{note(branch)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="branch-menu__divider" />
      {creating ? (
        <input
          className="branch-menu__new"
          // biome-ignore lint/a11y/noAutofocus: shown right after choosing to create a branch
          autoFocus
          placeholder={t("branch-new-placeholder")}
          onKeyDown={(event) => {
            const name = event.currentTarget.value.trim();
            if (event.key === "Enter" && name && !event.nativeEvent.isComposing) {
              void run(() => store.switchBranch(workspace.id, name, { create: true }));
            }
            if (event.key === "Escape") setCreating(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="branch-menu__action"
          data-accent
          onClick={() => setCreating(true)}
        >
          {t("branch-new")}
        </button>
      )}
      {git.upstream && (
        <button
          type="button"
          className="branch-menu__action"
          disabled={busy}
          onClick={() => void run(() => store.pullBranch(workspace.id))}
        >
          {t("branch-pull")}
        </button>
      )}
      {failure && <p className="branch-menu__failure">{t("branch-failed", { detail: failure })}</p>}
      {asking && (
        <SwitchDialog
          name={asking}
          git={git}
          onPick={(stash) => void run(() => store.switchBranch(workspace.id, asking, { stash }))}
          onClose={() => setAsking(null)}
        />
      )}
    </div>
  );
}
