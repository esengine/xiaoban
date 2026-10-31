use std::net::SocketAddr;
use std::path::PathBuf;

use anyhow::Context as _;
use clap::Parser;
use tracing_subscriber::EnvFilter;
use xiaoban_agent::{
    Agent, OpenAiCompatible, ProviderPreset, UnconfiguredProvider, first_configured_from_env,
};
use xiaoban_hub::{Hub, HubConfig, default_hub_name, system_locale, system_prefix};
use xiaoban_i18n::Locale;

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

fn agent(args: &Args, locale: Locale) -> anyhow::Result<Agent> {
    let prefix = system_prefix(locale);
    let configured = match &args.provider {
        Some(id) => {
            let preset =
                ProviderPreset::parse(id).with_context(|| format!("unknown provider {id}"))?;
            let config = preset
                .from_env()
                .with_context(|| format!("{} is not set", preset.key_env()))?;
            Some((preset, config))
        }
        None => first_configured_from_env(),
    };
    let Some((preset, mut config)) = configured else {
        let names: Vec<_> = ProviderPreset::ALL.iter().map(|p| p.key_env()).collect();
        tracing::warn!(expected = ?names, "no provider API key found; replies will fail until one is set");
        return Ok(Agent::new(UnconfiguredProvider, prefix));
    };
    if let Some(model) = &args.model {
        config.model.clone_from(model);
    }
    tracing::info!(provider = preset.id(), model = %config.model, "model provider configured");
    Ok(Agent::new(OpenAiCompatible::new(config), prefix))
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
    let agent = agent(&args, locale)?;

    let hub = Hub::start(
        HubConfig {
            data_dir: Some(args.data_dir),
            bind: args.bind,
            name: args.name.unwrap_or_else(|| default_hub_name(locale)),
            advertise: !args.no_advertise,
        },
        agent,
    )
    .await?;

    tokio::signal::ctrl_c().await?;
    hub.shutdown().await;
    Ok(())
}
