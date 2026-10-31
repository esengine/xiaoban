use xiaoban_protocol::{ModelInfo, ProviderId};

use crate::OpenAiConfig;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProviderPreset {
    pub id: ProviderId,
    pub base_url: &'static str,
    pub default_model: &'static str,
    pub key_env: &'static str,
}

pub const PRESETS: [ProviderPreset; 2] = [
    ProviderPreset {
        id: ProviderId::Deepseek,
        base_url: "https://api.deepseek.com",
        default_model: "deepseek-v4-flash",
        key_env: "DEEPSEEK_API_KEY",
    },
    ProviderPreset {
        id: ProviderId::Mimo,
        base_url: "https://api.xiaomimimo.com/v1",
        default_model: "mimo-v2.5-pro",
        key_env: "MIMO_API_KEY",
    },
];

impl ProviderPreset {
    pub fn of(id: ProviderId) -> &'static Self {
        PRESETS
            .iter()
            .find(|preset| preset.id == id)
            .expect("every provider id has a preset")
    }

    pub fn config(&self, api_key: String, model: Option<String>) -> OpenAiConfig {
        OpenAiConfig {
            base_url: self.base_url.to_owned(),
            api_key,
            model: model.unwrap_or_else(|| self.default_model.to_owned()),
        }
    }

    pub fn from_env(&self) -> Option<OpenAiConfig> {
        std::env::var(self.key_env)
            .ok()
            .filter(|key| !key.trim().is_empty())
            .map(|key| self.config(key, None))
    }
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
            },
            config,
        }
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
    fn every_provider_id_has_exactly_one_preset() {
        for id in ProviderId::ALL {
            assert_eq!(PRESETS.iter().filter(|preset| preset.id == id).count(), 1);
        }
    }

    #[test]
    fn config_falls_back_to_the_preset_model() {
        let mimo = ProviderPreset::of(ProviderId::Mimo).config("k".into(), None);
        assert_eq!(mimo.base_url, "https://api.xiaomimimo.com/v1");
        assert_eq!(mimo.model, "mimo-v2.5-pro");
        let preset = ProviderPreset::of(ProviderId::Deepseek);
        let configured = ConfiguredProvider::new(preset, preset.config("k".into(), None))
            .with_model("deepseek-v4-pro".into());
        assert_eq!(configured.config.model, "deepseek-v4-pro");
        assert_eq!(configured.info.model, "deepseek-v4-pro");
    }
}
