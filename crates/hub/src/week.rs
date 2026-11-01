use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};
use tokio_util::sync::CancellationToken;
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{Dish, Event, Kitchen, PrepTask, ShoppingItem, WeekDay, WeekItem, WeekPlan};
use xiaoban_store::now_ms;

use crate::kitchen::{add_item, load, save};
use crate::state::SharedState;
use crate::tools::HubTools;

pub const PLAN: &str = "week_plan";
const MAX_WEEKS: usize = 6;
const MAX_ITEMS: usize = 60;
const MAX_PREP: usize = 14;
const CHECK_EVERY: Duration = Duration::from_secs(30);

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

fn keep(l: &Localizer) -> Value {
    json!({ "type": "string", "enum": ["frozen", "chilled", "room", "none"], "description": l.text(keys::TOOL_WEEK_KEEP) })
}

pub fn spec(l: &Localizer) -> ToolSpec {
    let day = json!({
        "type": "object",
        "properties": {
            "date": text(l, keys::TOOL_WEEK_DAY_DATE),
            "dish": text(l, keys::TOOL_WEEK_DAY_DISH),
            "minutes": { "type": "integer", "minimum": 0, "maximum": 600, "description": l.text(keys::TOOL_KITCHEN_DISH_MINUTES) },
            "why": text(l, keys::TOOL_WEEK_DAY_WHY),
            "takeout": { "type": "boolean", "description": l.text(keys::TOOL_WEEK_DAY_TAKEOUT) },
            "photo_query": text(l, keys::TOOL_KITCHEN_DISH_PHOTO),
        },
        "required": ["date", "dish", "minutes", "why"],
        "additionalProperties": false,
    });
    let prep = json!({
        "type": "object",
        "properties": {
            "date": text(l, keys::TOOL_WEEK_DAY_DATE),
            "time": text(l, keys::TOOL_WEEK_PREP_TIME),
            "text": text(l, keys::TOOL_WEEK_PREP_TEXT),
        },
        "required": ["date", "time", "text"],
        "additionalProperties": false,
    });
    let item = json!({
        "type": "object",
        "properties": {
            "name": text(l, keys::TOOL_KITCHEN_ITEM_NAME),
            "amount": text(l, keys::TOOL_KITCHEN_ITEM_AMOUNT),
            "note": text(l, keys::TOOL_WEEK_ITEM_NOTE),
            "group": text(l, keys::TOOL_WEEK_ITEM_GROUP),
            "keep": keep(l),
            "have": { "type": "boolean", "description": l.text(keys::TOOL_WEEK_ITEM_HAVE) },
        },
        "required": ["name", "group", "keep"],
        "additionalProperties": false,
    });
    ToolSpec {
        name: PLAN.to_owned(),
        description: l.text(keys::TOOL_WEEK_PLAN_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "start": text(l, keys::TOOL_WEEK_START),
                "idea": text(l, keys::TOOL_WEEK_IDEA),
                "days": { "type": "array", "items": day, "maxItems": 7, "description": l.text(keys::TOOL_WEEK_DAYS) },
                "prep": { "type": "array", "items": prep, "maxItems": MAX_PREP, "description": l.text(keys::TOOL_WEEK_PREP) },
                "buy": { "type": "array", "items": item, "maxItems": MAX_ITEMS, "description": l.text(keys::TOOL_WEEK_BUY) },
            },
            "required": ["start", "days"],
            "additionalProperties": false,
        }),
    }
}

pub fn keep_spec(l: &Localizer) -> Value {
    keep(l)
}

#[derive(Deserialize)]
struct DayArg {
    date: String,
    dish: String,
    #[serde(default)]
    minutes: u32,
    #[serde(default)]
    why: String,
    #[serde(default)]
    takeout: bool,
    #[serde(default)]
    photo_query: String,
}

#[derive(Deserialize)]
struct PrepArg {
    date: String,
    #[serde(default)]
    time: String,
    text: String,
}

#[derive(Deserialize)]
struct PlanArgs {
    start: String,
    #[serde(default)]
    idea: Option<String>,
    #[serde(default)]
    days: Vec<DayArg>,
    #[serde(default)]
    prep: Option<Vec<PrepArg>>,
    #[serde(default)]
    buy: Option<Vec<WeekItem>>,
}

fn monday(date: &str) -> Option<jiff::civil::Date> {
    let date: jiff::civil::Date = date.trim().parse().ok()?;
    let offset = i64::from(date.weekday().to_monday_zero_offset());
    date.checked_sub(jiff::Span::new().days(offset)).ok()
}

pub fn today() -> jiff::civil::Date {
    jiff::Zoned::now().date()
}

pub fn this_monday() -> String {
    monday(&today().to_string()).map(|date| date.to_string()).unwrap_or_default()
}

fn merge(plan: &mut WeekPlan, args: PlanArgs, fresh: bool) {
    if let Some(idea) = args.idea {
        plan.idea = idea;
    }
    for day in &mut plan.days {
        day.changed = false;
    }
    for arg in args.days {
        let Some(date) = arg.date.trim().parse::<jiff::civil::Date>().ok().map(|date| date.to_string()) else {
            continue;
        };
        let next = WeekDay {
            date: date.clone(),
            dish: arg.dish,
            minutes: arg.minutes,
            why: arg.why,
            takeout: arg.takeout,
            photo_query: arg.photo_query,
            image: None,
            changed: false,
        };
        match plan.days.iter_mut().find(|known| known.date == date) {
            Some(known) => {
                let changed = !fresh && known.dish != next.dish;
                let image = if known.dish == next.dish { known.image.clone() } else { None };
                *known = WeekDay { changed, image, ..next };
            }
            None => plan.days.push(next),
        }
    }
    plan.days.sort_by(|a, b| a.date.cmp(&b.date));
    plan.days.truncate(7);
    if let Some(prep) = args.prep {
        plan.prep = prep
            .into_iter()
            .take(MAX_PREP)
            .map(|task| {
                let previous = plan.prep.iter().find(|known| known.date == task.date && known.text == task.text);
                PrepTask {
                    notified: previous.is_some_and(|known| known.notified),
                    date: task.date,
                    time: task.time,
                    text: task.text,
                }
            })
            .collect();
    }
    if let Some(buy) = args.buy {
        plan.buy = buy.into_iter().take(MAX_ITEMS).collect();
        plan.added = false;
    }
}

impl HubTools<'_> {
    pub(crate) async fn week_plan(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<PlanArgs>(arguments) else {
            return json!({ "error": "arguments must be {start, idea?, days: [{date, dish, minutes, why, takeout?}], prep?, buy?}" }).to_string();
        };
        let Some(start) = monday(&args.start) else {
            return json!({ "error": "start must be a date like 2026-11-02" }).to_string();
        };
        let start = start.to_string();
        let mut kitchen = load(self.state).await;
        let fresh = !kitchen.weeks.iter().any(|plan| plan.start == start);
        if fresh {
            kitchen.weeks.push(WeekPlan { start: start.clone(), ..WeekPlan::default() });
        }
        if let Some(plan) = kitchen.weeks.iter_mut().find(|plan| plan.start == start) {
            merge(plan, args, fresh);
        }
        kitchen.weeks.sort_by(|a, b| a.start.cmp(&b.start));
        while kitchen.weeks.len() > MAX_WEEKS {
            kitchen.weeks.remove(0);
        }
        save(self.state, kitchen).await;
        pictures(self.state, start);
        json!({ "saved": true, "hint": "the app shows the week; reply in one or two short sentences" }).to_string()
    }
}

fn pictures(state: &SharedState, start: String) {
    let state = std::sync::Arc::clone(state);
    tokio::spawn(async move {
        let kitchen = load(&state).await;
        let Some(plan) = kitchen.weeks.iter().find(|plan| plan.start == start) else {
            return;
        };
        let wanted: Vec<Dish> = plan
            .days
            .iter()
            .filter(|day| !day.takeout && day.image.is_none())
            .map(|day| Dish {
                name: day.dish.clone(),
                photo_query: day.photo_query.clone(),
                ..Dish::default()
            })
            .collect();
        if wanted.is_empty() {
            return;
        }
        let pictured = crate::dish_photos::fill(&state, wanted).await;
        let mut latest = load(&state).await;
        if let Some(plan) = latest.weeks.iter_mut().find(|plan| plan.start == start) {
            for day in &mut plan.days {
                if let Some(found) = pictured.iter().find(|dish| dish.name == day.dish) {
                    day.image.clone_from(&found.image);
                }
            }
        }
        save(&state, latest).await;
    });
}

pub async fn to_shopping(state: &SharedState, start: &str) -> Kitchen {
    let mut kitchen = load(state).await;
    let Some(index) = kitchen.weeks.iter().position(|plan| plan.start == start) else {
        return kitchen;
    };
    let items: Vec<WeekItem> = kitchen.weeks[index].buy.iter().filter(|item| !item.have).cloned().collect();
    for item in items {
        add_item(
            &mut kitchen,
            ShoppingItem {
                name: item.name,
                amount: item.amount,
                note: item.note,
                done: false,
                keep: item.keep,
            },
        );
    }
    kitchen.weeks[index].added = true;
    save(state, kitchen).await
}

pub fn context(kitchen: &Kitchen) -> Value {
    let start = this_monday();
    let week = |start: &str| {
        kitchen.weeks.iter().find(|plan| plan.start == start).map(|plan| {
            json!({
                "start": plan.start,
                "days": plan.days.iter().map(|day| json!({ "date": day.date, "dish": day.dish })).collect::<Vec<_>>(),
            })
        })
    };
    let next = monday(&start)
        .and_then(|date| date.checked_add(jiff::Span::new().days(7)).ok())
        .map(|date| date.to_string())
        .unwrap_or_default();
    json!({
        "today": today().to_string(),
        "weekday": today().weekday().to_monday_one_offset(),
        "this_week_start": start,
        "this_week": week(&start),
        "next_week": week(&next),
    })
}

fn due_at(task: &PrepTask) -> Option<i64> {
    let date: jiff::civil::Date = task.date.trim().parse().ok()?;
    let time: jiff::civil::Time = task.time.trim().parse().unwrap_or(jiff::civil::time(9, 0, 0, 0));
    let zoned = date.to_datetime(time).to_zoned(jiff::tz::TimeZone::system()).ok()?;
    Some(zoned.timestamp().as_millisecond())
}

async fn remind(state: &SharedState) {
    let mut kitchen = load(state).await;
    let now = now_ms();
    let mut dirty = false;
    let mut due = Vec::new();
    for task in kitchen.weeks.iter_mut().flat_map(|plan| plan.prep.iter_mut()) {
        if task.notified {
            continue;
        }
        if let Some(at) = due_at(task)
            && at <= now
        {
            task.notified = true;
            dirty = true;
            if now - at < 12 * 3600 * 1000 {
                due.push(task.clone());
            }
        }
    }
    if dirty {
        save(state, kitchen).await;
    }
    for task in due {
        state.publish(Event::PrepDue { task });
    }
}

pub fn watch(state: SharedState, shutdown: CancellationToken) {
    tokio::spawn(async move {
        loop {
            remind(&state).await;
            tokio::select! {
                () = shutdown.cancelled() => return,
                () = tokio::time::sleep(CHECK_EVERY) => {}
            }
        }
    });
}

