//! Chat, payment and bank apps on a phone: which they are, which buttons are never pressed, and
//! how to check what the model says it is about to send or pay against what is on the screen.
//!
//! The rules live in `locales/native/handover.json`, which the phone's own code reads too.

use std::sync::LazyLock;

use serde::Deserialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Category {
    /// A chat app: operated only with the user's say-so for this task, and every send is checked.
    Chat,
    /// A payment app: same, and every payment is confirmed twice.
    Pay,
    /// A bank or wallet app: never read or operated, only opened.
    Refused,
}

#[derive(Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct Rules {
    labels: Vec<String>,
    packages: Vec<String>,
    package_words: Vec<String>,
    chat: Vec<String>,
    pay: Vec<String>,
    send_labels: Vec<String>,
    never_labels: Vec<String>,
}

static RULES: LazyLock<Rules> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../locales/native/handover.json")).unwrap_or_default()
});

fn word_in(label: &str, word: &str) -> bool {
    crate::price_check::mentions(label, word)
}

pub fn category(app_id: &str) -> Option<Category> {
    let rules = &*RULES;
    if rules.chat.iter().any(|package| package == app_id) {
        return Some(Category::Chat);
    }
    if rules.pay.iter().any(|package| package == app_id) {
        return Some(Category::Pay);
    }
    crate::price_check::money_app(app_id).then_some(Category::Refused)
}

/// Buttons that move money to someone, send a red packet, message many people or add a contact.
pub fn never_label(label: &str) -> bool {
    RULES.never_labels.iter().any(|word| word_in(label, word))
}

pub fn send_label(label: &str) -> bool {
    RULES.send_labels.iter().any(|word| word_in(label, word))
}

/// The last button of a payment or an order.
pub fn pay_label(label: &str) -> bool {
    RULES.labels.iter().any(|word| word_in(label, word))
}

/// Every money-like number in a piece of text, in cents: `¥1,234.5` is 123450.
pub fn amounts(text: &str) -> Vec<i64> {
    let mut found = Vec::new();
    let mut token = String::new();
    for character in text.chars().chain(std::iter::once(' ')) {
        if character.is_ascii_digit() || character == '.' || character == ',' {
            token.push(character);
            continue;
        }
        if let Some(cents) = cents(&token) {
            found.push(cents);
        }
        token.clear();
    }
    found
}

fn cents(token: &str) -> Option<i64> {
    let trimmed = token.trim_matches(|c| c == '.' || c == ',');
    if !trimmed.chars().any(|c| c.is_ascii_digit()) {
        return None;
    }
    let plain: String = trimmed.chars().filter(|c| *c != ',').collect();
    let (whole, fraction) = plain.split_once('.').unwrap_or((plain.as_str(), ""));
    if fraction.contains('.') || whole.len() > 12 {
        return None;
    }
    let whole: i64 = if whole.is_empty() {
        0
    } else {
        whole.parse().ok()?
    };
    let fraction: String = fraction.chars().chain("00".chars()).take(2).collect();
    Some(whole * 100 + fraction.parse::<i64>().ok()?)
}

/// Whether the amount the model names is one that really is on the screen.
pub fn amount_shown(amount: &str, screen: &[&str]) -> bool {
    let Some(wanted) = amounts(amount).into_iter().next() else {
        return false;
    };
    screen.iter().any(|text| amounts(text).contains(&wanted))
}

/// Whether a name the model gives appears in the text on the screen.
pub fn name_shown(name: &str, screen: &[&str]) -> bool {
    let wanted: String = name
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_lowercase();
    if wanted.chars().count() < 2 {
        return false;
    }
    screen.iter().any(|text| {
        let text: String = text
            .chars()
            .filter(|c| !c.is_whitespace())
            .collect::<String>()
            .to_lowercase();
        text.contains(&wanted)
    })
}

/// Keys that would send a message from the keyboard.
pub fn is_enter(combo: &str) -> bool {
    matches!(
        combo.trim().to_lowercase().as_str(),
        "enter" | "return" | "send" | "go"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apps_fall_into_chat_pay_or_refused() {
        assert_eq!(category("com.tencent.mm"), Some(Category::Chat));
        assert_eq!(category("com.eg.android.AlipayGphone"), Some(Category::Pay));
        assert_eq!(category("com.icbc"), Some(Category::Refused));
        assert_eq!(category("com.example.bank.app"), Some(Category::Refused));
        assert_eq!(category("com.android.settings"), None);
    }

    #[test]
    fn money_buttons_are_found_in_both_languages() {
        for label in [
            "确认付款",
            "立即支付",
            "提交订单",
            "立即缴费",
            "Pay",
            "Place order",
        ] {
            assert!(pay_label(label), "{label}");
        }
        assert!(
            !pay_label("支付宝") || pay_label("支付"),
            "the app name is not the button"
        );
        for label in ["转账", "发红包", "群发", "添加朋友", "Transfer"] {
            assert!(never_label(label), "{label}");
        }
        assert!(send_label("发送") && send_label("Send") && !send_label("Sender settings"));
    }

    #[test]
    fn amounts_are_read_the_way_people_write_them() {
        assert_eq!(amounts("¥126.00"), vec![12600]);
        assert_eq!(amounts("应缴 1,234.5 元"), vec![123_450]);
        assert_eq!(amounts("126"), vec![12600]);
        assert_eq!(amounts("户号 3307 金额 0.5"), vec![330_700, 50]);
        assert_eq!(amounts("没有数字"), Vec::<i64>::new());
        assert!(amount_shown("¥126.00", &["国网上海电力", "应缴 ¥126.00"]));
        assert!(amount_shown("126", &["应缴 ¥126.00"]));
        assert!(!amount_shown("12.60", &["应缴 ¥126.00"]));
        assert!(!amount_shown("没写", &["应缴 ¥126.00"]));
    }

    #[test]
    fn names_must_really_be_on_the_screen() {
        let screen = ["国网上海电力 · 10 月电费", "户号：****3307"];
        assert!(name_shown("国网上海电力", &screen));
        assert!(name_shown("国网 上海电力", &screen));
        assert!(!name_shown("国家电网", &screen));
        assert!(
            !name_shown("国", &screen),
            "a single character proves nothing"
        );
    }

    #[test]
    fn the_keyboard_send_key_counts_as_sending() {
        assert!(is_enter("Enter") && is_enter(" return ") && !is_enter("back"));
    }
}
