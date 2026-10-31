use std::net::SocketAddr;
use std::path::PathBuf;

use anyhow::Context as _;
use clap::Parser;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

use xiaoban_agent::{ConfiguredProvider, HttpConnector, ProviderPreset, first_configured_from_env};
use xiaoban_hub::{
    Hub, HubConfig, HubRuntime, KEYCHAIN_SERVICE, KeyringSecrets, default_hub_name, system_locale,
    system_prefix,
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
        help = "deepseek or mimo; defaults to the first provider with an API key in the environment"
    )]
    provider: Option<String>,
    #[arg(long, help = "Override the provider's default model")]
    model: Option<String>,
    #[arg(long)]
    no_advertise: bool,
}

fn configured(args: &Args) -> anyhow::Result<Option<ConfiguredProvider>> {
    let configured = match &args.provider {
        Some(id) => {
            let id = ProviderId::parse(id).with_context(|| format!("unknown provider {id}"))?;
            let preset = ProviderPreset::of(id);
            let config = preset
                .from_env()
                .with_context(|| format!("{} is not set", preset.key_env))?;
            Some(ConfiguredProvider::new(preset, config))
        }
        None => first_configured_from_env(),
    };
    Ok(match (configured, &args.model) {
        (Some(configured), Some(model)) => Some(configured.with_model(model.clone())),
        (configured, _) => configured,
    })
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
        prefix: system_prefix(locale),
        connector: Arc::new(HttpConnector),
        secrets: Arc::new(KeyringSecrets::new(KEYCHAIN_SERVICE)),
        fallback: configured(&args)?,
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
