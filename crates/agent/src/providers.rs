use xiaoban_protocol::{ModelApi, ModelInfo, ProviderId};

use crate::{AgentError, OpenAiConfig};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProviderPreset {
    pub id: ProviderId,
    pub base_url: &'static str,
    pub default_model: &'static str,
    pub models: &'static [&'static str],
    pub console_url: &'static str,
    pub key_env: &'static str,
}

pub const PRESETS: [ProviderPreset; 2] = [
    ProviderPreset {
        id: ProviderId::Deepseek,
        base_url: "https://api.deepseek.com",
        default_model: "deepseek-v4-flash",
        models: &["deepseek-v4-flash", "deepseek-v4-pro"],
        console_url: "https://platform.deepseek.com/api_keys",
        key_env: "DEEPSEEK_API_KEY",
    },
    ProviderPreset {
        id: ProviderId::Mimo,
        base_url: "https://api.xiaomimimo.com/v1",
        default_model: "mimo-v2.5-pro",
        models: &["mimo-v2.5-pro"],
        console_url: "https://platform.xiaomimimo.com",
        key_env: "MIMO_API_KEY",
    },
];

impl ProviderPreset {
    pub fn find(id: ProviderId) -> Option<&'static Self> {
        PRESETS.iter().find(|preset| preset.id == id)
    }

    pub fn config(&self, api_key: String, model: Option<String>) -> OpenAiConfig {
        OpenAiConfig {
            base_url: self.base_url.to_owned(),
            api_key,
            model: model.unwrap_or_else(|| self.default_model.to_owned()),
            api: ModelApi::OpenAi,
        }
    }

    pub fn from_env(&self) -> Option<OpenAiConfig> {
        std::env::var(self.key_env)
            .ok()
            .filter(|key| !key.trim().is_empty())
            .map(|key| self.config(key, None))
    }
}

pub fn normalize_base_url(raw: &str) -> Result<String, AgentError> {
    let invalid = || AgentError::InvalidEndpoint(raw.to_owned());
    let mut url = reqwest::Url::parse(raw.trim()).map_err(|_| invalid())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(invalid());
    }
    url.set_query(None);
    url.set_fragment(None);
    let path = url.path().trim_end_matches('/');
    let path = path
        .strip_suffix("/chat/completions")
        .or_else(|| path.strip_suffix("/messages"))
        .or_else(|| path.strip_suffix("/responses"))
        .or_else(|| path.strip_suffix("/models"))
        .unwrap_or(path)
        .to_owned();
    url.set_path(&path);
    Ok(url.as_str().trim_end_matches('/').to_owned())
}

#[derive(Debug, Clone)]
pub struct ConfiguredProvider {
    pub info: ModelInfo,
    pub config: OpenAiConfig,
}

impl ConfiguredProvider {
    pub fn new(preset: &ProviderPreset, config: OpenAiConfig) -> Self {
        Self {
            info: ModelInfo {
                provider: preset.id,
                model: config.model.clone(),
                label: None,
                base_url: None,
                api: ModelApi::OpenAi,
            },
            config,
        }
    }

    pub fn custom(
        base_url: &str,
        api_key: String,
        model: &str,
        label: Option<String>,
        api: ModelApi,
    ) -> Result<Self, AgentError> {
        let base_url = normalize_base_url(base_url)?;
        let model = model.trim().to_owned();
        if model.is_empty() {
            return Err(AgentError::UnknownModel {
                model,
                available: Vec::new(),
            });
        }
        Ok(Self {
            info: ModelInfo {
                provider: ProviderId::Custom,
                model: model.clone(),
                label: label
                    .map(|label| label.trim().to_owned())
                    .filter(|label| !label.is_empty()),
                base_url: Some(base_url.clone()),
                api,
            },
            config: OpenAiConfig {
                base_url,
                api_key,
                model,
                api,
            },
        })
    }

    #[must_use]
    pub fn with_model(mut self, model: String) -> Self {
        self.info.model.clone_from(&model);
        self.config.model = model;
        self
    }
}

pub fn first_configured_from_env() -> Option<ConfiguredProvider> {
    PRESETS.iter().find_map(|preset| {
        preset
            .from_env()
            .map(|config| ConfiguredProvider::new(preset, config))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_builtin_provider_has_exactly_one_preset() {
        for id in ProviderId::ALL {
            let count = PRESETS.iter().filter(|preset| preset.id == id).count();
            assert_eq!(count, usize::from(id != ProviderId::Custom));
        }
    }

    #[test]
    fn config_falls_back_to_the_preset_model() {
        let mimo = ProviderPreset::find(ProviderId::Mimo)
            .unwrap()
            .config("k".into(), None);
        assert_eq!(mimo.base_url, "https://api.xiaomimimo.com/v1");
        assert_eq!(mimo.model, "mimo-v2.5-pro");
    }

    #[test]
    fn normalizes_pasted_endpoints() {
        for (raw, expected) in [
            (
                "https://relay.example.com/v1",
                "https://relay.example.com/v1",
            ),
            (
                "https://relay.example.com/v1/",
                "https://relay.example.com/v1",
            ),
            (
                "https://relay.example.com/v1/chat/completions",
                "https://relay.example.com/v1",
            ),
            (
                " http://127.0.0.1:11434/v1/models ",
                "http://127.0.0.1:11434/v1",
            ),
            ("https://relay.example.com", "https://relay.example.com"),
        ] {
            assert_eq!(normalize_base_url(raw).unwrap(), expected, "{raw}");
        }
        for raw in [
            "relay.example.com/v1",
            "ftp://relay.example.com",
            "",
            "https://",
        ] {
            assert!(
                matches!(normalize_base_url(raw), Err(AgentError::InvalidEndpoint(_))),
                "{raw}"
            );
        }
    }

    #[test]
    fn custom_providers_keep_label_and_endpoint() {
        let custom = ConfiguredProvider::custom(
            "https://relay.example.com/v1/chat/completions",
            "k".into(),
            " gpt-x ",
            Some(" 我的中转站 ".into()),
            ModelApi::OpenAi,
        )
        .unwrap();
        assert_eq!(custom.info.provider, ProviderId::Custom);
        assert_eq!(custom.info.model, "gpt-x");
        assert_eq!(custom.info.label.as_deref(), Some("我的中转站"));
        assert_eq!(custom.config.base_url, "https://relay.example.com/v1");
        assert!(matches!(
            ConfiguredProvider::custom(
                "https://r.example.com",
                "k".into(),
                " ",
                None,
                ModelApi::OpenAi
            ),
            Err(AgentError::UnknownModel { .. })
        ));
    }
}
