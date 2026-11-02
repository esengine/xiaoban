use std::collections::HashMap;
use std::ops::Range;
use std::sync::OnceLock;

use jiff::ToSpan;
use jiff::civil::Date;
use xiaoban_protocol::TodoRepeat;

const GAP: char = '\u{0}';
const MORNING: u16 = 9 * 60;
const NOON: u16 = 12 * 60;
const AFTERNOON: u16 = 15 * 60;
const EVENING: u16 = 20 * 60;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Parsed {
    pub title: String,
    pub date: Option<Date>,
    pub minute: Option<u16>,
    pub repeat: Option<TodoRepeat>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Part {
    Morning,
    Noon,
    Afternoon,
    Evening,
}

fn table() -> &'static HashMap<String, Vec<String>> {
    static WORDS: OnceLock<HashMap<String, Vec<String>>> = OnceLock::new();
    WORDS.get_or_init(|| {
        include_str!("todo_words.txt")
            .lines()
            .filter_map(|line| line.split_once('='))
            .map(|(name, list)| {
                let mut words: Vec<String> = if name.trim() == "trim" {
                    list.chars().map(String::from).collect()
                } else {
                    list.split(',')
                        .map(|word| word.trim().to_lowercase())
                        .filter(|word| !word.is_empty())
                        .collect()
                };
                if name.trim() != "digits" {
                    words.sort_by_key(|word| std::cmp::Reverse(word.len()));
                }
                (name.trim().to_owned(), words)
            })
            .collect()
    })
}

fn words(key: &str) -> &'static [String] {
    table().get(key).map_or(&[], Vec::as_slice)
}

fn find_any(text: &str, key: &str) -> Option<Range<usize>> {
    let lower = text.to_ascii_lowercase();
    words(key)
        .iter()
        .filter_map(|word| lower.find(word.as_str()).map(|start| start..start + word.len()))
        .min_by_key(|range| (range.start, std::cmp::Reverse(range.end)))
}

fn ends_with_any(text: &str, key: &str) -> Option<usize> {
    let lower = text.trim_end_matches(GAP).to_ascii_lowercase();
    let trimmed = text.len() - text.trim_end_matches(GAP).len();
    words(key)
        .iter()
        .find(|word| lower.ends_with(word.as_str()))
        .map(|word| word.len() + trimmed)
}

fn starts_with_any(text: &str, key: &str) -> Option<usize> {
    let lower = text.to_ascii_lowercase();
    words(key)
        .iter()
        .find(|word| lower.starts_with(word.as_str()))
        .map(String::len)
}

fn cut(text: &mut String, range: Range<usize>) {
    text.replace_range(range, &GAP.to_string());
}

fn numeral_value(ch: char) -> Option<u32> {
    if let Some(digit) = ch.to_digit(10) {
        return Some(digit);
    }
    let text = ch.to_string();
    if words("two").contains(&text) {
        return Some(2);
    }
    words("digits")
        .iter()
        .position(|digit| *digit == text)
        .and_then(|index| u32::try_from(index).ok())
}

fn is_numeral(ch: char) -> bool {
    numeral_value(ch).is_some() || words("ten").contains(&ch.to_string())
}

fn read_number(text: &str) -> Option<(u32, bool)> {
    if text.is_empty() {
        return None;
    }
    if text.chars().all(|ch| ch.is_ascii_digit()) {
        return text.parse().ok().map(|value| (value, false));
    }
    let mut total = 0;
    let mut current = 0;
    for ch in text.chars() {
        if words("ten").contains(&ch.to_string()) {
            total += if current == 0 { 10 } else { current * 10 };
            current = 0;
        } else {
            current = numeral_value(ch)?;
        }
    }
    Some((total + current, true))
}

fn number_before(text: &str, end: usize) -> Option<(u32, bool, usize)> {
    let head = &text[..end];
    let start = head
        .char_indices()
        .rev()
        .take_while(|(_, ch)| is_numeral(*ch))
        .last()
        .map(|(index, _)| index)?;
    let (value, chinese) = read_number(&head[start..])?;
    Some((value, chinese, start))
}

fn number_after(text: &str, start: usize) -> Option<(u32, usize)> {
    let tail = &text[start..];
    let length: usize = tail
        .chars()
        .take_while(|ch| is_numeral(*ch))
        .map(char::len_utf8)
        .sum();
    let (value, _) = read_number(&tail[..length])?;
    Some((value, start + length))
}

fn weekday_of(day: Date) -> i64 {
    i64::from(day.weekday().to_monday_one_offset())
}

fn find_weekday(text: &str) -> Option<(Range<usize>, u8)> {
    (1..=7u8)
        .filter_map(|day| find_any(text, &format!("weekday{day}")).map(|range| (range, day)))
        .min_by_key(|(range, _)| range.start)
}

fn plus_days(day: Date, days: i64) -> Date {
    day.checked_add(days.days()).unwrap_or(day)
}

fn take_repeat(text: &mut String, today: Date) -> (Option<TodoRepeat>, Option<Date>) {
    if let Some(range) = find_any(text, "daily") {
        cut(text, range);
        return (Some(TodoRepeat::Daily), None);
    }
    if let Some(range) = find_any(text, "monthly") {
        let after = range.end;
        if let Some((day, end)) = number_after(text, after)
            && (1..=31).contains(&day)
            && let Some(unit) = starts_with_any(&text[end..], "monthday")
        {
            cut(text, range.start..end + unit);
            return (
                Some(TodoRepeat::Monthly {
                    days: vec![u8::try_from(day).unwrap_or(1)],
                }),
                None,
            );
        }
    }
    let mut weekly = Vec::new();
    let mut date = None;
    while let Some((range, day)) = find_weekday(text) {
        let mut start = range.start;
        if let Some(length) = ends_with_any(&text[..start], "each") {
            start -= length;
            weekly.push(day);
        } else if !weekly.is_empty() {
            weekly.push(day);
        } else if date.is_none() {
            let now = weekday_of(today);
            let found = if let Some(length) = ends_with_any(&text[..start], "next") {
                start -= length;
                plus_days(today, 8 - now + i64::from(day) - 1)
            } else {
                plus_days(today, (i64::from(day) + 7 - now) % 7)
            };
            date = Some(found);
        }
        cut(text, start..range.end);
    }
    if weekly.is_empty() {
        return (None, date);
    }
    weekly.sort_unstable();
    weekly.dedup();
    (Some(TodoRepeat::Weekly { weekdays: weekly }), None)
}

fn take_day(text: &mut String, today: Date) -> Option<Date> {
    for (key, days) in [("day3", 3), ("day2", 2), ("day1", 1), ("day0", 0)] {
        if let Some(range) = find_any(text, key) {
            cut(text, range);
            return Some(plus_days(today, days));
        }
    }
    None
}

fn occurrences(text: &str, key: &str) -> Vec<Range<usize>> {
    let lower = text.to_ascii_lowercase();
    let mut found: Vec<Range<usize>> = words(key)
        .iter()
        .flat_map(|word| {
            lower
                .match_indices(word.as_str())
                .map(|(start, matched)| start..start + matched.len())
                .collect::<Vec<_>>()
        })
        .collect();
    found.sort_by_key(|range| range.start);
    found
}

fn take_calendar_day(text: &mut String, today: Date) -> Option<Date> {
    for month_at in occurrences(text, "month") {
        let Some((month, _, start)) = number_before(text, month_at.start) else {
            continue;
        };
        let Some((day, end)) = number_after(text, month_at.end) else {
            continue;
        };
        let unit = starts_with_any(&text[end..], "monthday").unwrap_or(0);
        let (Ok(month), Ok(day)) = (i8::try_from(month), i8::try_from(day)) else {
            continue;
        };
        let Ok(mut found) = Date::new(today.year(), month, day) else {
            continue;
        };
        if found < today {
            found = Date::new(today.year() + 1, month, day).unwrap_or(found);
        }
        cut(text, start..end + unit);
        return Some(found);
    }
    for unit in occurrences(text, "monthday") {
        let Some((day, _, start)) = number_before(text, unit.start) else {
            continue;
        };
        let Ok(day) = i8::try_from(day) else {
            continue;
        };
        let Ok(mut found) = Date::new(today.year(), today.month(), day) else {
            continue;
        };
        if found < today {
            let next = today.first_of_month().checked_add(1.month()).unwrap_or(today);
            found = Date::new(next.year(), next.month(), day).unwrap_or(found);
        }
        cut(text, start..unit.end);
        return Some(found);
    }
    None
}

fn take_part(text: &mut String) -> Option<Part> {
    for (key, part) in [
        ("evening", Part::Evening),
        ("afternoon", Part::Afternoon),
        ("noon", Part::Noon),
        ("morning", Part::Morning),
    ] {
        if let Some(range) = find_any(text, key) {
            cut(text, range);
            return Some(part);
        }
    }
    None
}

fn take_clock(text: &mut String) -> Option<(u32, u32)> {
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    for (index, (start, ch)) in chars.iter().enumerate() {
        if *ch != ':' && *ch != '\u{ff1a}' {
            continue;
        }
        let hours: String = chars[..index]
            .iter()
            .rev()
            .take_while(|(_, ch)| ch.is_ascii_digit())
            .map(|(_, ch)| *ch)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        let minutes: String = chars[index + 1..]
            .iter()
            .take_while(|(_, ch)| ch.is_ascii_digit())
            .map(|(_, ch)| *ch)
            .collect();
        if hours.is_empty() || hours.len() > 2 || minutes.len() != 2 {
            continue;
        }
        let (Ok(hour), Ok(minute)) = (hours.parse::<u32>(), minutes.parse::<u32>()) else {
            continue;
        };
        let from = start - hours.len();
        let to = start + ch.len_utf8() + minutes.len();
        cut(text, from..to);
        return Some((hour, minute));
    }
    None
}

fn take_hour(text: &mut String, sure: bool) -> Option<(u32, u32)> {
    for unit in occurrences(text, "hour") {
        let Some((hour, chinese, start)) = number_before(text, unit.start) else {
            continue;
        };
        if chinese && hour == 1 && !sure {
            continue;
        }
        let mut end = unit.end;
        let mut minute = 0;
        if let Some(length) = starts_with_any(&text[end..], "half") {
            minute = 30;
            end += length;
        } else if let Some((value, after)) = number_after(text, end) {
            minute = value;
            end = after + starts_with_any(&text[after..], "minute").unwrap_or(0);
        }
        cut(text, start..end);
        return Some((hour, minute));
    }
    None
}

fn minute_of(clock: Option<(u32, u32)>, part: Option<Part>) -> Option<u16> {
    let Some((hour, minute)) = clock else {
        return part.map(|part| match part {
            Part::Morning => MORNING,
            Part::Noon => NOON,
            Part::Afternoon => AFTERNOON,
            Part::Evening => EVENING,
        });
    };
    let hour = match part {
        Some(Part::Afternoon | Part::Evening) if hour < 12 => hour + 12,
        Some(Part::Noon) if hour < 6 => hour + 12,
        _ => hour,
    };
    if hour > 23 || minute > 59 {
        return None;
    }
    u16::try_from(hour * 60 + minute).ok()
}

fn title_of(text: &str) -> String {
    let trim = words("trim");
    let edge = |ch: char| ch == GAP || ch.is_whitespace() || trim.contains(&ch.to_string());
    let chars: Vec<char> = text.trim_matches(edge).chars().collect();
    let mut title = String::new();
    for (index, ch) in chars.iter().enumerate() {
        if *ch != GAP {
            title.push(*ch);
            continue;
        }
        let before = title.chars().last();
        let after = chars[index + 1..].iter().find(|next| **next != GAP);
        let wide = |ch: Option<&char>| ch.is_some_and(|ch| !ch.is_ascii());
        if !wide(before.as_ref()) && !wide(after) && before.is_some_and(|ch| !ch.is_whitespace()) {
            title.push(' ');
        }
    }
    title.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn parse(input: &str, today: Date) -> Parsed {
    let mut text = input.trim().to_owned();
    while let Some(range) = find_any(&text, "fillers") {
        cut(&mut text, range);
    }
    let (repeat, weekday) = take_repeat(&mut text, today);
    let mut date = weekday.or_else(|| take_day(&mut text, today));
    if repeat.is_none() && date.is_none() {
        date = take_calendar_day(&mut text, today);
    }
    let part = take_part(&mut text);
    let sure = part.is_some() || date.is_some() || repeat.is_some();
    let clock = take_clock(&mut text).or_else(|| take_hour(&mut text, sure));
    let minute = minute_of(clock, part);
    let title = title_of(&text);
    Parsed {
        title: if title.is_empty() {
            input.trim().to_owned()
        } else {
            title
        },
        date,
        minute,
        repeat,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sunday() -> Date {
        Date::new(2026, 11, 1).unwrap()
    }

    #[allow(clippy::unnecessary_wraps)]
    fn hm(hour: u16, minute: u16) -> Option<u16> {
        Some(hour * 60 + minute)
    }

    #[test]
    fn weekday_and_part_of_day() {
        let parsed = parse("周三下午去银行", sunday());
        assert_eq!(parsed.title, "去银行");
        assert_eq!(parsed.date, Some(Date::new(2026, 11, 4).unwrap()));
        assert_eq!(parsed.minute, hm(15, 0));
        assert_eq!(parsed.repeat, None);
    }

    #[test]
    fn relative_days_and_clock_words() {
        let parsed = parse("明天晚上8点给妈妈打电话", sunday());
        assert_eq!(parsed.title, "给妈妈打电话");
        assert_eq!(parsed.date, Some(Date::new(2026, 11, 2).unwrap()));
        assert_eq!(parsed.minute, hm(20, 0));
        let parsed = parse("提醒我十点半吃药", sunday());
        assert_eq!(parsed.title, "吃药");
        assert_eq!(parsed.minute, hm(10, 30));
        assert_eq!(parsed.date, None);
        let parsed = parse("后天 9:30 开会", sunday());
        assert_eq!(parsed.title, "开会");
        assert_eq!(parsed.date, Some(Date::new(2026, 11, 3).unwrap()));
        assert_eq!(parsed.minute, hm(9, 30));
    }

    #[test]
    fn calendar_days() {
        let parsed = parse("11月28号车险续保", sunday());
        assert_eq!(parsed.title, "车险续保");
        assert_eq!(parsed.date, Some(Date::new(2026, 11, 28).unwrap()));
        assert_eq!(parsed.minute, None);
        let parsed = parse("交物业费 1号", Date::new(2026, 11, 20).unwrap());
        assert_eq!(parsed.date, Some(Date::new(2026, 12, 1).unwrap()));
        let parsed = parse("下周一交报告", sunday());
        assert_eq!(parsed.date, Some(Date::new(2026, 11, 2).unwrap()));
        assert_eq!(parsed.title, "交报告");
    }

    #[test]
    fn repeats() {
        let parsed = parse("每月5号交房租", sunday());
        assert_eq!(parsed.title, "交房租");
        assert_eq!(parsed.repeat, Some(TodoRepeat::Monthly { days: vec![5] }));
        assert_eq!(parsed.date, None);
        let parsed = parse("每周五下午6点倒垃圾", sunday());
        assert_eq!(parsed.repeat, Some(TodoRepeat::Weekly { weekdays: vec![5] }));
        assert_eq!(parsed.minute, hm(18, 0));
        assert_eq!(parsed.title, "倒垃圾");
        let parsed = parse("每天早上吃维生素", sunday());
        assert_eq!(parsed.repeat, Some(TodoRepeat::Daily));
        assert_eq!(parsed.minute, hm(9, 0));
    }

    #[test]
    fn plain_text_stays_untimed() {
        let parsed = parse("买牙膏", sunday());
        assert_eq!(parsed, Parsed { title: "买牙膏".into(), ..Parsed::default() });
        let parsed = parse("买一点水果", sunday());
        assert_eq!(parsed.minute, None);
        assert_eq!(parsed.title, "买一点水果");
        let parsed = parse("Call mom tomorrow 19:00", sunday());
        assert_eq!(parsed.title, "Call mom");
        assert_eq!(parsed.date, Some(Date::new(2026, 11, 2).unwrap()));
        assert_eq!(parsed.minute, hm(19, 0));
    }
}
