use fluent_bundle::concurrent::FluentBundle;
use fluent_bundle::{FluentArgs, FluentResource, FluentValue};
use unic_langid::LanguageIdentifier;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Key {
    id: &'static str,
    args: &'static [&'static str],
}

impl Key {
    const fn new(id: &'static str, args: &'static [&'static str]) -> Self {
        Self { id, args }
    }

    pub const fn id(self) -> &'static str {
        self.id
    }

    pub const fn args(self) -> &'static [&'static str] {
        self.args
    }
}

pub mod keys {
    use super::Key;
    include!(concat!(env!("OUT_DIR"), "/keys.rs"));
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum Locale {
    #[default]
    ZhCn,
    En,
}

impl Locale {
    pub const ALL: [Self; 2] = [Self::ZhCn, Self::En];

    pub fn negotiate(tag: &str) -> Self {
        if tag.to_ascii_lowercase().starts_with("zh") {
            Self::ZhCn
        } else {
            Self::En
        }
    }

    pub const fn tag(self) -> &'static str {
        match self {
            Self::ZhCn => "zh-CN",
            Self::En => "en",
        }
    }

    const fn source(self) -> &'static str {
        match self {
            Self::ZhCn => include_str!("../../../locales/zh-CN/main.ftl"),
            Self::En => include_str!("../../../locales/en/main.ftl"),
        }
    }
}

pub struct Localizer {
    locale: Locale,
    bundle: FluentBundle<FluentResource>,
}

impl std::fmt::Debug for Localizer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Localizer")
            .field("locale", &self.locale)
            .finish_non_exhaustive()
    }
}

impl Localizer {
    pub fn new(locale: Locale) -> Self {
        let langid: LanguageIdentifier = locale.tag().parse().unwrap_or_default();
        let resource = FluentResource::try_new(locale.source().to_owned())
            .unwrap_or_else(|(resource, _)| resource);
        let mut bundle = FluentBundle::new_concurrent(vec![langid]);
        bundle.set_use_isolating(false);
        bundle
            .add_resource(resource)
            .unwrap_or_else(|errors| panic!("duplicate Fluent messages: {errors:?}"));
        Self { locale, bundle }
    }

    pub fn locale(&self) -> Locale {
        self.locale
    }

    pub fn text(&self, key: Key) -> String {
        self.format(key, &[])
    }

    pub fn format(&self, key: Key, args: &[(&'static str, &str)]) -> String {
        debug_assert_eq!(
            key.args().len(),
            args.len(),
            "wrong number of arguments for {}",
            key.id()
        );
        let Some(pattern) = self.bundle.get_message(key.id()).and_then(|m| m.value()) else {
            return key.id().to_owned();
        };
        let mut fluent_args = FluentArgs::new();
        for (name, value) in args {
            fluent_args.set(*name, FluentValue::from(*value));
        }
        let mut errors = Vec::new();
        self.bundle
            .format_pattern(pattern, Some(&fluent_args), &mut errors)
            .into_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_key_resolves_in_every_locale() {
        for locale in Locale::ALL {
            let localizer = Localizer::new(locale);
            for key in keys::ALL {
                let args: Vec<_> = key.args().iter().map(|name| (*name, "1")).collect();
                let text = localizer.format(*key, &args);
                assert_ne!(text, key.id(), "{} missing in {}", key.id(), locale.tag());
                assert!(!text.contains('{'), "{} left a placeholder", key.id());
            }
        }
    }

    #[test]
    fn formats_arguments() {
        let zh = Localizer::new(Locale::ZhCn);
        assert_eq!(
            zh.format(keys::DRAFT_ELAPSED, &[("seconds", "4")]),
            "已想 4 秒"
        );
        let en = Localizer::new(Locale::En);
        assert_eq!(
            en.format(keys::DRAFT_ELAPSED, &[("seconds", "4")]),
            "Thought for 4 s"
        );
    }

    #[test]
    fn negotiates_locale_tags() {
        assert_eq!(Locale::negotiate("zh-Hans-CN"), Locale::ZhCn);
        assert_eq!(Locale::negotiate("en-US"), Locale::En);
        assert_eq!(Locale::negotiate("fr"), Locale::En);
    }
}
