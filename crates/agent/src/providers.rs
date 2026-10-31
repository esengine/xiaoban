use crate::OpenAiConfig;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ProviderPreset {
    DeepSeek,
    Mimo,
}

impl ProviderPreset {
    pub const ALL: [Self; 2] = [Self::DeepSeek, Self::Mimo];

    pub const fn id(self) -> &'static str {
        match self {
            Self::DeepSeek => "deepseek",
            Self::Mimo => "mimo",
        }
    }

    pub fn parse(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|preset| preset.id() == id)
    }

    pub const fn base_url(self) -> &'static str {
        match self {
            Self::DeepSeek => "https://api.deepseek.com",
            Self::Mimo => "https://api.xiaomimimo.com/v1",
        }
    }

    pub const fn default_model(self) -> &'static str {
        match self {
            Self::DeepSeek => "deepseek-v4-flash",
            Self::Mimo => "mimo-v2.5-pro",
        }
    }

    pub const fn key_env(self) -> &'static str {
        match self {
            Self::DeepSeek => "DEEPSEEK_API_KEY",
            Self::Mimo => "MIMO_API_KEY",
        }
    }

    pub fn config(self, api_key: String, model: Option<String>) -> OpenAiConfig {
        OpenAiConfig {
            base_url: self.base_url().to_owned(),
            api_key,
            model: model.unwrap_or_else(|| self.default_model().to_owned()),
        }
    }

    pub fn from_env(self) -> Option<OpenAiConfig> {
        std::env::var(self.key_env())
            .ok()
            .filter(|key| !key.trim().is_empty())
            .map(|key| self.config(key, None))
    }
}

pub fn first_configured_from_env() -> Option<(ProviderPreset, OpenAiConfig)> {
    ProviderPreset::ALL
        .into_iter()
        .find_map(|preset| preset.from_env().map(|config| (preset, config)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_round_trip_by_id() {
        for preset in ProviderPreset::ALL {
            assert_eq!(ProviderPreset::parse(preset.id()), Some(preset));
        }
        assert_eq!(ProviderPreset::parse("unknown"), None);
    }

    #[test]
    fn config_falls_back_to_the_preset_model() {
        let config = ProviderPreset::Mimo.config("k".into(), None);
        assert_eq!(config.base_url, "https://api.xiaomimimo.com/v1");
        assert_eq!(config.model, "mimo-v2.5-pro");
        let config = ProviderPreset::DeepSeek.config("k".into(), Some("deepseek-v4-pro".into()));
        assert_eq!(config.model, "deepseek-v4-pro");
    }
}
