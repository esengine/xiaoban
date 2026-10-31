use std::sync::Arc;

use futures_util::future::BoxFuture;

use crate::{AgentError, ModelProvider, OpenAiCompatible, OpenAiConfig};

pub trait Connector: std::fmt::Debug + Send + Sync + 'static {
    fn provider(&self, config: OpenAiConfig) -> Arc<dyn ModelProvider>;
    fn check(&self, config: OpenAiConfig) -> BoxFuture<'static, Result<(), AgentError>>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct HttpConnector;

impl Connector for HttpConnector {
    fn provider(&self, config: OpenAiConfig) -> Arc<dyn ModelProvider> {
        Arc::new(OpenAiCompatible::new(config))
    }

    fn check(&self, config: OpenAiConfig) -> BoxFuture<'static, Result<(), AgentError>> {
        Box::pin(async move { OpenAiCompatible::new(config).check().await })
    }
}
