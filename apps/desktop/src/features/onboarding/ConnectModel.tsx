import { describeError, failureKey, providerKey } from "@xiaoban/client";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import type { ProviderId, ProviderOption } from "@xiaoban/protocol";
import { providerSvgDataUri } from "@xiaoban/provider-icons";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { openExternal } from "../../lib/external.ts";
import "./onboarding.css";

export function ConnectModel() {
  const { t } = useI18n();
  const store = useHub();
  const keyId = useId();
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selected, setSelected] = useState<ProviderId | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<PlainMessageKey | null>(null);

  useEffect(() => {
    void store.listProviders().then((options) => {
      setProviders(options);
      setSelected((current) => current ?? options[0]?.id ?? null);
    });
  }, [store]);

  const provider = providers.find((option) => option.id === selected) ?? null;
  const providerName = provider ? t(providerKey(provider.id)) : "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!provider || !apiKey.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const { failure } = await store.configureProvider(provider.id, apiKey);
      if (failure) setError(failureKey(failure.kind));
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className="onboarding">
      <form className="onboarding__card" onSubmit={submit}>
        <div className="onboarding__logo">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
            <g className="onboarding__eyes">
              <circle cx="9" cy="11" r="0.8" />
              <circle cx="15" cy="11" r="0.8" />
            </g>
            <path d="M9 15c1.6 1.2 4.4 1.2 6 0" />
          </svg>
        </div>
        <h1 className="onboarding__title">{t("onboarding-hello")}</h1>
        <p className="onboarding__lead">{t("onboarding-local-first")}</p>

        <fieldset className="onboarding__providers">
          <legend>{t("onboarding-pick-provider")}</legend>
          {providers.map((option, index) => (
            <label
              key={option.id}
              className="provider-option"
              data-selected={option.id === selected}
            >
              <input
                type="radio"
                name="provider"
                value={option.id}
                checked={option.id === selected}
                onChange={() => {
                  setSelected(option.id);
                  setError(null);
                }}
              />
              <span className="provider-option__icon">
                <img src={providerSvgDataUri(option.id)} alt="" />
              </span>
              <span className="provider-option__text">
                <span className="provider-option__name">{t(providerKey(option.id))}</span>
                <span className="provider-option__model">{option.defaultModel}</span>
              </span>
              {index === 0 && (
                <span className="provider-option__badge">{t("onboarding-recommended")}</span>
              )}
            </label>
          ))}
        </fieldset>

        <div className="onboarding__field">
          <label htmlFor={keyId}>{t("onboarding-key-label")}</label>
          <div className="onboarding__key">
            <input
              id={keyId}
              type={revealed ? "text" : "password"}
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setError(null);
              }}
              placeholder={t("onboarding-key-placeholder", { provider: providerName })}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="onboarding__reveal"
              aria-label={t(revealed ? "onboarding-hide-key" : "onboarding-show-key")}
              aria-pressed={revealed}
              onClick={() => setRevealed((value) => !value)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
                {revealed && <path d="M4 4l16 16" />}
              </svg>
            </button>
          </div>
          {provider && (
            <button
              type="button"
              className="onboarding__link"
              onClick={() => void openExternal(provider.consoleUrl)}
            >
              {t("onboarding-get-key", { provider: providerName })}
            </button>
          )}
        </div>

        <p className="onboarding__note">{t("onboarding-cost-note")}</p>
        {error && (
          <p className="onboarding__error" role="alert">
            {t(error)}
          </p>
        )}

        <button
          type="submit"
          className="onboarding__submit"
          disabled={!provider || !apiKey.trim() || checking}
        >
          {checking && <span className="onboarding__spinner" aria-hidden="true" />}
          {t(checking ? "onboarding-checking" : "onboarding-submit")}
        </button>
        <p className="onboarding__footnote">{t("onboarding-key-local")}</p>
      </form>
    </main>
  );
}
