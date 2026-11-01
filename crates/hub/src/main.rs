use std::net::SocketAddr;
use std::path::PathBuf;

use anyhow::Context as _;
use clap::Parser;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

use xiaoban_agent::{ConfiguredProvider, HttpConnector, ProviderPreset, first_configured_from_env};
use xiaoban_hub::{
    DeepseekWeb, Hub, HubConfig, HubRuntime, KEYCHAIN_SERVICE, KeyringSecrets, NoApps, NoLocator,
    NoOperator, NoRouter, OpenMeteo, Prompts, default_hub_name, system_locale,
};
use xiaoban_i18n::Locale;
use xiaoban_protocol::ProviderId;

#[derive(Debug, Parser)]
#[command(
    name = "xiaoban-hub",
    version,
    about = "Run the Xiaoban hub without a desktop UI"
)]
struct Args {
    #[arg(long, env = "XIAOBAN_DATA_DIR", default_value = "./data")]
    data_dir: PathBuf,
    #[arg(long, env = "XIAOBAN_BIND", default_value = "0.0.0.0:47100")]
    bind: SocketAddr,
    #[arg(long, env = "XIAOBAN_NAME")]
    name: Option<String>,
    #[arg(
        long,
        env = "XIAOBAN_LOCALE",
        help = "BCP 47 tag, defaults to the system locale"
    )]
    locale: Option<String>,
    #[arg(
        long,
        help = "deepseek, mimo or custom; defaults to the first provider with an API key in the environment"
    )]
    provider: Option<String>,
    #[arg(
        long,
        help = "Override the provider's default model; required for custom"
    )]
    model: Option<String>,
    #[arg(
        long,
        help = "OpenAI-compatible endpoint for the custom provider, e.g. a relay"
    )]
    base_url: Option<String>,
    #[arg(
        long,
        help = "Name of the environment variable holding the custom provider's key"
    )]
    api_key_env: Option<String>,
    #[arg(long)]
    no_advertise: bool,
}

fn custom(args: &Args) -> anyhow::Result<ConfiguredProvider> {
    let base_url = args
        .base_url
        .as_deref()
        .context("--base-url is required for custom")?;
    let model = args
        .model
        .clone()
        .context("--model is required for custom")?;
    let key_env = args
        .api_key_env
        .as_deref()
        .context("--api-key-env is required for custom")?;
    let api_key = std::env::var(key_env).with_context(|| format!("{key_env} is not set"))?;
    Ok(ConfiguredProvider::custom(
        base_url,
        api_key,
        &model,
        None,
        xiaoban_protocol::ModelApi::OpenAi,
    )?)
}

fn configured(args: &Args) -> anyhow::Result<Option<ConfiguredProvider>> {
    let Some(id) = &args.provider else {
        return Ok(
            first_configured_from_env().map(|configured| match &args.model {
                Some(model) => configured.with_model(model.clone()),
                None => configured,
            }),
        );
    };
    let id = ProviderId::parse(id).with_context(|| format!("unknown provider {id}"))?;
    let Some(preset) = ProviderPreset::find(id) else {
        return custom(args).map(Some);
    };
    let config = preset
        .from_env()
        .with_context(|| format!("{} is not set", preset.key_env))?;
    let configured = ConfiguredProvider::new(preset, config);
    Ok(Some(match &args.model {
        Some(model) => configured.with_model(model.clone()),
        None => configured,
    }))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();
    let args = Args::parse();
    let locale = args
        .locale
        .as_deref()
        .map_or_else(system_locale, Locale::negotiate);
    let runtime = HubRuntime {
        locale,
        prompts: Prompts::for_locale(locale),
        connector: Arc::new(HttpConnector),
        secrets: Arc::new(KeyringSecrets::new(KEYCHAIN_SERVICE)),
        locator: Arc::new(NoLocator),
        presence: Arc::new(xiaoban_hub::NoPresence),
        weather: Arc::new(OpenMeteo::for_locale(locale)),
        router: Arc::new(NoRouter),
        apps: Arc::new(NoApps),
        operator: Arc::new(NoOperator),
        web: Arc::new(DeepseekWeb::new()),
        fallback: configured(&args)?,
        auto_titles: true,
        auto_thinking: true,
    };

    let hub = Hub::start(
        HubConfig {
            data_dir: Some(args.data_dir),
            bind: args.bind,
            name: args.name.unwrap_or_else(|| default_hub_name(locale)),
            advertise: !args.no_advertise,
        },
        runtime,
    )
    .await?;

    tokio::signal::ctrl_c().await?;
    hub.shutdown().await;
    Ok(())
}
