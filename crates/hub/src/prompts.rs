use xiaoban_i18n::{Locale, Localizer, keys};
use xiaoban_protocol::ThreadKind;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Prompts {
    pub chat: String,
    pub onboarding: String,
}

impl Prompts {
    pub fn for_locale(locale: Locale) -> Self {
        let localizer = Localizer::new(locale);
        let chat = format!(
            "{}\n\n{}",
            localizer.text(keys::PROMPT_SYSTEM),
            localizer.text(keys::PROMPT_MEMORY_POLICY)
        );
        let onboarding = format!("{chat}\n\n{}", localizer.text(keys::PROMPT_ONBOARDING));
        Self { chat, onboarding }
    }

    pub fn for_kind(&self, kind: ThreadKind) -> &str {
        match kind {
            ThreadKind::Chat => &self.chat,
            ThreadKind::Onboarding => &self.onboarding,
        }
    }
}
