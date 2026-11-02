use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use mail_parser::{Address, MessageParser};
use regex::Regex;
use serde::Deserialize;
use xiaoban_protocol::{MailBill, MailCategory, MailParcel, MailTrip};

const CODE_REACH: usize = 40;
const CODE_DIGITS: std::ops::RangeInclusive<usize> = 4..=8;
const TEXT_LIMIT: usize = 20_000;
const SHORT: usize = 40;
const MONEY_BEFORE: [char; 6] = ['\u{A5}', '\u{FFE5}', '$', ',', '.', '-'];
const MONEY_AFTER: [char; 3] = ['.', ',', '-'];

fn words(key: &str) -> &'static [String] {
    static WORDS: OnceLock<HashMap<String, Vec<String>>> = OnceLock::new();
    WORDS
        .get_or_init(|| {
            include_str!("mail_words.txt")
                .lines()
                .filter_map(|line| line.split_once('='))
                .map(|(name, list)| {
                    (
                        name.trim().to_owned(),
                        list.split(',')
                            .map(|word| word.trim().to_lowercase())
                            .filter(|word| !word.is_empty())
                            .collect(),
                    )
                })
                .collect()
        })
        .get(key)
        .map_or(&[], Vec::as_slice)
}

fn bounded(text: &str, at: usize, word: &str) -> bool {
    if !word.is_ascii() {
        return true;
    }
    let before = text[..at].chars().next_back();
    let after = text[at + word.len()..].chars().next();
    let edge = |c: Option<char>| c.is_none_or(|c| !c.is_ascii_alphanumeric());
    let starts = word.chars().next().is_none_or(|c| !c.is_ascii_alphanumeric());
    let ends = word.chars().next_back().is_none_or(|c| !c.is_ascii_alphanumeric());
    (starts || edge(before)) && (ends || edge(after))
}

fn find(text: &str, key: &str) -> Option<(usize, usize)> {
    let lower = text.to_lowercase();
    words(key).iter().find_map(|word| {
        lower
            .match_indices(word.as_str())
            .find(|(at, _)| bounded(&lower, *at, word))
            .map(|(at, _)| (at, word.len()))
    })
}

pub fn has(text: &str, key: &str) -> bool {
    find(text, key).is_some()
}

fn sender_in(address: &str, key: &str) -> bool {
    let address = address.to_lowercase();
    words(key).iter().any(|word| address.contains(word.as_str()))
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Parsed {
    pub from_name: String,
    pub from_address: String,
    pub reply_to: String,
    pub subject: String,
    pub text: String,
    pub at: Option<i64>,
    pub bulk: bool,
}

fn tidy(text: &str) -> String {
    let mut out = String::new();
    let mut blank = false;
    for line in text.lines() {
        let line = line.split_whitespace().collect::<Vec<_>>().join(" ");
        if line.is_empty() {
            blank = !out.is_empty();
            continue;
        }
        if blank {
            out.push('\n');
            blank = false;
        }
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(&line);
        if out.len() > TEXT_LIMIT {
            break;
        }
    }
    clip(&out, TEXT_LIMIT)
}

pub fn clip(text: &str, max: usize) -> String {
    match text.char_indices().nth(max) {
        Some((cut, _)) => text[..cut].to_owned(),
        None => text.to_owned(),
    }
}

fn first(address: Option<&Address<'_>>) -> (String, String) {
    address
        .and_then(Address::first)
        .map(|addr| {
            (
                addr.name().unwrap_or_default().trim().to_owned(),
                addr.address().unwrap_or_default().trim().to_owned(),
            )
        })
        .unwrap_or_default()
}

pub fn parse(raw: &[u8]) -> Option<Parsed> {
    let message = MessageParser::default().parse(raw)?;
    let (from_name, from_address) = first(message.from());
    let (_, reply_to) = first(message.reply_to());
    let text = message.body_text(0).map(|text| tidy(&text)).unwrap_or_default();
    let bulk = !message.list_unsubscribe().is_empty()
        || message.header_raw("List-Id").is_some()
        || message
            .header_raw("Precedence")
            .is_some_and(|value| matches!(value.trim().to_lowercase().as_str(), "bulk" | "list" | "junk"));
    Some(Parsed {
        from_name,
        from_address,
        reply_to,
        subject: message.subject().unwrap_or_default().trim().to_owned(),
        text,
        at: message.date().map(|date| date.to_timestamp() * 1000),
        bulk,
    })
}

fn digits_near(text: &str) -> bool {
    let chars: Vec<char> = text.chars().collect();
    let mut index = 0;
    while index < chars.len() {
        if !chars[index].is_ascii_digit() {
            index += 1;
            continue;
        }
        let start = index;
        while index < chars.len() && chars[index].is_ascii_digit() {
            index += 1;
        }
        let money = start > 0 && MONEY_BEFORE.contains(&chars[start - 1]);
        let decimal = chars.get(index).is_some_and(|c| MONEY_AFTER.contains(c));
        if CODE_DIGITS.contains(&(index - start)) && !money && !decimal {
            return true;
        }
    }
    false
}

pub fn is_code(parsed: &Parsed) -> bool {
    if has(&parsed.subject, "code") {
        return true;
    }
    if ["bill", "trip", "parcel"].iter().any(|key| has(&parsed.subject, key)) {
        return false;
    }
    let lower = parsed.text.to_lowercase();
    words("code").iter().any(|word| {
        lower.match_indices(word.as_str()).any(|(at, _)| {
            bounded(&lower, at, word) && {
                let tail: String = lower[at + word.len()..].chars().take(CODE_REACH).collect();
                digits_near(&tail)
            }
        })
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rule {
    Sure(MailCategory),
    Hint(MailCategory),
    Unknown,
}

impl Rule {
    pub const fn category(self) -> Option<MailCategory> {
        match self {
            Self::Sure(category) | Self::Hint(category) => Some(category),
            Self::Unknown => None,
        }
    }
}

fn personal(parsed: &Parsed) -> bool {
    !parsed.bulk && !sender_in(&parsed.from_address, "notice_from")
}

pub fn classify(parsed: &Parsed) -> Rule {
    let subject = parsed.subject.as_str();
    for (key, category) in [
        ("bill", MailCategory::Bill),
        ("trip", MailCategory::Trip),
        ("parcel", MailCategory::Parcel),
    ] {
        if has(subject, key) {
            return Rule::Sure(category);
        }
    }
    if has(subject, "promo") {
        return Rule::Sure(MailCategory::Promo);
    }
    for (key, category) in [
        ("bill_from", MailCategory::Bill),
        ("trip_from", MailCategory::Trip),
        ("parcel_from", MailCategory::Parcel),
    ] {
        if sender_in(&parsed.from_address, key) {
            return Rule::Hint(category);
        }
    }
    if !personal(parsed) {
        return Rule::Sure(MailCategory::Promo);
    }
    let lower = subject.to_lowercase();
    let replied = words("reply_prefix").iter().any(|prefix| lower.starts_with(prefix.as_str()));
    let opening = clip(&parsed.text, 300);
    if replied || has(subject, "reply") || has(&opening, "reply") {
        return Rule::Hint(MailCategory::Reply);
    }
    Rule::Unknown
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct BillDraft {
    pub amount: Option<f64>,
    pub minimum: Option<f64>,
    pub due: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct TripDraft {
    pub number: Option<String>,
    pub date: Option<String>,
    pub time: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub station: Option<String>,
    pub tickets: Option<f64>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct ParcelDraft {
    pub merchant: Option<String>,
    pub item: Option<String>,
    pub status: Option<String>,
    pub eta: Option<String>,
}

fn filled(value: Option<&String>) -> Option<String> {
    value
        .map(|value| clip(value.trim(), SHORT))
        .filter(|value| !value.is_empty())
}

fn squash(text: &str) -> String {
    text.chars()
        .filter(|c| !c.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect()
}

fn mentions(haystack: &str, value: Option<String>) -> Option<String> {
    let value = value?;
    squash(haystack).contains(&squash(&value)).then_some(value)
}

fn amount(haystack: &str, value: Option<f64>) -> Option<i64> {
    let cents = value.and_then(crate::price::cents).filter(|cents| *cents > 0)?;
    crate::price::amounts_in(haystack).contains(&cents).then_some(cents)
}

fn date_patterns() -> &'static [Regex; 4] {
    static PATTERNS: OnceLock<[Regex; 4]> = OnceLock::new();
    PATTERNS.get_or_init(|| {
        [
            Regex::new(r"(\d{4})\s*[-/.\x{5E74}]\s*(\d{1,2})\s*[-/.\x{6708}]\s*(\d{1,2})").unwrap(),
            Regex::new(r"(\d{1,2})\s*\x{6708}\s*(\d{1,2})\s*[\x{65E5}\x{53F7}]").unwrap(),
            Regex::new(r"(?:^|[^\d/.-])(\d{1,2})[/-](\d{1,2})(?:$|[^\d/.-])").unwrap(),
            Regex::new(r"(?i)\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b|\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b").unwrap(),
        ]
    })
}

fn month_number(name: &str) -> Option<u32> {
    const MONTHS: [&str; 12] = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    let lower = name.to_lowercase();
    MONTHS
        .iter()
        .position(|month| lower.starts_with(month))
        .and_then(|index| u32::try_from(index + 1).ok())
}

pub fn days_in(text: &str) -> HashSet<(u32, u32)> {
    let mut found = HashSet::new();
    let [full, chinese, slash, english] = date_patterns();
    let number = |caps: &regex::Captures<'_>, index: usize| caps.get(index).and_then(|m| m.as_str().parse::<u32>().ok());
    for caps in full.captures_iter(text) {
        if let (Some(month), Some(day)) = (number(&caps, 2), number(&caps, 3)) {
            found.insert((month, day));
        }
    }
    for caps in chinese.captures_iter(text).chain(slash.captures_iter(text)) {
        if let (Some(month), Some(day)) = (number(&caps, 1), number(&caps, 2)) {
            found.insert((month, day));
        }
    }
    for caps in english.captures_iter(text) {
        let pair = match (caps.get(1), caps.get(4)) {
            (Some(month), _) => month_number(month.as_str()).zip(number(&caps, 2)),
            (None, Some(month)) => month_number(month.as_str()).zip(number(&caps, 3)),
            _ => None,
        };
        if let Some(pair) = pair {
            found.insert(pair);
        }
    }
    found.retain(|(month, day)| (1..=12).contains(month) && (1..=31).contains(day));
    found
}

fn date(haystack: &str, value: Option<String>) -> Option<String> {
    let value = value?;
    let parsed: jiff::civil::Date = value.trim().parse().ok()?;
    let month = u32::try_from(parsed.month()).ok()?;
    let day = u32::try_from(parsed.day()).ok()?;
    days_in(haystack).contains(&(month, day)).then(|| parsed.to_string())
}

fn clock(haystack: &str, value: Option<String>) -> Option<String> {
    let value = value?;
    let (hour, minute) = value.trim().split_once(':')?;
    let hour: u32 = hour.trim().parse().ok().filter(|hour| *hour < 24)?;
    let minute: u32 = minute.trim().parse().ok().filter(|minute| *minute < 60)?;
    let padded = format!("{hour:02}:{minute:02}");
    let bare = format!("{hour}:{minute:02}");
    let wide = squash(&haystack.replace('\u{FF1A}', ":"));
    (wide.contains(&padded) || wide.contains(&bare)).then_some(padded)
}

pub fn check_bill(haystack: &str, draft: &BillDraft) -> Option<MailBill> {
    let bill = MailBill {
        cents: amount(haystack, draft.amount),
        minimum_cents: amount(haystack, draft.minimum),
        due: date(haystack, draft.due.clone()),
    };
    (bill != MailBill::default()).then_some(bill)
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub fn check_trip(haystack: &str, draft: &TripDraft) -> Option<MailTrip> {
    let trip = MailTrip {
        number: mentions(haystack, filled(draft.number.as_ref()).map(|number| number.to_uppercase())),
        date: date(haystack, draft.date.clone()),
        time: clock(haystack, draft.time.clone()),
        from: mentions(haystack, filled(draft.from.as_ref())),
        to: mentions(haystack, filled(draft.to.as_ref())),
        station: mentions(haystack, filled(draft.station.as_ref())),
        tickets: draft
            .tickets
            .filter(|count| count.is_finite() && (1.0..=20.0).contains(count))
            .map(|count| count.round() as u32),
        ..MailTrip::default()
    };
    (trip.number.is_some() || trip.date.is_some()).then_some(trip)
}

pub fn check_parcel(haystack: &str, draft: &ParcelDraft) -> Option<MailParcel> {
    let parcel = MailParcel {
        merchant: filled(draft.merchant.as_ref()),
        item: filled(draft.item.as_ref()),
        status: filled(draft.status.as_ref()),
        eta: date(haystack, draft.eta.clone()),
    };
    (parcel != MailParcel::default()).then_some(parcel)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parsed(from: &str, subject: &str, text: &str) -> Parsed {
        Parsed {
            from_name: String::new(),
            from_address: from.to_owned(),
            reply_to: String::new(),
            subject: subject.to_owned(),
            text: text.to_owned(),
            at: None,
            bulk: false,
        }
    }

    #[test]
    fn codes_are_recognised_in_subject_or_next_to_digits() {
        assert!(is_code(&parsed("a@b.com", "您的登录验证码", "")));
        assert!(is_code(&parsed("a@b.com", "Account notice", "Your verification code is 482913.")));
        assert!(is_code(&parsed("a@b.com", "安全提醒", "本次操作的验证码：6610，5 分钟内有效")));
        assert!(!is_code(&parsed("a@cmbchina.com", "信用卡电子账单", "请勿向任何人泄露验证码。本期应还 ¥3,240.00")));
        assert!(!is_code(&parsed("a@b.com", "Hotpot party", "bring 2 friends")));
    }

    #[test]
    fn rules_sort_by_subject_then_sender() {
        assert_eq!(classify(&parsed("x@cmbchina.com", "招商银行信用卡 10 月电子账单", "")), Rule::Sure(MailCategory::Bill));
        assert_eq!(classify(&parsed("x@12306.cn", "网上购票系统-用户支付通知", "")), Rule::Hint(MailCategory::Trip));
        assert_eq!(classify(&parsed("x@jd.com", "京东：您的订单已发货", "")), Rule::Sure(MailCategory::Parcel));
        assert_eq!(classify(&parsed("x@shop.com", "双十一限时特惠", "")), Rule::Sure(MailCategory::Promo));
        let mut bulk = parsed("hi@site.com", "Our story this week", "");
        bulk.bulk = true;
        assert_eq!(classify(&bulk), Rule::Sure(MailCategory::Promo));
        assert_eq!(classify(&parsed("wang@wuye.cn", "回复：装修押金", "")), Rule::Hint(MailCategory::Reply));
        assert_eq!(classify(&parsed("li@friend.cn", "周末", "随便聊聊")), Rule::Unknown);
    }

    #[test]
    fn amounts_and_dates_must_appear_in_the_mail() {
        let text = "招商银行信用卡 10 月账单\n本期应还金额 ¥3,240.00，最低还款 ¥324.00，到期还款日 2026年11月20日";
        let bill = check_bill(
            text,
            &BillDraft { amount: Some(3240.0), minimum: Some(324.0), due: Some("2026-11-20".into()) },
        )
        .unwrap();
        assert_eq!(bill.cents, Some(324_000));
        assert_eq!(bill.minimum_cents, Some(32_400));
        assert_eq!(bill.due.as_deref(), Some("2026-11-20"));
        let wrong = check_bill(
            text,
            &BillDraft { amount: Some(3420.0), minimum: Some(342.0), due: Some("2026-11-21".into()) },
        );
        assert_eq!(wrong, None);
    }

    #[test]
    fn trips_keep_only_fields_found_in_the_text() {
        let text = "您已购 11月14日 G7321 次列车，上海虹桥站 08:05 开，到达杭州东，共 2 张";
        let trip = check_trip(
            text,
            &TripDraft {
                number: Some("g7321".into()),
                date: Some("2026-11-14".into()),
                time: Some("8:05".into()),
                from: Some("上海".into()),
                to: Some("杭州".into()),
                station: Some("上海虹桥".into()),
                tickets: Some(2.0),
            },
        )
        .unwrap();
        assert_eq!(trip.number.as_deref(), Some("G7321"));
        assert_eq!(trip.date.as_deref(), Some("2026-11-14"));
        assert_eq!(trip.time.as_deref(), Some("08:05"));
        assert_eq!(trip.tickets, Some(2));
        let made_up = check_trip(text, &TripDraft { number: Some("G1234".into()), date: Some("2026-11-15".into()), ..TripDraft::default() });
        assert_eq!(made_up, None);
    }

    #[test]
    fn dates_are_read_in_common_forms() {
        let days = days_in("due Nov 20, ships 4 Nov, 到期 11/22, 2026-12-01, 12月3日");
        for pair in [(11, 20), (11, 4), (11, 22), (12, 1), (12, 3)] {
            assert!(days.contains(&pair), "{pair:?} in {days:?}");
        }
    }

    #[test]
    fn messages_are_parsed_with_encoded_headers() {
        let raw = b"From: =?UTF-8?B?5oub5ZWG6ZO26KGM?= <ccsvc@message.cmbchina.com>\r\nSubject: =?UTF-8?B?5L+h55So5Y2h6LSm5Y2V?=\r\nDate: Sun, 01 Nov 2026 08:00:00 +0800\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nhello\r\n";
        let parsed = parse(raw).unwrap();
        assert_eq!(parsed.from_name, "招商银行");
        assert_eq!(parsed.subject, "信用卡账单");
        assert_eq!(parsed.text, "hello");
        assert!(parsed.at.is_some());
    }
}
