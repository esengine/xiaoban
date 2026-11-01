use std::fmt::Write as _;

use jiff::civil::{Date, Time};
use jiff::tz::TimeZone;
use jiff::{Timestamp, ToSpan};
use xiaoban_protocol::{CalendarEvent, Trip, TripCalendar};

const DEFAULT_MINUTES: i64 = 60;
const PRODUCT: &str = "-//Xiaoban//Trip//EN";

fn zone(trip: &Trip) -> TimeZone {
    trip.timezone
        .as_deref()
        .and_then(|name| TimeZone::get(name).ok())
        .unwrap_or_else(TimeZone::system)
}

fn start_of(date: Date, time: &str, zone: &TimeZone) -> Option<Timestamp> {
    let time = Time::strptime("%H:%M", time.trim()).ok()?;
    date.to_datetime(time)
        .to_zoned(zone.clone())
        .ok()
        .map(|zoned| zoned.timestamp())
}

fn events(trip: &Trip, zone: &TimeZone) -> Vec<CalendarEvent> {
    let mut events = Vec::new();
    for (day_index, day) in trip.days.iter().enumerate() {
        let Ok(date) = day.date.parse::<Date>() else {
            continue;
        };
        let starts: Vec<_> = day
            .stops
            .iter()
            .map(|stop| start_of(date, &stop.time, zone))
            .collect();
        for (stop_index, stop) in day.stops.iter().enumerate() {
            let Some(start) = starts[stop_index] else {
                continue;
            };
            let fallback = start
                .checked_add(DEFAULT_MINUTES.minutes())
                .unwrap_or(start);
            let end = starts
                .get(stop_index + 1)
                .copied()
                .flatten()
                .filter(|next| *next > start)
                .unwrap_or(fallback);
            events.push(CalendarEvent {
                uid: format!("{}-{day_index}-{stop_index}@xiaoban", trip.id),
                title: stop.name.clone(),
                start: start.as_millisecond(),
                end: end.as_millisecond(),
                location: format!("{} {}", trip.city, stop.name),
                notes: stop.note.clone(),
            });
        }
    }
    events
}

fn escape(text: &str) -> String {
    text.replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace('\n', "\\n")
}

fn stamp(ms: i64) -> String {
    Timestamp::from_millisecond(ms)
        .map(|at| at.strftime("%Y%m%dT%H%M%SZ").to_string())
        .unwrap_or_default()
}

fn fold(line: &str, out: &mut String) {
    let mut width = 0;
    for ch in line.chars() {
        let len = ch.len_utf8();
        if width + len > 74 {
            out.push_str("\r\n ");
            width = 1;
        }
        out.push(ch);
        width += len;
    }
    out.push_str("\r\n");
}

fn ics(trip: &Trip, events: &[CalendarEvent], sequence: u32) -> String {
    let mut out = String::new();
    let now = stamp(Timestamp::now().as_millisecond());
    for line in [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        &format!("PRODID:{PRODUCT}"),
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        &format!("X-WR-CALNAME:{}", escape(&trip.title)),
    ] {
        fold(line, &mut out);
    }
    for event in events {
        for line in [
            "BEGIN:VEVENT".to_owned(),
            format!("UID:{}", event.uid),
            format!("SEQUENCE:{sequence}"),
            format!("DTSTAMP:{now}"),
            format!("DTSTART:{}", stamp(event.start)),
            format!("DTEND:{}", stamp(event.end)),
            format!("SUMMARY:{}", escape(&event.title)),
            format!("LOCATION:{}", escape(&event.location)),
            format!("DESCRIPTION:{}", escape(&event.notes)),
            "END:VEVENT".to_owned(),
        ] {
            fold(&line, &mut out);
        }
    }
    let _ = write!(out, "END:VCALENDAR\r\n");
    out
}

pub fn build(trip: &Trip) -> TripCalendar {
    let zone = zone(trip);
    let events = events(trip, &zone);
    TripCalendar {
        trip_id: trip.id.clone(),
        ics: ics(trip, &events, trip.version),
        events,
    }
}

#[cfg(test)]
mod tests {
    use xiaoban_protocol::{TripDay, TripStop};

    use super::*;

    fn stop(name: &str, time: &str) -> TripStop {
        TripStop {
            name: name.into(),
            time: time.into(),
            note: "备注, 有逗号".into(),
            location: None,
            next: None,
            detail: None,
        }
    }

    fn trip() -> Trip {
        Trip {
            id: "t1".into(),
            thread_id: "th".into(),
            version: 3,
            title: "杭州 · 1 天".into(),
            city: "杭州".into(),
            timezone: Some("Asia/Shanghai".into()),
            party: String::new(),
            needs: None,
            reminder: None,
            costs: None,
            verified: true,
            days: vec![TripDay {
                date: "2026-11-14".into(),
                weather: None,
                change: None,
                stops: vec![
                    stop("断桥", "09:00"),
                    stop("孤山", "10:30"),
                    stop("坏时间", "上午"),
                ],
            }],
            created_at: 0,
        }
    }

    #[test]
    fn events_end_when_the_next_stop_starts() {
        let calendar = build(&trip());
        assert_eq!(calendar.events.len(), 2);
        let first = &calendar.events[0];
        assert_eq!(first.uid, "t1-0-0@xiaoban");
        assert_eq!(first.end - first.start, 90 * 60 * 1000);
        let last = &calendar.events[1];
        assert_eq!(last.end - last.start, 60 * 60 * 1000);
        assert_eq!(
            Timestamp::from_millisecond(first.start)
                .unwrap()
                .to_string(),
            "2026-11-14T01:00:00Z"
        );
    }

    #[test]
    fn ics_escapes_text_and_uses_crlf() {
        let text = build(&trip()).ics;
        assert!(text.starts_with("BEGIN:VCALENDAR\r\n"));
        assert!(text.contains("DTSTART:20261114T010000Z\r\n"));
        assert!(text.contains("SEQUENCE:3\r\n"));
        assert!(text.contains("备注\\, 有逗号"));
        assert!(text.ends_with("END:VCALENDAR\r\n"));
        assert!(text.lines().all(|line| line.len() <= 75));
    }
}
