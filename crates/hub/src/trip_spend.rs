use serde::Deserialize;
use serde_json::json;
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{Expense, ExpenseSource, Trip};
use xiaoban_store::now_ms;

use crate::state::SharedState;
use crate::tools::HubTools;

pub const SPEND: &str = "log_trip_expense";

pub fn spec(l: &Localizer) -> ToolSpec {
    ToolSpec {
        name: SPEND.to_owned(),
        description: l.text(keys::TOOL_TRIP_EXPENSE_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "amount": { "type": "number", "exclusiveMinimum": 0, "description": l.text(keys::TOOL_TRIP_EXPENSE_AMOUNT) },
                "name": { "type": "string", "description": l.text(keys::TOOL_TRIP_EXPENSE_NAME) },
                "time": { "type": "string", "description": l.text(keys::TOOL_TRIP_EXPENSE_TIME) },
            },
            "required": ["amount", "name"],
            "additionalProperties": false,
        }),
    }
}

pub fn category(state: &SharedState, trip: &Trip) -> String {
    let place = if trip.city.trim().is_empty() {
        trip.title.trim()
    } else {
        trip.city.trim()
    };
    state
        .localizer
        .format(keys::TRIP_LEDGER_CATEGORY, &[("city", place)])
}

fn months(trip: &Trip) -> Vec<String> {
    let mut months: Vec<String> = trip
        .days
        .iter()
        .filter_map(|day| day.date.get(..7).map(str::to_owned))
        .collect();
    months.push(crate::ledger::this_month());
    months.sort();
    months.dedup();
    months
}

pub async fn spent(state: &SharedState, trip: &Trip) -> (String, Vec<Expense>) {
    let name = category(state, trip);
    let mut entries: Vec<Expense> = crate::ledger::in_months(state, &months(trip))
        .await
        .into_iter()
        .filter(|entry| entry.category == name)
        .collect();
    entries.sort_by_key(|entry| std::cmp::Reverse(entry.at));
    (name, entries)
}

pub async fn log(state: &SharedState, trip: &Trip, name: &str, cents: i64, at: Option<i64>) -> Option<String> {
    let name = name.trim();
    if cents <= 0 || name.is_empty() {
        return None;
    }
    let expense = Expense {
        id: uuid::Uuid::now_v7().to_string(),
        name: name.to_owned(),
        category: category(state, trip),
        cents,
        at: at.filter(|at| *at <= now_ms() + 600_000).unwrap_or_else(now_ms),
        source: ExpenseSource::Said,
        note: String::new(),
    };
    Some(crate::ledger::record(state, expense).await)
}

#[derive(Deserialize)]
struct SpendArgs {
    amount: f64,
    name: String,
    time: Option<String>,
}

impl HubTools<'_> {
    pub(crate) async fn trip_spend(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<SpendArgs>(arguments) else {
            return json!({ "error": "arguments must be {amount, name, time?}" }).to_string();
        };
        let trip = match self.state.store.latest_trip_in_thread(self.thread_id.to_owned()).await {
            Ok(Some(trip)) => trip,
            Ok(None) => return json!({ "error": "there is no trip in this conversation" }).to_string(),
            Err(failure) => {
                tracing::error!(%failure, "could not load the trip");
                return json!({ "error": "could not load the trip" }).to_string();
            }
        };
        let Some(cents) = crate::price::cents(args.amount) else {
            return json!({ "error": "amount must be a positive number" }).to_string();
        };
        let at = args.time.as_deref().and_then(crate::ledger::parse_time);
        match log(self.state, &trip, &args.name, cents, at).await {
            Some(id) => json!({ "saved": id, "category": category(self.state, &trip) }).to_string(),
            None => json!({ "error": "amount must be above zero and name must not be empty" }).to_string(),
        }
    }
}
