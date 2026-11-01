use std::collections::HashMap;

use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{
    Attachment, CookStep, Dish, ErrorCode, Event, Heat, Kitchen, ProtocolError, Recipe,
    RecipeIngredient, RecipeStep, RecipeView, Request, Response, ShoppingItem,
};
use xiaoban_store::now_ms;

use crate::cooking::{MAX_STEPS, MAX_TIMER};
use crate::kitchen::{add_item, load, save};
use crate::state::SharedState;
use crate::tools::HubTools;

pub const RECIPE: &str = "recipe";
const KEY: &str = "kitchen.recipes";
const MAX_STORED: usize = 60;
const MAX_RECENT: usize = 6;
const MAX_INGREDIENTS: usize = 30;

static LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

pub fn spec(l: &Localizer) -> ToolSpec {
    let ingredient = json!({
        "type": "object",
        "properties": {
            "name": text(l, keys::TOOL_KITCHEN_ITEM_NAME),
            "amount": text(l, keys::TOOL_KITCHEN_ITEM_AMOUNT),
            "staple": { "type": "boolean", "description": l.text(keys::TOOL_RECIPE_STAPLE) },
        },
        "required": ["name", "amount", "staple"],
        "additionalProperties": false,
    });
    let step = json!({
        "type": "object",
        "properties": {
            "title": text(l, keys::TOOL_RECIPE_STEP_TITLE),
            "text": text(l, keys::TOOL_COOK_STEP_TEXT),
            "tip": text(l, keys::TOOL_COOK_STEP_TIP),
            "heat": {
                "type": "string",
                "enum": ["high", "medium", "low", "none"],
                "description": l.text(keys::TOOL_COOK_STEP_HEAT),
            },
            "seconds": {
                "type": "integer",
                "minimum": 0,
                "maximum": MAX_TIMER,
                "description": l.text(keys::TOOL_COOK_STEP_SECONDS),
            },
            "after": text(l, keys::TOOL_COOK_STEP_AFTER),
        },
        "required": ["title", "text", "heat", "seconds"],
        "additionalProperties": false,
    });
    ToolSpec {
        name: RECIPE.to_owned(),
        description: l.text(keys::TOOL_RECIPE_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "dish": text(l, keys::TOOL_RECIPE_DISH),
                "minutes": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 600,
                    "description": l.text(keys::TOOL_RECIPE_MINUTES),
                },
                "servings": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 30,
                    "description": l.text(keys::TOOL_RECIPE_SERVINGS),
                },
                "style": text(l, keys::TOOL_RECIPE_STYLE),
                "photo_query": text(l, keys::TOOL_KITCHEN_DISH_PHOTO),
                "ingredients": {
                    "type": "array",
                    "items": ingredient,
                    "minItems": 1,
                    "maxItems": MAX_INGREDIENTS,
                    "description": l.text(keys::TOOL_RECIPE_INGREDIENTS),
                },
                "steps": { "type": "array", "items": step, "minItems": 1, "maxItems": MAX_STEPS },
            },
            "required": ["dish", "minutes", "servings", "style", "photo_query", "ingredients", "steps"],
            "additionalProperties": false,
        }),
    }
}

#[derive(Deserialize)]
struct StepArg {
    #[serde(default)]
    title: String,
    text: String,
    #[serde(default)]
    tip: String,
    #[serde(default)]
    heat: Heat,
    #[serde(default)]
    seconds: u32,
    #[serde(default)]
    after: String,
}

#[derive(Deserialize)]
struct IngredientArg {
    name: String,
    #[serde(default)]
    amount: String,
    #[serde(default)]
    staple: bool,
}

#[derive(Deserialize)]
struct Args {
    dish: String,
    #[serde(default)]
    minutes: u32,
    #[serde(default)]
    servings: u32,
    #[serde(default)]
    style: String,
    #[serde(default)]
    photo_query: String,
    #[serde(default)]
    ingredients: Vec<IngredientArg>,
    steps: Vec<StepArg>,
}

async fn all(state: &SharedState) -> HashMap<String, Recipe> {
    state
        .store
        .setting_owned(KEY.to_owned())
        .await
        .ok()
        .flatten()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

async fn write_all(state: &SharedState, recipes: &HashMap<String, Recipe>) {
    let _ = state
        .store
        .set_setting_owned(KEY.to_owned(), serde_json::to_string(recipes).unwrap_or_default())
        .await;
}

pub async fn get(state: &SharedState, id: &str) -> Option<Recipe> {
    all(state).await.remove(id)
}

async fn put(state: &SharedState, recipe: Recipe) {
    let _guard = LOCK.lock().await;
    let mut recipes = all(state).await;
    recipes.insert(recipe.id.clone(), recipe);
    if recipes.len() > MAX_STORED {
        let mut ages: Vec<(i64, String)> = recipes
            .values()
            .map(|known| (known.created_at, known.id.clone()))
            .collect();
        ages.sort();
        for (_, id) in ages.into_iter().take(recipes.len() - MAX_STORED) {
            recipes.remove(&id);
        }
    }
    write_all(state, &recipes).await;
}

fn remember(kitchen: &mut Kitchen, id: &str) {
    kitchen.recipes.retain(|known| known != id);
    kitchen.recipes.insert(0, id.to_owned());
    kitchen.recipes.truncate(MAX_RECENT);
}

fn same_food(ingredient: &str, fridge: &str) -> bool {
    let ingredient = ingredient.trim();
    let fridge = fridge.trim();
    !ingredient.is_empty()
        && !fridge.is_empty()
        && (ingredient.contains(fridge) || fridge.contains(ingredient))
}

pub fn have(recipe: &Recipe, kitchen: &Kitchen) -> Vec<String> {
    recipe
        .ingredients
        .iter()
        .filter(|item| {
            item.staple || kitchen.fridge.iter().any(|known| same_food(&item.name, &known.name))
        })
        .map(|item| item.name.clone())
        .collect()
}

fn view(recipe: Recipe, kitchen: &Kitchen) -> RecipeView {
    let have = have(&recipe, kitchen);
    let listed = recipe
        .ingredients
        .iter()
        .filter(|item| !have.contains(&item.name))
        .filter(|item| {
            kitchen
                .shopping
                .iter()
                .any(|known| !known.done && known.name == item.name)
        })
        .map(|item| item.name.clone())
        .collect();
    RecipeView {
        recipe,
        have,
        listed,
    }
}

fn find_photo(state: &SharedState, id: String, dish: Dish) {
    let state = std::sync::Arc::clone(state);
    tokio::spawn(async move {
        let found = crate::dish_photos::fill(&state, vec![dish]).await;
        let Some(image) = found.into_iter().next().and_then(|dish| dish.image) else {
            return;
        };
        {
            let _guard = LOCK.lock().await;
            let mut recipes = all(&state).await;
            let Some(recipe) = recipes.get_mut(&id) else {
                return;
            };
            recipe.image = Some(image);
            write_all(&state, &recipes).await;
        }
        state.publish(Event::KitchenUpdated {
            kitchen: load(&state).await,
        });
    });
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

impl HubTools<'_> {
    pub(crate) async fn recipe(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<Args>(arguments) else {
            return error(
                "arguments must be {dish, minutes, servings, style, photo_query, ingredients: [{name, amount, staple}], steps: [{title, text, heat, seconds, tip?, after?}]}",
            );
        };
        let dish = args.dish.trim().to_owned();
        if dish.is_empty() || args.steps.is_empty() {
            return error("a recipe needs a dish name and at least one step");
        }
        let ingredients: Vec<RecipeIngredient> = args
            .ingredients
            .into_iter()
            .filter(|item| !item.name.trim().is_empty())
            .take(MAX_INGREDIENTS)
            .map(|item| RecipeIngredient {
                name: item.name.trim().to_owned(),
                amount: item.amount.trim().to_owned(),
                staple: item.staple,
            })
            .collect();
        let steps: Vec<RecipeStep> = args
            .steps
            .into_iter()
            .take(MAX_STEPS)
            .map(|step| RecipeStep {
                title: step.title.trim().to_owned(),
                text: step.text,
                tip: step.tip,
                heat: step.heat,
                seconds: step.seconds.min(MAX_TIMER),
                after: step.after,
            })
            .collect();
        let minutes = if args.minutes > 0 {
            args.minutes.min(600)
        } else {
            steps.iter().map(|step| step.seconds).sum::<u32>().div_ceil(60)
        };
        let mut kitchen = load(self.state).await;
        let recipe = Recipe {
            id: uuid::Uuid::now_v7().to_string(),
            thread_id: self.thread_id.to_owned(),
            dish,
            minutes,
            servings: if args.servings > 0 {
                args.servings.min(30)
            } else {
                kitchen.servings
            },
            style: args.style.trim().to_owned(),
            ingredients,
            steps,
            photo_query: args.photo_query.trim().to_owned(),
            image: None,
            created_at: now_ms(),
        };
        let have = have(&recipe, &kitchen);
        let missing: Vec<&str> = recipe
            .ingredients
            .iter()
            .filter(|item| !have.contains(&item.name))
            .map(|item| item.name.as_str())
            .collect();
        let result = json!({
            "saved": true,
            "in_fridge_or_pantry": have,
            "missing": missing,
            "hint": "a recipe card with the photo, ingredients (missing ones marked), steps and a start-cooking button now shows under your reply; reply in one or two short sentences (what from the fridge gets used, what to buy); do not list the ingredients or steps again; cooking mode starts only when the user taps start",
        })
        .to_string();
        let id = recipe.id.clone();
        let photo = Dish {
            name: recipe.dish.clone(),
            photo_query: recipe.photo_query.clone(),
            ..Dish::default()
        };
        put(self.state, recipe).await;
        remember(&mut kitchen, &id);
        save(self.state, kitchen).await;
        find_photo(self.state, id.clone(), photo);
        self.attach(Attachment::Recipe { recipe_id: id });
        result
    }
}

pub async fn handle(state: &SharedState, request: Request) -> Result<Response, ProtocolError> {
    let missing = || ProtocolError::new(ErrorCode::NotFound, "recipe not found");
    match request {
        Request::Recipe { id } => {
            let recipe = get(state, &id).await.ok_or_else(missing)?;
            Ok(Response::Recipe {
                view: view(recipe, &load(state).await),
            })
        }
        Request::CookRecipe { id } => {
            let recipe = get(state, &id).await.ok_or_else(missing)?;
            let mut kitchen = load(state).await;
            let steps = recipe
                .steps
                .iter()
                .map(|step| CookStep {
                    dish: recipe.dish.clone(),
                    text: step.text.clone(),
                    tip: step.tip.clone(),
                    heat: step.heat,
                    seconds: step.seconds,
                    after: step.after.clone(),
                })
                .collect();
            let servings = if recipe.servings > 0 {
                recipe.servings
            } else {
                kitchen.servings
            };
            crate::cooking::begin(
                &mut kitchen,
                vec![recipe.dish.clone()],
                servings,
                recipe.minutes,
                steps,
            );
            remember(&mut kitchen, &id);
            Ok(Response::Kitchen {
                kitchen: save(state, kitchen).await,
            })
        }
        Request::RecipeToShopping { id } => {
            let recipe = get(state, &id).await.ok_or_else(missing)?;
            let mut kitchen = load(state).await;
            let have = have(&recipe, &kitchen);
            for item in recipe.ingredients.iter().filter(|item| !have.contains(&item.name)) {
                add_item(
                    &mut kitchen,
                    ShoppingItem {
                        name: item.name.clone(),
                        amount: item.amount.clone(),
                        note: recipe.dish.clone(),
                        ..ShoppingItem::default()
                    },
                );
            }
            let kitchen = save(state, kitchen).await;
            Ok(Response::Recipe {
                view: view(recipe, &kitchen),
            })
        }
        _ => Err(ProtocolError::new(ErrorCode::BadRequest, "not a recipe request")),
    }
}
