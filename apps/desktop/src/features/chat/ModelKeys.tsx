import { describeError, failureKey, providerKey } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { ProviderId, ProviderOption } from "@xiaoban/protocol";
import { providerSvgDataUri } from "@xiaoban/provider-icons";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { dismiss, dismissOnCancel } from "../../lib/dialog.ts";
import { openExternal } from "../../lib/external.ts";

type Check = { state: "testing" } | { state: "ok" } | { state: "failed"; message: PlainMessageKey };

function Row({
  option,
  open,
  onToggle,
  onSaved,
}: {
  option: ProviderOption;
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const { model } = useHubState(store);
  const ids = { key: useId(), base: useId(), model: useId(), label: useId() };
  const active = model?.provider === option.id ? model : null;
  const custom = option.id === "custom";
  const [key, setKey] = useState("");
  const [picked, setPicked] = useState<string | null>(active?.model ?? option.defaultModel);
  const [baseUrl, setBaseUrl] = useState(active?.baseUrl ?? "");
  const [customModel, setCustomModel] = useState(custom ? (active?.model ?? "") : "");
  const [label, setLabel] = useState(active?.label ?? "");
  const [check, setCheck] = useState<Check | null>(null);
  const name = custom && active?.label ? active.label : t(providerKey(option.id));

  const ready =
    check?.state !== "testing" &&
    (custom
      ? key.trim() !== "" && baseUrl.trim() !== "" && customModel.trim() !== ""
      : key.trim() !== "" || (option.configured && picked !== null));

  const save = async () => {
    const apiKey = key.trim();
    setCheck({ state: "testing" });
    try {
      const result =
        apiKey === "" && option.configured && !custom && picked
          ? await store.selectModel(option.id, picked)
          : await store.configureProvider(
              custom
                ? {
                    provider: option.id,
                    apiKey,
                    baseUrl: baseUrl.trim(),
                    model: customModel.trim(),
                    ...(label.trim() ? { label: label.trim() } : {}),
                  }
                : { provider: option.id, apiKey, ...(picked ? { model: picked } : {}) },
            );
      if (result.failure) {
        setCheck({ state: "failed", message: failureKey(result.failure.kind) });
        return;
      }
      setKey("");
      setCheck({ state: "ok" });
      onSaved();
    } catch (cause) {
      setCheck({ state: "failed", message: describeError(cause) });
    }
  };

  return (
    <li className="model-keys__item" data-open={open || undefined}>
      <button type="button" className="model-keys__row" aria-expanded={open} onClick={onToggle}>
        <span className="model-keys__icon">
          {custom ? (
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
          ) : (
            <img src={providerSvgDataUri(option.id)} alt="" />
          )}
        </span>
        <span className="model-keys__name">
          <b>{name}</b>
          <span>{active?.model ?? option.defaultModel ?? t("custom-card-hint")}</span>
        </span>
        <span className="model-keys__status" data-on={option.configured || undefined}>
          {t(option.configured ? "models-connected" : "models-not-set")}
        </span>
        <svg className="model-keys__chevron" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="model-keys__panel">
          {custom && (
            <>
              <label className="model-keys__field" htmlFor={ids.base}>
                {t("custom-base-url-label")}
                <input
                  id={ids.base}
                  className="input input--mono"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  spellCheck={false}
                />
              </label>
              <div className="model-keys__pair">
                <label className="model-keys__field" htmlFor={ids.model}>
                  {t("custom-model-label")}
                  <input
                    id={ids.model}
                    className="input input--mono"
                    value={customModel}
                    onChange={(event) => setCustomModel(event.target.value)}
                    spellCheck={false}
                  />
                </label>
                <label className="model-keys__field" htmlFor={ids.label}>
                  {t("models-label")}
                  <input
                    id={ids.label}
                    className="input"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                </label>
              </div>
            </>
          )}
          <label className="model-keys__field" htmlFor={ids.key}>
            {t("onboarding-key-label")}
            <input
              id={ids.key}
              type="password"
              className="input"
              value={key}
              placeholder={option.configured ? t("models-key-saved") : undefined}
              onChange={(event) => {
                setKey(event.target.value);
                setCheck(null);
              }}
              autoComplete="off"
            />
          </label>
          {!custom && option.models.length > 0 && (
            <fieldset className="model-keys__models">
              <legend>{t("models-model")}</legend>
              {option.models.map((id) => (
                <label key={id} data-checked={id === picked || undefined}>
                  <input
                    type="radio"
                    name={`model-${option.id}`}
                    checked={id === picked}
                    onChange={() => {
                      setPicked(id);
                      setCheck(null);
                    }}
                  />
                  {id}
                </label>
              ))}
            </fieldset>
          )}
          <div className="model-keys__actions">
            <button
              type="button"
              className="button button--primary"
              disabled={!ready}
              onClick={() => void save()}
            >
              {t("models-save")}
            </button>
            {check?.state === "testing" && (
              <span className="model-keys__note">{t("models-testing")}</span>
            )}
            {check?.state === "ok" && (
              <span className="model-keys__note" data-ok>
                {t("models-replaced")}
              </span>
            )}
            {check?.state === "failed" && (
              <span className="model-keys__note" data-bad>
                {t("models-kept", { reason: t(check.message) })}
              </span>
            )}
            <span className="model-keys__spacer" />
            {option.consoleUrl && (
              <button
                type="button"
                className="model-keys__link"
                onClick={() => void openExternal(option.consoleUrl ?? "")}
              >
                {t("models-get-key")}
              </button>
            )}
          </div>
          {custom && <p className="model-keys__warning">{t("custom-trust-warning")}</p>}
        </div>
      )}
    </li>
  );
}

export function ModelKeys({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const { model } = useHubState(store);
  const dialog = useRef<HTMLDialogElement>(null);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [open, setOpen] = useState<ProviderId | null>(model?.provider ?? null);

  const load = useCallback(() => {
    void store
      .listProviders()
      .then(setProviders)
      .catch(() => undefined);
  }, [store]);

  useEffect(() => {
    dialog.current?.showModal();
    load();
  }, [load]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape already closes the dialog
    <dialog
      ref={dialog}
      className="dialog dialog--keys"
      aria-label={t("models-dialog-title")}
      onCancel={dismissOnCancel}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss(dialog.current);
      }}
    >
      <header className="model-keys__head">
        <b>{t("models-dialog-title")}</b>
        <button
          type="button"
          className="dialog__close"
          aria-label={t("dialog-close")}
          onClick={() => dismiss(dialog.current)}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <p className="model-keys__banner">{t("models-desk-banner")}</p>
      <ul className="model-keys">
        {providers.map((option) => (
          <Row
            key={option.id}
            option={option}
            open={open === option.id}
            onToggle={() => setOpen((current) => (current === option.id ? null : option.id))}
            onSaved={load}
          />
        ))}
      </ul>
    </dialog>
  );
}
