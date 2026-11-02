use std::sync::LazyLock;

use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{ConfirmChoice, ConfirmKind};

use crate::operate::Snapshot;
use crate::tools::HubTools;

pub const CHECK: &str = "check_price_in_app";
pub const NOTE: &str = "note_app_price";
const DEFAULT_WANTED: u32 = 3;
const MAX_WANTED: u32 = 5;

#[derive(Debug, Default, Deserialize)]
struct Handover {
    #[serde(default)]
    labels: Vec<String>,
    #[serde(default)]
    packages: Vec<String>,
    #[serde(default, rename = "packageWords")]
    package_words: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ReadOnly {
    #[serde(default)]
    buttons: Vec<String>,
    #[serde(default)]
    fields: Vec<String>,
}

struct Rules {
    buttons: Vec<String>,
    fields: Vec<String>,
    packages: Vec<String>,
    package_words: Vec<String>,
}

static RULES: LazyLock<Rules> = LazyLock::new(|| {
    let handover: Handover =
        serde_json::from_str(include_str!("../../../locales/native/handover.json")).unwrap_or_default();
    let read_only: ReadOnly =
        serde_json::from_str(include_str!("../../../locales/native/price-check.json")).unwrap_or_default();
    let mut buttons = handover.labels;
    buttons.extend(read_only.buttons);
    Rules {
        buttons,
        fields: read_only.fields,
        packages: handover.packages,
        package_words: handover.package_words,
    }
});

pub(crate) fn mentions(label: &str, word: &str) -> bool {
    if !word.is_ascii() {
        return label.contains(word);
    }
    let label = label.to_lowercase();
    let word = word.to_lowercase();
    let mut from = 0;
    while let Some(found) = label[from..].find(&word) {
        let start = from + found;
        let end = start + word.len();
        let before = label[..start].chars().next_back();
        let after = label[end..].chars().next();
        let edge = |c: Option<char>| c.is_none_or(|c| !c.is_alphanumeric());
        if edge(before) && edge(after) {
            return true;
        }
        from = start + word.len().max(1);
    }
    false
}

pub fn forbidden_button(label: &str) -> bool {
    RULES.buttons.iter().any(|word| mentions(label, word))
}

pub fn private_field(label: &str) -> bool {
    RULES.fields.iter().any(|word| mentions(label, word))
}

pub fn money_app(app_id: &str) -> bool {
    let lower = app_id.to_lowercase();
    RULES.packages.iter().any(|package| package == app_id)
        || RULES.package_words.iter().any(|word| {
            lower.split('.').any(|part| part == word) || lower.contains(&format!(".{word}"))
        })
}

#[derive(Debug, Clone)]
pub struct PriceCheck {
    app_id: String,
    app: String,
    wanted: u32,
    noted: Vec<(String, i64)>,
}

fn text(l: &Localizer, key: xiaoban_i18n::Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

pub fn specs(l: &Localizer) -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: CHECK.to_owned(),
            description: l.text(keys::TOOL_CHECK_PRICE_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "app": text(l, keys::TOOL_CHECK_PRICE_APP),
                    "name": text(l, keys::TOOL_CHECK_PRICE_NAME),
                    "item": text(l, keys::TOOL_CHECK_PRICE_ITEM),
                    "detail": text(l, keys::TOOL_CHECK_PRICE_DETAIL),
                    "wanted": { "type": "integer", "minimum": 1, "maximum": MAX_WANTED, "description": l.text(keys::TOOL_CHECK_PRICE_WANTED) },
                },
                "required": ["app", "name", "item", "detail"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: NOTE.to_owned(),
            description: l.text(keys::TOOL_NOTE_PRICE_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "label": text(l, keys::TOOL_NOTE_PRICE_LABEL),
                    "amount": { "type": "number", "minimum": 0, "description": l.text(keys::TOOL_NOTE_PRICE_AMOUNT) },
                },
                "required": ["label", "amount"],
                "additionalProperties": false,
            }),
        },
    ]
}

#[derive(Deserialize)]
struct CheckArgs {
    app: String,
    item: String,
    detail: String,
    wanted: Option<u32>,
}

#[derive(Deserialize)]
struct NoteArgs {
    label: String,
    amount: f64,
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

impl HubTools<'_> {
    pub(crate) fn record_screen(&self, app_id: &str, snapshot: &Snapshot) {
        let mut texts: Vec<&str> = snapshot
            .elements
            .iter()
            .flat_map(|element| std::iter::once(element.label.as_str()).chain(element.value.as_deref()))
            .collect();
        if let Some(window) = snapshot.window.as_deref() {
            texts.push(window);
        }
        self.evidence
            .lock()
            .unwrap()
            .saw_screen(app_id, &snapshot.app, texts);
        self.screens
            .lock()
            .unwrap()
            .insert(app_id.to_owned(), snapshot.elements.clone());
        self.labels.lock().unwrap().insert(
            app_id.to_owned(),
            snapshot
                .elements
                .iter()
                .map(|element| (element.index, element.label.clone()))
                .collect(),
        );
    }

    pub(crate) fn price_app_guard(&self, app_id: &str) -> Result<(), String> {
        let check = self.price_check.lock().unwrap();
        match check.as_ref() {
            Some(check) if check.app_id != app_id => Err(error(&format!(
                "a read-only price check of {} is running; do not operate any other app in this reply",
                check.app
            ))),
            _ => Ok(()),
        }
    }

    pub(crate) fn price_step_guard(&self, app_id: &str, element: u32, typing: bool) -> Result<(), String> {
        if self.price_check.lock().unwrap().is_none() {
            return Ok(());
        }
        let label = self
            .labels
            .lock()
            .unwrap()
            .get(app_id)
            .and_then(|labels| labels.get(&element).cloned());
        let Some(label) = label else {
            return Err(
                "read-only price check: look at the app first so Xiaoban can see what this element is".to_owned(),
            );
        };
        if typing && private_field(&label) {
            return Err(format!(
                "read-only price check: Xiaoban never types into \"{label}\" (no personal details, no sign-in); search with the search box only"
            ));
        }
        if !typing && forbidden_button(&label) {
            return Err(format!(
                "read-only price check: Xiaoban never presses \"{label}\" (no sign-in, no booking, no ordering, no payment); read the price that is shown and stop there"
            ));
        }
        Ok(())
    }

    fn island(&self, check: &PriceCheck) {
        let n = check.noted.len().to_string();
        let total = check.wanted.to_string();
        let title = self.state.localizer.format(
            keys::PRICE_CHECK_ISLAND,
            &[("app", &check.app), ("n", &n), ("total", &total)],
        );
        self.state.operator.status(Some(title));
    }

    pub(crate) fn end_price_check(&self) {
        if self.price_check.lock().unwrap().take().is_some() {
            self.state.operator.status(None);
        }
    }

    pub(crate) async fn check_price(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<CheckArgs>(arguments) else {
            return error("arguments must be {app, name, item, detail, wanted?}");
        };
        if self.price_check.lock().unwrap().is_some() {
            return error("a price check is already running in this reply; finish it first");
        }
        let apps = self.state.apps.list().await;
        let Some(app) = apps.into_iter().find(|app| app.id == args.app) else {
            return error("unknown app id; call find_apps first and use an id it returned");
        };
        if money_app(&app.id) {
            return error(
                "this is a chat, payment or banking app; prices are never checked there. Pick a travel or shopping app instead, or leave the price empty for the user to fill in",
            );
        }
        let choice = self
            .ask(ConfirmKind::PriceCheck {
                app: app.name.clone(),
                item: args.item.trim().to_owned(),
                detail: args.detail.trim().to_owned(),
                phone: self.state.operator.is_phone(),
            })
            .await;
        if !matches!(choice, ConfirmChoice::Yes | ConfirmChoice::Once | ConfirmChoice::Always) {
            return json!({
                "answer": "no",
                "next": "the user will fill this price in themselves. Save it with source none and an empty amount; never put a remembered or guessed number there",
            })
            .to_string();
        }
        let check = PriceCheck {
            app_id: app.id.clone(),
            app: app.name.clone(),
            wanted: args.wanted.unwrap_or(DEFAULT_WANTED).clamp(1, MAX_WANTED),
            noted: Vec::new(),
        };
        self.island(&check);
        {
            let mut allowed = self.allowed_once.lock().unwrap();
            if !allowed.contains(&app.id) {
                allowed.push(app.id.clone());
            }
        }
        *self.price_check.lock().unwrap() = Some(check);
        json!({
            "answer": "yes",
            "app": app.id,
            "next": "read-only price check is on for this app only. Use look_at_app, type into the search box, pick dates and the number of people, then read the prices on the result list. Every time you read a price, call note_app_price with the exact number on screen. Sign-in, booking, ordering and payment buttons are blocked, and personal-detail fields cannot be typed into. When done, save the prices with source app and this app's name; anything you could not read stays source none",
        })
        .to_string()
    }

    pub(crate) fn note_price(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<NoteArgs>(arguments) else {
            return error("arguments must be {label, amount}");
        };
        let Some(cents) = crate::price::cents(args.amount) else {
            return error("amount must be a number");
        };
        let mut slot = self.price_check.lock().unwrap();
        let Some(check) = slot.as_mut() else {
            return error("no price check is running; call check_price_in_app first");
        };
        if !self.evidence.lock().unwrap().screen_shows(&check.app_id, cents) {
            return error(
                "that amount is not on any screen you read in this app; look at the app again and copy the number exactly as shown",
            );
        }
        let label = args.label.trim().to_owned();
        if !check.noted.iter().any(|(known, value)| *known == label && *value == cents) {
            check.noted.push((label, cents));
        }
        let snapshot = check.clone();
        drop(slot);
        self.island(&snapshot);
        json!({
            "noted": snapshot.noted.len(),
            "wanted": snapshot.wanted,
            "app": snapshot.app,
        })
        .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn booking_and_paying_are_blocked() {
        assert!(forbidden_button("立即预订"));
        assert!(forbidden_button("去支付 ¥680"));
        assert!(forbidden_button("Sign in"));
        assert!(forbidden_button("Book now"));
        assert!(!forbidden_button("Facebook"));
        assert!(!forbidden_button("搜索"));
        assert!(!forbidden_button("11/14 入住"));
        assert!(private_field("手机号"));
        assert!(private_field("Password"));
        assert!(!private_field("目的地/酒店/关键词"));
        assert!(money_app("com.eg.android.AlipayGphone"));
        assert!(money_app("com.tencent.mm"));
        assert!(!money_app("ctrip.android.view"));
    }
}
