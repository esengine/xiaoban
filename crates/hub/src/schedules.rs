use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::Duration;

use jiff::civil::{Date, Time};
use jiff::tz::TimeZone;
use jiff::{Timestamp, ToSpan};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{
    Attachment, ContextNote, ErrorCode, Event, Failure, ProtocolError, Request, Response, RunMark,
    Schedule, ScheduleNotify, ScheduleOutput, ScheduleResult, ScheduleRule, ScheduleState,
    ScheduleStop,
};
use xiaoban_store::{NewMessage, now_ms};

use crate::state::SharedState;
use crate::tools::HubTools;

pub const PROPOSE_SCHEDULE: &str = "propose_schedule";
pub const REPORT_SCHEDULE: &str = "report_schedule";
pub const MIN_EVERY: u32 = 30;
const KEY: &str = "schedules";
const GRACE_MS: i64 = 10 * 60 * 1000;
const TICK: Duration = Duration::from_secs(20);
const DAY_MINUTES: u16 = 24 * 60;
const MAX_TITLE: usize = 40;
const MAX_STATUS: usize = 24;
const MAX_DRAFTS: usize = 40;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Done,
    Failed,
    Met,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Report {
    pub outcome: Outcome,
    pub status: String,
    pub changed: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Run {
    pub schedule_id: String,
    pub mark: RunMark,
    pub started_at: i64,
    pub report: Option<Report>,
}

#[derive(Debug, Default)]
pub struct Runs {
    by_thread: Mutex<HashMap<String, Run>>,
    quiet: Mutex<HashSet<String>>,
    book: tokio::sync::Mutex<()>,
    wake: Notify,
}

impl Runs {
    fn register(&self, thread_id: &str, run: Run) -> bool {
        let mut runs = self.by_thread.lock().unwrap();
        if runs.contains_key(thread_id) {
            return false;
        }
        runs.insert(thread_id.to_owned(), run);
        true
    }

    fn take(&self, thread_id: &str) -> Option<Run> {
        self.by_thread.lock().unwrap().remove(thread_id)
    }

    fn running(&self, thread_id: &str) -> Option<Run> {
        self.by_thread.lock().unwrap().get(thread_id).cloned()
    }

    fn report(&self, thread_id: &str, report: Report) -> Option<Run> {
        let mut runs = self.by_thread.lock().unwrap();
        let run = runs.get_mut(thread_id)?;
        run.report = Some(report);
        Some(run.clone())
    }

    pub fn take_quiet(&self, turn_id: &str) -> bool {
        self.quiet.lock().unwrap().remove(turn_id)
    }

    fn hush(&self, turn_id: &str) {
        self.quiet.lock().unwrap().insert(turn_id.to_owned());
    }
}

pub(crate) fn at(date: Date, minute: u16, zone: &TimeZone) -> Option<Timestamp> {
    let time = Time::new(
        i8::try_from(minute / 60).ok()?,
        i8::try_from(minute % 60).ok()?,
        0,
        0,
    )
    .ok()?;
    date.to_datetime(time)
        .to_zoned(zone.clone())
        .ok()
        .map(|zoned| zoned.timestamp())
}

fn scan(
    start: Date,
    days: u16,
    after: Timestamp,
    zone: &TimeZone,
    pick: impl Fn(Date) -> Option<u16>,
) -> Option<Timestamp> {
    let mut day = start;
    for _ in 0..days {
        if let Some(minute) = pick(day)
            && let Some(found) = at(day, minute, zone)
            && found > after
        {
            return Some(found);
        }
        day = day.tomorrow().ok()?;
    }
    None
}

fn month_hit(day: Date, wanted: &[u8]) -> bool {
    let last = day.days_in_month();
    wanted
        .iter()
        .any(|want| i8::try_from(*want).unwrap_or(31).min(last) == day.day())
}

fn weekday_of(day: Date) -> u8 {
    u8::try_from(day.weekday().to_monday_one_offset()).unwrap_or(1)
}

fn every(
    minutes: u32,
    window: Option<(u16, u16)>,
    after: Timestamp,
    zone: &TimeZone,
) -> Option<Timestamp> {
    let step = i64::from(minutes.max(MIN_EVERY));
    let Some((from, to)) = window else {
        let next = after.as_millisecond() + step * 60_000;
        return Timestamp::from_millisecond(next - next.rem_euclid(60_000)).ok();
    };
    let length = match to.cmp(&from) {
        std::cmp::Ordering::Greater => i64::from(to - from),
        std::cmp::Ordering::Less => i64::from(to) + i64::from(DAY_MINUTES) - i64::from(from),
        std::cmp::Ordering::Equal => i64::from(DAY_MINUTES) - 1,
    };
    let mut day = after.to_zoned(zone.clone()).date().yesterday().ok()?;
    for _ in 0..4 {
        if let Some(base) = at(day, from, zone) {
            let mut offset = 0;
            while offset <= length {
                let found = base.checked_add(offset.minutes()).ok()?;
                if found > after {
                    return Some(found);
                }
                offset += step;
            }
        }
        day = day.tomorrow().ok()?;
    }
    None
}

pub fn next_after(rule: &ScheduleRule, after: Timestamp, zone: &TimeZone) -> Option<Timestamp> {
    let today = after.to_zoned(zone.clone()).date();
    match rule {
        ScheduleRule::Once { at } => Timestamp::from_millisecond(*at)
            .ok()
            .filter(|found| *found > after),
        ScheduleRule::Daily { minute } => scan(today, 3, after, zone, |_| Some(*minute)),
        ScheduleRule::Weekly { weekdays, minute } => scan(today, 9, after, zone, |day| {
            weekdays.contains(&weekday_of(day)).then_some(*minute)
        }),
        ScheduleRule::Monthly { days, minute } => scan(today, 400, after, zone, |day| {
            month_hit(day, days).then_some(*minute)
        }),
        ScheduleRule::Every { minutes, from, to } => {
            every(*minutes, from.zip(*to), after, zone)
        }
    }
}

pub fn upcoming(schedule: &Schedule, after: Timestamp, zone: &TimeZone) -> Option<i64> {
    if let ScheduleStop::Count { runs } = schedule.stop
        && schedule.runs >= runs
    {
        return None;
    }
    let next = next_after(&schedule.rule, after, zone)?;
    if let ScheduleStop::Until { date } = &schedule.stop
        && let Ok(last) = date.parse::<Date>()
        && next.to_zoned(zone.clone()).date() > last
    {
        return None;
    }
    Some(next.as_millisecond())
}

pub fn due(schedule: &mut Schedule, now: Timestamp, zone: &TimeZone) -> Option<(RunMark, i64)> {
    if schedule.state != ScheduleState::Active {
        return None;
    }
    let planned = schedule.next_at?;
    let now_ms = now.as_millisecond();
    if planned > now_ms {
        return None;
    }
    let mark = if now_ms - planned > GRACE_MS {
        RunMark::Catchup
    } else {
        RunMark::Scheduled
    };
    let counted = Schedule {
        runs: schedule.runs + 1,
        ..schedule.clone()
    };
    schedule.next_at = upcoming(&counted, now, zone);
    Some((mark, planned))
}

pub fn settle(schedule: &mut Schedule, run: &Run, failure: Option<String>, now: i64) -> bool {
    schedule.runs += 1;
    let report = run.report.as_ref();
    let met = report.is_some_and(|report| report.outcome == Outcome::Met);
    let failed = failure.is_some() || report.is_some_and(|report| report.outcome == Outcome::Failed);
    schedule.last = Some(ScheduleResult {
        at: run.started_at,
        duration_ms: (now - run.started_at).max(0),
        ok: !failed,
        status: report.map(|report| report.status.clone()).unwrap_or_default(),
        reason: failure.or_else(|| report.and_then(|report| report.reason.clone())),
    });
    let counted_out = matches!(schedule.stop, ScheduleStop::Count { runs } if schedule.runs >= runs);
    let ran_out = run.mark != RunMark::Manual && schedule.next_at.is_none();
    let live = matches!(schedule.state, ScheduleState::Active | ScheduleState::Paused);
    if live && (met || counted_out || (ran_out && schedule.state == ScheduleState::Active)) {
        schedule.state = ScheduleState::Finished;
        schedule.next_at = None;
    }
    match schedule.notify {
        ScheduleNotify::Off => false,
        ScheduleNotify::Changed => failed || met || report.is_some_and(|report| report.changed),
        ScheduleNotify::Done => true,
    }
}

pub async fn load(state: &SharedState) -> Vec<Schedule> {
    state
        .store
        .setting_owned(KEY.to_owned())
        .await
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

async fn save(state: &SharedState, schedules: &[Schedule]) {
    let _ = state
        .store
        .set_setting_owned(
            KEY.to_owned(),
            serde_json::to_string(schedules).unwrap_or_default(),
        )
        .await;
}

async fn find(state: &SharedState, id: &str) -> Option<Schedule> {
    load(state).await.into_iter().find(|schedule| schedule.id == id)
}

async fn change<T>(
    state: &SharedState,
    id: &str,
    edit: impl FnOnce(&mut Schedule) -> Result<T, ProtocolError>,
) -> Result<(Schedule, T), ProtocolError> {
    let _guard = state.schedules.book.lock().await;
    let mut schedules = load(state).await;
    let Some(schedule) = schedules.iter_mut().find(|schedule| schedule.id == id) else {
        return Err(not_found());
    };
    let value = edit(schedule)?;
    let saved = schedule.clone();
    save(state, &schedules).await;
    state.publish(Event::ScheduleUpdated {
        schedule: saved.clone(),
    });
    Ok((saved, value))
}

fn not_found() -> ProtocolError {
    ProtocolError::new(ErrorCode::NotFound, "no such scheduled task")
}

fn bad(message: &str) -> ProtocolError {
    ProtocolError::new(ErrorCode::BadRequest, message)
}

pub fn check_rule(rule: &ScheduleRule) -> Result<(), &'static str> {
    let minute_ok = |minute: &u16| *minute < DAY_MINUTES;
    match rule {
        ScheduleRule::Daily { minute } if minute_ok(minute) => Ok(()),
        ScheduleRule::Weekly { weekdays, minute }
            if minute_ok(minute)
                && !weekdays.is_empty()
                && weekdays.iter().all(|day| (1..=7).contains(day)) =>
        {
            Ok(())
        }
        ScheduleRule::Monthly { days, minute }
            if minute_ok(minute)
                && !days.is_empty()
                && days.iter().all(|day| (1..=31).contains(day)) =>
        {
            Ok(())
        }
        ScheduleRule::Every { minutes, .. } if *minutes < MIN_EVERY => {
            Err("repeat at most every 30 minutes")
        }
        ScheduleRule::Every { from, to, .. }
            if from.is_some() != to.is_some()
                || from.is_some_and(|from| from >= DAY_MINUTES)
                || to.is_some_and(|to| to >= DAY_MINUTES) =>
        {
            Err("give both ends of the time window as HH:MM")
        }
        ScheduleRule::Once { .. } | ScheduleRule::Every { .. } => Ok(()),
        _ => Err("weekdays are 1-7 (Monday is 1), month days are 1-31, times are HH:MM"),
    }
}

async fn result_thread(state: &SharedState, schedule: &Schedule) -> Result<String, ProtocolError> {
    let wanted = match schedule.output {
        ScheduleOutput::SameThread => Some(schedule.origin_thread_id.clone()),
        ScheduleOutput::NewThread => schedule
            .thread_id
            .clone()
            .filter(|id| *id != schedule.origin_thread_id),
    };
    if let Some(id) = wanted
        && state.store.thread(id.clone()).await.is_ok()
    {
        return Ok(id);
    }
    let thread = state
        .store
        .create_thread(Some(schedule.title.clone()))
        .await?;
    state.publish(Event::ThreadUpdated {
        thread: thread.clone(),
    });
    Ok(thread.id)
}

async fn begin(state: &SharedState, id: &str) -> Result<Schedule, ProtocolError> {
    let zone = TimeZone::system();
    let draft = find(state, id).await.ok_or_else(not_found)?;
    if draft.state != ScheduleState::Draft {
        return Ok(draft);
    }
    if let Some(target) = draft.replaces.clone()
        && find(state, &target).await.is_some()
    {
        let (updated, ()) = change(state, &target, |schedule| {
            schedule.title.clone_from(&draft.title);
            schedule.task.clone_from(&draft.task);
            schedule.rule = draft.rule.clone();
            schedule.stop = draft.stop.clone();
            schedule.notify = draft.notify;
            if schedule.state != ScheduleState::Paused {
                schedule.state = ScheduleState::Active;
            }
            schedule.next_at = upcoming(schedule, Timestamp::now(), &zone);
            if schedule.next_at.is_none() && schedule.state == ScheduleState::Active {
                schedule.state = ScheduleState::Finished;
            }
            Ok(())
        })
        .await?;
        change(state, id, |schedule| {
            schedule.state = ScheduleState::Applied;
            schedule.thread_id.clone_from(&updated.thread_id);
            Ok(())
        })
        .await?;
        return Ok(updated);
    }
    let thread_id = result_thread(state, &draft).await?;
    let (started, ()) = change(state, id, |schedule| {
        let next = upcoming(schedule, Timestamp::now(), &zone)
            .ok_or_else(|| bad("that time has already passed"))?;
        schedule.state = ScheduleState::Active;
        schedule.thread_id = Some(thread_id);
        schedule.next_at = Some(next);
        Ok(())
    })
    .await?;
    state.schedules.wake.notify_one();
    Ok(started)
}

async fn update(state: &SharedState, next: Schedule) -> Result<Schedule, ProtocolError> {
    check_rule(&next.rule).map_err(bad)?;
    let title = next.title.trim().chars().take(MAX_TITLE).collect::<String>();
    let task = next.task.trim().to_owned();
    if title.is_empty() || task.is_empty() {
        return Err(bad("a scheduled task needs a name and something to do"));
    }
    let current = find(state, &next.id).await.ok_or_else(not_found)?;
    let thread_id = if current.state == ScheduleState::Draft {
        current.thread_id.clone()
    } else {
        let moved = Schedule {
            output: next.output,
            ..current.clone()
        };
        Some(result_thread(state, &moved).await?)
    };
    let zone = TimeZone::system();
    let (saved, ()) = change(state, &next.id, |schedule| {
        schedule.title = title;
        schedule.task = task;
        schedule.rule = next.rule;
        schedule.stop = next.stop;
        schedule.output = next.output;
        schedule.notify = next.notify;
        schedule.thread_id = thread_id;
        if matches!(schedule.state, ScheduleState::Active | ScheduleState::Finished) {
            schedule.next_at = upcoming(schedule, Timestamp::now(), &zone);
            schedule.state = if schedule.next_at.is_some() {
                ScheduleState::Active
            } else {
                ScheduleState::Finished
            };
        }
        Ok(())
    })
    .await?;
    state.schedules.wake.notify_one();
    Ok(saved)
}

async fn set_active(state: &SharedState, id: &str, active: bool) -> Result<Schedule, ProtocolError> {
    let zone = TimeZone::system();
    let (saved, ()) = change(state, id, |schedule| {
        if schedule.state == ScheduleState::Draft || schedule.state == ScheduleState::Applied {
            return Err(bad("tap Start on the card first"));
        }
        if active {
            schedule.next_at = upcoming(schedule, Timestamp::now(), &zone);
            if schedule.next_at.is_none() {
                return Err(bad("this task has nothing left to run"));
            }
            schedule.state = ScheduleState::Active;
        } else {
            schedule.state = ScheduleState::Paused;
            schedule.next_at = None;
        }
        Ok(())
    })
    .await?;
    state.schedules.wake.notify_one();
    Ok(saved)
}

async fn remove(state: &SharedState, id: &str) -> Result<(), ProtocolError> {
    let _guard = state.schedules.book.lock().await;
    let mut schedules = load(state).await;
    let before = schedules.len();
    schedules.retain(|schedule| schedule.id != id);
    if schedules.len() == before {
        return Err(not_found());
    }
    save(state, &schedules).await;
    state.publish(Event::ScheduleRemoved { id: id.to_owned() });
    Ok(())
}

fn clock(ms: i64, zone: &TimeZone) -> String {
    Timestamp::from_millisecond(ms)
        .map(|at| at.to_zoned(zone.clone()).strftime("%Y-%m-%d %H:%M").to_string())
        .unwrap_or_default()
}

fn hhmm(minute: u16) -> String {
    format!("{:02}:{:02}", minute / 60, minute % 60)
}

fn describe_rule(rule: &ScheduleRule, zone: &TimeZone) -> String {
    match rule {
        ScheduleRule::Once { at } => format!("once at {}", clock(*at, zone)),
        ScheduleRule::Daily { minute } => format!("daily {}", hhmm(*minute)),
        ScheduleRule::Weekly { weekdays, minute } => {
            format!("weekly on {weekdays:?} (1 = Monday) {}", hhmm(*minute))
        }
        ScheduleRule::Monthly { days, minute } => {
            format!("monthly on days {days:?} {}", hhmm(*minute))
        }
        ScheduleRule::Every { minutes, from, to } => match from.zip(*to) {
            Some((from, to)) => format!("every {minutes} minutes between {} and {}", hhmm(from), hhmm(to)),
            None => format!("every {minutes} minutes"),
        },
    }
}

fn run_note(
    l: &Localizer,
    schedule: &Schedule,
    mark: RunMark,
    due_at: i64,
    zone: &TimeZone,
) -> ContextNote {
    let mut body = vec![l.text(keys::SCHEDULE_RUN_RULES)];
    if mark == RunMark::Catchup {
        let short = |ms: i64| {
            Timestamp::from_millisecond(ms)
                .map(|at| at.to_zoned(zone.clone()).strftime("%H:%M").to_string())
                .unwrap_or_default()
        };
        body.push(l.format(
            keys::SCHEDULE_RUN_CATCHUP,
            &[("due", &short(due_at)), ("now", &short(now_ms()))],
        ));
    }
    if let ScheduleStop::Condition { text } = &schedule.stop {
        body.push(l.format(keys::SCHEDULE_RUN_CONDITION, &[("condition", text)]));
    }
    if schedule.notify == ScheduleNotify::Changed {
        let last = schedule
            .last
            .as_ref()
            .map(|last| last.status.clone())
            .filter(|status| !status.is_empty())
            .unwrap_or_else(|| "-".to_owned());
        body.push(l.format(keys::SCHEDULE_RUN_CHANGED, &[("last", &last)]));
    }
    ContextNote {
        label: l.format(keys::SCHEDULE_RUN_LABEL, &[("title", &schedule.title)]),
        body: body.join("\n"),
    }
}

async fn dispatch(
    state: &SharedState,
    schedule: &Schedule,
    mark: RunMark,
    due_at: i64,
) -> Result<String, ProtocolError> {
    let thread_id = result_thread(state, schedule).await?;
    if schedule.thread_id.as_deref() != Some(thread_id.as_str()) {
        let id = thread_id.clone();
        let _guard = state.schedules.book.lock().await;
        let mut schedules = load(state).await;
        if let Some(stored) = schedules.iter_mut().find(|item| item.id == schedule.id) {
            stored.thread_id = Some(id);
            save(state, &schedules).await;
        }
    }
    let run = Run {
        schedule_id: schedule.id.clone(),
        mark,
        started_at: now_ms(),
        report: None,
    };
    if !state.schedules.register(&thread_id, run) {
        return Err(ProtocolError::new(ErrorCode::Busy, "already running"));
    }
    let zone = TimeZone::system();
    let note = run_note(&state.localizer, schedule, mark, due_at, &zone);
    let started = crate::turns::start(
        state,
        thread_id.clone(),
        schedule.task.clone(),
        vec![note],
        None,
        Vec::new(),
        Some(Attachment::ScheduleRun {
            schedule_id: schedule.id.clone(),
            mark,
            due_at,
        }),
    )
    .await;
    match started {
        Ok(_) => Ok(thread_id),
        Err(failure) => {
            state.schedules.take(&thread_id);
            Err(failure)
        }
    }
}

pub async fn tick(state: &SharedState, now: Timestamp) {
    let zone = TimeZone::system();
    let picked: Vec<(Schedule, RunMark, i64, Option<i64>)> = {
        let _guard = state.schedules.book.lock().await;
        let mut schedules = load(state).await;
        let mut picked = Vec::new();
        for schedule in &mut schedules {
            let before = schedule.next_at;
            if let Some((mark, due_at)) = due(schedule, now, &zone) {
                picked.push((schedule.clone(), mark, due_at, before));
            }
        }
        if !picked.is_empty() {
            save(state, &schedules).await;
        }
        picked
    };
    for (schedule, mark, due_at, before) in picked {
        match dispatch(state, &schedule, mark, due_at).await {
            Ok(_) => {}
            Err(failure) if failure.code == ErrorCode::Busy => {
                let _ = change(state, &schedule.id, |stored| {
                    stored.next_at = before;
                    Ok(())
                })
                .await;
            }
            Err(failure) => {
                tracing::warn!(?failure, "could not start a scheduled task");
            }
        }
        if let Some(saved) = find(state, &schedule.id).await {
            state.publish(Event::ScheduleUpdated { schedule: saved });
        }
    }
}

async fn finish(state: &SharedState, thread_id: &str, turn_id: &str, failure: Option<String>) {
    let Some(run) = state.schedules.take(thread_id) else {
        return;
    };
    let ended = now_ms();
    let outcome = change(state, &run.schedule_id, |schedule| {
        Ok(settle(schedule, &run, failure.clone(), ended))
    })
    .await;
    let Ok((schedule, notify)) = outcome else {
        return;
    };
    if !notify {
        state.schedules.hush(turn_id);
    }
    if let Some(reason) = failure {
        let card = state
            .store
            .append_message(
                thread_id.to_owned(),
                NewMessage::assistant(String::new()).attaching(Some(Attachment::ScheduleFailed {
                    schedule_id: schedule.id.clone(),
                    reason,
                })),
            )
            .await;
        if let Ok(message) = card {
            state.publish(Event::MessageCreated { message });
        }
    }
}

pub async fn after_turn(state: &SharedState, thread_id: &str, turn_id: &str) {
    finish(state, thread_id, turn_id, None).await;
}

fn failure_text(l: &Localizer, failure: &Failure) -> String {
    use xiaoban_protocol::FailureKind;
    let key = match failure.kind {
        FailureKind::Model => keys::FAILURE_MODEL,
        FailureKind::NotConfigured => keys::FAILURE_NOT_CONFIGURED,
        FailureKind::InvalidKey => keys::FAILURE_INVALID_KEY,
        FailureKind::UnknownModel => keys::FAILURE_UNKNOWN_MODEL,
        FailureKind::InvalidEndpoint => keys::FAILURE_INVALID_ENDPOINT,
        FailureKind::Network => keys::FAILURE_NETWORK,
        FailureKind::Cancelled => keys::FAILURE_CANCELLED,
        FailureKind::Budget => keys::FAILURE_BUDGET,
        FailureKind::Internal => keys::FAILURE_INTERNAL,
    };
    l.text(key)
}

pub async fn after_failure(state: &SharedState, thread_id: &str, turn_id: &str, failure: &Failure) {
    let reason = failure_text(&state.localizer, failure);
    finish(state, thread_id, turn_id, Some(reason)).await;
}

pub async fn note(state: &SharedState, thread_id: &str) -> Option<ContextNote> {
    if state.schedules.running(thread_id).is_some() {
        return None;
    }
    let schedule = load(state).await.into_iter().find(|schedule| {
        schedule.thread_id.as_deref() == Some(thread_id)
            && schedule.output == ScheduleOutput::NewThread
            && !matches!(schedule.state, ScheduleState::Draft | ScheduleState::Applied)
    })?;
    let zone = TimeZone::system();
    Some(ContextNote {
        label: state.localizer.text(keys::SCHEDULE_THREAD_LABEL),
        body: state.localizer.format(
            keys::SCHEDULE_THREAD_NOTE,
            &[
                ("title", &schedule.title),
                ("id", &schedule.id),
                ("rule", &describe_rule(&schedule.rule, &zone)),
                ("task", &schedule.task),
            ],
        ),
    })
}

pub fn watch(state: SharedState, shutdown: CancellationToken) {
    tokio::spawn(async move {
        loop {
            tick(&state, Timestamp::now()).await;
            tokio::select! {
                () = tokio::time::sleep(TICK) => {}
                () = state.schedules.wake.notified() => {}
                () = shutdown.cancelled() => return,
            }
        }
    });
}

async fn run_now(state: &SharedState, id: &str) -> Result<Schedule, ProtocolError> {
    let schedule = find(state, id).await.ok_or_else(not_found)?;
    if matches!(schedule.state, ScheduleState::Draft | ScheduleState::Applied) {
        return Err(bad("tap Start on the card first"));
    }
    dispatch(state, &schedule, RunMark::Manual, now_ms()).await?;
    find(state, id).await.ok_or_else(not_found)
}

pub async fn handle(state: &SharedState, request: Request) -> Result<Response, ProtocolError> {
    let schedule = match request {
        Request::ListSchedules => {
            let mut schedules: Vec<Schedule> = load(state)
                .await
                .into_iter()
                .filter(|schedule| {
                    !matches!(schedule.state, ScheduleState::Draft | ScheduleState::Applied)
                })
                .collect();
            schedules.sort_by_key(|schedule| std::cmp::Reverse(schedule.created_at));
            return Ok(Response::Schedules { schedules });
        }
        Request::Schedule { id } => find(state, &id).await.ok_or_else(not_found)?,
        Request::StartSchedule { id } => begin(state, &id).await?,
        Request::UpdateSchedule { schedule } => update(state, *schedule).await?,
        Request::SetScheduleActive { id, active } => set_active(state, &id, active).await?,
        Request::RunSchedule { id } => run_now(state, &id).await?,
        Request::DeleteSchedule { id } => {
            remove(state, &id).await?;
            return Ok(Response::Ack);
        }
        _ => return Err(bad("not a schedule request")),
    };
    Ok(Response::Schedule { schedule })
}

pub fn is_tool(name: &str) -> bool {
    matches!(name, PROPOSE_SCHEDULE | REPORT_SCHEDULE)
}

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

pub fn specs(l: &Localizer) -> Vec<ToolSpec> {
    let day_list = |key: Key, max: u8| {
        json!({
            "type": "array",
            "items": { "type": "integer", "minimum": 1, "maximum": max },
            "description": l.text(key),
        })
    };
    vec![
        ToolSpec {
            name: PROPOSE_SCHEDULE.to_owned(),
            description: l.text(keys::TOOL_PROPOSE_SCHEDULE_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "title": text(l, keys::TOOL_PROPOSE_SCHEDULE_TITLE),
                    "task": text(l, keys::TOOL_PROPOSE_SCHEDULE_TASK),
                    "kind": {
                        "type": "string",
                        "enum": ["once", "daily", "weekly", "monthly", "every"],
                        "description": l.text(keys::TOOL_PROPOSE_SCHEDULE_KIND),
                    },
                    "at": text(l, keys::TOOL_PROPOSE_SCHEDULE_AT),
                    "time": text(l, keys::TOOL_PROPOSE_SCHEDULE_TIME),
                    "weekdays": day_list(keys::TOOL_PROPOSE_SCHEDULE_WEEKDAYS, 7),
                    "days": day_list(keys::TOOL_PROPOSE_SCHEDULE_DAYS, 31),
                    "every_minutes": {
                        "type": "integer",
                        "minimum": MIN_EVERY,
                        "description": l.text(keys::TOOL_PROPOSE_SCHEDULE_EVERY),
                    },
                    "from": text(l, keys::TOOL_PROPOSE_SCHEDULE_FROM),
                    "to": text(l, keys::TOOL_PROPOSE_SCHEDULE_TO),
                    "until": text(l, keys::TOOL_PROPOSE_SCHEDULE_UNTIL),
                    "runs": {
                        "type": "integer",
                        "minimum": 1,
                        "description": l.text(keys::TOOL_PROPOSE_SCHEDULE_RUNS),
                    },
                    "condition": text(l, keys::TOOL_PROPOSE_SCHEDULE_CONDITION),
                    "results": {
                        "type": "string",
                        "enum": ["new_thread", "this_thread"],
                        "description": l.text(keys::TOOL_PROPOSE_SCHEDULE_RESULTS),
                    },
                    "notify": {
                        "type": "string",
                        "enum": ["done", "changed", "off"],
                        "description": l.text(keys::TOOL_PROPOSE_SCHEDULE_NOTIFY),
                    },
                    "replaces": text(l, keys::TOOL_PROPOSE_SCHEDULE_REPLACES),
                },
                "required": ["title", "task", "kind"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: REPORT_SCHEDULE.to_owned(),
            description: l.text(keys::TOOL_REPORT_SCHEDULE_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "outcome": {
                        "type": "string",
                        "enum": ["done", "failed", "met"],
                        "description": l.text(keys::TOOL_REPORT_SCHEDULE_OUTCOME),
                    },
                    "status": text(l, keys::TOOL_REPORT_SCHEDULE_STATUS),
                    "changed": {
                        "type": "boolean",
                        "description": l.text(keys::TOOL_REPORT_SCHEDULE_CHANGED),
                    },
                    "reason": text(l, keys::TOOL_REPORT_SCHEDULE_REASON),
                },
                "required": ["outcome", "status"],
                "additionalProperties": false,
            }),
        },
    ]
}

#[derive(Debug, Default, Deserialize)]
pub struct ProposeArgs {
    pub title: String,
    pub task: String,
    pub kind: String,
    #[serde(default)]
    pub at: Option<String>,
    #[serde(default)]
    pub time: Option<String>,
    #[serde(default)]
    pub weekdays: Vec<u8>,
    #[serde(default)]
    pub days: Vec<u8>,
    #[serde(default)]
    pub every_minutes: Option<u32>,
    #[serde(default)]
    pub from: Option<String>,
    #[serde(default)]
    pub to: Option<String>,
    #[serde(default)]
    pub until: Option<String>,
    #[serde(default)]
    pub runs: Option<u32>,
    #[serde(default)]
    pub condition: Option<String>,
    #[serde(default)]
    pub results: Option<String>,
    #[serde(default)]
    pub notify: Option<String>,
    #[serde(default)]
    pub replaces: Option<String>,
}

#[derive(Deserialize)]
struct ReportArgs {
    outcome: Outcome,
    status: String,
    #[serde(default)]
    changed: bool,
    #[serde(default)]
    reason: Option<String>,
}

pub(crate) fn parse_minute(text: Option<&str>) -> Option<u16> {
    let text = text?.trim().replace('\u{ff1a}', ":");
    let time = Time::strptime("%H:%M", &text).ok()?;
    u16::try_from(i32::from(time.hour()) * 60 + i32::from(time.minute())).ok()
}

fn filled(text: Option<String>) -> Option<String> {
    text.map(|text| text.trim().to_owned()).filter(|text| !text.is_empty())
}

pub fn rule_of(args: &ProposeArgs, zone: &TimeZone) -> Result<ScheduleRule, &'static str> {
    let minute = || parse_minute(args.time.as_deref()).ok_or("time must be HH:MM");
    let rule = match args.kind.as_str() {
        "once" => {
            let at = args.at.as_deref().map(str::trim).ok_or("at must be YYYY-MM-DD HH:MM")?;
            let (date, time) = at.split_once(' ').ok_or("at must be YYYY-MM-DD HH:MM")?;
            let date: Date = date.parse().map_err(|_| "at must be YYYY-MM-DD HH:MM")?;
            let minute = parse_minute(Some(time)).ok_or("at must be YYYY-MM-DD HH:MM")?;
            let found = self::at(date, minute, zone).ok_or("at must be YYYY-MM-DD HH:MM")?;
            ScheduleRule::Once {
                at: found.as_millisecond(),
            }
        }
        "daily" => ScheduleRule::Daily { minute: minute()? },
        "weekly" => ScheduleRule::Weekly {
            weekdays: sorted(&args.weekdays),
            minute: minute()?,
        },
        "monthly" => ScheduleRule::Monthly {
            days: sorted(&args.days),
            minute: minute()?,
        },
        "every" => ScheduleRule::Every {
            minutes: args.every_minutes.ok_or("every_minutes is required")?,
            from: parse_minute(args.from.as_deref()),
            to: parse_minute(args.to.as_deref()),
        },
        _ => return Err("kind must be once, daily, weekly, monthly or every"),
    };
    check_rule(&rule)?;
    Ok(rule)
}

fn sorted(days: &[u8]) -> Vec<u8> {
    let mut days = days.to_vec();
    days.sort_unstable();
    days.dedup();
    days
}

pub fn stop_of(args: &ProposeArgs) -> Result<ScheduleStop, &'static str> {
    if let Some(condition) = filled(args.condition.clone()) {
        return Ok(ScheduleStop::Condition { text: condition });
    }
    if let Some(runs) = args.runs {
        return Ok(ScheduleStop::Count { runs: runs.max(1) });
    }
    if let Some(until) = filled(args.until.clone()) {
        until.parse::<Date>().map_err(|_| "until must be YYYY-MM-DD")?;
        return Ok(ScheduleStop::Until { date: until });
    }
    Ok(ScheduleStop::Never)
}

pub fn draft(args: ProposeArgs, origin: &str, zone: &TimeZone) -> Result<Schedule, &'static str> {
    let title: String = args.title.trim().chars().take(MAX_TITLE).collect();
    let task = args.task.trim().to_owned();
    if title.is_empty() || task.is_empty() {
        return Err("title and task must not be empty");
    }
    let rule = rule_of(&args, zone)?;
    let stop = stop_of(&args)?;
    let mut schedule = Schedule {
        id: uuid::Uuid::now_v7().to_string(),
        title,
        task,
        rule,
        stop,
        output: match args.results.as_deref() {
            Some("this_thread") => ScheduleOutput::SameThread,
            _ => ScheduleOutput::NewThread,
        },
        notify: match args.notify.as_deref() {
            Some("changed") => ScheduleNotify::Changed,
            Some("off") => ScheduleNotify::Off,
            _ => ScheduleNotify::Done,
        },
        state: ScheduleState::Draft,
        origin_thread_id: origin.to_owned(),
        thread_id: None,
        replaces: filled(args.replaces),
        next_at: None,
        runs: 0,
        last: None,
        created_at: now_ms(),
    };
    schedule.next_at = upcoming(&schedule, Timestamp::now(), zone);
    if schedule.next_at.is_none() {
        return Err("that time has already passed; pick a time in the future");
    }
    Ok(schedule)
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

impl HubTools<'_> {
    pub(crate) async fn schedule_tool(&self, name: &str, arguments: &str) -> String {
        match name {
            PROPOSE_SCHEDULE => self.propose_schedule(arguments).await,
            _ => self.report_schedule(arguments),
        }
    }

    async fn propose_schedule(&self, arguments: &str) -> String {
        if self.state.schedules.running(self.thread_id).is_some() {
            return error("this is a scheduled run; do the task instead of proposing a new one");
        }
        let args = match serde_json::from_str::<ProposeArgs>(arguments) {
            Ok(args) => args,
            Err(failure) => return error(&format!("invalid schedule: {failure}")),
        };
        if matches!(self.attachment(), Some(Attachment::Schedule { .. })) {
            return error("one task card per reply; ask the user to start it first, then propose the next one");
        }
        let zone = TimeZone::system();
        let schedule = match draft(args, self.thread_id, &zone) {
            Ok(schedule) => schedule,
            Err(message) => return error(message),
        };
        {
            let _guard = self.state.schedules.book.lock().await;
            let mut schedules = load(self.state).await;
            let drafts: Vec<String> = schedules
                .iter()
                .filter(|item| item.state == ScheduleState::Draft)
                .map(|item| item.id.clone())
                .collect();
            if drafts.len() >= MAX_DRAFTS {
                let oldest = drafts[0].clone();
                schedules.retain(|item| item.id != oldest);
            }
            schedules.push(schedule.clone());
            save(self.state, &schedules).await;
        }
        let reply = json!({
            "shown": true,
            "first_run": schedule.next_at.map(|next| clock(next, &zone)),
            "note": "a task card is now shown under your reply; nothing runs until the user taps Start on it. Say when the first run is and ask them to confirm; do not say it is already set up",
        });
        self.attach(Attachment::Schedule {
            schedule_id: schedule.id,
        });
        reply.to_string()
    }

    fn report_schedule(&self, arguments: &str) -> String {
        let args = match serde_json::from_str::<ReportArgs>(arguments) {
            Ok(args) => args,
            Err(failure) => return error(&format!("invalid report: {failure}")),
        };
        let reason = filled(args.reason);
        let report = Report {
            outcome: args.outcome,
            status: args.status.trim().chars().take(MAX_STATUS).collect(),
            changed: args.changed,
            reason: reason.clone(),
        };
        let Some(run) = self.state.schedules.report(self.thread_id, report) else {
            return error("this is not a scheduled run; there is nothing to report");
        };
        if args.outcome == Outcome::Failed {
            self.attach(Attachment::ScheduleFailed {
                schedule_id: run.schedule_id,
                reason: reason.unwrap_or_default(),
            });
        }
        let note = match args.outcome {
            Outcome::Met => "recorded; the task stops after this run. Tell the user briefly",
            Outcome::Failed => "recorded; a card under your reply lets the user retry. Explain briefly what went wrong",
            Outcome::Done => "recorded",
        };
        json!({ "ok": true, "note": note }).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn zone() -> TimeZone {
        TimeZone::get("Asia/Shanghai").unwrap()
    }

    fn local(text: &str) -> Timestamp {
        let (date, time) = text.split_once(' ').unwrap();
        let date: Date = date.parse().unwrap();
        at(date, parse_minute(Some(time)).unwrap(), &zone()).unwrap()
    }

    fn shown(found: Option<Timestamp>) -> String {
        found
            .map(|found| found.to_zoned(zone()).strftime("%Y-%m-%d %H:%M").to_string())
            .unwrap_or_default()
    }

    fn schedule(rule: ScheduleRule) -> Schedule {
        Schedule {
            id: "s1".into(),
            title: "AI 新闻早报".into(),
            task: "搜昨天 AI 圈的新闻".into(),
            rule,
            stop: ScheduleStop::Never,
            output: ScheduleOutput::NewThread,
            notify: ScheduleNotify::Done,
            state: ScheduleState::Active,
            origin_thread_id: "t0".into(),
            thread_id: Some("t1".into()),
            replaces: None,
            next_at: None,
            runs: 0,
            last: None,
            created_at: 0,
        }
    }

    fn run(mark: RunMark, report: Option<Report>) -> Run {
        Run {
            schedule_id: "s1".into(),
            mark,
            started_at: 1_000,
            report,
        }
    }

    #[test]
    fn daily_runs_today_or_tomorrow() {
        let rule = ScheduleRule::Daily { minute: 8 * 60 };
        let next = next_after(&rule, local("2026-11-03 07:59"), &zone());
        assert_eq!(shown(next), "2026-11-03 08:00");
        let next = next_after(&rule, local("2026-11-03 08:00"), &zone());
        assert_eq!(shown(next), "2026-11-04 08:00");
    }

    #[test]
    fn weekly_picks_the_next_listed_weekday() {
        let rule = ScheduleRule::Weekly {
            weekdays: vec![5],
            minute: 17 * 60,
        };
        let next = next_after(&rule, local("2026-11-03 09:00"), &zone());
        assert_eq!(shown(next), "2026-11-06 17:00");
        let next = next_after(&rule, local("2026-11-06 17:30"), &zone());
        assert_eq!(shown(next), "2026-11-13 17:00");
        let both = ScheduleRule::Weekly {
            weekdays: vec![1, 3],
            minute: 9 * 60,
        };
        let next = next_after(&both, local("2026-11-02 10:00"), &zone());
        assert_eq!(shown(next), "2026-11-04 09:00");
    }

    #[test]
    fn monthly_days_and_month_end() {
        let rule = ScheduleRule::Monthly {
            days: vec![15],
            minute: 9 * 60,
        };
        let next = next_after(&rule, local("2026-11-16 00:00"), &zone());
        assert_eq!(shown(next), "2026-12-15 09:00");
        let end = ScheduleRule::Monthly {
            days: vec![31],
            minute: 21 * 60,
        };
        let next = next_after(&end, local("2027-02-01 00:00"), &zone());
        assert_eq!(shown(next), "2027-02-28 21:00");
        let next = next_after(&end, local("2026-11-01 00:00"), &zone());
        assert_eq!(shown(next), "2026-11-30 21:00");
        let next = next_after(&end, local("2026-12-01 00:00"), &zone());
        assert_eq!(shown(next), "2026-12-31 21:00");
    }

    #[test]
    fn repeats_stay_inside_their_window() {
        let rule = ScheduleRule::Every {
            minutes: 120,
            from: Some(8 * 60),
            to: Some(22 * 60),
        };
        assert_eq!(
            shown(next_after(&rule, local("2026-11-03 13:10"), &zone())),
            "2026-11-03 14:00"
        );
        assert_eq!(
            shown(next_after(&rule, local("2026-11-03 21:30"), &zone())),
            "2026-11-03 22:00"
        );
        assert_eq!(
            shown(next_after(&rule, local("2026-11-03 22:00"), &zone())),
            "2026-11-04 08:00"
        );
        assert_eq!(
            shown(next_after(&rule, local("2026-11-03 03:00"), &zone())),
            "2026-11-03 08:00"
        );
        let night = ScheduleRule::Every {
            minutes: 60,
            from: Some(22 * 60),
            to: Some(2 * 60),
        };
        assert_eq!(
            shown(next_after(&night, local("2026-11-04 00:30"), &zone())),
            "2026-11-04 01:00"
        );
        let open = ScheduleRule::Every {
            minutes: 30,
            from: None,
            to: None,
        };
        assert_eq!(
            shown(next_after(&open, local("2026-11-03 13:10"), &zone())),
            "2026-11-03 13:40"
        );
    }

    #[test]
    fn repeats_shorter_than_half_an_hour_are_rejected() {
        let args = ProposeArgs {
            title: "盯快递".into(),
            task: "查快递".into(),
            kind: "every".into(),
            every_minutes: Some(10),
            ..ProposeArgs::default()
        };
        assert!(rule_of(&args, &zone()).is_err());
    }

    #[test]
    fn drafts_are_not_due_until_started() {
        let mut draft = schedule(ScheduleRule::Daily { minute: 8 * 60 });
        draft.state = ScheduleState::Draft;
        draft.next_at = Some(local("2026-11-03 08:00").as_millisecond());
        assert!(due(&mut draft, local("2026-11-03 08:01"), &zone()).is_none());
        draft.state = ScheduleState::Active;
        assert!(due(&mut draft, local("2026-11-03 08:01"), &zone()).is_some());
    }

    #[test]
    fn missed_runs_catch_up_only_once() {
        let mut task = schedule(ScheduleRule::Daily { minute: 8 * 60 });
        task.next_at = Some(local("2026-10-31 08:00").as_millisecond());
        let now = local("2026-11-03 09:12");
        let (mark, due_at) = due(&mut task, now, &zone()).unwrap();
        assert_eq!(mark, RunMark::Catchup);
        assert_eq!(due_at, local("2026-10-31 08:00").as_millisecond());
        assert_eq!(
            shown(task.next_at.and_then(|at| Timestamp::from_millisecond(at).ok())),
            "2026-11-04 08:00"
        );
        assert!(due(&mut task, now, &zone()).is_none());
        let mut late = schedule(ScheduleRule::Daily { minute: 8 * 60 });
        late.next_at = Some(local("2026-11-03 08:00").as_millisecond());
        let (mark, _) = due(&mut late, local("2026-11-03 08:03"), &zone()).unwrap();
        assert_eq!(mark, RunMark::Scheduled);
    }

    #[test]
    fn meeting_the_condition_stops_the_task() {
        let mut task = schedule(ScheduleRule::Every {
            minutes: 120,
            from: None,
            to: None,
        });
        task.stop = ScheduleStop::Condition {
            text: "签收".into(),
        };
        task.notify = ScheduleNotify::Changed;
        task.next_at = Some(5_000);
        let first = settle(
            &mut task,
            &run(
                RunMark::Scheduled,
                Some(Report {
                    outcome: Outcome::Done,
                    status: "运输中".into(),
                    changed: false,
                    reason: None,
                }),
            ),
            None,
            2_000,
        );
        assert!(!first);
        assert_eq!(task.state, ScheduleState::Active);
        assert_eq!(task.last.as_ref().unwrap().status, "运输中");
        let rang = settle(
            &mut task,
            &run(
                RunMark::Scheduled,
                Some(Report {
                    outcome: Outcome::Met,
                    status: "已签收".into(),
                    changed: true,
                    reason: None,
                }),
            ),
            None,
            3_000,
        );
        assert!(rang);
        assert_eq!(task.state, ScheduleState::Finished);
        assert_eq!(task.next_at, None);
        assert_eq!(task.runs, 2);
    }

    #[test]
    fn failures_are_recorded_with_their_reason() {
        let mut task = schedule(ScheduleRule::Daily { minute: 8 * 60 });
        task.next_at = Some(9_000);
        settle(
            &mut task,
            &run(RunMark::Scheduled, None),
            Some("网页搜索的额度用完了".into()),
            61_000,
        );
        let last = task.last.unwrap();
        assert!(!last.ok);
        assert_eq!(last.reason.as_deref(), Some("网页搜索的额度用完了"));
        assert_eq!(last.duration_ms, 60_000);
        assert_eq!(task.state, ScheduleState::Active);
        assert_eq!(task.runs, 1);
    }

    #[test]
    fn counts_and_end_dates_finish_the_task() {
        let mut task = schedule(ScheduleRule::Daily { minute: 8 * 60 });
        task.stop = ScheduleStop::Count { runs: 2 };
        task.next_at = Some(local("2026-11-03 08:00").as_millisecond());
        due(&mut task, local("2026-11-03 08:00"), &zone()).unwrap();
        settle(&mut task, &run(RunMark::Scheduled, None), None, 2_000);
        assert_eq!(task.state, ScheduleState::Active);
        due(&mut task, local("2026-11-04 08:00"), &zone()).unwrap();
        assert_eq!(task.next_at, None);
        settle(&mut task, &run(RunMark::Scheduled, None), None, 3_000);
        assert_eq!(task.state, ScheduleState::Finished);

        let mut until = schedule(ScheduleRule::Daily { minute: 8 * 60 });
        until.stop = ScheduleStop::Until {
            date: "2026-11-04".into(),
        };
        assert!(upcoming(&until, local("2026-11-03 09:00"), &zone()).is_some());
        assert!(upcoming(&until, local("2026-11-04 09:00"), &zone()).is_none());
    }

    #[test]
    fn once_finishes_after_its_run_but_not_after_a_manual_one() {
        let mut task = schedule(ScheduleRule::Once {
            at: local("2026-11-06 09:00").as_millisecond(),
        });
        task.next_at = Some(local("2026-11-06 09:00").as_millisecond());
        settle(&mut task, &run(RunMark::Manual, None), None, 2_000);
        assert_eq!(task.state, ScheduleState::Active);
        due(&mut task, local("2026-11-06 09:00"), &zone()).unwrap();
        settle(&mut task, &run(RunMark::Scheduled, None), None, 3_000);
        assert_eq!(task.state, ScheduleState::Finished);
    }

    #[test]
    fn proposals_become_drafts() {
        let args = ProposeArgs {
            title: "盯快递 SF1234".into(),
            task: "查快递 SF1234 到哪了".into(),
            kind: "every".into(),
            every_minutes: Some(120),
            from: Some("8:00".into()),
            to: Some("22:00".into()),
            condition: Some("快递签收".into()),
            notify: Some("changed".into()),
            ..ProposeArgs::default()
        };
        let schedule = draft(args, "t0", &zone()).unwrap();
        assert_eq!(schedule.state, ScheduleState::Draft);
        assert_eq!(schedule.notify, ScheduleNotify::Changed);
        assert!(matches!(schedule.stop, ScheduleStop::Condition { .. }));
        assert!(schedule.next_at.is_some());
    }
}
