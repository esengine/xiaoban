use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{
    CategoryTotal, ContextNote, ErrorCode, Event, Expense, ExpenseSource, ImportPreview, Ledger,
    ProtocolError, Request, Response,
};
use xiaoban_store::now_ms;

use crate::state::SharedState;
use crate::tools::HubTools;

const META_KEY: &str = "ledger";
const THREAD_KEY: &str = "ledger.thread";
const MONTH_PREFIX: &str = "ledger.m.";
const MAX_ADD: usize = 40;

pub const ADD: &str = "ledger_add";
pub const EDIT: &str = "ledger_edit";
pub const REMOVE: &str = "ledger_delete";
pub const BUDGET: &str = "ledger_budget";
pub const SORT: &str = "ledger_import_categories";

pub fn is_tool(name: &str) -> bool {
    matches!(name, ADD | EDIT | REMOVE | BUDGET | SORT)
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
struct Meta {
    budget_cents: Option<i64>,
    muted: Vec<String>,
    import: Option<ImportPreview>,
}

fn zone() -> jiff::tz::TimeZone {
    jiff::tz::TimeZone::system()
}

pub fn month_of(at: i64) -> String {
    jiff::Timestamp::from_millisecond(at)
        .map(|stamp| stamp.to_zoned(zone()).strftime("%Y-%m").to_string())
        .unwrap_or_default()
}

fn current_month() -> String {
    month_of(now_ms())
}

fn shift_month(month: &str, by: i32) -> String {
    let mut parts = month.split('-').filter_map(|part| part.parse::<i32>().ok());
    let (Some(year), Some(number)) = (parts.next(), parts.next()) else {
        return String::new();
    };
    let index = year * 12 + (number - 1) + by;
    format!("{:04}-{:02}", index.div_euclid(12), index.rem_euclid(12) + 1)
}

fn valid_month(month: &str) -> bool {
    month.len() == 7 && month.as_bytes()[4] == b'-' && month.split('-').all(|part| part.parse::<u32>().is_ok())
}

async fn read<T: serde::de::DeserializeOwned + Default>(state: &SharedState, key: String) -> T {
    state
        .store
        .setting_owned(key)
        .await
        .ok()
        .flatten()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

async fn write<T: Serialize>(state: &SharedState, key: String, value: &T) {
    let _ = state
        .store
        .set_setting_owned(key, serde_json::to_string(value).unwrap_or_default())
        .await;
}

async fn meta(state: &SharedState) -> Meta {
    read(state, META_KEY.to_owned()).await
}

async fn save_meta(state: &SharedState, meta: &Meta) {
    write(state, META_KEY.to_owned(), meta).await;
}

async fn entries(state: &SharedState, month: &str) -> Vec<Expense> {
    read(state, format!("{MONTH_PREFIX}{month}")).await
}

async fn save_entries(state: &SharedState, month: &str, list: &mut Vec<Expense>) {
    list.sort_by_key(|entry| std::cmp::Reverse(entry.at));
    write(state, format!("{MONTH_PREFIX}{month}"), list).await;
}

fn changed(state: &SharedState) {
    state.publish(Event::LedgerChanged);
}

pub async fn thread(state: &SharedState) -> Option<String> {
    state
        .store
        .setting_owned(THREAD_KEY.to_owned())
        .await
        .ok()
        .flatten()
        .filter(|id| !id.is_empty())
}

pub async fn is_ledger(state: &SharedState, thread_id: &str) -> bool {
    thread(state).await.as_deref() == Some(thread_id)
}

async fn ensure_thread(state: &SharedState) -> Result<String, String> {
    if let Some(id) = thread(state).await
        && state.store.thread(id.clone()).await.is_ok()
    {
        return Ok(id);
    }
    let created = state
        .store
        .create_thread(Some(state.localizer.text(keys::LEDGER_THREAD_TITLE)))
        .await
        .map_err(|failure| failure.to_string())?;
    let _ = state
        .store
        .set_setting_owned(THREAD_KEY.to_owned(), created.id.clone())
        .await;
    state.publish(Event::ThreadUpdated {
        thread: created.clone(),
    });
    Ok(created.id)
}

fn day_of(at: i64) -> i8 {
    jiff::Timestamp::from_millisecond(at)
        .map_or(1, |stamp| stamp.to_zoned(zone()).day())
}

fn totals(list: &[Expense]) -> Vec<CategoryTotal> {
    let mut sums: BTreeMap<String, i64> = BTreeMap::new();
    for entry in list {
        *sums.entry(entry.category.clone()).or_default() += entry.cents;
    }
    let mut out: Vec<CategoryTotal> = sums
        .into_iter()
        .map(|(category, cents)| CategoryTotal { category, cents })
        .collect();
    out.sort_by_key(|total| std::cmp::Reverse(total.cents));
    out
}

async fn any_entries(state: &SharedState) -> bool {
    let now = current_month();
    for back in 0..36 {
        if !entries(state, &shift_month(&now, -back)).await.is_empty() {
            return true;
        }
    }
    false
}

pub async fn view(state: &SharedState, month: &str) -> Ledger {
    let month = if valid_month(month) { month.to_owned() } else { current_month() };
    let meta = meta(state).await;
    let list = entries(state, &month).await;
    let mut previous = entries(state, &shift_month(&month, -1)).await;
    if month == current_month() {
        let today = day_of(now_ms());
        previous.retain(|entry| day_of(entry.at) <= today);
    }
    let empty = list.is_empty() && !any_entries(state).await;
    Ledger {
        thread_id: thread(state).await,
        month,
        budget_cents: meta.budget_cents,
        previous: totals(&previous),
        entries: list,
        muted: meta.muted,
        import: meta.import,
        empty,
        ..Ledger::default()
    }
}

fn day_bounds(date: jiff::civil::Date) -> Option<(i64, i64)> {
    let start = date.to_zoned(zone()).ok()?;
    let end = date.tomorrow().ok()?.to_zoned(zone()).ok()?;
    Some((start.timestamp().as_millisecond(), end.timestamp().as_millisecond()))
}

async fn between(state: &SharedState, from: jiff::civil::Date, to: jiff::civil::Date) -> Vec<Expense> {
    let (Some((start, _)), Some((_, end))) = (day_bounds(from), day_bounds(to)) else {
        return Vec::new();
    };
    let mut month = from.strftime("%Y-%m").to_string();
    let last = to.strftime("%Y-%m").to_string();
    let mut out = Vec::new();
    while month <= last {
        out.extend(entries(state, &month).await.into_iter().filter(|entry| entry.at >= start && entry.at < end));
        month = shift_month(&month, 1);
    }
    out.sort_by_key(|entry| std::cmp::Reverse(entry.at));
    out
}

pub async fn recent(state: &SharedState, days: i64) -> Vec<Expense> {
    let Ok(today) = jiff::Timestamp::from_millisecond(now_ms()).map(|stamp| stamp.to_zoned(zone()).date()) else {
        return Vec::new();
    };
    let from = today.checked_sub(jiff::Span::new().days(days)).unwrap_or(today);
    between(state, from, today).await
}

pub async fn unmute(state: &SharedState, category: &str) {
    let mut meta = meta(state).await;
    let before = meta.muted.len();
    meta.muted.retain(|key| key != category);
    if meta.muted.len() != before {
        save_meta(state, &meta).await;
        changed(state);
    }
}

pub async fn view_range(state: &SharedState, from: &str, to: &str) -> Ledger {
    let parse = |value: &str| value.trim().parse::<jiff::civil::Date>().ok();
    let (Some(mut from), Some(mut to)) = (parse(from), parse(to)) else {
        return view(state, &current_month()).await;
    };
    if from > to {
        std::mem::swap(&mut from, &mut to);
    }
    let days = (to - from).get_days().clamp(0, 400);
    let to = from.checked_add(jiff::Span::new().days(days)).unwrap_or(to);
    let list = between(state, from, to).await;
    let before_end = from.yesterday().unwrap_or(from);
    let before_start = before_end.checked_sub(jiff::Span::new().days(days)).unwrap_or(before_end);
    let previous = between(state, before_start, before_end).await;
    let meta = meta(state).await;
    let empty = list.is_empty() && !any_entries(state).await;
    Ledger {
        thread_id: thread(state).await,
        month: String::new(),
        budget_cents: meta.budget_cents,
        previous: totals(&previous),
        previous_cents: previous.iter().map(|entry| entry.cents).sum(),
        entries: list,
        muted: meta.muted,
        import: meta.import,
        empty,
        from: from.to_string(),
        to: to.to_string(),
    }
}

pub async fn year(state: &SharedState, year: i32) -> xiaoban_protocol::LedgerYear {
    let mut months = Vec::new();
    let mut days = std::collections::BTreeSet::new();
    for number in 1..=12 {
        let month = format!("{year:04}-{number:02}");
        let list = entries(state, &month).await;
        for entry in &list {
            if let Ok(stamp) = jiff::Timestamp::from_millisecond(entry.at) {
                days.insert(stamp.to_zoned(zone()).date().to_string());
            }
        }
        months.push(xiaoban_protocol::MonthTotal {
            month,
            cents: list.iter().map(|entry| entry.cents).sum(),
            count: u32::try_from(list.len()).unwrap_or(u32::MAX),
        });
    }
    xiaoban_protocol::LedgerYear {
        year,
        months,
        days: days.into_iter().collect(),
    }
}

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

fn spec(name: &str, description: String, properties: &Value, required: &[&str]) -> ToolSpec {
    ToolSpec {
        name: name.to_owned(),
        description,
        parameters: json!({ "type": "object", "properties": properties, "required": required, "additionalProperties": false }),
    }
}

pub fn specs(l: &Localizer) -> Vec<ToolSpec> {
    let amount = json!({ "type": "number", "minimum": 0, "description": l.text(keys::TOOL_LEDGER_AMOUNT) });
    let item = json!({
        "type": "object",
        "properties": {
            "amount": amount,
            "name": text(l, keys::TOOL_LEDGER_NAME),
            "category": text(l, keys::TOOL_LEDGER_CATEGORY),
            "time": text(l, keys::TOOL_LEDGER_TIME),
            "source": { "type": "string", "enum": ["said", "receipt"], "description": l.text(keys::TOOL_LEDGER_SOURCE) },
            "note": text(l, keys::TOOL_LEDGER_NOTE),
        },
        "required": ["amount", "name", "category"],
        "additionalProperties": false,
    });
    vec![
        spec(ADD, l.text(keys::TOOL_LEDGER_ADD_DESCRIPTION), &json!({ "items": { "type": "array", "items": item, "maxItems": MAX_ADD } }), &["items"]),
        spec(
            EDIT,
            l.text(keys::TOOL_LEDGER_EDIT_DESCRIPTION),
            &json!({
                "id": text(l, keys::TOOL_LEDGER_ID),
                "amount": amount,
                "name": text(l, keys::TOOL_LEDGER_NAME),
                "category": text(l, keys::TOOL_LEDGER_CATEGORY),
                "time": text(l, keys::TOOL_LEDGER_TIME),
            }),
            &["id"],
        ),
        spec(
            REMOVE,
            l.text(keys::TOOL_LEDGER_DELETE_DESCRIPTION),
            &json!({ "ids": { "type": "array", "items": { "type": "string" }, "description": l.text(keys::TOOL_LEDGER_ID) } }),
            &["ids"],
        ),
        spec(
            BUDGET,
            l.text(keys::TOOL_LEDGER_BUDGET_DESCRIPTION),
            &json!({ "amount": { "type": "number", "minimum": 0, "description": l.text(keys::TOOL_LEDGER_BUDGET_AMOUNT) } }),
            &["amount"],
        ),
        spec(
            SORT,
            l.text(keys::TOOL_LEDGER_SORT_DESCRIPTION),
            &json!({ "items": { "type": "array", "items": {
                "type": "object",
                "properties": { "key": text(l, keys::TOOL_LEDGER_SORT_KEY), "category": text(l, keys::TOOL_LEDGER_CATEGORY) },
                "required": ["key", "category"],
                "additionalProperties": false,
            } } }),
            &["items"],
        ),
    ]
}

#[allow(clippy::cast_possible_truncation)]
fn cents(amount: f64) -> i64 {
    let rounded = (amount * 100.0).round();
    if rounded.is_finite() && (0.0..1e13).contains(&rounded) {
        rounded as i64
    } else {
        0
    }
}

pub fn parse_time(value: &str) -> Option<i64> {
    let numbers: Vec<i32> = value
        .split(|c: char| !c.is_ascii_digit())
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse().ok())
        .collect();
    let get = |index: usize| numbers.get(index).copied().unwrap_or(0);
    if numbers.len() < 3 {
        return None;
    }
    let date = jiff::civil::Date::new(i16::try_from(get(0)).ok()?, i8::try_from(get(1)).ok()?, i8::try_from(get(2)).ok()?).ok()?;
    let time = jiff::civil::Time::new(
        i8::try_from(get(3)).ok()?,
        i8::try_from(get(4)).ok()?,
        i8::try_from(get(5)).ok()?,
        0,
    )
    .ok()?;
    date.to_datetime(time)
        .to_zoned(zone())
        .ok()
        .map(|zoned| zoned.timestamp().as_millisecond())
}

#[derive(Deserialize)]
struct ItemArg {
    amount: f64,
    name: String,
    category: String,
    #[serde(default)]
    time: String,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    note: String,
}

#[derive(Deserialize)]
struct AddArgs {
    items: Vec<ItemArg>,
}

#[derive(Deserialize)]
struct EditArgs {
    id: String,
    amount: Option<f64>,
    name: Option<String>,
    category: Option<String>,
    time: Option<String>,
}

#[derive(Deserialize)]
struct RemoveArgs {
    ids: Vec<String>,
}

#[derive(Deserialize)]
struct BudgetArgs {
    amount: f64,
}

#[derive(Deserialize)]
struct SortItem {
    key: String,
    category: String,
}

#[derive(Deserialize)]
struct SortArgs {
    items: Vec<SortItem>,
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

async fn find(state: &SharedState, id: &str) -> Option<(String, Vec<Expense>)> {
    let now = current_month();
    for back in 0..24 {
        let month = shift_month(&now, -back);
        let list = entries(state, &month).await;
        if list.iter().any(|entry| entry.id == id) {
            return Some((month, list));
        }
    }
    None
}

async fn edit(state: &SharedState, updated: Expense) -> bool {
    let Some((month, mut list)) = find(state, &updated.id).await else {
        return false;
    };
    list.retain(|entry| entry.id != updated.id);
    let target = month_of(updated.at);
    if target == month {
        list.push(updated);
        save_entries(state, &month, &mut list).await;
    } else {
        save_entries(state, &month, &mut list).await;
        let mut other = entries(state, &target).await;
        other.push(updated);
        save_entries(state, &target, &mut other).await;
    }
    true
}

async fn add(state: &SharedState, items: Vec<Expense>) -> Vec<String> {
    let mut by_month: BTreeMap<String, Vec<Expense>> = BTreeMap::new();
    let mut ids = Vec::new();
    for item in items {
        ids.push(item.id.clone());
        by_month.entry(month_of(item.at)).or_default().push(item);
    }
    for (month, items) in by_month {
        let mut list = entries(state, &month).await;
        list.extend(items);
        save_entries(state, &month, &mut list).await;
    }
    ids
}

impl HubTools<'_> {
    pub(crate) async fn ledger_tool(&self, name: &str, arguments: &str) -> String {
        let state = self.state;
        let result = match name {
            ADD => {
                let Ok(args) = serde_json::from_str::<AddArgs>(arguments) else {
                    return error("arguments must be {items: [{amount, name, category, time?, source?, note?}]}");
                };
                let items: Vec<Expense> = args
                    .items
                    .into_iter()
                    .take(MAX_ADD)
                    .filter(|item| item.amount > 0.0)
                    .map(|item| Expense {
                        id: uuid::Uuid::now_v7().to_string(),
                        name: item.name,
                        category: item.category,
                        cents: cents(item.amount),
                        at: parse_time(&item.time).filter(|at| *at <= now_ms() + 600_000).unwrap_or_else(now_ms),
                        source: if item.source.as_deref() == Some("receipt") { ExpenseSource::Receipt } else { ExpenseSource::Said },
                        note: item.note,
                    })
                    .collect();
                json!({ "saved": add(state, items).await })
            }
            EDIT => {
                let Ok(args) = serde_json::from_str::<EditArgs>(arguments) else {
                    return error("arguments must be {id, amount?, name?, category?, time?}");
                };
                let Some((_, list)) = find(state, &args.id).await else {
                    return error("no entry with that id");
                };
                let Some(mut entry) = list.into_iter().find(|entry| entry.id == args.id) else {
                    return error("no entry with that id");
                };
                if let Some(amount) = args.amount {
                    entry.cents = cents(amount);
                }
                if let Some(name) = args.name {
                    entry.name = name;
                }
                if let Some(category) = args.category {
                    entry.category = category;
                }
                if let Some(at) = args.time.as_deref().and_then(parse_time).filter(|at| *at <= now_ms() + 600_000) {
                    entry.at = at;
                }
                json!({ "saved": edit(state, entry).await })
            }
            REMOVE => {
                let Ok(args) = serde_json::from_str::<RemoveArgs>(arguments) else {
                    return error("arguments must be {ids: [...]}");
                };
                let mut removed = 0;
                for id in args.ids {
                    if let Some((month, mut list)) = find(state, &id).await {
                        list.retain(|entry| entry.id != id);
                        save_entries(state, &month, &mut list).await;
                        removed += 1;
                    }
                }
                json!({ "removed": removed })
            }
            BUDGET => {
                let Ok(args) = serde_json::from_str::<BudgetArgs>(arguments) else {
                    return error("arguments must be {amount}");
                };
                let mut meta = meta(state).await;
                meta.budget_cents = (args.amount > 0.0).then(|| cents(args.amount));
                save_meta(state, &meta).await;
                json!({ "saved": true })
            }
            _ => {
                let Ok(args) = serde_json::from_str::<SortArgs>(arguments) else {
                    return error("arguments must be {items: [{key, category}]}");
                };
                let mut meta = meta(state).await;
                let Some(preview) = meta.import.as_mut() else {
                    return error("no import waiting");
                };
                let map: BTreeMap<String, String> = args.items.into_iter().map(|item| (item.key, item.category)).collect();
                for row in &mut preview.rows {
                    if let Some(category) = map.get(&crate::ledger_import::key_of(row)) {
                        row.category.clone_from(category);
                    }
                }
                preview.sorted = true;
                save_meta(state, &meta).await;
                json!({ "saved": true, "hint": "the app now shows the import for the user to check; reply in one short sentence" })
            }
        };
        changed(state);
        result.to_string()
    }
}

#[allow(clippy::cast_precision_loss)]
pub async fn note(state: &SharedState, thread_id: &str) -> Option<ContextNote> {
    if !is_ledger(state, thread_id).await {
        return None;
    }
    let month = current_month();
    let list = entries(state, &month).await;
    let meta = meta(state).await;
    let mut categories: Vec<String> = totals(&list).into_iter().map(|total| total.category).collect();
    for previous in totals(&entries(state, &shift_month(&month, -1)).await) {
        if !categories.contains(&previous.category) {
            categories.push(previous.category);
        }
    }
    let recent: Vec<Value> = list
        .iter()
        .take(20)
        .map(|entry| {
            json!({
                "id": entry.id,
                "time": jiff::Timestamp::from_millisecond(entry.at).map(|stamp| stamp.to_zoned(zone()).strftime("%m-%d %H:%M").to_string()).unwrap_or_default(),
                "name": entry.name,
                "category": entry.category,
                "amount": entry.cents as f64 / 100.0,
            })
        })
        .collect();
    let body = json!({
        "month": month,
        "spent": list.iter().map(|entry| entry.cents).sum::<i64>() as f64 / 100.0,
        "budget": meta.budget_cents.map(|value| value as f64 / 100.0),
        "categories_in_use": categories,
        "recent": recent,
        "import_waiting": meta.import.as_ref().map(|preview| json!({ "file": preview.file, "rows": preview.rows.len(), "sorted": preview.sorted })),
    });
    Some(ContextNote {
        label: state.localizer.text(keys::LEDGER_CONTEXT_LABEL),
        body: body.to_string(),
    })
}

pub async fn take_import(state: &SharedState, thread_id: &str, paths: Vec<String>) -> (Vec<String>, Option<ContextNote>) {
    if !is_ledger(state, thread_id).await {
        return (paths, None);
    }
    let (sheets, rest): (Vec<String>, Vec<String>) = paths.into_iter().partition(|path| crate::ledger_import::is_bill(path));
    let Some(path) = sheets.into_iter().next() else {
        return (rest, None);
    };
    let known = {
        let now = current_month();
        let mut all = Vec::new();
        for back in 0..3 {
            all.extend(entries(state, &shift_month(&now, -back)).await);
        }
        all
    };
    let parsed = tokio::task::spawn_blocking(move || crate::ledger_import::read(std::path::Path::new(&path), &known))
        .await
        .ok()
        .and_then(Result::ok);
    let l = &state.localizer;
    let Some(preview) = parsed else {
        return (rest, Some(ContextNote { label: l.text(keys::LEDGER_IMPORT_LABEL), body: l.text(keys::LEDGER_IMPORT_FAILED) }));
    };
    let summary = crate::ledger_import::summary(&preview);
    let mut meta = meta(state).await;
    meta.import = Some(preview);
    save_meta(state, &meta).await;
    changed(state);
    (rest, Some(ContextNote { label: l.text(keys::LEDGER_IMPORT_LABEL), body: summary }))
}

pub async fn handle(state: &SharedState, request: Request) -> Result<Response, ProtocolError> {
    let month = match &request {
        Request::Ledger { month }
        | Request::SetBudget { month, .. }
        | Request::UpdateExpense { month, .. }
        | Request::DeleteExpense { month, .. }
        | Request::MuteInsight { month, .. }
        | Request::SetImportRow { month, .. }
        | Request::CommitImport { month }
        | Request::CancelImport { month } => month.clone(),
        _ => current_month(),
    };
    match request {
        Request::LedgerRange { from, to } => {
            return Ok(Response::Ledger {
                ledger: view_range(state, &from, &to).await,
            });
        }
        Request::LedgerYear { year: number } => {
            return Ok(Response::LedgerYear {
                year: year(state, number.clamp(2000, 2100)).await,
            });
        }
        Request::Ledger { .. } => {
            ensure_thread(state)
                .await
                .map_err(|failure| ProtocolError::new(ErrorCode::Internal, failure))?;
        }
        Request::SetBudget { cents, .. } => {
            let mut meta = meta(state).await;
            meta.budget_cents = cents.filter(|value| *value > 0);
            save_meta(state, &meta).await;
            changed(state);
        }
        Request::UpdateExpense { expense, .. } => {
            if expense.cents > 0 && edit(state, expense).await {
                changed(state);
            }
        }
        Request::DeleteExpense { id, .. } => {
            if let Some((found, mut list)) = find(state, &id).await {
                list.retain(|entry| entry.id != id);
                save_entries(state, &found, &mut list).await;
                changed(state);
            }
        }
        Request::MuteInsight { key, .. } => {
            let mut meta = meta(state).await;
            if !meta.muted.contains(&key) {
                meta.muted.push(key);
            }
            save_meta(state, &meta).await;
            changed(state);
        }
        Request::SetImportRow { id, checked, category, .. } => {
            let mut meta = meta(state).await;
            if let Some(row) = meta.import.as_mut().and_then(|preview| preview.rows.iter_mut().find(|row| row.id == id)) {
                row.checked = checked;
                if !category.trim().is_empty() {
                    category.trim().clone_into(&mut row.category);
                }
            }
            save_meta(state, &meta).await;
            changed(state);
        }
        Request::CommitImport { .. } => {
            let mut meta = meta(state).await;
            if let Some(preview) = meta.import.take() {
                let file = preview.file.clone();
                let fallback = state.localizer.text(keys::LEDGER_OTHER);
                let items: Vec<Expense> = preview
                    .rows
                    .into_iter()
                    .filter(|row| row.checked && row.cents > 0)
                    .map(|row| Expense {
                        id: uuid::Uuid::now_v7().to_string(),
                        name: if row.item.is_empty() || row.item == "/" { row.payee.clone() } else { row.item.clone() },
                        category: if row.category.is_empty() { fallback.clone() } else { row.category },
                        cents: row.cents,
                        at: row.at,
                        source: ExpenseSource::Import,
                        note: row.payee,
                    })
                    .collect();
                let count = items.len();
                add(state, items).await;
                if count > 0 {
                    crate::insights::record_import(state, count, &file, thread(state).await).await;
                }
            }
            save_meta(state, &meta).await;
            changed(state);
        }
        Request::CancelImport { .. } => {
            let mut meta = meta(state).await;
            meta.import = None;
            save_meta(state, &meta).await;
            changed(state);
        }
        _ => {}
    }
    Ok(Response::Ledger {
        ledger: view(state, &month).await,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn months_shift_across_years() {
        assert_eq!(shift_month("2026-01", -1), "2025-12");
        assert_eq!(shift_month("2026-12", 1), "2027-01");
        assert_eq!(shift_month("2026-10", -12), "2025-10");
    }

    #[test]
    fn loose_times_are_read() {
        assert!(parse_time("2026/10/1 9:05").is_some());
        assert!(parse_time("2026-10-31 09:20:33").is_some());
        assert!(parse_time("2026-10-31").is_some());
        assert!(parse_time("yesterday").is_none());
    }

    #[test]
    fn amounts_become_cents() {
        assert_eq!(cents(38.5), 3850);
        assert_eq!(cents(126.8), 12680);
        assert_eq!(cents(-3.0), 0);
    }
}
