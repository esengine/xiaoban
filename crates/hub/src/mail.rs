use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use jiff::civil::Date;
use jiff::tz::TimeZone;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{NoTools, StablePrefix, ToolSpec, Transcript};
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{
    Attachment, ErrorCode, Event, MailCategory, MailDraft, MailFailure, MailItem, MailOriginal, MailProvider,
    MailStatus, MailToday, ProtocolError, Request, Response, Trip,
};
use xiaoban_store::now_ms;

use crate::mail_imap::{Login, MailError, MailSource, Raw};
use crate::mail_rules::{self, BillDraft, Parsed, ParcelDraft, Rule, TripDraft, clip};
use crate::state::SharedState;
use crate::tools::HubTools;

pub const SEARCH: &str = "search_mail";
pub const READ: &str = "read_mail";
pub const DRAFT: &str = "draft_reply";

const ACCOUNT_KEY: &str = "mail.account";
const ITEMS_KEY: &str = "mail.items";
pub const SECRET: &str = "mail:password";
const CHECK_EVERY: Duration = Duration::from_secs(15 * 60);
const FIRST_LOOK: Duration = Duration::from_secs(45);
const DAY_MS: i64 = 24 * 3600 * 1000;
const WINDOW_DAYS: i64 = 30;
const SORT_BATCH: usize = 20;
const SORT_CHARS: usize = 500;
const SUMMARY_CHARS: usize = 120;
const TITLE_CHARS: usize = 40;
const ORIGINAL_CHARS: usize = 6000;
const TOOL_CHARS: usize = 4000;
const DRAFT_CHARS: usize = 2000;
const RESULTS: usize = 10;
const LISTED: usize = 300;
const TODAY_ITEMS: usize = 5;
const UPCOMING_DAYS: i64 = 7;
const DUE_SOON_DAYS: i64 = 3;
const TRIPS: u32 = 10;
const ORIGINAL_CAP: usize = 262_144;

#[derive(Debug)]
pub struct Mail {
    source: Arc<dyn MailSource>,
    generation: AtomicU64,
    syncing: AtomicBool,
    failure: Mutex<Option<MailFailure>>,
    lock: tokio::sync::Mutex<()>,
}

impl Mail {
    pub fn new(source: Arc<dyn MailSource>) -> Self {
        Self {
            source,
            generation: AtomicU64::new(0),
            syncing: AtomicBool::new(false),
            failure: Mutex::new(None),
            lock: tokio::sync::Mutex::new(()),
        }
    }

    fn fail(&self, failure: Option<MailFailure>) {
        *self.failure.lock().unwrap() = failure;
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Account {
    provider: MailProvider,
    address: String,
    host: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
struct Saved {
    validity: u32,
    last_uid: u32,
    total: u32,
    checked_at: Option<i64>,
    items: Vec<MailItem>,
}

const fn failure_of(error: MailError) -> MailFailure {
    match error {
        MailError::BadLogin => MailFailure::BadPassword,
        MailError::Refused => MailFailure::Refused,
        MailError::Unreachable => MailFailure::Unreachable,
    }
}

fn clean_host(raw: &str) -> Option<String> {
    let host = raw.trim().to_lowercase();
    let host = host
        .strip_prefix("imaps://")
        .or_else(|| host.strip_prefix("imap://"))
        .unwrap_or(&host);
    let host = host.split(['/', ':']).next().unwrap_or_default();
    let valid = !host.is_empty()
        && host.contains('.')
        && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
    valid.then(|| host.to_owned())
}

fn host_for(provider: MailProvider, address: &str, host: Option<&str>) -> Option<String> {
    let domain = address.rsplit_once('@').map(|(_, domain)| domain.trim().to_lowercase())?;
    match provider {
        MailProvider::Qq => Some("imap.qq.com".to_owned()),
        MailProvider::Netease => Some(match domain.as_str() {
            "126.com" => "imap.126.com".to_owned(),
            "yeah.net" => "imap.yeah.net".to_owned(),
            _ => "imap.163.com".to_owned(),
        }),
        MailProvider::Gmail => Some("imap.gmail.com".to_owned()),
        MailProvider::Outlook => Some("outlook.office365.com".to_owned()),
        MailProvider::Other => host.and_then(clean_host),
    }
}

fn zone() -> TimeZone {
    TimeZone::system()
}

fn date_of(at: i64, zone: &TimeZone) -> Option<Date> {
    jiff::Timestamp::from_millisecond(at).ok().map(|stamp| stamp.to_zoned(zone.clone()).date())
}

fn start_of(date: Date, zone: &TimeZone) -> Option<i64> {
    date.to_zoned(zone.clone()).ok().map(|zoned| zoned.timestamp().as_millisecond())
}

fn since(now: i64) -> String {
    let stamp = jiff::Timestamp::from_millisecond(now - WINDOW_DAYS * DAY_MS).unwrap_or_default();
    stamp.to_zoned(zone()).date().strftime("%d-%b-%Y").to_string()
}

fn item_id(validity: u32, uid: u32) -> String {
    format!("{validity}-{uid}")
}

fn split_id(id: &str) -> Option<(u32, u32)> {
    let (validity, uid) = id.trim().split_once('-')?;
    Some((validity.parse().ok()?, uid.parse().ok()?))
}

async fn read<T: serde::de::DeserializeOwned>(state: &SharedState, key: &'static str) -> Option<T> {
    state
        .store
        .setting(key)
        .await
        .ok()
        .flatten()
        .and_then(|text| serde_json::from_str(&text).ok())
}

async fn write<T: Serialize>(state: &SharedState, key: &'static str, value: &T) {
    if let Ok(text) = serde_json::to_string(value)
        && let Err(failure) = state.store.set_setting(key, text).await
    {
        tracing::warn!(%failure, "could not save mail data");
    }
}

async fn account(state: &SharedState) -> Option<Account> {
    read(state, ACCOUNT_KEY).await
}

async fn saved(state: &SharedState) -> Saved {
    read(state, ITEMS_KEY).await.unwrap_or_default()
}

async fn credentials(state: &SharedState) -> Option<(Account, Login)> {
    let account = account(state).await?;
    let password = state.secrets.load_named(SECRET).ok().flatten()?;
    let login = Login {
        host: account.host.clone(),
        address: account.address.clone(),
        password,
    };
    Some((account, login))
}

pub async fn status(state: &SharedState) -> MailStatus {
    let Some(account) = account(state).await else {
        return MailStatus {
            failure: *state.mail.failure.lock().unwrap(),
            ..MailStatus::default()
        };
    };
    let saved = saved(state).await;
    MailStatus {
        connected: true,
        provider: Some(account.provider),
        address: Some(account.address),
        total: saved.total,
        checked_at: saved.checked_at,
        syncing: state.mail.syncing.load(Ordering::SeqCst),
        failure: *state.mail.failure.lock().unwrap(),
    }
}

async fn announce(state: &SharedState) {
    state.publish(Event::MailStatusChanged {
        status: status(state).await,
    });
}

fn rejected(failure: MailFailure) -> MailStatus {
    MailStatus {
        failure: Some(failure),
        ..MailStatus::default()
    }
}

async fn connect(
    state: &SharedState,
    provider: MailProvider,
    address: &str,
    password: &str,
    host: Option<&str>,
) -> Result<MailStatus, ProtocolError> {
    let address = address.trim().to_owned();
    let password: String = password.chars().filter(|c| !c.is_whitespace()).collect();
    let Some(host) = host_for(provider, &address, host).filter(|_| address.contains('@') && !password.is_empty())
    else {
        return Ok(rejected(MailFailure::BadAddress));
    };
    let login = Login {
        host: host.clone(),
        address: address.clone(),
        password: password.clone(),
    };
    let total = match state.mail.source.probe(login, since(now_ms())).await {
        Ok(total) => total,
        Err(error) => return Ok(rejected(failure_of(error))),
    };
    state
        .secrets
        .save_named(SECRET, Some(&password))
        .map_err(|failure| ProtocolError::new(ErrorCode::Internal, failure.to_string()))?;
    state.mail.generation.fetch_add(1, Ordering::SeqCst);
    write(state, ACCOUNT_KEY, &Account { provider, address, host }).await;
    write(state, ITEMS_KEY, &Saved { total, ..Saved::default() }).await;
    state.mail.fail(None);
    state.mail.syncing.store(true, Ordering::SeqCst);
    let background = Arc::clone(state);
    tokio::spawn(async move { sync(&background).await });
    let status = status(state).await;
    state.publish(Event::MailStatusChanged { status: status.clone() });
    Ok(status)
}

async fn disconnect(state: &SharedState) {
    state.mail.generation.fetch_add(1, Ordering::SeqCst);
    let _ = state.store.clear_setting(ACCOUNT_KEY).await;
    let _ = state.store.clear_setting(ITEMS_KEY).await;
    if let Err(failure) = state.secrets.save_named(SECRET, None) {
        tracing::warn!(%failure, "could not remove the mail password");
    }
    state.mail.fail(None);
    state.mail.syncing.store(false, Ordering::SeqCst);
    crate::insights::forget_kind(state, xiaoban_protocol::InsightKind::MailDue).await;
    announce(state).await;
    state.publish(Event::DailyFeedChanged);
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Verdict {
    pub i: usize,
    pub category: Option<String>,
    pub title: Option<String>,
    pub summary: Option<String>,
    pub bill: Option<BillDraft>,
    pub trip: Option<TripDraft>,
    pub parcel: Option<ParcelDraft>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(default)]
struct Verdicts {
    mails: Vec<Verdict>,
}

fn one_line(text: &str, max: usize) -> String {
    clip(&text.split_whitespace().collect::<Vec<_>>().join(" "), max)
}

fn filled(value: Option<&String>, max: usize) -> Option<String> {
    value.map(|value| one_line(value, max)).filter(|value| !value.is_empty())
}

pub fn settle(id: String, at: i64, parsed: &Parsed, rule: Rule, verdict: Option<&Verdict>) -> MailItem {
    let guessed = verdict
        .and_then(|verdict| verdict.category.as_deref())
        .and_then(MailCategory::parse);
    let category = match rule {
        Rule::Sure(category) => category,
        Rule::Hint(category) => guessed.unwrap_or(category),
        Rule::Unknown => guessed.unwrap_or_default(),
    };
    let haystack = format!("{}\n{}", parsed.subject, parsed.text);
    let subject = one_line(&parsed.subject, TITLE_CHARS * 2);
    MailItem {
        id,
        from_name: one_line(&parsed.from_name, TITLE_CHARS),
        from_address: if parsed.reply_to.is_empty() { parsed.from_address.clone() } else { parsed.reply_to.clone() },
        title: verdict
            .and_then(|verdict| filled(verdict.title.as_ref(), TITLE_CHARS))
            .unwrap_or_else(|| one_line(&parsed.subject, TITLE_CHARS)),
        subject,
        summary: verdict
            .and_then(|verdict| filled(verdict.summary.as_ref(), SUMMARY_CHARS))
            .unwrap_or_else(|| one_line(&parsed.text, SUMMARY_CHARS)),
        at,
        category,
        bill: (category == MailCategory::Bill)
            .then(|| verdict.and_then(|verdict| verdict.bill.as_ref()))
            .flatten()
            .and_then(|draft| mail_rules::check_bill(&haystack, draft)),
        trip: (category == MailCategory::Trip)
            .then(|| verdict.and_then(|verdict| verdict.trip.as_ref()))
            .flatten()
            .and_then(|draft| mail_rules::check_trip(&haystack, draft)),
        parcel: (category == MailCategory::Parcel)
            .then(|| verdict.and_then(|verdict| verdict.parcel.as_ref()))
            .flatten()
            .and_then(|draft| mail_rules::check_parcel(&haystack, draft)),
    }
}

fn parse_verdicts(text: &str) -> Vec<Verdict> {
    let (Some(start), Some(end)) = (text.find('{'), text.rfind('}')) else {
        return Vec::new();
    };
    if start >= end {
        return Vec::new();
    }
    serde_json::from_str::<Verdicts>(&text[start..=end]).map(|found| found.mails).unwrap_or_else(|failure| {
        tracing::warn!(%failure, "unreadable mail sorting");
        Vec::new()
    })
}

async fn ask(state: &SharedState, mails: &[(usize, &Parsed, Rule)], today: &str) -> HashMap<usize, Verdict> {
    let input = json!({
        "today": today,
        "mails": mails.iter().map(|(index, parsed, rule)| json!({
            "i": index,
            "from": format!("{} <{}>", parsed.from_name, parsed.from_address),
            "subject": parsed.subject,
            "hint": rule.category().map(MailCategory::as_str),
            "text": clip(&parsed.text, SORT_CHARS),
        })).collect::<Vec<_>>(),
    })
    .to_string();
    let prefix = StablePrefix::new(state.localizer.text(keys::PROMPT_MAIL_SORT));
    let (events, _) = mpsc::channel(1);
    let outcome = state
        .active()
        .agent
        .without_thinking()
        .run_turn(&prefix, &Transcript::default(), &input, &NoTools, events, CancellationToken::new())
        .await;
    match outcome {
        Ok(outcome) => parse_verdicts(&outcome.text).into_iter().map(|verdict| (verdict.i, verdict)).collect(),
        Err(failure) => {
            tracing::warn!(%failure, "mail sorting failed");
            HashMap::new()
        }
    }
}

fn needs_model(rule: Rule) -> bool {
    !matches!(rule, Rule::Sure(MailCategory::Promo | MailCategory::Other))
}

fn trip_start(trip: &xiaoban_protocol::MailTrip, zone: &TimeZone) -> Option<i64> {
    let date: Date = trip.date.as_deref()?.parse().ok()?;
    let (hour, minute) = trip.time.as_deref()?.split_once(':')?;
    let time = jiff::civil::Time::new(hour.parse().ok()?, minute.parse().ok()?, 0, 0).ok()?;
    date.to_datetime(time)
        .to_zoned(zone.clone())
        .ok()
        .map(|zoned| zoned.timestamp().as_millisecond())
}

fn link_trip(item: &mut MailItem, trips: &[Trip], zone: &TimeZone) {
    let Some(trip) = item.trip.as_mut() else {
        return;
    };
    trip.start = trip_start(trip, zone);
    let to = trip.to.clone().unwrap_or_default();
    let found = trips.iter().find(|saved| {
        let city = saved.city.trim();
        !city.is_empty() && !to.is_empty() && (to.contains(city) || city.contains(to.as_str()))
    });
    if let Some(found) = found {
        trip.trip_thread_id = Some(found.thread_id.clone());
        trip.trip_city = Some(found.city.clone());
    } else if !to.is_empty() {
        trip.trip_city = Some(to);
    }
}

async fn digest(state: &SharedState, raws: Vec<Raw>, validity: u32) -> Vec<MailItem> {
    let now = now_ms();
    let zone = zone();
    let parsed: Vec<(Raw, Parsed, Rule)> = raws
        .into_iter()
        .filter_map(|raw| {
            let parsed = mail_rules::parse(&raw.bytes)?;
            if mail_rules::is_code(&parsed) {
                return None;
            }
            let rule = mail_rules::classify(&parsed);
            Some((raw, parsed, rule))
        })
        .collect();
    let mut verdicts = HashMap::new();
    if state.active().model.is_some() {
        let today = date_of(now, &zone).map(|date| date.to_string()).unwrap_or_default();
        let asking: Vec<(usize, &Parsed, Rule)> = parsed
            .iter()
            .enumerate()
            .filter(|(_, (_, _, rule))| needs_model(*rule))
            .map(|(index, (_, parsed, rule))| (index, parsed, *rule))
            .collect();
        for chunk in asking.chunks(SORT_BATCH) {
            verdicts.extend(ask(state, chunk, &today).await);
        }
    }
    let trips = state.store.recent_trips(TRIPS).await.unwrap_or_default();
    parsed
        .iter()
        .enumerate()
        .map(|(index, (raw, parsed, rule))| {
            let at = raw.at.or(parsed.at).unwrap_or(now);
            let mut item = settle(item_id(validity, raw.uid), at, parsed, *rule, verdicts.get(&index));
            link_trip(&mut item, &trips, &zone);
            item
        })
        .collect()
}

fn merge(saved: &mut Saved, fresh: Vec<MailItem>, now: i64) {
    for item in fresh {
        saved.items.retain(|old| old.id != item.id);
        saved.items.push(item);
    }
    saved.items.retain(|item| item.at >= now - WINDOW_DAYS * DAY_MS);
    saved.items.sort_by_key(|item| std::cmp::Reverse(item.at));
}

pub async fn sync(state: &SharedState) {
    let _running = state.mail.lock.lock().await;
    let generation = state.mail.generation.load(Ordering::SeqCst);
    let Some((_, login)) = credentials(state).await else {
        state.mail.syncing.store(false, Ordering::SeqCst);
        return;
    };
    state.mail.syncing.store(true, Ordering::SeqCst);
    announce(state).await;
    let before = saved(state).await;
    let after = (before.validity != 0 || before.last_uid != 0).then_some((before.validity, before.last_uid));
    match state.mail.source.recent(login, since(now_ms()), after).await {
        Err(error) => state.mail.fail(Some(failure_of(error))),
        Ok(batch) => {
            let mut next = if batch.validity == before.validity { before } else { Saved::default() };
            next.validity = batch.validity;
            next.total = batch.total;
            next.last_uid = batch.messages.iter().map(|raw| raw.uid).max().unwrap_or(0).max(next.last_uid);
            let fresh = digest(state, batch.messages, batch.validity).await;
            let now = now_ms();
            merge(&mut next, fresh, now);
            next.checked_at = Some(now);
            if state.mail.generation.load(Ordering::SeqCst) == generation {
                write(state, ITEMS_KEY, &next).await;
                state.mail.fail(None);
            }
        }
    }
    state.mail.syncing.store(false, Ordering::SeqCst);
    announce(state).await;
    state.publish(Event::DailyFeedChanged);
}

fn upcoming(item: &MailItem, today: Date) -> bool {
    let soon = |date: Option<&String>| {
        date.and_then(|date| date.parse::<Date>().ok())
            .and_then(|date| today.until(date).ok())
            .is_some_and(|span| (0..=UPCOMING_DAYS).contains(&i64::from(span.get_days())))
    };
    soon(item.bill.as_ref().and_then(|bill| bill.due.as_ref()))
        || soon(item.trip.as_ref().and_then(|trip| trip.date.as_ref()))
        || soon(item.parcel.as_ref().and_then(|parcel| parcel.eta.as_ref()))
}

const fn rank(category: MailCategory) -> u8 {
    match category {
        MailCategory::Bill => 0,
        MailCategory::Trip => 1,
        MailCategory::Parcel => 2,
        MailCategory::Reply => 3,
        MailCategory::Promo | MailCategory::Other => 4,
    }
}

pub fn pick(items: &[MailItem], now: i64, zone: &TimeZone) -> MailToday {
    let Some(today) = date_of(now, zone) else {
        return MailToday::default();
    };
    let start = start_of(today, zone).unwrap_or(now - DAY_MS);
    let yesterday = today.yesterday().ok().and_then(|day| start_of(day, zone)).unwrap_or(start - DAY_MS);
    let arrived: Vec<&MailItem> = items.iter().filter(|item| item.at >= start).collect();
    let mut worth: Vec<MailItem> = items
        .iter()
        .filter(|item| item.category.worth() && (item.at >= yesterday || upcoming(item, today)))
        .cloned()
        .collect();
    worth.sort_by_key(|item| (rank(item.category), std::cmp::Reverse(item.at)));
    worth.truncate(TODAY_ITEMS);
    let shown_today = worth.iter().filter(|item| item.at >= start).count();
    MailToday {
        total: u32::try_from(arrived.len()).unwrap_or(u32::MAX),
        folded: u32::try_from(arrived.len().saturating_sub(shown_today)).unwrap_or(0),
        items: worth,
    }
}

pub async fn today(state: &SharedState) -> Option<MailToday> {
    account(state).await?;
    Some(pick(&saved(state).await.items, now_ms(), &zone()))
}

pub async fn bills_due(state: &SharedState) -> Vec<MailItem> {
    if account(state).await.is_none() {
        return Vec::new();
    }
    let zone = zone();
    let Some(today) = date_of(now_ms(), &zone) else {
        return Vec::new();
    };
    saved(state)
        .await
        .items
        .into_iter()
        .filter(|item| {
            item.bill.as_ref().is_some_and(|bill| {
                bill.cents.is_some()
                    && bill
                        .due
                        .as_deref()
                        .and_then(|due| due.parse::<Date>().ok())
                        .and_then(|due| today.until(due).ok())
                        .is_some_and(|span| (0..=DUE_SOON_DAYS).contains(&i64::from(span.get_days())))
            })
        })
        .collect()
}

async fn find(state: &SharedState, id: &str) -> Option<MailItem> {
    saved(state).await.items.into_iter().find(|item| item.id == id.trim())
}

async fn original(state: &SharedState, id: &str) -> Result<MailOriginal, ProtocolError> {
    let missing = || ProtocolError::new(ErrorCode::NotFound, "no such mail");
    let item = find(state, id).await.ok_or_else(missing)?;
    let (validity, uid) = split_id(&item.id).ok_or_else(missing)?;
    let (_, login) = credentials(state).await.ok_or_else(missing)?;
    let raw = state
        .mail
        .source
        .original(login, validity, uid)
        .await
        .map_err(|error| ProtocolError::new(ErrorCode::Internal, error.to_string()))?
        .ok_or_else(missing)?;
    let parsed = mail_rules::parse(&raw.bytes).ok_or_else(missing)?;
    if mail_rules::is_code(&parsed) {
        return Err(missing());
    }
    let truncated = parsed.text.chars().count() > ORIGINAL_CHARS || raw.bytes.len() >= ORIGINAL_CAP;
    Ok(MailOriginal {
        item,
        text: clip(&parsed.text, ORIGINAL_CHARS),
        truncated,
    })
}

pub async fn handle(state: &SharedState, request: Request) -> Result<Response, ProtocolError> {
    match request {
        Request::ConnectMail { provider, address, password, host } => {
            let status = connect(state, provider, &address, &password, host.as_deref()).await?;
            Ok(Response::MailStatus { status })
        }
        Request::DisconnectMail => {
            disconnect(state).await;
            Ok(Response::MailStatus { status: status(state).await })
        }
        Request::MailList { category } => {
            let mut items = saved(state).await.items;
            items.retain(|item| category.is_none_or(|category| item.category == category));
            items.truncate(LISTED);
            Ok(Response::MailList { items })
        }
        Request::MailOriginal { id } => Ok(Response::MailOriginal {
            original: original(state, &id).await?,
        }),
        _ => Ok(Response::MailStatus { status: status(state).await }),
    }
}

pub fn watch(state: SharedState, shutdown: CancellationToken) {
    tokio::spawn(async move {
        let mut wait = FIRST_LOOK;
        loop {
            tokio::select! {
                () = shutdown.cancelled() => return,
                () = tokio::time::sleep(wait) => {}
            }
            wait = CHECK_EVERY;
            if account(&state).await.is_some() {
                sync(&state).await;
            }
        }
    });
}

pub fn is_tool(name: &str) -> bool {
    matches!(name, SEARCH | READ | DRAFT)
}

fn text(l: &Localizer, key: xiaoban_i18n::Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

pub fn specs(l: &Localizer) -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: SEARCH.to_owned(),
            description: l.text(keys::TOOL_SEARCH_MAIL_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "query": text(l, keys::TOOL_SEARCH_MAIL_QUERY),
                    "category": {
                        "type": "string",
                        "enum": MailCategory::ALL.map(MailCategory::as_str),
                        "description": l.text(keys::TOOL_SEARCH_MAIL_CATEGORY),
                    },
                    "days": { "type": "integer", "minimum": 1, "maximum": WINDOW_DAYS, "description": l.text(keys::TOOL_SEARCH_MAIL_DAYS) },
                },
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: READ.to_owned(),
            description: l.text(keys::TOOL_READ_MAIL_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": { "id": text(l, keys::TOOL_READ_MAIL_ID) },
                "required": ["id"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: DRAFT.to_owned(),
            description: l.text(keys::TOOL_DRAFT_REPLY_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "id": text(l, keys::TOOL_DRAFT_REPLY_ID),
                    "text": text(l, keys::TOOL_DRAFT_REPLY_TEXT),
                },
                "required": ["id", "text"],
                "additionalProperties": false,
            }),
        },
    ]
}

#[derive(Deserialize)]
struct SearchArgs {
    #[serde(default)]
    query: Option<String>,
    #[serde(default)]
    category: Option<String>,
    #[serde(default)]
    days: Option<i64>,
}

#[derive(Deserialize)]
struct ReadArgs {
    id: String,
}

#[derive(Deserialize)]
struct DraftArgs {
    id: String,
    text: String,
}

fn failure(message: &str) -> String {
    json!({ "error": message }).to_string()
}

const NOT_CONNECTED: &str = "no mailbox is connected; tell the user they can connect one in Me > Connected services > Add mailbox, and never ask for the password in chat";

#[allow(clippy::cast_precision_loss)]
fn yuan(cents: Option<i64>) -> Value {
    cents.map_or(Value::Null, |cents| json!(cents as f64 / 100.0))
}

fn day_text(at: i64) -> String {
    date_of(at, &zone()).map(|date| date.to_string()).unwrap_or_default()
}

fn sender(item: &MailItem) -> String {
    if item.from_name.is_empty() { item.from_address.clone() } else { item.from_name.clone() }
}

fn brief(item: &MailItem) -> Value {
    json!({
        "id": item.id,
        "from": sender(item),
        "address": item.from_address,
        "date": day_text(item.at),
        "subject": item.subject,
        "category": item.category.as_str(),
        "summary": item.summary,
        "bill": item.bill.as_ref().map(|bill| json!({
            "amount": yuan(bill.cents),
            "minimum": yuan(bill.minimum_cents),
            "due": bill.due,
        })),
        "trip": item.trip,
        "parcel": item.parcel,
    })
}

fn matches(item: &MailItem, words: &[String]) -> bool {
    let haystack = format!(
        "{} {} {} {} {} {}",
        item.subject,
        item.title,
        item.summary,
        item.from_name,
        item.from_address,
        item.category.as_str()
    )
    .to_lowercase();
    words.iter().all(|word| haystack.contains(word.as_str()))
}

pub fn search(items: &[MailItem], query: &str, category: Option<MailCategory>, days: i64, now: i64) -> Vec<MailItem> {
    let words: Vec<String> = query.split_whitespace().map(str::to_lowercase).collect();
    items
        .iter()
        .filter(|item| category.is_none_or(|category| item.category == category))
        .filter(|item| item.at >= now - days * DAY_MS)
        .filter(|item| matches(item, &words))
        .take(RESULTS)
        .cloned()
        .collect()
}

fn reply_subject(subject: &str) -> String {
    let lower = subject.trim().to_lowercase();
    if lower.starts_with("re:") || lower.starts_with("re\u{FF1A}") {
        subject.trim().to_owned()
    } else {
        format!("Re: {}", subject.trim())
    }
}

impl HubTools<'_> {
    pub async fn mail_tool(&self, name: &str, arguments: &str) -> String {
        if account(self.state).await.is_none() {
            return failure(NOT_CONNECTED);
        }
        match name {
            SEARCH => self.search_mail(arguments).await,
            READ => self.read_mail(arguments).await,
            _ => self.draft_reply(arguments).await,
        }
    }

    async fn search_mail(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<SearchArgs>(arguments) else {
            return failure("arguments must be {query?, category?, days?}");
        };
        let category = args.category.as_deref().and_then(MailCategory::parse);
        let days = args.days.unwrap_or(WINDOW_DAYS).clamp(1, WINDOW_DAYS);
        let items = saved(self.state).await.items;
        let found = search(&items, args.query.as_deref().unwrap_or_default(), category, days, now_ms());
        if let [only] = found.as_slice() {
            self.attach(Attachment::Mail { mail: only.clone() });
        }
        json!({
            "mails": found.iter().map(brief).collect::<Vec<_>>(),
            "note": "only the last 30 days are kept; when you answer from a mail, say which sender and date it came from, and call read_mail on the one you rely on so its source card is shown",
        })
        .to_string()
    }

    async fn read_mail(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<ReadArgs>(arguments) else {
            return failure("arguments must be {id}");
        };
        let Some(item) = find(self.state, &args.id).await else {
            return failure("unknown mail id; call search_mail first and use an id it returned");
        };
        self.attach(Attachment::Mail { mail: item.clone() });
        match original(self.state, &item.id).await {
            Ok(found) => json!({
                "mail": brief(&item),
                "text": clip(&found.text, TOOL_CHARS),
                "truncated": found.truncated || found.text.chars().count() > TOOL_CHARS,
            })
            .to_string(),
            Err(_) => json!({
                "mail": brief(&item),
                "error": "the original could not be fetched right now; answer from the summary and say so",
            })
            .to_string(),
        }
    }

    async fn draft_reply(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<DraftArgs>(arguments) else {
            return failure("arguments must be {id, text}");
        };
        let Some(item) = find(self.state, &args.id).await else {
            return failure("unknown mail id; call search_mail first and use an id it returned");
        };
        let body = clip(args.text.trim(), DRAFT_CHARS);
        if body.is_empty() {
            return failure("text must not be empty");
        }
        self.attach(Attachment::MailDraft {
            draft: MailDraft {
                mail_id: item.id.clone(),
                to: item.from_address.clone(),
                to_name: item.from_name.clone(),
                subject: reply_subject(&item.subject),
                text: body,
            },
        });
        json!({
            "shown": true,
            "note": "the draft is shown to the user with Copy and Open in mail buttons; it is never sent by you, so do not say it was sent and do not repeat the draft text in your reply",
        })
        .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use xiaoban_protocol::{MailBill, MailTrip};

    const NOW: i64 = 1_793_520_000_000;

    fn parsed(subject: &str, text: &str) -> Parsed {
        Parsed {
            from_name: "招商银行".into(),
            from_address: "ccsvc@message.cmbchina.com".into(),
            reply_to: String::new(),
            subject: subject.into(),
            text: text.into(),
            at: None,
            bulk: false,
        }
    }

    fn item(id: &str, category: MailCategory, at: i64) -> MailItem {
        MailItem {
            id: id.into(),
            category,
            at,
            ..MailItem::default()
        }
    }

    #[test]
    fn extracted_numbers_that_are_not_in_the_mail_are_dropped() {
        let mail = parsed("信用卡 10 月账单", "本期应还 ¥3,240.00，到期还款日 11月20日");
        let honest: Verdict = serde_json::from_value(json!({
            "i": 0, "category": "bill", "title": "招商银行信用卡 10 月账单",
            "bill": { "amount": 3240, "minimum": null, "due": "2026-11-20" }
        }))
        .unwrap();
        let item = settle("7-1".into(), NOW, &mail, mail_rules::classify(&mail), Some(&honest));
        assert_eq!(item.category, MailCategory::Bill);
        assert_eq!(
            item.bill,
            Some(MailBill { cents: Some(324_000), minimum_cents: None, due: Some("2026-11-20".into()) })
        );
        let invented: Verdict = serde_json::from_value(json!({
            "i": 0, "category": "bill",
            "bill": { "amount": 3420, "minimum": 500, "due": "2026-11-25" }
        }))
        .unwrap();
        let item = settle("7-1".into(), NOW, &mail, mail_rules::classify(&mail), Some(&invented));
        assert_eq!(item.bill, None);
        assert_eq!(item.title, "信用卡 10 月账单");
    }

    #[test]
    fn the_model_only_decides_what_the_rules_could_not() {
        let mail = parsed("信用卡 10 月账单", "");
        let says_promo: Verdict = serde_json::from_value(json!({ "i": 0, "category": "promo" })).unwrap();
        assert_eq!(settle("1-1".into(), NOW, &mail, Rule::Sure(MailCategory::Bill), Some(&says_promo)).category, MailCategory::Bill);
        assert_eq!(settle("1-1".into(), NOW, &mail, Rule::Hint(MailCategory::Bill), Some(&says_promo)).category, MailCategory::Promo);
        assert_eq!(settle("1-1".into(), NOW, &mail, Rule::Unknown, None).category, MailCategory::Other);
        let says_reply: Verdict = serde_json::from_value(json!({ "i": 0, "category": "reply" })).unwrap();
        assert_eq!(settle("1-1".into(), NOW, &mail, Rule::Unknown, Some(&says_reply)).category, MailCategory::Reply);
    }

    #[test]
    fn verdicts_survive_code_fences() {
        let found = parse_verdicts("```json\n{\"mails\":[{\"i\":2,\"category\":\"trip\"}]}\n```");
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].i, 2);
        assert!(parse_verdicts("not json").is_empty());
    }

    #[test]
    fn today_shows_worthwhile_mail_and_folds_the_rest() {
        let zone = TimeZone::UTC;
        let start = NOW - NOW.rem_euclid(DAY_MS);
        let mut bill = item("1-1", MailCategory::Bill, start - 5 * DAY_MS);
        bill.bill = Some(MailBill { cents: Some(100), minimum_cents: None, due: date_of(NOW + 2 * DAY_MS, &zone).map(|d| d.to_string()) });
        let items = vec![
            item("1-2", MailCategory::Promo, start + 1000),
            item("1-3", MailCategory::Promo, start + 2000),
            item("1-4", MailCategory::Reply, start - DAY_MS + 10),
            item("1-5", MailCategory::Parcel, start + 3000),
            item("1-6", MailCategory::Other, start - 3 * DAY_MS),
            item("1-7", MailCategory::Reply, start - 4 * DAY_MS),
            bill,
        ];
        let today = pick(&items, NOW, &zone);
        assert_eq!(today.total, 3);
        assert_eq!(today.items.iter().map(|item| item.id.as_str()).collect::<Vec<_>>(), vec!["1-1", "1-5", "1-4"]);
        assert_eq!(today.folded, 2);
    }

    #[test]
    fn old_mail_falls_out_and_new_mail_replaces_by_id() {
        let mut saved = Saved {
            items: vec![item("1-1", MailCategory::Other, NOW - 40 * DAY_MS), item("1-2", MailCategory::Other, NOW - DAY_MS)],
            ..Saved::default()
        };
        merge(&mut saved, vec![item("1-2", MailCategory::Bill, NOW - DAY_MS), item("1-3", MailCategory::Trip, NOW)], NOW);
        assert_eq!(saved.items.iter().map(|item| item.id.as_str()).collect::<Vec<_>>(), vec!["1-3", "1-2"]);
        assert_eq!(saved.items[1].category, MailCategory::Bill);
    }

    #[test]
    fn hosts_follow_the_provider() {
        assert_eq!(host_for(MailProvider::Qq, "1@qq.com", None).as_deref(), Some("imap.qq.com"));
        assert_eq!(host_for(MailProvider::Netease, "a@126.com", None).as_deref(), Some("imap.126.com"));
        assert_eq!(host_for(MailProvider::Netease, "a@163.com", None).as_deref(), Some("imap.163.com"));
        assert_eq!(host_for(MailProvider::Other, "a@x.cn", Some(" imaps://Mail.X.cn:993 ")).as_deref(), Some("mail.x.cn"));
        assert_eq!(host_for(MailProvider::Other, "a@x.cn", Some("not a host")), None);
        assert_eq!(host_for(MailProvider::Qq, "no-at-sign", None), None);
    }

    #[test]
    fn search_matches_every_word() {
        let mut first = item("1-1", MailCategory::Bill, NOW);
        first.from_name = "招商银行".into();
        first.subject = "信用卡账单".into();
        let mut second = item("1-2", MailCategory::Trip, NOW);
        second.subject = "G7321 电子客票".into();
        second.trip = Some(MailTrip::default());
        let items = vec![first, second];
        assert_eq!(search(&items, "招商 账单", None, 30, NOW).len(), 1);
        assert_eq!(search(&items, "", Some(MailCategory::Trip), 30, NOW)[0].id, "1-2");
        assert!(search(&items, "账单", Some(MailCategory::Trip), 30, NOW).is_empty());
    }

    #[test]
    fn ids_round_trip() {
        assert_eq!(split_id(&item_id(7, 42)), Some((7, 42)));
        assert_eq!(split_id("x"), None);
        assert_eq!(reply_subject("装修押金"), "Re: 装修押金");
        assert_eq!(reply_subject("RE: 装修押金"), "RE: 装修押金");
    }
}
