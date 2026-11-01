import { activeModelName, failureKey, modelName } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { ProviderId, ProviderOption, ThinkingEffort } from "@xiaoban/protocol";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { ModelStep } from "../onboarding/steps/ModelStep.tsx";
import { FloatPanel } from "./FloatPanel.tsx";

const EFFORTS: ThinkingEffort[] = ["auto", "none", "low", "high", "max"];

type Choice = { provider: ProviderId; model: string };

export function ModelMenu({ threadId }: { threadId: string }) {
  const { t } = useI18n();
  const store = useHub();
  const state = useHubState(store);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [switching, setSwitching] = useState<Choice | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const active = state.model;
  const effort = state.threads.find((thread) => thread.id === threadId)?.thinking ?? "auto";
  const supported = active?.provider === "deepseek";
  const label = (value: ThinkingEffort) => t(`thinking-${value}`);

  useEffect(() => {
    if (open) void store.listProviders().then(setProviders);
  }, [open, store]);

  if (!active) return null;
  const choices: Choice[] = providers
    .filter((option) => option.configured && option.id !== "custom")
    .flatMap((option) => option.models.map((model) => ({ provider: option.id, model })));
  if (!choices.some((choice) => choice.model === active.model)) {
    choices.unshift({ provider: active.provider, model: active.model });
  }

  const pick = async (choice: Choice) => {
    if (choice.model === active.model && choice.provider === active.provider) return;
    setSwitching(choice);
    setFailed(null);
    try {
      const { failure } = await store.selectModel(choice.provider, choice.model);
      if (failure) setFailed(t(failureKey(failure.kind)));
    } catch {
      setFailed(t("model-switch-failed"));
    } finally {
      setSwitching(null);
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="model-menu__trigger"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {activeModelName(active)}
        {supported && <span className="model-menu__effort">{label(effort)}</span>}
      </button>
      {open && (
        <FloatPanel
          anchor={trigger}
          label={t("thinking-model")}
          className="model-menu"
          onClose={() => setOpen(false)}
        >
          <b className="model-menu__title">{t("thinking-model")}</b>
          <ul className="model-menu__models">
            {choices.map((choice) => {
              const current = choice.model === active.model && choice.provider === active.provider;
              const busy = switching?.model === choice.model;
              return (
                <li key={`${choice.provider}:${choice.model}`}>
                  <button
                    type="button"
                    aria-pressed={current}
                    disabled={switching !== null}
                    onClick={() => void pick(choice)}
                  >
                    <span>
                      {current
                        ? (active.label ?? modelName(choice.model))
                        : modelName(choice.model)}
                    </span>
                    {busy ? (
                      <span className="model-menu__note">{t("model-switching")}</span>
                    ) : (
                      current && (
                        <svg className="model-menu__check" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      )
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {failed && <p className="model-menu__failed">{failed}</p>}
          <button
            type="button"
            className="model-menu__add"
            onClick={() => {
              setOpen(false);
              setAdding(true);
            }}
          >
            {t("model-add")}
          </button>
          <hr className="model-menu__separator" />
          <b className="model-menu__title">{t("thinking-title")}</b>
          <div className="model-menu__segments" data-disabled={!supported || undefined}>
            {EFFORTS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={value === effort}
                disabled={!supported}
                onClick={() => void store.setThinking(threadId, value)}
              >
                {label(value)}
              </button>
            ))}
          </div>
          {supported ? (
            <dl className="model-menu__help">
              {EFFORTS.map((value) => (
                <div key={value}>
                  <dt>{label(value)}</dt>
                  <dd>{t(`thinking-${value}-help`)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="model-menu__help">{t("thinking-unsupported")}</p>
          )}
        </FloatPanel>
      )}
      {adding && <AddModel onClose={() => setAdding(false)} />}
    </>
  );
}

function AddModel({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} className="dialog dialog--model" onClose={onClose}>
      <ModelStep onDone={() => dialog.current?.close()} />
    </dialog>
  );
}
