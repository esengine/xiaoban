use std::sync::Arc;

use xiaoban_agent::{
    Agent, ConfiguredProvider, Connector, PRESETS, ProviderPreset, UnconfiguredProvider,
};
use xiaoban_protocol::{ErrorCode, ModelApi, ProtocolError, ProviderId, ProviderOption, Response};
use xiaoban_store::Store;

use crate::secrets::SecretStore;
use crate::state::{Active, SharedState};

const PROVIDER_KEY: &str = "model_provider";
const MODEL_KEY: &str = "model_name";
const BASE_URL_KEY: &str = "model_base_url";
const LABEL_KEY: &str = "model_label";
const API_KEY: &str = "model_api";

#[derive(Debug, Clone, Default)]
pub struct Selection {
    pub provider: Option<ProviderId>,
    pub api_key: String,
    pub model: Option<String>,
    pub base_url: Option<String>,
    pub label: Option<String>,
    pub api: ModelApi,
}

fn internal(detail: &dyn std::fmt::Display) -> ProtocolError {
    ProtocolError::new(ErrorCode::Internal, detail.to_string())
}

fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

async fn load_secret(
    secrets: &Arc<dyn SecretStore>,
    provider: ProviderId,
) -> Result<Option<String>, ProtocolError> {
    let secrets = Arc::clone(secrets);
    tokio::task::spawn_blocking(move || secrets.load(provider))
        .await
        .map_err(|error| internal(&error))?
        .map_err(|error| internal(&error))
}

pub fn activate(connector: &dyn Connector, configured: Option<ConfiguredProvider>) -> Active {
    match configured {
        Some(configured) => Active {
            search_key: (configured.info.provider == ProviderId::Deepseek)
                .then(|| configured.config.api_key.clone()),
            agent: Agent::from_shared(connector.provider(configured.config)),
            model: Some(configured.info),
        },
        None => Active {
            agent: Agent::new(UnconfiguredProvider),
            model: None,
            search_key: None,
        },
    }
}

fn resolve(selection: Selection) -> Result<ConfiguredProvider, xiaoban_agent::AgentError> {
    let provider = selection.provider.unwrap_or(ProviderId::Custom);
    match ProviderPreset::find(provider) {
        Some(preset) => Ok(ConfiguredProvider::new(
            preset,
            preset.config(selection.api_key, non_empty(selection.model)),
        )),
        None => ConfiguredProvider::custom(
            selection.base_url.as_deref().unwrap_or_default(),
            selection.api_key,
            selection.model.as_deref().unwrap_or_default(),
            selection.label,
            selection.api,
        ),
    }
}

pub async fn restore(
    store: &Store,
    secrets: &Arc<dyn SecretStore>,
    fallback: Option<ConfiguredProvider>,
) -> Result<Option<ConfiguredProvider>, ProtocolError> {
    let Some(provider) = store
        .setting(PROVIDER_KEY)
        .await?
        .as_deref()
        .and_then(ProviderId::parse)
    else {
        return Ok(fallback);
    };
    let Some(api_key) = load_secret(secrets, provider).await? else {
        tracing::warn!(
            provider = provider.as_str(),
            "saved provider has no key in the keychain"
        );
        return Ok(fallback);
    };
    let selection = Selection {
        provider: Some(provider),
        api_key,
        model: store.setting(MODEL_KEY).await?,
        base_url: store.setting(BASE_URL_KEY).await?,
        label: store.setting(LABEL_KEY).await?,
        api: store
            .setting(API_KEY)
            .await?
            .as_deref()
            .and_then(ModelApi::parse)
            .unwrap_or_default(),
    };
    Ok(resolve(selection)
        .inspect_err(|error| tracing::warn!(%error, "saved provider settings are unusable"))
        .ok()
        .or(fallback))
}

pub async fn list_providers(state: &SharedState) -> Result<Response, ProtocolError> {
    let mut providers = Vec::with_capacity(ProviderId::ALL.len());
    for id in ProviderId::ALL {
        let preset = ProviderPreset::find(id);
        providers.push(ProviderOption {
            id,
            default_model: preset.map(|preset| preset.default_model.to_owned()),
            models: preset
                .map(|preset| {
                    preset
                        .models
                        .iter()
                        .map(|&model| model.to_owned())
                        .collect()
                })
                .unwrap_or_default(),
            console_url: preset.map(|preset| preset.console_url.to_owned()),
            configured: load_secret(&state.secrets, id).await?.is_some(),
        });
    }
    debug_assert_eq!(providers.len(), PRESETS.len() + 1);
    Ok(Response::Providers { providers })
}

async fn persist(
    state: &SharedState,
    configured: &ConfiguredProvider,
) -> Result<(), ProtocolError> {
    let info = &configured.info;
    let secrets = Arc::clone(&state.secrets);
    let provider = info.provider;
    let secret = configured.config.api_key.clone();
    tokio::task::spawn_blocking(move || secrets.save(provider, &secret))
        .await
        .map_err(|error| internal(&error))?
        .map_err(|error| internal(&error))?;

    let store = &state.store;
    store
        .set_setting(PROVIDER_KEY, provider.as_str().to_owned())
        .await?;
    store.set_setting(MODEL_KEY, info.model.clone()).await?;
    store.set_setting(API_KEY, info.api.as_str().to_owned()).await?;
    for (key, value) in [(BASE_URL_KEY, &info.base_url), (LABEL_KEY, &info.label)] {
        match value {
            Some(value) => store.set_setting(key, value.clone()).await?,
            None => store.clear_setting(key).await?,
        }
    }
    Ok(())
}

pub async fn configure(
    state: &SharedState,
    selection: Selection,
) -> Result<Response, ProtocolError> {
    if selection.api_key.trim().is_empty() {
        return Err(ProtocolError::new(
            ErrorCode::BadRequest,
            "api key is empty",
        ));
    }
    let rejected = |error: xiaoban_agent::AgentError| Response::ProviderConfigured {
        model: state.active().model,
        failure: Some(error.to_failure()),
    };
    let selection = Selection {
        api_key: selection.api_key.trim().to_owned(),
        ..selection
    };
    let configured = match resolve(selection) {
        Ok(configured) => configured,
        Err(error) => return Ok(rejected(error)),
    };
    let verify_model = configured.info.provider == ProviderId::Custom;
    if let Err(error) = state
        .connector
        .check(configured.config.clone(), verify_model)
        .await
    {
        return Ok(rejected(error));
    }

    persist(state, &configured).await?;
    let info = configured.info.clone();
    state.activate(activate(&*state.connector, Some(configured)));
    tracing::info!(provider = info.provider.as_str(), model = %info.model, "model provider configured");
    Ok(Response::ProviderConfigured {
        model: Some(info),
        failure: None,
    })
}

pub async fn secret(
    state: &SharedState,
    provider: ProviderId,
) -> Result<Option<String>, ProtocolError> {
    load_secret(&state.secrets, provider).await
}

pub async fn select(
    state: &SharedState,
    provider: ProviderId,
    model: String,
) -> Result<Response, ProtocolError> {
    let Some(api_key) = load_secret(&state.secrets, provider).await? else {
        return Err(ProtocolError::new(
            ErrorCode::BadRequest,
            "this provider has no saved key",
        ));
    };
    let keep = provider == ProviderId::Custom;
    let store = &state.store;
    let base_url = if keep { store.setting(BASE_URL_KEY).await? } else { None };
    let label = if keep { store.setting(LABEL_KEY).await? } else { None };
    let api = if keep {
        store
            .setting(API_KEY)
            .await?
            .as_deref()
            .and_then(ModelApi::parse)
            .unwrap_or_default()
    } else {
        ModelApi::OpenAi
    };
    configure(
        state,
        Selection {
            provider: Some(provider),
            api_key,
            model: Some(model),
            base_url,
            label,
            api,
        },
    )
    .await
}
