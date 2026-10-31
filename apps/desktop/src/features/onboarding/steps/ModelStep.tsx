import { describeError, failureKey, providerKey } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { Failure, ProviderId, ProviderOption } from "@xiaoban/protocol";
import { providerSvgDataUri } from "@xiaoban/provider-icons";
import { type FormEvent, useEffect, useId, useState } from "react";
import { useHub } from "../../../app/hub.tsx";
import { openExternal } from "../../../lib/external.ts";
import { StepFooter } from "../StepFooter.tsx";

type Problem =
  | { failure: Failure; model: string }
  | { unreachable: true; key: ReturnType<typeof describeError> };

export function ModelStep({ onDone }: { onDone: () => void }) {
  const { t, locale } = useI18n();
  const store = useHub();
  const ids = { key: useId(), baseUrl: useId(), model: useId(), label: useId() };
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selected, setSelected] = useState<ProviderId | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [label, setLabel] = useState("");
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    void store.listProviders().then((options) => {
      setProviders(options);
      setSelected((current) => current ?? options[0]?.id ?? null);
    });
  }, [store]);

  const provider = providers.find((option) => option.id === selected) ?? null;
  const isCustom = provider?.id === "custom";
  const providerName = provider ? t(providerKey(provider.id)) : "";
  const ready =
    provider !== null &&
    apiKey.trim() !== "" &&
    (!isCustom || (baseUrl.trim() !== "" && customModel.trim() !== ""));
  const failureKind = problem && "failure" in problem ? problem.failure.kind : null;

  const change = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setProblem(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!provider || !ready) return;
    setChecking(true);
    setProblem(null);
    try {
      const { failure } = await store.configureProvider(
        isCustom
          ? { provider: provider.id, apiKey, baseUrl, model: customModel, label }
          : { provider: provider.id, apiKey },
      );
      if (failure) setProblem({ failure, model: customModel.trim() });
      else onDone();
    } catch (cause) {
      setProblem({ unreachable: true, key: describeError(cause) });
    } finally {
      setChecking(false);
    }
  };

  const message = () => {
    if (!problem) return null;
    if ("unreachable" in problem) return t(problem.key);
    const { failure, model } = problem;
    if (failure.kind === "unknown_model" && failure.alternatives.length > 0) {
      const models = new Intl.ListFormat(locale, { style: "narrow", type: "unit" }).format(
        failure.alternatives,
      );
      return t("failure-unknown-model-listed", { model, models });
    }
    return t(failureKey(failure.kind));
  };

  return (
    <form className="step" onSubmit={submit}>
      <div className="step__body model-step">
        <fieldset className="provider-grid">
          {providers.map((option, index) => (
            <label key={option.id} className="provider-card" data-selected={option.id === selected}>
              <input
                type="radio"
                name="provider"
                value={option.id}
                checked={option.id === selected}
                onChange={() => {
                  setSelected(option.id);
                  setProblem(null);
                }}
              />
              <span className="provider-card__icon">
                <img src={providerSvgDataUri(option.id)} alt="" />
              </span>
              <span className="provider-card__text">
                <span className="provider-card__name">{t(providerKey(option.id))}</span>
                <span className="provider-card__model" data-mono={option.defaultModel !== null}>
                  {option.defaultModel ?? t("custom-card-hint")}
                </span>
              </span>
              {index === 0 && (
                <span className="provider-card__badge">{t("onboarding-recommended")}</span>
              )}
            </label>
          ))}
        </fieldset>

        {isCustom ? (
          <div className="custom-panel">
            <div className="field">
              <label htmlFor={ids.baseUrl}>{t("custom-base-url-label")}</label>
              <input
                id={ids.baseUrl}
                className="input input--mono"
                data-invalid={failureKind === "invalid_endpoint"}
                value={baseUrl}
                onChange={(event) => change(setBaseUrl)(event.target.value)}
                placeholder={t("custom-base-url-placeholder")}
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
              />
              <span className="field__hint">{t("custom-base-url-hint")}</span>
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor={ids.model}>{t("custom-model-label")}</label>
                <input
                  id={ids.model}
                  className="input input--mono"
                  data-invalid={failureKind === "unknown_model"}
                  value={customModel}
                  onChange={(event) => change(setCustomModel)(event.target.value)}
                  placeholder={t("custom-model-placeholder")}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="field">
                <label htmlFor={ids.label}>{t("custom-label-label")}</label>
                <input
                  id={ids.label}
                  className="input"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder={t("custom-label-placeholder")}
                  autoComplete="off"
                />
              </div>
            </div>
            <KeyField
              id={ids.key}
              value={apiKey}
              revealed={revealed}
              invalid={failureKind === "invalid_key"}
              placeholder={t("onboarding-key-placeholder", {
                provider: label.trim() || providerName,
              })}
              onChange={change(setApiKey)}
              onToggle={() => setRevealed((value) => !value)}
            />
            <p className="custom-panel__warning">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3l9 16H3z" />
                <path d="M12 10v4M12 17h.01" />
              </svg>
              {t("custom-trust-warning")}
            </p>
          </div>
        ) : (
          <>
            <KeyField
              id={ids.key}
              value={apiKey}
              revealed={revealed}
              invalid={failureKind === "invalid_key"}
              placeholder={t("onboarding-key-placeholder", { provider: providerName })}
              onChange={change(setApiKey)}
              onToggle={() => setRevealed((value) => !value)}
              link={
                provider?.consoleUrl
                  ? {
                      label: t("onboarding-get-key", { provider: providerName }),
                      url: provider.consoleUrl,
                    }
                  : undefined
              }
            />
            <p className="model-step__note">{t("onboarding-cost-note")}</p>
          </>
        )}

        {problem && (
          <p className="banner banner--attention" role="alert">
            {message()}
          </p>
        )}
      </div>
      <StepFooter
        note={t("onboarding-key-local")}
        next={{
          label: t(checking ? "onboarding-checking" : "onboarding-submit"),
          disabled: !ready,
          busy: checking,
        }}
      />
    </form>
  );
}

interface KeyFieldProps {
  id: string;
  value: string;
  revealed: boolean;
  invalid: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  onToggle: () => void;
  link?: { label: string; url: string } | undefined;
}

function KeyField({
  id,
  value,
  revealed,
  invalid,
  placeholder,
  onChange,
  onToggle,
  link,
}: KeyFieldProps) {
  const { t } = useI18n();
  return (
    <div className="field">
      <label htmlFor={id}>{t("onboarding-key-label")}</label>
      <div className="key-input" data-invalid={invalid}>
        <input
          id={id}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          aria-label={t(revealed ? "onboarding-hide-key" : "onboarding-show-key")}
          aria-pressed={revealed}
          onClick={onToggle}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
            <circle cx="12" cy="12" r="3" />
            {revealed && <path d="M4 4l16 16" />}
          </svg>
        </button>
      </div>
      {link && (
        <button type="button" className="link" onClick={() => void openExternal(link.url)}>
          {link.label}
        </button>
      )}
    </div>
  );
}
