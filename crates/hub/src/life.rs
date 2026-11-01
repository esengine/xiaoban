use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::ContextNote;

use crate::state::SharedState;
use crate::tools::HubTools;

pub const LIFE: &str = "life";

pub fn spec(l: &Localizer) -> ToolSpec {
    let text = |key| json!({ "type": "string", "description": l.text(key) });
    ToolSpec {
        name: LIFE.to_owned(),
        description: l.text(keys::TOOL_LIFE_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "action": { "type": "string", "enum": ["summary", "add_expense", "add_shopping"] },
                "expenses": { "type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "amount": { "type": "number", "minimum": 0 },
                        "name": text(keys::TOOL_LEDGER_NAME),
                        "category": text(keys::TOOL_LEDGER_CATEGORY),
                        "time": text(keys::TOOL_LEDGER_TIME),
                    },
                    "required": ["amount", "name", "category"],
                    "additionalProperties": false,
                } },
                "items": { "type": "array", "items": {
                    "type": "object",
                    "properties": { "name": text(keys::TOOL_KITCHEN_ITEM_NAME), "amount": text(keys::TOOL_KITCHEN_ITEM_AMOUNT) },
                    "required": ["name"],
                    "additionalProperties": false,
                } },
            },
            "required": ["action"],
            "additionalProperties": false,
        }),
    }
}

#[derive(Deserialize)]
struct Args {
    action: String,
    #[serde(default)]
    expenses: Vec<Value>,
    #[serde(default)]
    items: Vec<Value>,
}

#[allow(clippy::cast_precision_loss)]
async fn summary(state: &SharedState) -> Value {
    let kitchen = crate::kitchen::load(state).await;
    let month = crate::ledger::month_of(xiaoban_store::now_ms());
    let ledger = crate::ledger::view(state, &month).await;
    let mut categories: Vec<(String, i64)> = Vec::new();
    for entry in &ledger.entries {
        match categories.iter_mut().find(|(name, _)| *name == entry.category) {
            Some((_, cents)) => *cents += entry.cents,
            None => categories.push((entry.category.clone(), entry.cents)),
        }
    }
    categories.sort_by_key(|(_, cents)| std::cmp::Reverse(*cents));
    let weather = crate::weather_page::view(state, None).await;
    json!({
        "spending_this_month": {
            "spent": ledger.entries.iter().map(|entry| entry.cents).sum::<i64>() as f64 / 100.0,
            "budget": ledger.budget_cents.map(|cents| cents as f64 / 100.0),
            "top": categories.iter().take(4).map(|(name, cents)| json!({ "category": name, "spent": *cents as f64 / 100.0 })).collect::<Vec<_>>(),
            "recent": ledger.entries.iter().take(5).map(|entry| json!({ "name": entry.name, "amount": entry.cents as f64 / 100.0 })).collect::<Vec<_>>(),
        },
        "kitchen": {
            "tonight": kitchen.dishes.iter().map(|dish| json!({ "name": dish.name, "picked": dish.selected })).collect::<Vec<_>>(),
            "week": crate::week::context(&kitchen),
            "shopping_left": kitchen.shopping.iter().filter(|item| !item.done).map(|item| &item.name).collect::<Vec<_>>(),
            "cooking_now": kitchen.cook.as_ref().map(|cook| &cook.dishes),
        },
        "weather_home": weather.report.as_ref().map(|report| json!({
            "now": report.now.temp,
            "today": report.days.first().map(|day| json!({ "low": day.low, "high": day.high, "rain": day.rain })),
            "tips": report.tips.iter().map(|tip| &tip.title).collect::<Vec<_>>(),
        })),
    })
}

impl HubTools<'_> {
    pub(crate) async fn life(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<Args>(arguments) else {
            return json!({ "error": "arguments must be {action, expenses?, items?}" }).to_string();
        };
        match args.action.as_str() {
            "add_expense" => {
                let items: Vec<Value> = args
                    .expenses
                    .into_iter()
                    .map(|mut item| {
                        if let Some(object) = item.as_object_mut() {
                            object.insert("source".to_owned(), json!("said"));
                        }
                        item
                    })
                    .collect();
                self.ledger_tool(crate::ledger::ADD, &json!({ "items": items }).to_string()).await
            }
            "add_shopping" => self.kitchen_tool(crate::kitchen::SHOPPING, &json!({ "items": args.items }).to_string()).await,
            _ => summary(self.state).await.to_string(),
        }
    }
}

pub async fn home_note(state: &SharedState, thread_id: &str) -> Option<ContextNote> {
    if crate::state::scene_of(state, thread_id).await != crate::state::Scene::Chat {
        return None;
    }
    let place = crate::weather_page::home(state).await?;
    let where_ = [place.city.as_str(), place.district.as_str()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    Some(ContextNote {
        label: state.localizer.text(keys::HOME_CONTEXT_LABEL),
        body: where_,
    })
}
