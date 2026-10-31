use std::sync::Arc;

use xiaoban_agent::{
    Agent, ConfiguredProvider, Connector, PRESETS, ProviderPreset, StablePrefix,
    UnconfiguredProvider,
};
use xiaoban_protocol::{ErrorCode, ProtocolError, ProviderId, ProviderOption, Response};
use xiaoban_store::Store;

use crate::secrets::SecretStore;
use crate::state::{Active, SharedState};

const PROVIDER_KEY: &str = "model_provider";
const MODEL_KEY: &str = "model_name";

fn internal(detail: &dyn std::fmt::Display) -> ProtocolError {
    ProtocolError::new(ErrorCode::Internal, detail.to_string())
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

pub fn activate(
    connector: &dyn Connector,
    prefix: &StablePrefix,
    configured: Option<ConfiguredProvider>,
) -> Active {
    match configured {
        Some(configured) => Active {
            agent: Agent::from_shared(connector.provider(configured.config), prefix.clone()),
            model: Some(configured.info),
        },
        None => Active {
            agent: Agent::new(UnconfiguredProvider, prefix.clone()),
            model: None,
        },
    }
}

pub async fn restore(
    store: &Store,
    secrets: &Arc<dyn SecretStore>,
    fallback: Option<ConfiguredProvider>,
) -> Result<Option<ConfiguredProvider>, ProtocolError> {
    let provider = store
        .setting(PROVIDER_KEY)
        .await?
        .as_deref()
        .and_then(ProviderId::parse);
    let Some(provider) = provider else {
        return Ok(fallback);
    };
    let Some(secret) = load_secret(secrets, provider).await? else {
        tracing::warn!(
            provider = provider.as_str(),
            "saved provider has no key in the keychain"
        );
        return Ok(fallback);
    };
    let preset = ProviderPreset::of(provider);
    let model = store.setting(MODEL_KEY).await?;
    Ok(Some(ConfiguredProvider::new(
        preset,
        preset.config(secret, model),
    )))
}

pub async fn list_providers(state: &SharedState) -> Result<Response, ProtocolError> {
    let mut providers = Vec::with_capacity(PRESETS.len());
    for preset in &PRESETS {
        providers.push(ProviderOption {
            id: preset.id,
            default_model: preset.default_model.to_owned(),
            models: preset
                .models
                .iter()
                .map(|&model| model.to_owned())
                .collect(),
            console_url: preset.console_url.to_owned(),
            configured: load_secret(&state.secrets, preset.id).await?.is_some(),
        });
    }
    Ok(Response::Providers { providers })
}

pub async fn configure(
    state: &SharedState,
    provider: ProviderId,
    api_key: &str,
    model: Option<String>,
) -> Result<Response, ProtocolError> {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err(ProtocolError::new(
            ErrorCode::BadRequest,
            "api key is empty",
        ));
    }
    let preset = ProviderPreset::of(provider);
    let model = model
        .map(|model| model.trim().to_owned())
        .filter(|model| !model.is_empty());
    let configured = ConfiguredProvider::new(preset, preset.config(api_key.to_owned(), model));

    if let Err(error) = state.connector.check(configured.config.clone()).await {
        return Ok(Response::ProviderConfigured {
            model: state.active().model,
            failure: Some(error.to_failure()),
        });
    }

    let secrets = Arc::clone(&state.secrets);
    let secret = api_key.to_owned();
    tokio::task::spawn_blocking(move || secrets.save(provider, &secret))
        .await
        .map_err(|error| internal(&error))?
        .map_err(|error| internal(&error))?;
    state
        .store
        .set_setting(PROVIDER_KEY, provider.as_str().to_owned())
        .await?;
    state
        .store
        .set_setting(MODEL_KEY, configured.info.model.clone())
        .await?;

    let info = configured.info.clone();
    state.activate(activate(&*state.connector, &state.prefix, Some(configured)));
    tracing::info!(provider = provider.as_str(), model = %info.model, "model provider configured");
    Ok(Response::ProviderConfigured {
        model: Some(info),
        failure: None,
    })
}
