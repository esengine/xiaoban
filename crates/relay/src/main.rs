use std::net::SocketAddr;

use clap::Parser;
use tracing_subscriber::EnvFilter;
use xiaoban_relay::Relay;

#[derive(Debug, Parser)]
#[command(
    name = "xiaoban-relay",
    version,
    about = "Self-hosted Xiaoban relay: forwards encrypted frames, stores nothing, has no accounts"
)]
struct Args {
    #[arg(long, env = "XIAOBAN_RELAY_BIND", default_value = "0.0.0.0:8443")]
    bind: SocketAddr,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();
    let args = Args::parse();
    let listener = tokio::net::TcpListener::bind(args.bind).await?;
    tracing::info!(addr = %listener.local_addr()?, "relay listening");
    axum::serve(listener, Relay::default().router())
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
