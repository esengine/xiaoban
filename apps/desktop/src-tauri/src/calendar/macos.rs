use std::sync::mpsc;
use std::time::Duration;

use block2::RcBlock;
use objc2::Message;
use objc2::rc::Retained;
use objc2::runtime::Bool;
use objc2_event_kit::{
    EKAuthorizationStatus, EKCalendar, EKEntityType, EKEvent, EKEventStore, EKSpan,
};
use objc2_foundation::{NSArray, NSDate, NSError, NSString, NSURL};
use xiaoban_protocol::TripCalendar;

use super::{Status, SyncOutcome};

const ASK_TIMEOUT: Duration = Duration::from_secs(120);
const DAY_SECONDS: f64 = 24.0 * 60.0 * 60.0;
const LOOK_AROUND_DAYS: f64 = 60.0;

fn granted(store: &EKEventStore) -> bool {
    let status = unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) };
    if status == EKAuthorizationStatus::FullAccess {
        return true;
    }
    if status != EKAuthorizationStatus::NotDetermined {
        return false;
    }
    let (reply, answer) = mpsc::channel();
    let handler = RcBlock::new(move |granted: Bool, _: *mut NSError| {
        let _ = reply.send(granted.as_bool());
    });
    unsafe { store.requestFullAccessToEventsWithCompletion(RcBlock::as_ptr(&handler)) };
    answer.recv_timeout(ASK_TIMEOUT).unwrap_or(false)
}

fn calendar(store: &EKEventStore, name: &str) -> Option<Retained<EKCalendar>> {
    let calendars = unsafe { store.calendarsForEntityType(EKEntityType::Event) };
    if let Some(existing) = calendars
        .iter()
        .find(|calendar| unsafe { calendar.title() }.to_string() == name)
    {
        return Some(existing);
    }
    let source = unsafe { store.defaultCalendarForNewEvents() }
        .and_then(|default| unsafe { default.source() })?;
    let created =
        unsafe { EKCalendar::calendarForEntityType_eventStore(EKEntityType::Event, store) };
    unsafe {
        created.setTitle(&NSString::from_str(name));
        created.setSource(Some(&source));
        store.saveCalendar_commit_error(&created, true)
    }
    .inspect_err(|error| tracing::warn!(code = error.code(), "could not create the trip calendar"))
    .ok()?;
    Some(created)
}

fn marker(trip_id: &str) -> String {
    format!("xiaoban://trip/{trip_id}")
}

#[allow(clippy::cast_precision_loss)]
fn date(ms: i64) -> Retained<NSDate> {
    NSDate::dateWithTimeIntervalSince1970(ms as f64 / 1000.0)
}

fn remove_previous(store: &EKEventStore, target: &EKCalendar, calendar: &TripCalendar) {
    let (Some(first), Some(last)) = (
        calendar.events.iter().map(|event| event.start).min(),
        calendar.events.iter().map(|event| event.end).max(),
    ) else {
        return;
    };
    let window = LOOK_AROUND_DAYS * DAY_SECONDS;
    let start = date(first).dateByAddingTimeInterval(-window);
    let end = date(last).dateByAddingTimeInterval(window);
    let calendars = NSArray::from_retained_slice(&[target.retain()]);
    let predicate = unsafe {
        store.predicateForEventsWithStartDate_endDate_calendars(&start, &end, Some(&calendars))
    };
    let marker = marker(&calendar.trip_id);
    let events = unsafe { store.eventsMatchingPredicate(&predicate) };
    for event in &events {
        let ours = unsafe { event.URL() }
            .and_then(|url| url.absoluteString())
            .is_some_and(|url| url.to_string() == marker);
        if ours {
            let _ =
                unsafe { store.removeEvent_span_commit_error(&event, EKSpan::ThisEvent, false) };
        }
    }
}

pub fn sync(calendar: &TripCalendar, name: &str) -> SyncOutcome {
    let store = unsafe { EKEventStore::new() };
    if !granted(&store) {
        return SyncOutcome::Status(Status::Denied);
    }
    let Some(target) = self::calendar(&store, name) else {
        return SyncOutcome::Status(Status::Failed);
    };
    remove_previous(&store, &target, calendar);
    let link = NSURL::URLWithString(&NSString::from_str(&marker(&calendar.trip_id)));
    let mut added = 0;
    for item in &calendar.events {
        let event = unsafe { EKEvent::eventWithEventStore(&store) };
        unsafe {
            event.setCalendar(Some(&target));
            event.setTitle(Some(&NSString::from_str(&item.title)));
            event.setStartDate(Some(&date(item.start)));
            event.setEndDate(Some(&date(item.end)));
            event.setLocation(Some(&NSString::from_str(&item.location)));
            event.setNotes(Some(&NSString::from_str(&item.notes)));
            event.setURL(link.as_deref());
        }
        match unsafe { store.saveEvent_span_commit_error(&event, EKSpan::ThisEvent, false) } {
            Ok(()) => added += 1,
            Err(error) => tracing::warn!(code = error.code(), "could not save a trip event"),
        }
    }
    if let Err(error) = unsafe { store.commit() } {
        tracing::warn!(code = error.code(), "could not commit trip events");
        return SyncOutcome::Status(Status::Failed);
    }
    SyncOutcome::Added { added }
}
