use std::collections::HashSet;

use serde::Deserialize;
use serde_json::{Map, Value, json};
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{Price, PriceSource};

pub fn schema_properties(l: &Localizer) -> Map<String, Value> {
    let text = |key| json!({ "type": "string", "description": l.text(key) });
    let number = |key| json!({ "type": "number", "minimum": 0, "description": l.text(key) });
    let mut properties = Map::new();
    properties.insert("label".to_owned(), text(keys::TOOL_PRICE_LABEL));
    properties.insert("amount".to_owned(), number(keys::TOOL_PRICE_AMOUNT));
    properties.insert("unit_amount".to_owned(), number(keys::TOOL_PRICE_UNIT_AMOUNT));
    properties.insert(
        "quantity".to_owned(),
        json!({ "type": "integer", "minimum": 1, "description": l.text(keys::TOOL_PRICE_QUANTITY) }),
    );
    properties.insert("per".to_owned(), text(keys::TOOL_PRICE_PER));
    properties.insert(
        "source".to_owned(),
        json!({ "type": "string", "enum": ["web", "app", "estimate", "none"], "description": l.text(keys::TOOL_PRICE_SOURCE) }),
    );
    properties.insert("url".to_owned(), text(keys::TOOL_PRICE_URL));
    properties.insert("site".to_owned(), text(keys::TOOL_PRICE_SITE));
    properties.insert("app".to_owned(), text(keys::TOOL_PRICE_APP));
    properties.insert("basis".to_owned(), text(keys::TOOL_PRICE_BASIS));
    properties.insert("reason".to_owned(), text(keys::TOOL_PRICE_REASON));
    properties.insert("applies_to".to_owned(), text(keys::TOOL_PRICE_APPLIES_TO));
    properties
}

#[derive(Debug, Default, Clone)]
pub struct Evidence {
    links: HashSet<String>,
    screens: Vec<Screen>,
}

#[derive(Debug, Clone)]
struct Screen {
    app_id: String,
    app: String,
    amounts: HashSet<i64>,
}

pub fn link_key(url: &str) -> String {
    let url = url.trim();
    let url = url.split('#').next().unwrap_or(url);
    let url = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .unwrap_or(url);
    let url = url.strip_prefix("www.").unwrap_or(url);
    url.trim_end_matches('/').to_lowercase()
}

#[allow(clippy::cast_possible_truncation)]
pub fn cents(amount: f64) -> Option<i64> {
    (amount.is_finite() && amount >= 0.0 && amount < 1e12).then(|| (amount * 100.0).round() as i64)
}

pub fn amounts_in(text: &str) -> HashSet<i64> {
    let mut found = HashSet::new();
    let mut run = String::new();
    let flush = |run: &mut String, found: &mut HashSet<i64>| {
        let trimmed = run.trim_matches(|c| c == ',' || c == '.');
        let plain: String = trimmed.chars().filter(|c| *c != ',').collect();
        if !plain.is_empty()
            && let Ok(value) = plain.parse::<f64>()
            && let Some(value) = cents(value)
        {
            found.insert(value);
        }
        run.clear();
    };
    for c in text.chars() {
        if c.is_ascii_digit() || ((c == ',' || c == '.') && !run.is_empty()) {
            run.push(c);
        } else {
            flush(&mut run, &mut found);
        }
    }
    flush(&mut run, &mut found);
    found
}

fn same_app(a: &str, b: &str) -> bool {
    let a = a.trim().to_lowercase();
    let b = b.trim().to_lowercase();
    !a.is_empty() && !b.is_empty() && (a == b || a.contains(&b) || b.contains(&a))
}

impl Evidence {
    pub fn saw_link(&mut self, url: &str) {
        let key = link_key(url);
        if !key.is_empty() {
            self.links.insert(key);
        }
    }

    pub fn saw_screen<'a>(&mut self, app_id: &str, app: &str, texts: impl IntoIterator<Item = &'a str>) {
        let mut amounts = HashSet::new();
        for text in texts {
            amounts.extend(amounts_in(text));
        }
        if let Some(screen) = self.screens.iter_mut().find(|screen| screen.app_id == app_id) {
            screen.amounts.extend(amounts);
            if !app.is_empty() {
                app.clone_into(&mut screen.app);
            }
        } else {
            self.screens.push(Screen {
                app_id: app_id.to_owned(),
                app: app.to_owned(),
                amounts,
            });
        }
    }

    pub fn has_link(&self, url: &str) -> bool {
        self.links.contains(&link_key(url))
    }

    pub fn app_shows(&self, app: &str, cents: i64) -> bool {
        self.screens
            .iter()
            .filter(|screen| same_app(&screen.app, app) || screen.app_id == app.trim())
            .any(|screen| screen.amounts.contains(&cents))
    }

    pub fn screen_shows(&self, app_id: &str, cents: i64) -> bool {
        self.screens
            .iter()
            .any(|screen| screen.app_id == app_id && screen.amounts.contains(&cents))
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct PriceDraft {
    #[serde(default)]
    pub label: String,
    pub amount: Option<f64>,
    pub unit_amount: Option<f64>,
    pub quantity: Option<f64>,
    pub per: Option<String>,
    #[serde(default)]
    pub source: String,
    pub url: Option<String>,
    pub site: Option<String>,
    pub app: Option<String>,
    pub basis: Option<String>,
    pub reason: Option<String>,
    pub applies_to: Option<String>,
}

fn filled(text: Option<&String>) -> Option<String> {
    text.map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn quantity(value: Option<f64>) -> Option<u32> {
    value
        .filter(|value| value.is_finite() && *value >= 1.0 && *value <= 1000.0)
        .map(|value| value.round() as u32)
}

fn void(mut price: Price, voided: bool, reason: Option<String>) -> Price {
    price.cents = None;
    price.unit_cents = None;
    price.checked_at = None;
    price.source = PriceSource::None { reason, voided };
    price
}

fn same_source(a: &PriceSource, b: &PriceSource) -> bool {
    match (a, b) {
        (PriceSource::Web { url: a, .. }, PriceSource::Web { url: b, .. }) => link_key(a) == link_key(b),
        (PriceSource::App { app: a }, PriceSource::App { app: b }) => same_app(a, b),
        (PriceSource::User, PriceSource::User) => true,
        _ => false,
    }
}

pub fn check(draft: &PriceDraft, evidence: &Evidence, earlier: &[&Price], now: i64) -> Price {
    let unit = draft.unit_amount.and_then(cents);
    let count = quantity(draft.quantity);
    let total = match (unit, count) {
        (Some(unit), Some(count)) => Some(unit * i64::from(count)),
        (Some(unit), None) => draft.amount.and_then(cents).or(Some(unit)),
        _ => draft.amount.and_then(cents),
    };
    let mut price = Price {
        label: draft.label.trim().to_owned(),
        cents: total,
        unit_cents: unit,
        quantity: count.filter(|_| unit.is_some()),
        per: filled(draft.per.as_ref()),
        source: PriceSource::None {
            reason: None,
            voided: false,
        },
        checked_at: Some(now),
        applies_to: filled(draft.applies_to.as_ref()),
    };
    let reason = filled(draft.reason.as_ref());
    let source = match draft.source.trim() {
        "web" => filled(draft.url.as_ref()).map(|url| PriceSource::Web {
            site: filled(draft.site.as_ref()).unwrap_or_default(),
            url,
        }),
        "app" => filled(draft.app.as_ref()).map(|app| PriceSource::App { app }),
        "estimate" => filled(draft.basis.as_ref()).map(|basis| PriceSource::Estimate { basis }),
        _ => return void(price, false, reason),
    };
    let Some(source) = source else {
        return void(price, total.is_some(), reason);
    };
    let Some(total) = total else {
        return void(price, false, reason);
    };
    if let Some(previous) = earlier
        .iter()
        .find(|previous| previous.cents == Some(total) && same_source(&previous.source, &source))
    {
        let mut kept = (*previous).clone();
        kept.label.clone_from(&price.label);
        return kept;
    }
    let trusted = match &source {
        PriceSource::Web { url, .. } => evidence.has_link(url),
        PriceSource::App { app } => evidence.app_shows(app, unit.unwrap_or(total)),
        PriceSource::Estimate { .. } => true,
        PriceSource::User | PriceSource::None { .. } => false,
    };
    if !trusted {
        return void(price, true, reason);
    }
    if matches!(source, PriceSource::Estimate { .. }) {
        price.checked_at = None;
    }
    price.source = source;
    price
}

#[cfg(test)]
mod tests {
    use super::*;

    fn draft(json: &str) -> PriceDraft {
        serde_json::from_str(json).unwrap()
    }

    fn searched() -> Evidence {
        let mut evidence = Evidence::default();
        evidence.saw_link("https://www.lingyinsi.org/tickets/");
        evidence.saw_screen(
            "ctrip.android.view",
            "携程旅行",
            ["西湖边 · 某亲子酒店", "¥680/晚起", "龙翔桥地铁站旁 · 某酒店", "¥1,480"],
        );
        evidence
    }

    #[test]
    fn reads_amounts_from_screen_text() {
        let found = amounts_in("¥680/晚起 · 共 1,360.50 元 · 2 晚");
        assert!(found.contains(&68_000));
        assert!(found.contains(&136_050));
        assert!(found.contains(&200));
    }

    #[test]
    fn a_link_returned_by_this_search_is_kept() {
        let price = check(
            &draft(r#"{"label":"灵隐寺","amount":75,"source":"web","url":"http://lingyinsi.org/tickets","site":"灵隐寺官网"}"#),
            &searched(),
            &[],
            1,
        );
        assert_eq!(price.cents, Some(7_500));
        assert!(matches!(price.source, PriceSource::Web { .. }));
        assert_eq!(price.checked_at, Some(1));
    }

    #[test]
    fn a_made_up_link_is_voided() {
        let price = check(
            &draft(r#"{"label":"西湖游船","amount":55,"source":"web","url":"https://example.com/boat","site":"官网"}"#),
            &searched(),
            &[],
            1,
        );
        assert_eq!(price.cents, None);
        assert_eq!(price.source, PriceSource::None { reason: None, voided: true });
    }

    #[test]
    fn an_app_price_must_be_on_the_screen_that_was_read() {
        let real = check(
            &draft(r#"{"label":"西湖边亲子房","unit_amount":680,"quantity":2,"per":"晚","source":"app","app":"携程"}"#),
            &searched(),
            &[],
            1,
        );
        assert_eq!(real.cents, Some(136_000));
        assert_eq!(real.unit_cents, Some(68_000));
        let invented = check(
            &draft(r#"{"label":"某民宿","unit_amount":560,"quantity":2,"source":"app","app":"携程"}"#),
            &searched(),
            &[],
            1,
        );
        assert_eq!(invented.cents, None);
        assert!(matches!(invented.source, PriceSource::None { voided: true, .. }));
        let other_app = check(
            &draft(r#"{"label":"西湖边亲子房","amount":680,"source":"app","app":"美团"}"#),
            &searched(),
            &[],
            1,
        );
        assert_eq!(other_app.cents, None);
    }

    #[test]
    fn nothing_searched_means_nothing_kept() {
        let price = check(
            &draft(r#"{"label":"高铁","amount":366,"source":"app","app":"12306"}"#),
            &Evidence::default(),
            &[],
            1,
        );
        assert_eq!(price.cents, None);
    }

    #[test]
    fn estimates_need_a_basis() {
        let with = check(
            &draft(r#"{"label":"吃的","amount":1080,"source":"estimate","basis":"按大众点评搜到的人均"}"#),
            &Evidence::default(),
            &[],
            1,
        );
        assert_eq!(with.cents, Some(108_000));
        assert_eq!(with.checked_at, None);
        let without = check(
            &draft(r#"{"label":"吃的","amount":1080,"source":"estimate"}"#),
            &Evidence::default(),
            &[],
            1,
        );
        assert_eq!(without.cents, None);
    }

    #[test]
    fn a_price_checked_earlier_survives_an_update() {
        let earlier = check(
            &draft(r#"{"label":"灵隐寺","amount":75,"source":"web","url":"https://lingyinsi.org/tickets","site":"官网"}"#),
            &searched(),
            &[],
            5,
        );
        let again = check(
            &draft(r#"{"label":"灵隐寺门票","amount":75,"source":"web","url":"https://lingyinsi.org/tickets","site":"官网"}"#),
            &Evidence::default(),
            &[&earlier],
            9,
        );
        assert_eq!(again.cents, Some(7_500));
        assert_eq!(again.checked_at, Some(5));
        let changed = check(
            &draft(r#"{"label":"灵隐寺","amount":95,"source":"web","url":"https://lingyinsi.org/tickets","site":"官网"}"#),
            &Evidence::default(),
            &[&earlier],
            9,
        );
        assert_eq!(changed.cents, None);
    }
}
