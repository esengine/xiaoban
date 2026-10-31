use std::fmt::Debug;

use futures_util::future::BoxFuture;
use serde::Serialize;

pub const MAX_MATCHES: usize = 8;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppEntry {
    pub id: String,
    pub name: String,
    pub aliases: Vec<String>,
}

impl AppEntry {
    fn matches(&self, needle: &str) -> bool {
        std::iter::once(&self.name)
            .chain(&self.aliases)
            .any(|text| text.to_lowercase().contains(needle))
    }
}

pub trait Apps: Debug + Send + Sync + 'static {
    fn list(&self) -> BoxFuture<'static, Vec<AppEntry>>;
    fn open(&self, id: String) -> BoxFuture<'static, Result<(), String>>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct NoApps;

impl Apps for NoApps {
    fn list(&self) -> BoxFuture<'static, Vec<AppEntry>> {
        Box::pin(async { Vec::new() })
    }

    fn open(&self, _: String) -> BoxFuture<'static, Result<(), String>> {
        Box::pin(async { Err("this hub cannot open apps".to_owned()) })
    }
}

pub fn find(apps: &[AppEntry], query: &str) -> Vec<AppEntry> {
    let needles: Vec<String> = query
        .split([' ', ',', '\u{ff0c}', '\u{3001}'])
        .map(|part| part.trim().to_lowercase())
        .filter(|part| !part.is_empty())
        .collect();
    let mut found: Vec<AppEntry> = apps
        .iter()
        .filter(|app| needles.iter().any(|needle| app.matches(needle)))
        .cloned()
        .collect();
    found.sort_by_key(|app| app.name.chars().count());
    found.truncate(MAX_MATCHES);
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    fn app(id: &str, name: &str, alias: &str) -> AppEntry {
        AppEntry {
            id: id.into(),
            name: name.into(),
            aliases: vec![alias.into()],
        }
    }

    #[test]
    fn finds_by_any_word_in_name_or_alias() {
        let apps = [
            app("com.tencent.xinWeChat", "微信", "WeChat"),
            app("com.tencent.meeting", "腾讯会议", "TencentMeeting"),
            app("com.apple.Keynote", "Keynote 讲演", "Keynote"),
        ];
        let found = find(&apps, "wechat 会议");
        assert_eq!(
            found
                .iter()
                .map(|app| app.name.as_str())
                .collect::<Vec<_>>(),
            ["微信", "腾讯会议"]
        );
        assert_eq!(find(&apps, "  ").len(), 0);
    }
}
