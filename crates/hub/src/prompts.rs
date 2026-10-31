use xiaoban_i18n::{Locale, Localizer, keys};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Prompts {
    pub chat: String,
    pub interpret_answer: String,
}

impl Prompts {
    pub fn for_locale(locale: Locale) -> Self {
        let localizer = Localizer::new(locale);
        Self {
            chat: format!(
                "{}\n\n{}\n\n{}",
                localizer.text(keys::PROMPT_SYSTEM),
                localizer.text(keys::PROMPT_MEMORY_POLICY),
                localizer.text(keys::PROMPT_TOOL_POLICY)
            ),
            interpret_answer: localizer.text(keys::PROMPT_INTERPRET_ANSWER),
        }
    }
}
