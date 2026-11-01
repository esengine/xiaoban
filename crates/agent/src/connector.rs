use std::sync::Arc;

use futures_util::future::BoxFuture;

use xiaoban_protocol::ModelApi;

use crate::{AgentError, Anthropic, ModelProvider, OpenAiCompatible, OpenAiConfig};

pub trait Connector: std::fmt::Debug + Send + Sync + 'static {
    fn provider(&self, config: OpenAiConfig) -> Arc<dyn ModelProvider>;
    fn check(
        &self,
        config: OpenAiConfig,
        verify_model: bool,
    ) -> BoxFuture<'static, Result<(), AgentError>>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct HttpConnector;

impl Connector for HttpConnector {
    fn provider(&self, config: OpenAiConfig) -> Arc<dyn ModelProvider> {
        match config.api {
            ModelApi::OpenAi => Arc::new(OpenAiCompatible::new(config)),
            ModelApi::Anthropic => Arc::new(Anthropic::new(config)),
        }
    }

    fn check(
        &self,
        config: OpenAiConfig,
        verify_model: bool,
    ) -> BoxFuture<'static, Result<(), AgentError>> {
        Box::pin(async move {
            match config.api {
                ModelApi::OpenAi => OpenAiCompatible::new(config).check(verify_model).await,
                ModelApi::Anthropic => Anthropic::new(config).check().await,
            }
        })
    }
}
