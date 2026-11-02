use std::collections::{BTreeMap, HashMap};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use jiff::civil::Date;
use jiff::tz::TimeZone;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast::error::RecvError;
use tokio_util::sync::CancellationToken;
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{
    CategoryTotal, DailyFeed, DoneItem, DoneSource, DoneStatus, Event, Expense, Ingredient, Insight,
    InsightAction, InsightKind, InsightPage, MailItem, MutedInsight, Plan, PlanStatus, ProtocolError, Request,
    Response, StepStatus, Trip,
};
use xiaoban_store::now_ms;

use crate::state::SharedState;

const KEY: &str = "insights";
const LOG_KEY: &str = "daily.done";
const CHECK_EVERY: Duration = Duration::from_secs(15 * 60);
const SETTLE: Duration = Duration::from_secs(10 * 60);
const FIRST_LOOK: Duration = Duration::from_secs(20);
const DAY_MS: i64 = 24 * 3600 * 1000;
const COOLDOWN_MS: i64 = 7 * DAY_MS;
const KEEP_MS: i64 = 3 * DAY_MS;
const DONE_MS: i64 = 7 * DAY_MS;
const MAX_LOG: usize = 30;
const DONE_SHOWN: usize = 8;
const SUMMARY_CHARS: usize = 80;
const TAKEOUT_MIN: usize = 4;
const TAKEOUT_MORE: usize = 3;
const LATE_HOUR: i8 = 21;
const EARLY_HOUR: i8 = 4;
const LEDGER_DIFF: i64 = 20_000;
const FRIDGE_DAYS: i64 = 3;
const FRIDGE_STALE: i64 = 10;
const FRIDGE_ITEMS: usize = 2;
const RAINY: u8 = 60;
const PLAN_IDLE_DAYS: i64 = 7;
const TRIPS: u32 = 10;

fn words(key: &str) -> &'static [String] {
    static WORDS: OnceLock<HashMap<String, Vec<String>>> = OnceLock::new();
    WORDS
        .get_or_init(|| {
            include_str!("insight_words.txt")
                .lines()
                .filter_map(|line| line.split_once('='))
                .map(|(name, list)| {
                    (
                        name.trim().to_owned(),
                        list.split(',').map(|word| word.trim().to_lowercase()).filter(|word| !word.is_empty()).collect(),
                    )
                })
                .collect()
        })
        .get(key)
        .map_or(&[], Vec::as_slice)
}

fn has(text: &str, key: &str) -> bool {
    let lower = text.to_lowercase();
    words(key).iter().any(|word| lower.contains(word.as_str()))
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
struct Saved {
    items: Vec<Insight>,
    muted: Vec<MutedInsight>,
    seen: BTreeMap<String, i64>,
    day: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Logged {
    item: DoneItem,
    turn_id: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct Facts {
    pub now: i64,
    pub zone: Option<TimeZone>,
    pub expenses: Vec<Expense>,
    pub month: Vec<CategoryTotal>,
    pub previous: Vec<CategoryTotal>,
    pub ledger_muted: Vec<String>,
    pub ledger_thread: Option<String>,
    pub fridge: Vec<Ingredient>,
    pub photo_at: Option<i64>,
    pub kitchen_thread: Option<String>,
    pub rain_tomorrow: Option<u8>,
    pub trips: Vec<Trip>,
    pub plans: Vec<Plan>,
    pub mail_bills: Vec<MailItem>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Candidate {
    pub kind: InsightKind,
    pub subject: String,
    pub label: String,
    pub text: String,
    pub action_label: String,
    pub action: InsightAction,
    pub urgent: bool,
    pub until: i64,
}

impl Facts {
    fn zone(&self) -> TimeZone {
        self.zone.clone().unwrap_or_else(TimeZone::system)
    }

    fn zoned(&self, at: i64) -> Option<jiff::Zoned> {
        jiff::Timestamp::from_millisecond(at).ok().map(|stamp| stamp.to_zoned(self.zone()))
    }

    fn today(&self) -> Option<Date> {
        self.zoned(self.now).map(|zoned| zoned.date())
    }

    fn end_of(&self, date: Date) -> i64 {
        date.tomorrow()
            .ok()
            .and_then(|next| next.to_zoned(self.zone()).ok())
            .map_or(self.now + DAY_MS, |zoned| zoned.timestamp().as_millisecond())
    }
}

fn key_of(kind: InsightKind, subject: &str) -> String {
    format!("{}:{subject}", serde_json::to_value(kind).ok().and_then(|value| value.as_str().map(str::to_owned)).unwrap_or_default())
}

fn yuan(l: &Localizer, cents: i64) -> String {
    l.format(keys::INSIGHT_MONEY, &[("amount", &((cents + 50) / 100).to_string())])
}

fn takeout(facts: &Facts, l: &Localizer) -> Option<Candidate> {
    let week = 7 * DAY_MS;
    let ordered: Vec<&Expense> = facts
        .expenses
        .iter()
        .filter(|entry| has(&format!("{} {} {}", entry.name, entry.category, entry.note), "takeout"))
        .collect();
    let this: Vec<&&Expense> = ordered.iter().filter(|entry| entry.at > facts.now - week && entry.at <= facts.now).collect();
    let before = ordered.iter().filter(|entry| entry.at > facts.now - 2 * week && entry.at <= facts.now - week).count();
    let count = this.len();
    if count < TAKEOUT_MIN || count < before + TAKEOUT_MORE {
        return None;
    }
    let late = this
        .iter()
        .filter(|entry| facts.zoned(entry.at).is_some_and(|zoned| zoned.hour() >= LATE_HOUR || zoned.hour() < EARLY_HOUR))
        .count();
    let count_text = count.to_string();
    let more = (count - before).to_string();
    let text = if late * 2 >= count {
        l.format(keys::INSIGHT_TAKEOUT_LATE, &[("count", &count_text), ("more", &more), ("late", &late.to_string())])
    } else {
        l.format(keys::INSIGHT_TAKEOUT, &[("count", &count_text), ("more", &more)])
    };
    Some(Candidate {
        kind: InsightKind::Takeout,
        subject: String::new(),
        label: l.text(keys::INSIGHT_LABEL_TAKEOUT),
        text,
        action_label: l.text(keys::INSIGHT_TAKEOUT_ACT),
        action: InsightAction::Say {
            text: l.text(keys::INSIGHT_TAKEOUT_SAY),
            thread_id: None,
        },
        urgent: false,
        until: facts.now + KEEP_MS,
    })
}

fn ledger_up(facts: &Facts, l: &Localizer) -> Option<Candidate> {
    facts.month.iter().find_map(|total| {
        let before = facts.previous.iter().find(|item| item.category == total.category)?.cents;
        let diff = total.cents - before;
        if before <= 0 || diff < LEDGER_DIFF || total.cents * 10 < before * 13 || facts.ledger_muted.contains(&total.category) {
            return None;
        }
        let pct = (diff * 100 + before / 2) / before;
        Some(Candidate {
            kind: InsightKind::LedgerUp,
            subject: total.category.clone(),
            label: l.format(keys::INSIGHT_LABEL_LEDGER, &[("category", &total.category)]),
            text: l.format(
                keys::INSIGHT_LEDGER_UP,
                &[("category", &total.category), ("amount", &yuan(l, diff)), ("pct", &pct.to_string())],
            ),
            action_label: l.text(keys::INSIGHT_LEDGER_ACT),
            action: InsightAction::Open {
                page: InsightPage::Ledger,
                thread_id: facts.ledger_thread.clone(),
            },
            urgent: false,
            until: facts.now + KEEP_MS,
        })
    })
}

fn fridge(facts: &Facts, l: &Localizer) -> Option<Candidate> {
    let days = (facts.now - facts.photo_at?) / DAY_MS;
    if !(FRIDGE_DAYS..=FRIDGE_STALE).contains(&days) {
        return None;
    }
    let items: Vec<String> = facts
        .fridge
        .iter()
        .filter(|item| has(&item.name, "perishable"))
        .map(|item| item.name.trim().to_owned())
        .filter(|name| !name.is_empty())
        .take(FRIDGE_ITEMS)
        .collect();
    let first = items.first()?.clone();
    let joined = items.join(&l.text(keys::INSIGHT_JOINER));
    Some(Candidate {
        kind: InsightKind::Fridge,
        subject: first.clone(),
        label: l.format(keys::INSIGHT_LABEL_FRIDGE, &[("item", &first)]),
        text: l.format(keys::INSIGHT_FRIDGE, &[("items", &joined), ("days", &days.to_string())]),
        action_label: l.text(keys::INSIGHT_FRIDGE_ACT),
        action: InsightAction::Say {
            text: l.format(keys::INSIGHT_FRIDGE_SAY, &[("items", &joined)]),
            thread_id: facts.kitchen_thread.clone(),
        },
        urgent: false,
        until: facts.now + DAY_MS,
    })
}

fn rain_outdoor(facts: &Facts, l: &Localizer) -> Option<Candidate> {
    let tomorrow = facts.today()?.tomorrow().ok()?;
    let date = tomorrow.to_string();
    facts.trips.iter().find_map(|trip| {
        let day = trip.days.iter().find(|day| day.date == date)?;
        let rain = day.weather.as_ref().and_then(|weather| weather.rain_chance).or(facts.rain_tomorrow)?;
        if rain < RAINY {
            return None;
        }
        let stop = day.stops.iter().find(|stop| has(&format!("{} {}", stop.name, stop.note), "outdoor"))?;
        let rain_text = rain.to_string();
        Some(Candidate {
            kind: InsightKind::RainOutdoor,
            subject: format!("{}:{date}", trip.id),
            label: l.format(keys::INSIGHT_LABEL_RAIN, &[("title", &trip.title)]),
            text: l.format(keys::INSIGHT_RAIN, &[("rain", &rain_text), ("title", &trip.title), ("stop", &stop.name)]),
            action_label: l.text(keys::INSIGHT_RAIN_ACT),
            action: InsightAction::Say {
                text: l.format(keys::INSIGHT_RAIN_SAY, &[("rain", &rain_text), ("stop", &stop.name)]),
                thread_id: Some(trip.thread_id.clone()),
            },
            urgent: true,
            until: facts.end_of(tomorrow),
        })
    })
}

fn plan_stalled(facts: &Facts, l: &Localizer) -> Option<Candidate> {
    facts.plans.iter().find_map(|plan| {
        if !matches!(plan.status, PlanStatus::Running | PlanStatus::Blocked) || plan.updated_at <= 0 {
            return None;
        }
        let days = (facts.now - plan.updated_at) / DAY_MS;
        if days < PLAN_IDLE_DAYS {
            return None;
        }
        let next = plan.steps.iter().find(|step| matches!(step.status, StepStatus::Todo | StepStatus::Running));
        let text = match next {
            Some(step) => l.format(
                keys::INSIGHT_PLAN_NEXT,
                &[("title", &plan.title), ("days", &days.to_string()), ("step", &step.title)],
            ),
            None => l.format(keys::INSIGHT_PLAN, &[("title", &plan.title), ("days", &days.to_string())]),
        };
        Some(Candidate {
            kind: InsightKind::PlanStalled,
            subject: plan.thread_id.clone(),
            label: l.format(keys::INSIGHT_LABEL_PLAN, &[("title", &plan.title)]),
            text,
            action_label: l.text(keys::INSIGHT_PLAN_ACT),
            action: InsightAction::Say {
                text: l.text(keys::INSIGHT_PLAN_SAY),
                thread_id: Some(plan.thread_id.clone()),
            },
            urgent: false,
            until: facts.now + KEEP_MS,
        })
    })
}

fn money(cents: i64) -> String {
    let whole = cents / 100;
    let digits = whole.to_string();
    let mut grouped = String::new();
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index).is_multiple_of(3) {
            grouped.push(',');
        }
        grouped.push(digit);
    }
    match cents % 100 {
        0 => grouped,
        rest => format!("{grouped}.{rest:02}"),
    }
}

fn mail_due(facts: &Facts, l: &Localizer) -> Option<Candidate> {
    facts.mail_bills.iter().find_map(|item| {
        let bill = item.bill.as_ref()?;
        let due: Date = bill.due.as_deref()?.parse().ok()?;
        let amount = l.format(keys::INSIGHT_MONEY, &[("amount", &money(bill.cents?))]);
        let due_text = format!("{}/{}", due.month(), due.day());
        let from = if item.from_name.is_empty() { item.from_address.clone() } else { item.from_name.clone() };
        Some(Candidate {
            kind: InsightKind::MailDue,
            subject: item.id.clone(),
            label: l.format(keys::INSIGHT_LABEL_MAIL, &[("title", &item.title)]),
            text: l.format(
                keys::INSIGHT_MAIL_DUE,
                &[("title", &item.title), ("amount", &amount), ("due", &due_text), ("from", &from)],
            ),
            action_label: l.text(keys::INSIGHT_MAIL_ACT),
            action: InsightAction::Say {
                text: l.format(keys::INSIGHT_MAIL_SAY, &[("title", &item.title), ("amount", &amount), ("due", &due_text)]),
                thread_id: None,
            },
            urgent: false,
            until: facts.end_of(due),
        })
    })
}

pub fn detect(facts: &Facts, l: &Localizer) -> Vec<Candidate> {
    [rain_outdoor(facts, l), mail_due(facts, l), fridge(facts, l), takeout(facts, l), ledger_up(facts, l), plan_stalled(facts, l)]
        .into_iter()
        .flatten()
        .collect()
}

fn is_muted(muted: &[MutedInsight], kind: InsightKind, subject: &str) -> bool {
    muted.iter().any(|item| item.kind == kind && item.subject == subject)
}

fn prune(saved: &mut Saved, now: i64) -> bool {
    let before = saved.items.len();
    saved.items.retain(|item| item.until > now);
    saved.seen.retain(|_, at| now - *at < COOLDOWN_MS * 4);
    saved.items.len() != before
}

fn advance(saved: &mut Saved, candidates: Vec<Candidate>, today: &str, now: i64) -> Option<Insight> {
    if saved.day == today {
        return None;
    }
    let found = candidates.into_iter().find(|candidate| {
        let key = key_of(candidate.kind, &candidate.subject);
        !is_muted(&saved.muted, candidate.kind, &candidate.subject)
            && saved.seen.get(&key).is_none_or(|at| now - *at >= COOLDOWN_MS)
            && !saved.items.iter().any(|item| item.kind == candidate.kind && item.subject == candidate.subject)
    })?;
    saved.seen.insert(key_of(found.kind, &found.subject), now);
    today.clone_into(&mut saved.day);
    let insight = Insight {
        id: uuid::Uuid::now_v7().to_string(),
        kind: found.kind,
        subject: found.subject,
        label: found.label,
        text: found.text,
        action_label: found.action_label,
        action: found.action,
        urgent: found.urgent,
        at: now,
        until: found.until,
    };
    saved.items.insert(0, insight.clone());
    Some(insight)
}

fn resolve(saved: &mut Saved, id: &str, mute: bool) -> Option<Insight> {
    let index = saved.items.iter().position(|item| item.id == id)?;
    let item = saved.items.remove(index);
    if mute && !is_muted(&saved.muted, item.kind, &item.subject) {
        saved.muted.push(MutedInsight {
            kind: item.kind,
            subject: item.subject.clone(),
            label: item.label.clone(),
        });
    }
    Some(item)
}

async fn read<T: serde::de::DeserializeOwned + Default>(state: &SharedState, key: &str) -> T {
    state
        .store
        .setting_owned(key.to_owned())
        .await
        .ok()
        .flatten()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

async fn write<T: Serialize>(state: &SharedState, key: &str, value: &T) {
    let _ = state
        .store
        .set_setting_owned(key.to_owned(), serde_json::to_string(value).unwrap_or_default())
        .await;
}

fn totals(list: &[Expense]) -> Vec<CategoryTotal> {
    let mut sums: BTreeMap<String, i64> = BTreeMap::new();
    for entry in list {
        *sums.entry(entry.category.clone()).or_default() += entry.cents;
    }
    let mut out: Vec<CategoryTotal> = sums.into_iter().map(|(category, cents)| CategoryTotal { category, cents }).collect();
    out.sort_by_key(|total| std::cmp::Reverse(total.cents));
    out
}

async fn facts(state: &SharedState) -> Facts {
    let ledger = crate::ledger::view(state, "").await;
    let kitchen = crate::kitchen::load(state).await;
    let zone = TimeZone::system();
    let now = now_ms();
    let tomorrow = jiff::Timestamp::from_millisecond(now)
        .ok()
        .and_then(|stamp| stamp.to_zoned(zone.clone()).date().tomorrow().ok())
        .map(|date| date.to_string());
    let rain_tomorrow = crate::weather_page::view(state, None)
        .await
        .report
        .and_then(|report| report.days.into_iter().find(|day| Some(&day.date) == tomorrow.as_ref()))
        .map(|day| day.rain);
    Facts {
        now,
        zone: Some(zone),
        expenses: crate::ledger::recent(state, 15).await,
        month: totals(&ledger.entries),
        previous: ledger.previous,
        ledger_muted: ledger.muted,
        ledger_thread: ledger.thread_id,
        fridge: kitchen.fridge,
        photo_at: kitchen.photo_at,
        kitchen_thread: kitchen.thread_id,
        rain_tomorrow,
        trips: state.store.recent_trips(TRIPS).await.unwrap_or_default(),
        plans: crate::plan::list(state).await,
        mail_bills: crate::mail::bills_due(state).await,
    }
}

fn today_text(now: i64) -> String {
    jiff::Timestamp::from_millisecond(now)
        .map(|stamp| stamp.to_zoned(TimeZone::system()).date().to_string())
        .unwrap_or_default()
}

pub async fn refresh(state: &SharedState) {
    let now = now_ms();
    let today = today_text(now);
    let mut saved: Saved = read(state, KEY).await;
    let mut changed = prune(&mut saved, now);
    let mut raised = None;
    if saved.day != today {
        let facts = facts(state).await;
        let candidates = detect(&facts, &state.localizer);
        raised = advance(&mut saved, candidates, &today, now);
        changed |= raised.is_some();
    }
    if changed {
        write(state, KEY, &saved).await;
        state.publish(Event::DailyFeedChanged);
    }
    if let Some(insight) = raised.filter(|insight| insight.urgent) {
        state.publish(Event::InsightAlert { insight });
    }
}

pub async fn forget_kind(state: &SharedState, kind: InsightKind) {
    let mut saved: Saved = read(state, KEY).await;
    let gone: Vec<String> = saved.items.iter().filter(|item| item.kind == kind).map(|item| item.id.clone()).collect();
    if gone.is_empty() {
        return;
    }
    saved.items.retain(|item| item.kind != kind);
    write(state, KEY, &saved).await;
    for id in gone {
        state.publish(Event::NoticeWithdrawn { id: notice_id(&id) });
    }
}

fn excerpt(text: &str) -> String {
    let line = text
        .lines()
        .map(|line| line.trim().trim_start_matches(['#', '>', '-', '*', ' ']).replace("**", ""))
        .find(|line| !line.trim().is_empty())
        .unwrap_or_default();
    if line.chars().count() <= SUMMARY_CHARS {
        return line;
    }
    let mut cut: String = line.chars().take(SUMMARY_CHARS).collect();
    cut.push('…');
    cut
}

async fn done(state: &SharedState) -> Vec<DoneItem> {
    let now = now_ms();
    let mut items = Vec::new();
    for thread in state.store.list_threads().await.unwrap_or_default() {
        if thread.parent_id.is_none() || now - thread.updated_at >= DONE_MS {
            continue;
        }
        let running = state.turns.running_in(&thread.id).is_some();
        items.push(DoneItem {
            id: format!("sub:{}", thread.id),
            source: DoneSource::Subthread,
            title: thread.title.clone().unwrap_or_default(),
            summary: excerpt(thread.last_message.as_deref().unwrap_or_default()),
            status: if running { DoneStatus::Running } else { DoneStatus::Done },
            thread_id: Some(thread.id),
            at: thread.updated_at,
        });
    }
    let log: Vec<Logged> = read(state, LOG_KEY).await;
    for logged in log {
        if now - logged.item.at >= DONE_MS {
            continue;
        }
        let mut item = logged.item;
        let running = logged.turn_id.is_some()
            && item
                .thread_id
                .as_deref()
                .and_then(|thread| state.turns.running_in(thread))
                == logged.turn_id;
        item.status = if running { DoneStatus::Running } else { DoneStatus::Done };
        items.push(item);
    }
    items.sort_by_key(|item| std::cmp::Reverse(item.at));
    items.truncate(DONE_SHOWN);
    items
}

async fn record(state: &SharedState, item: DoneItem, turn_id: Option<String>) {
    let mut log: Vec<Logged> = read(state, LOG_KEY).await;
    log.insert(0, Logged { item, turn_id });
    log.truncate(MAX_LOG);
    write(state, LOG_KEY, &log).await;
    state.publish(Event::DailyFeedChanged);
}

pub async fn record_action(state: &SharedState, thread_id: &str, turn_id: &str, title: &str, detail: &str) {
    record(
        state,
        DoneItem {
            id: uuid::Uuid::now_v7().to_string(),
            source: DoneSource::Operate,
            title: title.trim().to_owned(),
            summary: excerpt(detail),
            status: DoneStatus::Running,
            thread_id: Some(thread_id.to_owned()),
            at: now_ms(),
        },
        Some(turn_id.to_owned()),
    )
    .await;
}

pub async fn record_import(state: &SharedState, count: usize, file: &str, thread_id: Option<String>) {
    let l = &state.localizer;
    record(
        state,
        DoneItem {
            id: uuid::Uuid::now_v7().to_string(),
            source: DoneSource::Import,
            title: l.format(keys::DONE_IMPORT_TITLE, &[("count", &count.to_string())]),
            summary: file.to_owned(),
            status: DoneStatus::Done,
            thread_id,
            at: now_ms(),
        },
        None,
    )
    .await;
}

async fn feed(state: &SharedState) -> DailyFeed {
    let now = now_ms();
    let saved: Saved = read(state, KEY).await;
    let mut muted = saved.muted.clone();
    for category in crate::ledger::view(state, "").await.muted {
        if !is_muted(&muted, InsightKind::LedgerUp, &category) {
            muted.push(MutedInsight {
                kind: InsightKind::LedgerUp,
                label: state.localizer.format(keys::INSIGHT_LABEL_LEDGER, &[("category", &category)]),
                subject: category,
            });
        }
    }
    DailyFeed {
        insights: saved.items.into_iter().filter(|item| item.until > now).collect(),
        done: done(state).await,
        muted,
        mail: crate::mail::today(state).await,
    }
}

pub fn notice_id(insight_id: &str) -> String {
    format!("insight:{insight_id}")
}

pub async fn handle(state: &SharedState, request: Request) -> Result<Response, ProtocolError> {
    match request {
        Request::ResolveInsight { id, mute } => {
            let mut saved: Saved = read(state, KEY).await;
            if resolve(&mut saved, &id, mute).is_some() {
                write(state, KEY, &saved).await;
                state.publish(Event::NoticeWithdrawn { id: notice_id(&id) });
                state.publish(Event::DailyFeedChanged);
            }
        }
        Request::UnmuteInsight { kind, subject } => {
            let mut saved: Saved = read(state, KEY).await;
            saved.muted.retain(|item| !(item.kind == kind && item.subject == subject));
            write(state, KEY, &saved).await;
            if kind == InsightKind::LedgerUp {
                crate::ledger::unmute(state, &subject).await;
            }
            state.publish(Event::DailyFeedChanged);
        }
        _ => {}
    }
    Ok(Response::DailyFeed { feed: feed(state).await })
}

fn wakes(event: &Event) -> bool {
    matches!(
        event,
        Event::LedgerChanged | Event::KitchenUpdated { .. } | Event::PlanUpdated { .. } | Event::WeatherAlert { .. }
    )
}

pub fn watch(state: SharedState, shutdown: CancellationToken) {
    let mut events = state.events.subscribe();
    tokio::spawn(async move {
        tokio::select! {
            () = shutdown.cancelled() => return,
            () = tokio::time::sleep(FIRST_LOOK) => {}
        }
        refresh(&state).await;
        let mut last = Instant::now();
        let mut dirty = false;
        loop {
            let wait = if dirty { SETTLE.saturating_sub(last.elapsed()) } else { CHECK_EVERY };
            tokio::select! {
                () = shutdown.cancelled() => return,
                () = tokio::time::sleep(wait) => dirty = true,
                event = events.recv() => match event {
                    Ok(event) if wakes(&event) => dirty = true,
                    Ok(_) => continue,
                    Err(RecvError::Lagged(_)) => dirty = true,
                    Err(RecvError::Closed) => return,
                },
            }
            if dirty && last.elapsed() >= SETTLE {
                refresh(&state).await;
                last = Instant::now();
                dirty = false;
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use xiaoban_i18n::Locale;
    use xiaoban_protocol::ExpenseSource;

    const NOW: i64 = 1_793_000_000_000;
    const HOUR: i64 = 3600 * 1000;

    fn facts() -> Facts {
        Facts {
            now: NOW,
            zone: Some(TimeZone::UTC),
            ..Facts::default()
        }
    }

    fn meal(name: &str, at: i64) -> Expense {
        Expense {
            id: format!("{name}-{at}"),
            name: name.to_owned(),
            category: "餐饮".to_owned(),
            cents: 3500,
            at,
            source: ExpenseSource::Said,
            note: String::new(),
        }
    }

    fn zh() -> Localizer {
        Localizer::new(Locale::ZhCn)
    }

    fn candidate(kind: InsightKind, subject: &str) -> Candidate {
        Candidate {
            kind,
            subject: subject.to_owned(),
            label: subject.to_owned(),
            text: subject.to_owned(),
            action_label: String::new(),
            action: InsightAction::Open { page: InsightPage::Ledger, thread_id: None },
            urgent: false,
            until: NOW + KEEP_MS,
        }
    }

    #[test]
    fn more_takeout_this_week_is_noticed_with_counted_numbers() {
        let mut facts = facts();
        let day_start = NOW - NOW.rem_euclid(DAY_MS);
        for back in 0..7 {
            facts.expenses.push(meal("美团外卖 黄焖鸡", day_start - back * DAY_MS + 22 * HOUR - DAY_MS));
        }
        facts.expenses.push(meal("午饭 牛肉面", NOW - HOUR));
        facts.expenses.push(meal("饿了么 披萨", NOW - 9 * DAY_MS));
        facts.expenses.push(meal("饿了么 寿司", NOW - 10 * DAY_MS));
        let found = takeout(&facts, &zh()).expect("takeout noticed");
        assert_eq!(found.kind, InsightKind::Takeout);
        let this = facts.expenses.iter().filter(|entry| entry.at > NOW - 7 * DAY_MS && entry.name.contains("外卖")).count();
        assert_eq!(this, 7);
        assert!(found.text.contains('7'), "{}", found.text);
        assert!(found.text.contains('5'), "{}", found.text);
        assert!(found.text.contains("21"), "{}", found.text);
        assert!(matches!(found.action, InsightAction::Say { thread_id: None, .. }));
    }

    #[test]
    fn steady_takeout_says_nothing() {
        let mut facts = facts();
        for back in 0..4 {
            facts.expenses.push(meal("外卖", NOW - back * DAY_MS - HOUR));
            facts.expenses.push(meal("外卖", NOW - (back + 7) * DAY_MS - HOUR));
        }
        assert!(takeout(&facts, &zh()).is_none());
        let mut few = self::facts();
        few.expenses.push(meal("外卖", NOW - HOUR));
        assert!(takeout(&few, &zh()).is_none());
    }

    #[test]
    fn ledger_numbers_come_from_the_entries() {
        let mut facts = facts();
        facts.month = vec![CategoryTotal { category: "购物".into(), cents: 51_000 }];
        facts.previous = vec![CategoryTotal { category: "购物".into(), cents: 20_000 }];
        let found = ledger_up(&facts, &zh()).expect("spending noticed");
        assert!(found.text.contains("¥310"), "{}", found.text);
        assert!(found.text.contains("155"), "{}", found.text);
        facts.ledger_muted = vec!["购物".into()];
        assert!(ledger_up(&facts, &zh()).is_none());
    }

    #[test]
    fn only_one_new_insight_a_day() {
        let mut saved = Saved::default();
        let both = || vec![candidate(InsightKind::Takeout, ""), candidate(InsightKind::LedgerUp, "购物")];
        let first = advance(&mut saved, both(), "2026-11-01", NOW).expect("first");
        assert_eq!(first.kind, InsightKind::Takeout);
        assert!(advance(&mut saved, both(), "2026-11-01", NOW + HOUR).is_none());
        let second = advance(&mut saved, both(), "2026-11-02", NOW + DAY_MS).expect("second");
        assert_eq!(second.kind, InsightKind::LedgerUp);
        assert_eq!(saved.items.len(), 2);
        assert!(advance(&mut saved, both(), "2026-11-03", NOW + 2 * DAY_MS).is_none());
    }

    #[test]
    fn muted_insights_stay_quiet() {
        let mut saved = Saved::default();
        let first = advance(&mut saved, vec![candidate(InsightKind::Takeout, "")], "2026-11-01", NOW).expect("first");
        assert!(resolve(&mut saved, &first.id, true).is_some());
        assert_eq!(saved.items, Vec::new());
        let later = NOW + 30 * DAY_MS;
        let next = advance(
            &mut saved,
            vec![candidate(InsightKind::Takeout, ""), candidate(InsightKind::PlanStalled, "t1")],
            "2026-12-01",
            later,
        )
        .expect("another kind");
        assert_eq!(next.kind, InsightKind::PlanStalled);
        assert!(advance(&mut saved, vec![candidate(InsightKind::Takeout, "")], "2026-12-02", later + DAY_MS).is_none());
        saved.muted.clear();
        assert!(advance(&mut saved, vec![candidate(InsightKind::Takeout, "")], "2026-12-03", later + 2 * DAY_MS).is_some());
    }

    #[test]
    fn accepted_insights_wait_before_coming_back() {
        let mut saved = Saved::default();
        let first = advance(&mut saved, vec![candidate(InsightKind::Takeout, "")], "2026-11-01", NOW).expect("first");
        assert!(resolve(&mut saved, &first.id, false).is_some());
        assert_eq!(saved.muted, Vec::new());
        assert!(advance(&mut saved, vec![candidate(InsightKind::Takeout, "")], "2026-11-02", NOW + DAY_MS).is_none());
        assert!(advance(&mut saved, vec![candidate(InsightKind::Takeout, "")], "2026-11-09", NOW + 8 * DAY_MS).is_some());
    }

    #[test]
    fn rain_on_an_outdoor_trip_day_is_urgent() {
        let mut facts = facts();
        let tomorrow = facts.today().unwrap().tomorrow().unwrap().to_string();
        let trip: Trip = serde_json::from_value(serde_json::json!({
            "id": "trip1", "threadId": "th1", "version": 1, "title": "杭州", "city": "杭州",
            "timezone": null, "party": "3 人", "needs": null, "reminder": null, "cost": null, "verified": false,
            "createdAt": 0,
            "days": [{ "date": tomorrow, "weather": { "sky": "rain", "high": 18, "low": 12, "rainChance": 80 }, "change": null,
                "stops": [{ "name": "九溪步道", "time": "14:00", "note": "", "location": null, "next": null, "detail": null }] }]
        }))
        .unwrap();
        facts.trips = vec![trip];
        let found = rain_outdoor(&facts, &zh()).expect("rain noticed");
        assert!(found.urgent);
        assert!(found.text.contains("80"), "{}", found.text);
        assert!(found.text.contains("九溪步道"), "{}", found.text);
        assert!(matches!(found.action, InsightAction::Say { thread_id: Some(ref id), .. } if id == "th1"));
        assert_eq!(detect(&facts, &zh()).first().map(|item| item.kind), Some(InsightKind::RainOutdoor));
    }

    #[test]
    fn old_fridge_photo_with_greens_is_noticed() {
        let mut facts = facts();
        facts.fridge = vec![
            Ingredient { name: "鸡蛋".into(), amount: String::new() },
            Ingredient { name: "菠菜".into(), amount: String::new() },
        ];
        facts.photo_at = Some(NOW - 4 * DAY_MS);
        let found = fridge(&facts, &zh()).expect("fridge noticed");
        assert_eq!(found.subject, "菠菜");
        assert!(found.text.contains('4'), "{}", found.text);
        facts.photo_at = Some(NOW - DAY_MS);
        assert!(fridge(&facts, &zh()).is_none());
    }

    #[test]
    fn a_mail_bill_due_soon_is_noticed_with_the_mail_numbers() {
        let mut facts = facts();
        let due = facts.today().unwrap().tomorrow().unwrap();
        facts.mail_bills = vec![MailItem {
            id: "7-1".into(),
            from_name: "招商银行".into(),
            title: "信用卡 10 月账单".into(),
            bill: Some(xiaoban_protocol::MailBill { cents: Some(324_050), minimum_cents: None, due: Some(due.to_string()) }),
            ..MailItem::default()
        }];
        let found = mail_due(&facts, &zh()).expect("bill noticed");
        assert_eq!(found.subject, "7-1");
        assert!(found.text.contains("3,240.50"), "{}", found.text);
        assert!(found.text.contains("招商银行"), "{}", found.text);
        assert_eq!(money(324_000), "3,240");
        assert_eq!(money(5), "0.05");
    }
}
