use std::net::SocketAddr;
use std::path::PathBuf;

use clap::Parser;
use tracing_subscriber::EnvFilter;
use xiaoban_agent::{Agent, OpenAiCompatible, OpenAiConfig, UnconfiguredProvider};
use xiaoban_hub::{Hub, HubConfig};

#[derive(Debug, Parser)]
#[command(name = "xiaoban-hub", version, about = "小伴中枢（无界面运行）")]
struct Args {
    #[arg(long, env = "XIAOBAN_DATA_DIR", default_value = "./data")]
    data_dir: PathBuf,
    #[arg(long, env = "XIAOBAN_BIND", default_value = "0.0.0.0:47100")]
    bind: SocketAddr,
    #[arg(long, env = "XIAOBAN_NAME", default_value = "小伴")]
    name: String,
    #[arg(
        long,
        env = "XIAOBAN_MODEL_BASE_URL",
        default_value = "https://api.deepseek.com"
    )]
    model_base_url: String,
    #[arg(long, env = "XIAOBAN_MODEL", default_value = "deepseek-v4-flash")]
    model: String,
    #[arg(long, env = "XIAOBAN_API_KEY", hide_env_values = true)]
    api_key: Option<String>,
    #[arg(long)]
    no_advertise: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();
    let args = Args::parse();

    let agent = if let Some(api_key) = args.api_key {
        Agent::new(OpenAiCompatible::new(OpenAiConfig {
            base_url: args.model_base_url,
            api_key,
            model: args.model,
        }))
    } else {
        tracing::warn!("XIAOBAN_API_KEY is not set; replies will fail until a model is connected");
        Agent::new(UnconfiguredProvider)
    };

    let hub = Hub::start(
        HubConfig {
            data_dir: Some(args.data_dir),
            bind: args.bind,
            name: args.name,
            advertise: !args.no_advertise,
        },
        agent,
    )
    .await?;

    tokio::signal::ctrl_c().await?;
    hub.shutdown().await;
    Ok(())
}
