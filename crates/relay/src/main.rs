use std::net::SocketAddr;

use clap::Parser;
use tracing_subscriber::EnvFilter;
use xiaoban_relay::Relay;

#[derive(Debug, Parser)]
#[command(
    name = "xiaoban-relay",
    version,
    about = "小伴自建中转：只转发加密数据，不保存、不认账号"
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
