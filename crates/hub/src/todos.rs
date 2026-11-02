use std::time::Duration;

use jiff::civil::Date;
use jiff::tz::TimeZone;
use jiff::{Timestamp, ToSpan};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::Notify;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{
    Attachment, ErrorCode, Event, NotifySettings, ProtocolError, Request, Response, ScheduleRule,
    ShoppingItem, Todo, TodoAction, TodoDraft, TodoRepeat, TodoSource, TodoSourceKind, TodoState,
};
use xiaoban_store::now_ms;

use crate::schedules::{at, next_after, parse_minute};
use crate::state::SharedState;
use crate::tools::HubTools;

pub const ADD_TODO: &str = "add_todo";
pub const LIST_TODOS: &str = "list_todos";
pub const COMPLETE_TODO: &str = "complete_todo";
pub const UPDATE_TODO: &str = "update_todo";
pub const MORNING: u16 = 9 * 60;

const KEY: &str = "todos";
const HOUR_MS: i64 = 3600 * 1000;
const DAY_MS: i64 = 24 * HOUR_MS;
const KEEP_DONE_MS: i64 = 60 * DAY_MS;
const TICK: Duration = Duration::from_secs(20);
const DAY_MINUTES: u16 = 24 * 60;
const MAX_TITLE: usize = 60;
const MAX_NOTE: usize = 500;
const MAX_PROPOSED: usize = 40;
const MAX_ITEMS: usize = 20;
const MAX_LISTED: usize = 60;

#[derive(Debug, Default)]
pub struct Book {
    lock: tokio::sync::Mutex<()>,
    wake: Notify,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Bucket {
    Overdue,
    Today,
    Later,
    Undated,
    Done,
    Hidden,
}

fn day_of(todo: &Todo) -> Option<Date> {
    todo.date.as_deref()?.parse().ok()
}

fn today_in(now: Timestamp, zone: &TimeZone) -> Date {
    now.to_zoned(zone.clone()).date()
}

pub fn bucket(todo: &Todo, now: Timestamp, zone: &TimeZone) -> Bucket {
    match todo.state {
        TodoState::Done => return Bucket::Done,
        TodoState::Proposed | TodoState::Shopping => return Bucket::Hidden,
        TodoState::Open => {}
    }
    let Some(day) = day_of(todo) else {
        return Bucket::Undated;
    };
    let today = today_in(now, zone);
    if day < today {
        return Bucket::Overdue;
    }
    if day > today {
        return Bucket::Later;
    }
    match todo.minute.and_then(|minute| at(day, minute, zone)) {
        Some(due) if due <= now => Bucket::Overdue,
        _ => Bucket::Today,
    }
}

fn rule_of(repeat: &TodoRepeat, minute: u16) -> ScheduleRule {
    match repeat {
        TodoRepeat::Daily => ScheduleRule::Daily { minute },
        TodoRepeat::Weekly { weekdays } => ScheduleRule::Weekly {
            weekdays: weekdays.clone(),
            minute,
        },
        TodoRepeat::Monthly { days } => ScheduleRule::Monthly {
            days: days.clone(),
            minute,
        },
    }
}

fn tidy_repeat(repeat: TodoRepeat) -> Result<TodoRepeat, &'static str> {
    let sorted = |days: Vec<u8>| {
        let mut days = days;
        days.sort_unstable();
        days.dedup();
        days
    };
    let repeat = match repeat {
        TodoRepeat::Daily => TodoRepeat::Daily,
        TodoRepeat::Weekly { weekdays } => TodoRepeat::Weekly {
            weekdays: sorted(weekdays),
        },
        TodoRepeat::Monthly { days } => TodoRepeat::Monthly { days: sorted(days) },
    };
    crate::schedules::check_rule(&rule_of(&repeat, 0))
        .map_err(|_| "weekdays are 1-7 (Monday is 1) and month days are 1-31")?;
    Ok(repeat)
}

fn next_date(
    repeat: &TodoRepeat,
    minute: Option<u16>,
    after: Timestamp,
    zone: &TimeZone,
) -> Option<Date> {
    next_after(&rule_of(repeat, minute.unwrap_or(0)), after, zone)
        .map(|found| found.to_zoned(zone.clone()).date())
}

fn first_date(
    repeat: &TodoRepeat,
    minute: Option<u16>,
    now: Timestamp,
    zone: &TimeZone,
) -> Option<Date> {
    let after = match minute {
        Some(_) => now,
        None => at(today_in(now, zone), 0, zone)?
            .checked_sub(1.millisecond())
            .ok()?,
    };
    next_date(repeat, minute, after, zone)
}

pub fn past_quiet(when: Timestamp, settings: &NotifySettings, zone: &TimeZone) -> Timestamp {
    if !settings.quiet {
        return when;
    }
    let zoned = when.to_zoned(zone.clone());
    let minute = u16::try_from(zoned.hour()).unwrap_or(0) * 60
        + u16::try_from(zoned.minute()).unwrap_or(0);
    if !crate::notify::in_window(settings.quiet_start, settings.quiet_end, minute) {
        return when;
    }
    let mut day = zoned.date();
    if settings.quiet_start > settings.quiet_end && minute >= settings.quiet_start {
        day = day.tomorrow().unwrap_or(day);
    }
    at(day, settings.quiet_end, zone).unwrap_or(when)
}

pub fn remind_at(todo: &Todo, settings: &NotifySettings, zone: &TimeZone) -> Option<i64> {
    if todo.state != TodoState::Open {
        return None;
    }
    let base = match todo.snooze_at {
        Some(snooze) => Timestamp::from_millisecond(snooze).ok()?,
        None => at(day_of(todo)?, todo.minute.unwrap_or(MORNING), zone)?,
    };
    Some(past_quiet(base, settings, zone).as_millisecond())
}

pub fn ring_due(
    todo: &Todo,
    settings: &NotifySettings,
    now: Timestamp,
    zone: &TimeZone,
) -> Option<i64> {
    let when = remind_at(todo, settings, zone)?;
    (when <= now.as_millisecond() && todo.reminded_at != Some(when)).then_some(when)
}

fn skip_past(todo: &mut Todo, settings: &NotifySettings, now: Timestamp, zone: &TimeZone) {
    if let Some(when) = ring_due(todo, settings, now, zone) {
        todo.reminded_at = Some(when);
    }
}

pub fn complete(todo: &mut Todo, now: Timestamp, zone: &TimeZone) -> Option<Todo> {
    if todo.state == TodoState::Done {
        return None;
    }
    todo.state = TodoState::Done;
    todo.done_at = Some(now.as_millisecond());
    todo.snooze_at = None;
    let repeat = todo.repeat.as_ref()?;
    let due = at(day_of(todo)?, todo.minute.unwrap_or(0), zone)?;
    let next = next_date(repeat, todo.minute, due.max(now), zone)?;
    Some(Todo {
        id: uuid::Uuid::now_v7().to_string(),
        date: Some(next.to_string()),
        state: TodoState::Open,
        snooze_at: None,
        reminded_at: None,
        done_at: None,
        created_at: now.as_millisecond(),
        ..todo.clone()
    })
}

pub fn act(todo: &mut Todo, action: TodoAction, now: Timestamp, zone: &TimeZone) -> Option<Todo> {
    match action {
        TodoAction::Done => return complete(todo, now, zone),
        TodoAction::Reopen => {
            if todo.state == TodoState::Done {
                todo.state = TodoState::Open;
                todo.done_at = None;
            }
        }
        TodoAction::Hour => {
            todo.state = TodoState::Open;
            todo.snooze_at = Some(now.as_millisecond() + HOUR_MS);
        }
        TodoAction::Tomorrow => {
            let today = today_in(now, zone);
            todo.state = TodoState::Open;
            todo.date = Some(today.tomorrow().unwrap_or(today).to_string());
            todo.snooze_at = None;
        }
    }
    None
}

fn clip(text: &str, max: usize) -> String {
    text.trim().chars().take(max).collect()
}

fn filled(text: Option<String>) -> Option<String> {
    text.map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
}

pub fn build(
    draft: TodoDraft,
    state: TodoState,
    now: Timestamp,
    zone: &TimeZone,
) -> Result<Todo, &'static str> {
    let title = clip(&draft.title, MAX_TITLE);
    if title.is_empty() {
        return Err("a to-do needs a title");
    }
    if draft.minute.is_some_and(|minute| minute >= DAY_MINUTES) {
        return Err("time must be HH:MM");
    }
    let repeat = draft.repeat.map(tidy_repeat).transpose()?;
    let mut date = match filled(draft.date) {
        Some(text) => Some(text.parse::<Date>().map_err(|_| "date must be YYYY-MM-DD")?),
        None => None,
    };
    if date.is_none() {
        let today = today_in(now, zone);
        date = match (&repeat, draft.minute) {
            (Some(repeat), minute) => first_date(repeat, minute, now, zone),
            (None, Some(minute)) => Some(match at(today, minute, zone) {
                Some(found) if found > now => today,
                _ => today.tomorrow().unwrap_or(today),
            }),
            (None, None) => None,
        };
    }
    Ok(Todo {
        id: uuid::Uuid::now_v7().to_string(),
        title,
        date: date.map(|date| date.to_string()),
        minute: draft.minute,
        repeat,
        note: clip(&draft.note, MAX_NOTE),
        source: draft.source,
        shop_item: filled(draft.shop_item),
        state,
        snooze_at: None,
        reminded_at: None,
        done_at: None,
        created_at: now.as_millisecond(),
    })
}

pub fn has_time(draft: &TodoDraft) -> bool {
    draft.minute.is_some()
        || draft.repeat.is_some()
        || draft.date.as_deref().is_some_and(|date| !date.trim().is_empty())
}

fn prune(todos: &mut Vec<Todo>, now: i64) {
    todos.retain(|todo| match todo.state {
        TodoState::Done => todo.done_at.is_none_or(|done| now - done <= KEEP_DONE_MS),
        TodoState::Shopping => now - todo.created_at <= KEEP_DONE_MS,
        TodoState::Open | TodoState::Proposed => true,
    });
    let proposed: Vec<String> = todos
        .iter()
        .filter(|todo| todo.state == TodoState::Proposed)
        .map(|todo| todo.id.clone())
        .collect();
    if proposed.len() > MAX_PROPOSED {
        let extra = &proposed[..proposed.len() - MAX_PROPOSED];
        todos.retain(|todo| !extra.contains(&todo.id));
    }
}

pub fn daily(todos: &[Todo], now: Timestamp, zone: &TimeZone) -> Vec<Todo> {
    let today = today_in(now, zone);
    let mut picked: Vec<(Bucket, Todo)> = todos
        .iter()
        .filter_map(|todo| {
            let bucket = bucket(todo, now, zone);
            let keep = match bucket {
                Bucket::Overdue | Bucket::Today | Bucket::Undated => true,
                Bucket::Done => todo
                    .done_at
                    .and_then(|done| Timestamp::from_millisecond(done).ok())
                    .is_some_and(|done| today_in(done, zone) == today),
                Bucket::Later | Bucket::Hidden => false,
            };
            keep.then(|| (bucket, todo.clone()))
        })
        .collect();
    picked.sort_by(|(a, left), (b, right)| {
        a.cmp(b).then_with(|| match a {
            Bucket::Done => right.done_at.cmp(&left.done_at),
            Bucket::Undated => left.created_at.cmp(&right.created_at),
            _ => (&left.date, left.minute.is_none(), left.minute)
                .cmp(&(&right.date, right.minute.is_none(), right.minute)),
        })
    });
    picked.into_iter().map(|(_, todo)| todo).collect()
}

pub async fn load(state: &SharedState) -> Vec<Todo> {
    state
        .store
        .setting_owned(KEY.to_owned())
        .await
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

async fn save(state: &SharedState, todos: &mut Vec<Todo>) {
    prune(todos, now_ms());
    let _ = state
        .store
        .set_setting_owned(KEY.to_owned(), serde_json::to_string(todos).unwrap_or_default())
        .await;
}

fn announce(state: &SharedState, changed: &[Todo]) {
    for todo in changed {
        if todo.state != TodoState::Open {
            state.publish(Event::NoticeWithdrawn {
                id: notice_id(&todo.id),
            });
        }
        state.publish(Event::TodoUpdated { todo: todo.clone() });
    }
    if !changed.is_empty() {
        state.publish(Event::DailyFeedChanged);
    }
    state.todos.wake.notify_one();
}

fn not_found() -> ProtocolError {
    ProtocolError::new(ErrorCode::NotFound, "no such to-do")
}

fn bad(message: &str) -> ProtocolError {
    ProtocolError::new(ErrorCode::BadRequest, message)
}

async fn insert(state: &SharedState, mut fresh: Vec<Todo>) -> Vec<Todo> {
    let settings = crate::notify::load(state).await;
    let zone = TimeZone::system();
    let now = Timestamp::now();
    for todo in &mut fresh {
        skip_past(todo, &settings, now, &zone);
    }
    {
        let _guard = state.todos.lock.lock().await;
        let mut todos = load(state).await;
        todos.extend(fresh.iter().cloned());
        save(state, &mut todos).await;
    }
    announce(state, &fresh);
    fresh
}

pub async fn create(
    state: &SharedState,
    draft: TodoDraft,
    propose: bool,
) -> Result<Todo, ProtocolError> {
    let kind = if propose {
        TodoState::Proposed
    } else {
        TodoState::Open
    };
    let todo = build(draft, kind, Timestamp::now(), &TimeZone::system()).map_err(bad)?;
    Ok(insert(state, vec![todo]).await.remove(0))
}

async fn change(
    state: &SharedState,
    ids: &[String],
    edit: impl Fn(&mut Todo, Timestamp, &TimeZone) -> Result<Option<Todo>, ProtocolError>,
) -> Result<Vec<Todo>, ProtocolError> {
    let settings = crate::notify::load(state).await;
    let zone = TimeZone::system();
    let now = Timestamp::now();
    let changed = {
        let _guard = state.todos.lock.lock().await;
        let mut todos = load(state).await;
        let mut changed = Vec::new();
        let mut born = Vec::new();
        for id in ids {
            let Some(todo) = todos.iter_mut().find(|todo| &todo.id == id) else {
                continue;
            };
            if let Some(mut next) = edit(todo, now, &zone)? {
                skip_past(&mut next, &settings, now, &zone);
                born.push(next);
            }
            skip_past(todo, &settings, now, &zone);
            changed.push(todo.clone());
        }
        if changed.is_empty() {
            return Err(not_found());
        }
        todos.extend(born.iter().cloned());
        save(state, &mut todos).await;
        changed.extend(born);
        changed
    };
    announce(state, &changed);
    Ok(changed)
}

async fn change_one(
    state: &SharedState,
    id: &str,
    edit: impl Fn(&mut Todo, Timestamp, &TimeZone) -> Result<Option<Todo>, ProtocolError>,
) -> Result<Todo, ProtocolError> {
    change(state, &[id.to_owned()], edit)
        .await
        .map(|mut changed| changed.remove(0))
}

fn apply_edit(todo: &mut Todo, next: &Todo, now: Timestamp, zone: &TimeZone) -> Result<(), ProtocolError> {
    let fixed = build(
        TodoDraft {
            title: next.title.clone(),
            date: next.date.clone(),
            minute: next.minute,
            repeat: next.repeat.clone(),
            note: next.note.clone(),
            source: todo.source.clone(),
            shop_item: todo.shop_item.clone(),
        },
        todo.state,
        now,
        zone,
    )
    .map_err(bad)?;
    if fixed.date != todo.date || fixed.minute != todo.minute {
        todo.snooze_at = None;
    }
    todo.title = fixed.title;
    todo.date = fixed.date;
    todo.minute = fixed.minute;
    todo.repeat = fixed.repeat;
    todo.note = fixed.note;
    Ok(())
}

async fn remove(state: &SharedState, id: &str) -> Result<(), ProtocolError> {
    {
        let _guard = state.todos.lock.lock().await;
        let mut todos = load(state).await;
        let before = todos.len();
        todos.retain(|todo| todo.id != id);
        if todos.len() == before {
            return Err(not_found());
        }
        save(state, &mut todos).await;
    }
    state.publish(Event::NoticeWithdrawn { id: notice_id(id) });
    state.publish(Event::TodoRemoved { id: id.to_owned() });
    state.publish(Event::DailyFeedChanged);
    Ok(())
}

async fn to_shopping(state: &SharedState, ids: &[String]) -> Result<Vec<Todo>, ProtocolError> {
    let changed = change(state, ids, |todo, _, _| {
        if todo.state == TodoState::Open || todo.state == TodoState::Proposed {
            todo.state = TodoState::Shopping;
        }
        Ok(None)
    })
    .await?;
    let mut kitchen = crate::kitchen::load(state).await;
    for todo in changed.iter().filter(|todo| todo.state == TodoState::Shopping) {
        let name = todo.shop_item.clone().unwrap_or_else(|| todo.title.clone());
        crate::kitchen::add_item(
            &mut kitchen,
            ShoppingItem {
                name,
                ..ShoppingItem::default()
            },
        );
    }
    crate::kitchen::save(state, kitchen).await;
    Ok(changed)
}

pub async fn quick_add(state: &SharedState, text: &str) -> Result<Todo, ProtocolError> {
    let zone = TimeZone::system();
    let parsed = crate::todo_parse::parse(text, today_in(Timestamp::now(), &zone));
    create(
        state,
        TodoDraft {
            title: parsed.title,
            date: parsed.date.map(|date| date.to_string()),
            minute: parsed.minute,
            repeat: parsed.repeat,
            note: String::new(),
            source: TodoSource {
                kind: TodoSourceKind::Daily,
                ..TodoSource::default()
            },
            shop_item: None,
        },
        false,
    )
    .await
}

pub async fn feed(state: &SharedState) -> Vec<Todo> {
    daily(&load(state).await, Timestamp::now(), &TimeZone::system())
}

pub async fn tick(state: &SharedState, now: Timestamp) {
    let settings = crate::notify::load(state).await;
    let zone = TimeZone::system();
    let rung = {
        let _guard = state.todos.lock.lock().await;
        let mut todos = load(state).await;
        let mut rung = Vec::new();
        for todo in &mut todos {
            if let Some(when) = ring_due(todo, &settings, now, &zone) {
                todo.reminded_at = Some(when);
                rung.push(todo.clone());
            }
        }
        if !rung.is_empty() {
            save(state, &mut todos).await;
        }
        rung
    };
    for todo in rung {
        state.publish(Event::TodoDue { todo: todo.clone() });
        state.publish(Event::TodoUpdated { todo });
    }
}

pub fn watch(state: SharedState, shutdown: CancellationToken) {
    tokio::spawn(async move {
        loop {
            tick(&state, Timestamp::now()).await;
            tokio::select! {
                () = tokio::time::sleep(TICK) => {}
                () = state.todos.wake.notified() => {}
                () = shutdown.cancelled() => return,
            }
        }
    });
}

pub fn notice_id(todo_id: &str) -> String {
    format!("todo:{todo_id}")
}

fn joined(l: &Localizer, parts: impl Iterator<Item = String>) -> String {
    parts.collect::<Vec<_>>().join(&l.text(keys::TODO_LIST_SEP))
}

pub fn repeat_text(l: &Localizer, repeat: &TodoRepeat) -> String {
    const WEEKDAYS: [Key; 7] = [
        keys::SCHEDULE_WEEKDAY_1,
        keys::SCHEDULE_WEEKDAY_2,
        keys::SCHEDULE_WEEKDAY_3,
        keys::SCHEDULE_WEEKDAY_4,
        keys::SCHEDULE_WEEKDAY_5,
        keys::SCHEDULE_WEEKDAY_6,
        keys::SCHEDULE_WEEKDAY_7,
    ];
    match repeat {
        TodoRepeat::Daily => l.text(keys::TODO_REPEAT_DAILY),
        TodoRepeat::Weekly { weekdays } => {
            let days = joined(
                l,
                weekdays
                    .iter()
                    .filter_map(|day| WEEKDAYS.get(usize::from(day.saturating_sub(1))))
                    .map(|key| l.text(*key)),
            );
            l.format(keys::TODO_REPEAT_WEEKLY, &[("days", &days)])
        }
        TodoRepeat::Monthly { days } if days.as_slice() == [31] => {
            l.text(keys::TODO_REPEAT_MONTH_END)
        }
        TodoRepeat::Monthly { days } => {
            let days = joined(l, days.iter().map(ToString::to_string));
            l.format(keys::TODO_REPEAT_MONTHLY, &[("days", &days)])
        }
    }
}

pub fn notice_body(l: &Localizer, todo: &Todo) -> String {
    let mut parts = Vec::new();
    if let Some(repeat) = &todo.repeat {
        parts.push(repeat_text(l, repeat));
    } else if let Some(minute) = todo.minute {
        parts.push(format!("{}:{:02}", minute / 60, minute % 60));
    }
    if let Some(line) = todo.note.lines().map(str::trim).find(|line| !line.is_empty()) {
        parts.push(line.to_owned());
    }
    parts.join(&l.text(keys::TODO_DOT))
}

pub async fn handle(state: &SharedState, request: Request) -> Result<Response, ProtocolError> {
    let todo = match request {
        Request::ListTodos => {
            let mut todos = load(state).await;
            todos.sort_by_key(|todo| todo.created_at);
            return Ok(Response::Todos { todos });
        }
        Request::AddTodo { draft, propose } => create(state, draft, propose).await?,
        Request::QuickAddTodo { text } => quick_add(state, &text).await?,
        Request::ConfirmTodo { id } => {
            change_one(state, &id, |todo, _, _| {
                if todo.state == TodoState::Proposed {
                    todo.state = TodoState::Open;
                }
                Ok(None)
            })
            .await?
        }
        Request::UpdateTodo { todo: next } => {
            change_one(state, &next.id.clone(), |todo, now, zone| {
                apply_edit(todo, &next, now, zone)?;
                Ok(None)
            })
            .await?
        }
        Request::TodoAction { id, action } => {
            change_one(state, &id, |todo, now, zone| Ok(act(todo, action, now, zone))).await?
        }
        Request::DeleteTodo { id } => {
            remove(state, &id).await?;
            return Ok(Response::Ack);
        }
        Request::TodosToShopping { ids } => {
            return Ok(Response::Todos {
                todos: to_shopping(state, &ids).await?,
            });
        }
        Request::KeepTodos { ids } => {
            let todos = change(state, &ids, |todo, _, _| {
                todo.shop_item = None;
                Ok(None)
            })
            .await?;
            return Ok(Response::Todos { todos });
        }
        _ => return Err(bad("not a to-do request")),
    };
    Ok(Response::Todo { todo })
}

pub fn is_tool(name: &str) -> bool {
    matches!(name, ADD_TODO | LIST_TODOS | COMPLETE_TODO | UPDATE_TODO)
}

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

fn item_properties(l: &Localizer) -> Value {
    json!({
        "title": text(l, keys::TOOL_ADD_TODO_TITLE),
        "date": text(l, keys::TOOL_ADD_TODO_DATE),
        "time": text(l, keys::TOOL_ADD_TODO_TIME),
        "repeat": {
            "type": "string",
            "enum": ["none", "daily", "weekly", "monthly"],
            "description": l.text(keys::TOOL_ADD_TODO_REPEAT),
        },
        "weekdays": {
            "type": "array",
            "items": { "type": "integer", "minimum": 1, "maximum": 7 },
            "description": l.text(keys::TOOL_ADD_TODO_WEEKDAYS),
        },
        "days": {
            "type": "array",
            "items": { "type": "integer", "minimum": 1, "maximum": 31 },
            "description": l.text(keys::TOOL_ADD_TODO_DAYS),
        },
        "note": text(l, keys::TOOL_ADD_TODO_NOTE),
    })
}

pub fn specs(l: &Localizer) -> Vec<ToolSpec> {
    let mut add_item = item_properties(l);
    add_item["shop_item"] = text(l, keys::TOOL_ADD_TODO_SHOP_ITEM);
    let mut update = item_properties(l);
    update["id"] = text(l, keys::TOOL_TODO_ID);
    update["delete"] = json!({ "type": "boolean", "description": l.text(keys::TOOL_UPDATE_TODO_DELETE) });
    vec![
        ToolSpec {
            name: ADD_TODO.to_owned(),
            description: l.text(keys::TOOL_ADD_TODO_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "minItems": 1,
                        "maxItems": MAX_ITEMS,
                        "description": l.text(keys::TOOL_ADD_TODO_ITEMS),
                        "items": {
                            "type": "object",
                            "properties": add_item,
                            "required": ["title"],
                            "additionalProperties": false,
                        },
                    },
                },
                "required": ["items"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: LIST_TODOS.to_owned(),
            description: l.text(keys::TOOL_LIST_TODOS_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "done": { "type": "boolean", "description": l.text(keys::TOOL_LIST_TODOS_DONE) },
                },
                "required": [],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: COMPLETE_TODO.to_owned(),
            description: l.text(keys::TOOL_COMPLETE_TODO_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": { "id": text(l, keys::TOOL_TODO_ID) },
                "required": ["id"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: UPDATE_TODO.to_owned(),
            description: l.text(keys::TOOL_UPDATE_TODO_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": update,
                "required": ["id"],
                "additionalProperties": false,
            }),
        },
    ]
}

#[derive(Debug, Default, Deserialize)]
pub struct ItemArgs {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub date: Option<String>,
    #[serde(default)]
    pub time: Option<String>,
    #[serde(default)]
    pub repeat: Option<String>,
    #[serde(default)]
    pub weekdays: Vec<u8>,
    #[serde(default)]
    pub days: Vec<u8>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub shop_item: Option<String>,
}

#[derive(Deserialize)]
struct AddArgs {
    items: Vec<ItemArgs>,
}

#[derive(Deserialize)]
struct ListArgs {
    #[serde(default)]
    done: bool,
}

#[derive(Deserialize)]
struct IdArgs {
    id: String,
}

#[derive(Deserialize)]
struct UpdateArgs {
    id: String,
    #[serde(default)]
    delete: bool,
    #[serde(flatten)]
    item: ItemArgs,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Field<T> {
    Keep,
    Set(Option<T>),
}

impl<T> Field<T> {
    fn value(self) -> Option<T> {
        match self {
            Self::Keep => None,
            Self::Set(value) => value,
        }
    }
}

fn repeat_of(item: &ItemArgs) -> Result<Field<TodoRepeat>, &'static str> {
    Ok(match item.repeat.as_deref().map(str::trim) {
        None => Field::Keep,
        Some("" | "none") => Field::Set(None),
        Some("daily") => Field::Set(Some(TodoRepeat::Daily)),
        Some("weekly") => Field::Set(Some(TodoRepeat::Weekly {
            weekdays: item.weekdays.clone(),
        })),
        Some("monthly") => Field::Set(Some(TodoRepeat::Monthly {
            days: item.days.clone(),
        })),
        Some(_) => return Err("repeat must be none, daily, weekly or monthly"),
    })
}

fn minute_of(text: Option<&str>) -> Result<Field<u16>, &'static str> {
    match text.map(str::trim) {
        None => Ok(Field::Keep),
        Some("") => Ok(Field::Set(None)),
        Some(text) => parse_minute(Some(text))
            .map(|minute| Field::Set(Some(minute)))
            .ok_or("time must be HH:MM"),
    }
}

pub fn draft_of(item: ItemArgs, thread_id: &str) -> Result<TodoDraft, &'static str> {
    let repeat = repeat_of(&item)?.value();
    let minute = minute_of(item.time.as_deref())?.value();
    Ok(TodoDraft {
        title: item.title.unwrap_or_default(),
        date: filled(item.date),
        minute,
        repeat,
        note: item.note.unwrap_or_default(),
        source: TodoSource {
            kind: TodoSourceKind::Chat,
            detail: String::new(),
            thread_id: Some(thread_id.to_owned()),
        },
        shop_item: filled(item.shop_item),
    })
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

fn when_text(todo: &Todo) -> Option<String> {
    let date = todo.date.clone()?;
    Some(match todo.minute {
        Some(minute) => format!("{date} {:02}:{:02}", minute / 60, minute % 60),
        None => date,
    })
}

fn brief(l: &Localizer, todo: &Todo) -> Value {
    json!({
        "id": todo.id,
        "title": todo.title,
        "when": when_text(todo),
        "repeat": todo.repeat.as_ref().map(|repeat| repeat_text(l, repeat)),
        "note": (!todo.note.is_empty()).then_some(&todo.note),
        "shop_item": todo.shop_item,
    })
}

impl HubTools<'_> {
    pub(crate) async fn todo_tool(&self, name: &str, arguments: &str) -> String {
        match name {
            ADD_TODO => self.add_todo(arguments).await,
            LIST_TODOS => self.list_todos(arguments).await,
            COMPLETE_TODO => self.complete_todo(arguments).await,
            _ => self.update_todo(arguments).await,
        }
    }

    async fn add_todo(&self, arguments: &str) -> String {
        let args = match serde_json::from_str::<AddArgs>(arguments) {
            Ok(args) => args,
            Err(failure) => return error(&format!("invalid to-do: {failure}")),
        };
        let zone = TimeZone::system();
        let now = Timestamp::now();
        let mut fresh = Vec::new();
        for item in args.items.into_iter().take(MAX_ITEMS) {
            let draft = match draft_of(item, self.thread_id) {
                Ok(draft) => draft,
                Err(message) => return error(message),
            };
            let kind = if has_time(&draft) {
                TodoState::Proposed
            } else {
                TodoState::Open
            };
            match build(draft, kind, now, &zone) {
                Ok(todo) => fresh.push(todo),
                Err(message) => return error(message),
            }
        }
        if fresh.is_empty() {
            return error("give at least one item");
        }
        let fresh = insert(self.state, fresh).await;
        let mut ids = match self.attachment() {
            Some(Attachment::Todos { todo_ids }) => todo_ids,
            _ => Vec::new(),
        };
        ids.extend(fresh.iter().map(|todo| todo.id.clone()));
        self.attach(Attachment::Todos { todo_ids: ids });
        let l = &self.state.localizer;
        let proposed: Vec<Value> = fresh
            .iter()
            .filter(|todo| todo.state == TodoState::Proposed)
            .map(|todo| brief(l, todo))
            .collect();
        let added: Vec<Value> = fresh
            .iter()
            .filter(|todo| todo.state == TodoState::Open)
            .map(|todo| brief(l, todo))
            .collect();
        let shop = fresh.iter().any(|todo| todo.shop_item.is_some());
        let mut notes = Vec::new();
        if !proposed.is_empty() {
            notes.push("the timed ones are only proposed: a card under your reply shows them and nothing reminds until the user taps OK. Say briefly when it will remind and ask them to confirm; do not say it is set");
        }
        if !added.is_empty() {
            notes.push("the untimed ones are already on the to-do list (no reminder; they show on the Daily page). Say so in one short sentence; the card lets the user undo");
        }
        if shop {
            notes.push("for items with shop_item, ask in one short question whether to put them on the shopping list instead; the card has a button for it");
        }
        json!({ "proposed": proposed, "added": added, "note": notes.join(". ") }).to_string()
    }

    async fn list_todos(&self, arguments: &str) -> String {
        let args = serde_json::from_str::<ListArgs>(arguments).unwrap_or(ListArgs { done: false });
        let zone = TimeZone::system();
        let now = Timestamp::now();
        let l = &self.state.localizer;
        let todos = load(self.state).await;
        let group = |wanted: Bucket| -> Vec<Value> {
            todos
                .iter()
                .filter(|todo| bucket(todo, now, &zone) == wanted)
                .take(MAX_LISTED)
                .map(|todo| brief(l, todo))
                .collect()
        };
        let mut reply = json!({
            "overdue": group(Bucket::Overdue),
            "today": group(Bucket::Today),
            "later": group(Bucket::Later),
            "no_date": group(Bucket::Undated),
        });
        if args.done {
            reply["done"] = Value::from(group(Bucket::Done));
        }
        reply.to_string()
    }

    async fn complete_todo(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<IdArgs>(arguments) else {
            return error("arguments must be {id}");
        };
        let ids = [args.id];
        match change(self.state, &ids, |todo, now, zone| Ok(complete(todo, now, zone))).await {
            Ok(changed) => {
                let next = changed.get(1).and_then(when_text);
                json!({ "done": true, "next": next }).to_string()
            }
            Err(failure) => error(&failure.detail),
        }
    }

    async fn update_todo(&self, arguments: &str) -> String {
        let args = match serde_json::from_str::<UpdateArgs>(arguments) {
            Ok(args) => args,
            Err(failure) => return error(&format!("invalid update: {failure}")),
        };
        if args.delete {
            return match remove(self.state, &args.id).await {
                Ok(()) => json!({ "deleted": true }).to_string(),
                Err(failure) => error(&failure.detail),
            };
        }
        let repeat = match repeat_of(&args.item) {
            Ok(repeat) => repeat,
            Err(message) => return error(message),
        };
        let minute = match minute_of(args.item.time.as_deref()) {
            Ok(minute) => minute,
            Err(message) => return error(message),
        };
        let item = args.item;
        let result = change_one(self.state, &args.id, |todo, now, zone| {
            let mut next = todo.clone();
            if let Some(title) = filled(item.title.clone()) {
                next.title = title;
            }
            if let Some(date) = item.date.as_deref().map(str::trim) {
                next.date = (!date.is_empty() && date != "none").then(|| date.to_owned());
                if next.date.is_none() {
                    next.minute = None;
                    next.repeat = None;
                }
            }
            if let Field::Set(minute) = minute {
                next.minute = minute;
            }
            if let Field::Set(repeat) = repeat.clone() {
                next.repeat = repeat;
            }
            if let Some(note) = item.note.clone() {
                next.note = note;
            }
            apply_edit(todo, &next, now, zone)?;
            Ok(None)
        })
        .await;
        match result {
            Ok(todo) => json!({ "updated": brief(&self.state.localizer, &todo) }).to_string(),
            Err(failure) => error(&failure.detail),
        }
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

    fn shown(ms: Option<i64>) -> String {
        ms.and_then(|ms| Timestamp::from_millisecond(ms).ok())
            .map(|at| at.to_zoned(zone()).strftime("%Y-%m-%d %H:%M").to_string())
            .unwrap_or_default()
    }

    fn quiet_off() -> NotifySettings {
        NotifySettings {
            quiet: false,
            ..NotifySettings::default()
        }
    }

    fn draft(title: &str) -> TodoDraft {
        TodoDraft {
            title: title.into(),
            ..TodoDraft::default()
        }
    }

    fn todo(title: &str, date: Option<&str>, minute: Option<u16>) -> Todo {
        let mut todo = build(draft(title), TodoState::Open, local("2026-11-01 08:00"), &zone()).unwrap();
        todo.date = date.map(Into::into);
        todo.minute = minute;
        todo
    }

    #[test]
    fn proposals_do_not_remind_until_confirmed() {
        let mut rent = build(
            TodoDraft {
                date: Some("2026-11-05".into()),
                minute: Some(9 * 60),
                repeat: Some(TodoRepeat::Monthly { days: vec![5] }),
                ..draft("交房租")
            },
            TodoState::Proposed,
            local("2026-11-01 08:00"),
            &zone(),
        )
        .unwrap();
        let later = local("2026-11-05 09:00");
        assert_eq!(remind_at(&rent, &quiet_off(), &zone()), None);
        assert_eq!(ring_due(&rent, &quiet_off(), later, &zone()), None);
        assert_eq!(bucket(&rent, later, &zone()), Bucket::Hidden);
        rent.state = TodoState::Open;
        assert_eq!(
            shown(ring_due(&rent, &quiet_off(), later, &zone())),
            "2026-11-05 09:00"
        );
    }

    #[test]
    fn date_only_reminds_at_nine() {
        let bill = todo("交物业费", Some("2026-11-03"), None);
        assert_eq!(
            shown(remind_at(&bill, &quiet_off(), &zone())),
            "2026-11-03 09:00"
        );
        assert_eq!(ring_due(&bill, &quiet_off(), local("2026-11-03 08:59"), &zone()), None);
        assert!(ring_due(&bill, &quiet_off(), local("2026-11-03 09:00"), &zone()).is_some());
        let mut rung = bill.clone();
        rung.reminded_at = remind_at(&bill, &quiet_off(), &zone());
        assert_eq!(ring_due(&rung, &quiet_off(), local("2026-11-03 10:00"), &zone()), None);
        let undated = todo("买牙膏", None, None);
        assert_eq!(remind_at(&undated, &quiet_off(), &zone()), None);
    }

    #[test]
    fn quiet_hours_push_reminders_to_their_end() {
        let settings = NotifySettings::default();
        let late = todo("吃药", Some("2026-11-03"), Some(23 * 60));
        assert_eq!(shown(remind_at(&late, &settings, &zone())), "2026-11-04 07:30");
        let early = todo("跑步", Some("2026-11-03"), Some(6 * 60));
        assert_eq!(shown(remind_at(&early, &settings, &zone())), "2026-11-03 07:30");
        let day = todo("开会", Some("2026-11-03"), Some(10 * 60));
        assert_eq!(shown(remind_at(&day, &settings, &zone())), "2026-11-03 10:00");
        assert_eq!(shown(remind_at(&late, &quiet_off(), &zone())), "2026-11-03 23:00");
    }

    #[test]
    fn finishing_a_repeat_makes_the_next_one() {
        let mut rent = todo("交房租", Some("2026-11-05"), Some(9 * 60));
        rent.repeat = Some(TodoRepeat::Monthly { days: vec![5] });
        let next = complete(&mut rent, local("2026-11-03 20:00"), &zone()).unwrap();
        assert_eq!(rent.state, TodoState::Done);
        assert_eq!(next.date.as_deref(), Some("2026-12-05"));
        assert_eq!(next.minute, Some(9 * 60));
        assert_eq!(next.state, TodoState::Open);
        assert_ne!(next.id, rent.id);
        let mut walk = todo("散步", Some("2026-11-03"), None);
        walk.repeat = Some(TodoRepeat::Daily);
        let next = complete(&mut walk, local("2026-11-03 18:00"), &zone()).unwrap();
        assert_eq!(next.date.as_deref(), Some("2026-11-04"));
        let mut late = todo("倒垃圾", Some("2026-11-02"), Some(20 * 60));
        late.repeat = Some(TodoRepeat::Weekly { weekdays: vec![1] });
        let next = complete(&mut late, local("2026-11-10 09:00"), &zone()).unwrap();
        assert_eq!(next.date.as_deref(), Some("2026-11-16"));
        let mut once = todo("取快递", Some("2026-11-03"), None);
        assert!(complete(&mut once, local("2026-11-03 18:00"), &zone()).is_none());
    }

    #[test]
    fn overdue_and_today() {
        let now = local("2026-11-03 20:00");
        let zone = zone();
        assert_eq!(bucket(&todo("a", Some("2026-11-02"), None), now, &zone), Bucket::Overdue);
        assert_eq!(bucket(&todo("b", Some("2026-11-03"), Some(19 * 60)), now, &zone), Bucket::Overdue);
        assert_eq!(bucket(&todo("c", Some("2026-11-03"), Some(21 * 60)), now, &zone), Bucket::Today);
        assert_eq!(bucket(&todo("d", Some("2026-11-03"), None), now, &zone), Bucket::Today);
        assert_eq!(bucket(&todo("e", Some("2026-11-04"), None), now, &zone), Bucket::Later);
        assert_eq!(bucket(&todo("f", None, None), now, &zone), Bucket::Undated);
        let mut done = todo("g", Some("2026-11-01"), None);
        done.state = TodoState::Done;
        done.done_at = Some(local("2026-11-03 09:12").as_millisecond());
        let list = vec![
            todo("later", Some("2026-11-09"), None),
            done,
            todo("undated", None, None),
            todo("today", Some("2026-11-03"), None),
            todo("tonight", Some("2026-11-03"), Some(21 * 60)),
            todo("overdue", Some("2026-11-01"), None),
        ];
        let titles: Vec<String> = daily(&list, now, &zone).into_iter().map(|todo| todo.title).collect();
        assert_eq!(titles, ["overdue", "tonight", "today", "undated", "g"]);
    }

    #[test]
    fn snoozing_and_moving_to_tomorrow() {
        let now = local("2026-11-05 09:00");
        let mut rent = todo("交房租", Some("2026-11-05"), Some(9 * 60));
        rent.reminded_at = remind_at(&rent, &quiet_off(), &zone());
        act(&mut rent, TodoAction::Hour, now, &zone());
        assert_eq!(shown(remind_at(&rent, &quiet_off(), &zone())), "2026-11-05 10:00");
        assert!(ring_due(&rent, &quiet_off(), local("2026-11-05 10:00"), &zone()).is_some());
        act(&mut rent, TodoAction::Tomorrow, now, &zone());
        assert_eq!(rent.date.as_deref(), Some("2026-11-06"));
        assert_eq!(shown(remind_at(&rent, &quiet_off(), &zone())), "2026-11-06 09:00");
    }

    #[test]
    fn times_without_a_date_land_on_the_next_one() {
        let now = local("2026-11-03 20:00");
        let call = build(
            TodoDraft {
                minute: Some(19 * 60),
                ..draft("给妈妈打电话")
            },
            TodoState::Proposed,
            now,
            &zone(),
        )
        .unwrap();
        assert_eq!(call.date.as_deref(), Some("2026-11-04"));
        let rent = build(
            TodoDraft {
                repeat: Some(TodoRepeat::Monthly { days: vec![5] }),
                ..draft("交房租")
            },
            TodoState::Proposed,
            now,
            &zone(),
        )
        .unwrap();
        assert_eq!(rent.date.as_deref(), Some("2026-11-05"));
        assert!(build(draft("  "), TodoState::Open, now, &zone()).is_err());
    }
}
