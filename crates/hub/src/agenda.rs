use std::fmt::Debug;

use futures_util::future::BoxFuture;
use jiff::civil::{Date, Time};
use jiff::tz::TimeZone;
use jiff::{Timestamp, ToSpan, Zoned};
use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{AgendaItem, Attachment, EventDraft};

use crate::tools::HubTools;

pub const PROPOSE_EVENT: &str = "propose_event";
pub const READ_CALENDAR: &str = "read_calendar";

const DEFAULT_MINUTES: i64 = 60;
const MAX_REMINDER: u32 = 7 * 24 * 60;
const MAX_DAYS: u8 = 14;
const MAX_ITEMS: usize = 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgendaError {
    Denied,
    Unavailable,
}

pub trait Agenda: Debug + Send + Sync + 'static {
    fn events(&self, from: i64, to: i64) -> BoxFuture<'static, Result<Vec<AgendaItem>, AgendaError>>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct NoAgenda;

impl Agenda for NoAgenda {
    fn events(&self, _from: i64, _to: i64) -> BoxFuture<'static, Result<Vec<AgendaItem>, AgendaError>> {
        Box::pin(async { Err(AgendaError::Unavailable) })
    }
}

#[derive(Debug, Clone, Default)]
pub struct FixedAgenda(pub Vec<AgendaItem>);

impl Agenda for FixedAgenda {
    fn events(&self, from: i64, to: i64) -> BoxFuture<'static, Result<Vec<AgendaItem>, AgendaError>> {
        let found = self
            .0
            .iter()
            .filter(|item| item.start < to && item.end > from)
            .cloned()
            .collect();
        Box::pin(async move { Ok(found) })
    }
}

pub fn is_tool(name: &str) -> bool {
    matches!(name, PROPOSE_EVENT | READ_CALENDAR)
}

fn text(l: &Localizer, key: xiaoban_i18n::Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

pub fn specs(l: &Localizer) -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: PROPOSE_EVENT.to_owned(),
            description: l.text(keys::TOOL_PROPOSE_EVENT_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "title": text(l, keys::TOOL_PROPOSE_EVENT_TITLE),
                    "date": text(l, keys::TOOL_PROPOSE_EVENT_DATE),
                    "start": text(l, keys::TOOL_PROPOSE_EVENT_START),
                    "end": text(l, keys::TOOL_PROPOSE_EVENT_END),
                    "location": text(l, keys::TOOL_PROPOSE_EVENT_LOCATION),
                    "notes": text(l, keys::TOOL_PROPOSE_EVENT_NOTES),
                    "reminder": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": MAX_REMINDER,
                        "description": l.text(keys::TOOL_PROPOSE_EVENT_REMINDER),
                    },
                },
                "required": ["title", "date", "start"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: READ_CALENDAR.to_owned(),
            description: l.text(keys::TOOL_READ_CALENDAR_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "date": text(l, keys::TOOL_READ_CALENDAR_DATE),
                    "days": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": MAX_DAYS,
                        "description": l.text(keys::TOOL_READ_CALENDAR_DAYS),
                    },
                },
                "required": [],
                "additionalProperties": false,
            }),
        },
    ]
}

#[derive(Deserialize)]
struct ProposeArgs {
    title: String,
    date: String,
    start: String,
    #[serde(default)]
    end: Option<String>,
    #[serde(default)]
    location: Option<String>,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    reminder: Option<u32>,
}

#[derive(Deserialize)]
struct ReadArgs {
    #[serde(default)]
    date: Option<String>,
    #[serde(default)]
    days: Option<u8>,
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

fn at(date: Date, time: &str, zone: &TimeZone) -> Option<Timestamp> {
    let time = Time::strptime("%H:%M", time.trim()).ok()?;
    date.to_datetime(time)
        .to_zoned(zone.clone())
        .ok()
        .map(|zoned| zoned.timestamp())
}

fn clock(ms: i64, zone: &TimeZone) -> String {
    Timestamp::from_millisecond(ms)
        .map(|at| at.to_zoned(zone.clone()).strftime("%Y-%m-%d %a %H:%M").to_string())
        .unwrap_or_default()
}

fn draft(args: ProposeArgs, zone: &TimeZone) -> Result<EventDraft, &'static str> {
    let title = args.title.trim().to_owned();
    if title.is_empty() {
        return Err("title must not be empty");
    }
    let date: Date = args
        .date
        .trim()
        .parse()
        .map_err(|_| "date must be YYYY-MM-DD")?;
    let start = at(date, &args.start, zone).ok_or("start must be HH:MM")?;
    let fallback = start
        .checked_add(DEFAULT_MINUTES.minutes())
        .unwrap_or(start);
    let end = match args.end.as_deref().map(str::trim).filter(|end| !end.is_empty()) {
        None => fallback,
        Some(end) => {
            let end = at(date, end, zone).ok_or("end must be HH:MM")?;
            if end > start {
                end
            } else {
                end.checked_add(24.hours()).unwrap_or(fallback)
            }
        }
    };
    Ok(EventDraft {
        id: format!("{}@xiaoban", uuid::Uuid::now_v7()),
        title,
        start: start.as_millisecond(),
        end: end.as_millisecond(),
        location: args.location.unwrap_or_default().trim().to_owned(),
        notes: args.notes.unwrap_or_default().trim().to_owned(),
        reminder: args.reminder.map(|minutes| minutes.min(MAX_REMINDER)),
    })
}

fn window(args: &ReadArgs, zone: &TimeZone) -> Result<(i64, i64), &'static str> {
    let first: Date = match args.date.as_deref().map(str::trim).filter(|date| !date.is_empty()) {
        Some(date) => date.parse().map_err(|_| "date must be YYYY-MM-DD")?,
        None => Zoned::now().with_time_zone(zone.clone()).date(),
    };
    let days = args.days.unwrap_or(1).clamp(1, MAX_DAYS);
    let from = first
        .to_zoned(zone.clone())
        .map_err(|_| "date is out of range")?;
    let to = from
        .checked_add(i64::from(days).days())
        .map_err(|_| "date is out of range")?;
    Ok((
        from.timestamp().as_millisecond(),
        to.timestamp().as_millisecond(),
    ))
}

impl HubTools<'_> {
    pub(crate) async fn agenda_tool(&self, name: &str, arguments: &str) -> String {
        match name {
            PROPOSE_EVENT => self.propose_event(arguments),
            _ => self.read_calendar(arguments).await,
        }
    }

    fn propose_event(&self, arguments: &str) -> String {
        let args = match serde_json::from_str::<ProposeArgs>(arguments) {
            Ok(args) => args,
            Err(failure) => return error(&format!("invalid event: {failure}")),
        };
        if matches!(self.attachment(), Some(Attachment::Event { .. })) {
            return error(
                "one event card per reply is already shown; ask the user to add it first, then propose the next one",
            );
        }
        let zone = TimeZone::system();
        let event = match draft(args, &zone) {
            Ok(event) => event,
            Err(message) => return error(message),
        };
        let reply = json!({
            "shown": true,
            "start": clock(event.start, &zone),
            "end": clock(event.end, &zone),
            "note": "a card is now shown under your reply; the user taps it to add the event to their calendar. Do not say it has been added, and do not repeat the details",
        });
        self.attach(Attachment::Event { event });
        reply.to_string()
    }

    async fn read_calendar(&self, arguments: &str) -> String {
        let args = match serde_json::from_str::<ReadArgs>(arguments) {
            Ok(args) => args,
            Err(failure) => return error(&format!("invalid arguments: {failure}")),
        };
        let zone = TimeZone::system();
        let (from, to) = match window(&args, &zone) {
            Ok(window) => window,
            Err(message) => return error(message),
        };
        match self.state.agenda.events(from, to).await {
            Ok(mut items) => {
                items.sort_by_key(|item| item.start);
                let events: Vec<_> = items
                    .into_iter()
                    .take(MAX_ITEMS)
                    .map(|item| {
                        json!({
                            "title": item.title,
                            "start": clock(item.start, &zone),
                            "end": clock(item.end, &zone),
                            "all_day": item.all_day,
                            "location": item.location,
                            "calendar": item.calendar,
                        })
                    })
                    .collect();
                json!({
                    "from": clock(from, &zone),
                    "to": clock(to, &zone),
                    "events": events,
                })
                .to_string()
            }
            Err(AgendaError::Denied) => error(
                "calendar access is not allowed yet; tell the user they can allow it in Me > Calendar, or by adding any event from a card",
            ),
            Err(AgendaError::Unavailable) => {
                error("the calendar cannot be read on this device; say so briefly")
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shanghai() -> TimeZone {
        TimeZone::get("Asia/Shanghai").unwrap()
    }

    fn args(end: Option<&str>) -> ProposeArgs {
        ProposeArgs {
            title: " 带孩子打疫苗 ".into(),
            date: "2026-11-12".into(),
            start: "15:00".into(),
            end: end.map(Into::into),
            location: Some("社区卫生服务中心".into()),
            notes: None,
            reminder: Some(60),
        }
    }

    #[test]
    fn drafts_use_local_time_and_default_to_an_hour() {
        let event = draft(args(None), &shanghai()).unwrap();
        assert_eq!(event.title, "带孩子打疫苗");
        assert_eq!(event.end - event.start, 60 * 60 * 1000);
        assert_eq!(
            Timestamp::from_millisecond(event.start).unwrap().to_string(),
            "2026-11-12T07:00:00Z"
        );
        assert_eq!(event.reminder, Some(60));
        assert!(event.id.ends_with("@xiaoban"));
    }

    #[test]
    fn an_end_before_the_start_runs_past_midnight() {
        let event = draft(args(Some("01:00")), &shanghai()).unwrap();
        assert_eq!(event.end - event.start, 10 * 60 * 60 * 1000);
    }

    #[test]
    fn vague_times_are_rejected() {
        let mut vague = args(None);
        vague.start = "下午".into();
        assert!(draft(vague, &shanghai()).is_err());
    }

    #[test]
    fn windows_cover_whole_days() {
        let (from, to) = window(
            &ReadArgs {
                date: Some("2026-11-12".into()),
                days: Some(2),
            },
            &shanghai(),
        )
        .unwrap();
        assert_eq!(to - from, 2 * 24 * 60 * 60 * 1000);
        assert_eq!(
            Timestamp::from_millisecond(from).unwrap().to_string(),
            "2026-11-11T16:00:00Z"
        );
    }
}
