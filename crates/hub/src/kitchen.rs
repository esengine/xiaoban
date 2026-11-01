use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{ContextNote, Dish, Event, FileInfo, Ingredient, Kitchen, ShoppingItem};

use crate::state::SharedState;
use crate::tools::HubTools;

const KEY: &str = "kitchen";
const THREAD_KEY: &str = "kitchen.thread";
const MAX_DISHES: usize = 6;
const MAX_ITEMS: usize = 80;

pub const FRIDGE: &str = "kitchen_fridge";
pub const DISHES: &str = "kitchen_dishes";
pub const PREFERENCES: &str = "kitchen_preferences";
pub const SHOPPING: &str = "shopping_add";

pub fn is_tool(name: &str) -> bool {
    matches!(name, FRIDGE | DISHES | PREFERENCES | SHOPPING | crate::cooking::STEPS)
}

pub async fn load(state: &SharedState) -> Kitchen {
    let mut kitchen: Kitchen = state
        .store
        .setting_owned(KEY.to_owned())
        .await
        .ok()
        .flatten()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    kitchen.thread_id = thread(state).await;
    kitchen
}

pub async fn save(state: &SharedState, mut kitchen: Kitchen) -> Kitchen {
    kitchen.thread_id = None;
    let _ = state
        .store
        .set_setting_owned(KEY.to_owned(), serde_json::to_string(&kitchen).unwrap_or_default())
        .await;
    let kitchen = load(state).await;
    state.publish(Event::KitchenUpdated {
        kitchen: kitchen.clone(),
    });
    kitchen
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

pub async fn is_kitchen(state: &SharedState, thread_id: &str) -> bool {
    thread(state).await.as_deref() == Some(thread_id)
}

pub async fn ensure_thread(state: &SharedState) -> Result<String, String> {
    if let Some(id) = thread(state).await
        && state.store.thread(id.clone()).await.is_ok()
    {
        return Ok(id);
    }
    let created = state
        .store
        .create_thread(Some(state.localizer.text(keys::KITCHEN_THREAD_TITLE)))
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

pub async fn note(state: &SharedState, thread_id: &str) -> Option<ContextNote> {
    if !is_kitchen(state, thread_id).await {
        return None;
    }
    let kitchen = load(state).await;
    let body = json!({
        "fridge": kitchen.fridge,
        "servings": kitchen.servings,
        "avoid": kitchen.avoid,
        "max_minutes": kitchen.max_minutes,
        "dishes": kitchen.dishes.iter().map(|dish| json!({ "name": dish.name, "selected": dish.selected })).collect::<Vec<_>>(),
        "shopping": kitchen.shopping.iter().filter(|item| !item.done).map(|item| &item.name).collect::<Vec<_>>(),
        "cooking": kitchen.cook.as_ref().map(|cook| json!({
            "dishes": cook.dishes,
            "current_step": cook.current + 1,
            "step": cook.steps.get(cook.current as usize).map(|step| &step.text),
        })),
    });
    Some(ContextNote {
        label: state.localizer.text(keys::KITCHEN_CONTEXT_LABEL),
        body: body.to_string(),
    })
}

pub async fn photo(state: &SharedState, thread_id: &str, files: &[FileInfo]) {
    let Some(image) = files.iter().rev().find(|file| file.mime.starts_with("image/")) else {
        return;
    };
    if !is_kitchen(state, thread_id).await {
        return;
    }
    let mut kitchen = load(state).await;
    kitchen.photo = Some(image.id.clone());
    kitchen.photo_at = Some(xiaoban_store::now_ms());
    save(state, kitchen).await;
}

pub async fn select(state: &SharedState, name: &str, selected: bool) -> Kitchen {
    let mut kitchen = load(state).await;
    for dish in &mut kitchen.dishes {
        if dish.name == name {
            dish.selected = selected;
        }
    }
    save(state, kitchen).await
}

pub async fn add_missing(state: &SharedState) -> Kitchen {
    let mut kitchen = load(state).await;
    let missing: Vec<String> = kitchen
        .dishes
        .iter()
        .filter(|dish| dish.selected)
        .flat_map(|dish| dish.missing.clone())
        .collect();
    for name in missing {
        add_item(&mut kitchen, ShoppingItem { name, ..ShoppingItem::default() });
    }
    save(state, kitchen).await
}

pub async fn toggle_item(state: &SharedState, name: &str, done: bool) -> Kitchen {
    let mut kitchen = load(state).await;
    for item in &mut kitchen.shopping {
        if item.name == name {
            item.done = done;
        }
    }
    save(state, kitchen).await
}

pub async fn clear_bought(state: &SharedState) -> Kitchen {
    let mut kitchen = load(state).await;
    kitchen.shopping.retain(|item| !item.done);
    save(state, kitchen).await
}

fn add_item(kitchen: &mut Kitchen, item: ShoppingItem) {
    let name = item.name.trim().to_owned();
    if name.is_empty() {
        return;
    }
    if let Some(existing) = kitchen.shopping.iter_mut().find(|known| known.name == name) {
        existing.done = false;
        if !item.amount.is_empty() {
            existing.amount = item.amount;
        }
        return;
    }
    if kitchen.shopping.len() < MAX_ITEMS {
        kitchen.shopping.push(ShoppingItem { name, ..item });
    }
}

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

fn strings(l: &Localizer, key: Key) -> Value {
    json!({ "type": "array", "items": { "type": "string" }, "description": l.text(key) })
}

fn spec(name: &str, description: String, properties: &Value, required: &[&str]) -> ToolSpec {
    ToolSpec {
        name: name.to_owned(),
        description,
        parameters: json!({ "type": "object", "properties": properties, "required": required, "additionalProperties": false }),
    }
}

pub fn specs(l: &Localizer) -> Vec<ToolSpec> {
    let ingredient = json!({
        "type": "object",
        "properties": { "name": text(l, keys::TOOL_KITCHEN_ITEM_NAME), "amount": text(l, keys::TOOL_KITCHEN_ITEM_AMOUNT) },
        "required": ["name"],
        "additionalProperties": false,
    });
    let dish = json!({
        "type": "object",
        "properties": {
            "name": text(l, keys::TOOL_KITCHEN_DISH_NAME),
            "minutes": { "type": "integer", "minimum": 1, "description": l.text(keys::TOOL_KITCHEN_DISH_MINUTES) },
            "why": text(l, keys::TOOL_KITCHEN_DISH_WHY),
            "uses": strings(l, keys::TOOL_KITCHEN_DISH_USES),
            "missing": strings(l, keys::TOOL_KITCHEN_DISH_MISSING),
            "photo_query": text(l, keys::TOOL_KITCHEN_DISH_PHOTO),
        },
        "required": ["name", "minutes", "why", "uses", "missing", "photo_query"],
        "additionalProperties": false,
    });
    vec![
        crate::cooking::spec(l),
        spec(
            FRIDGE,
            l.text(keys::TOOL_KITCHEN_FRIDGE_DESCRIPTION),
            &json!({
                "items": { "type": "array", "items": ingredient, "description": l.text(keys::TOOL_KITCHEN_FRIDGE_ITEMS) },
                "replace": { "type": "boolean", "description": l.text(keys::TOOL_KITCHEN_FRIDGE_REPLACE) },
                "remove": strings(l, keys::TOOL_KITCHEN_FRIDGE_REMOVE),
            }),
            &["items"],
        ),
        spec(
            DISHES,
            l.text(keys::TOOL_KITCHEN_DISHES_DESCRIPTION),
            &json!({ "dishes": { "type": "array", "items": dish, "maxItems": MAX_DISHES } }),
            &["dishes"],
        ),
        spec(
            PREFERENCES,
            l.text(keys::TOOL_KITCHEN_PREFERENCES_DESCRIPTION),
            &json!({
                "servings": { "type": "integer", "minimum": 1, "maximum": 30, "description": l.text(keys::TOOL_KITCHEN_SERVINGS) },
                "avoid": strings(l, keys::TOOL_KITCHEN_AVOID),
                "max_minutes": { "type": "integer", "minimum": 5, "maximum": 300, "description": l.text(keys::TOOL_KITCHEN_MAX_MINUTES) },
            }),
            &[],
        ),
        spec(
            SHOPPING,
            l.text(keys::TOOL_SHOPPING_ADD_DESCRIPTION),
            &json!({ "items": { "type": "array", "items": {
                "type": "object",
                "properties": { "name": text(l, keys::TOOL_KITCHEN_ITEM_NAME), "amount": text(l, keys::TOOL_KITCHEN_ITEM_AMOUNT), "note": text(l, keys::TOOL_SHOPPING_NOTE) },
                "required": ["name"],
                "additionalProperties": false,
            } } }),
            &["items"],
        ),
    ]
}

#[derive(Deserialize)]
struct FridgeArgs {
    items: Vec<Ingredient>,
    #[serde(default)]
    replace: bool,
    #[serde(default)]
    remove: Vec<String>,
}

#[derive(Deserialize)]
struct DishArg {
    name: String,
    #[serde(default)]
    minutes: u32,
    #[serde(default)]
    why: String,
    #[serde(default)]
    uses: Vec<String>,
    #[serde(default)]
    missing: Vec<String>,
    #[serde(default)]
    photo_query: String,
}

#[derive(Deserialize)]
struct DishesArgs {
    dishes: Vec<DishArg>,
}

#[derive(Deserialize)]
struct PreferenceArgs {
    servings: Option<u32>,
    avoid: Option<Vec<String>>,
    max_minutes: Option<u32>,
}

#[derive(Deserialize)]
struct ShoppingArgs {
    items: Vec<ShoppingItem>,
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

impl HubTools<'_> {
    pub(crate) async fn kitchen_tool(&self, name: &str, arguments: &str) -> String {
        if name == crate::cooking::STEPS {
            return self.cook_steps(arguments).await;
        }
        let mut kitchen = load(self.state).await;
        match name {
            FRIDGE => {
                let Ok(args) = serde_json::from_str::<FridgeArgs>(arguments) else {
                    return error("arguments must be {items: [{name, amount}], replace?, remove?}");
                };
                if args.replace {
                    kitchen.fridge.clear();
                }
                kitchen.fridge.retain(|item| !args.remove.contains(&item.name));
                for item in args.items {
                    let name = item.name.trim().to_owned();
                    if name.is_empty() {
                        continue;
                    }
                    match kitchen.fridge.iter_mut().find(|known| known.name == name) {
                        Some(known) => known.amount = item.amount,
                        None => kitchen.fridge.push(Ingredient { name, amount: item.amount }),
                    }
                }
            }
            DISHES => {
                let Ok(args) = serde_json::from_str::<DishesArgs>(arguments) else {
                    return error("arguments must be {dishes: [{name, minutes, why, uses, missing}]}");
                };
                kitchen.dishes = args
                    .dishes
                    .into_iter()
                    .take(MAX_DISHES)
                    .map(|dish| Dish {
                        name: dish.name,
                        minutes: dish.minutes,
                        why: dish.why,
                        uses: dish.uses,
                        missing: dish.missing,
                        photo_query: dish.photo_query,
                        ..Dish::default()
                    })
                    .collect();
                let state = std::sync::Arc::clone(self.state);
                let dishes = kitchen.dishes.clone();
                tokio::spawn(async move {
                    let pictured = crate::dish_photos::fill(&state, dishes).await;
                    let mut latest = load(&state).await;
                    for dish in &mut latest.dishes {
                        if let Some(found) = pictured.iter().find(|item| item.name == dish.name) {
                            dish.image.clone_from(&found.image);
                        }
                    }
                    save(&state, latest).await;
                });
            }
            PREFERENCES => {
                let Ok(args) = serde_json::from_str::<PreferenceArgs>(arguments) else {
                    return error("arguments must be {servings?, avoid?, max_minutes?}");
                };
                if let Some(servings) = args.servings {
                    kitchen.servings = servings;
                }
                if let Some(avoid) = args.avoid {
                    kitchen.avoid = avoid;
                }
                if let Some(minutes) = args.max_minutes {
                    kitchen.max_minutes = minutes;
                }
            }
            _ => {
                let Ok(args) = serde_json::from_str::<ShoppingArgs>(arguments) else {
                    return error("arguments must be {items: [{name, amount?, note?}]}");
                };
                for item in args.items {
                    add_item(&mut kitchen, item);
                }
            }
        }
        save(self.state, kitchen).await;
        json!({ "saved": true }).to_string()
    }
}

pub async fn handle(
    state: &SharedState,
    request: xiaoban_protocol::Request,
) -> Result<xiaoban_protocol::Response, xiaoban_protocol::ProtocolError> {
    use xiaoban_protocol::{Request, Response};
    let kitchen = match request {
        Request::Kitchen => {
            ensure_thread(state)
                .await
                .map_err(|failure| xiaoban_protocol::ProtocolError::new(xiaoban_protocol::ErrorCode::Internal, failure))?;
            load(state).await
        }
        Request::SelectDish { name, selected } => select(state, &name, selected).await,
        Request::AddMissingToShopping => add_missing(state).await,
        Request::ToggleShopping { name, done } => toggle_item(state, &name, done).await,
        Request::ClearBought => clear_bought(state).await,
        Request::CookGo { step } => crate::cooking::go(state, step).await,
        Request::StartTimer {
            step,
            label,
            after,
            seconds,
        } => crate::cooking::start_timer(state, step, label, after, seconds).await,
        Request::ExtendTimer { id, seconds } => crate::cooking::extend(state, &id, seconds).await,
        Request::DismissTimer { id } => crate::cooking::dismiss(state, &id).await,
        Request::FinishCooking => crate::cooking::finish(state).await,
        Request::ResetKitchen => {
            let _ = state.store.set_setting_owned(THREAD_KEY.to_owned(), String::new()).await;
            let _ = state.store.set_setting_owned(KEY.to_owned(), String::new()).await;
            let kitchen = load(state).await;
            state.publish(Event::KitchenUpdated { kitchen: kitchen.clone() });
            kitchen
        }
        _ => load(state).await,
    };
    Ok(Response::Kitchen { kitchen })
}
