use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{CookSession, CookStep, CookTimer, Event, Heat, Kitchen};
use xiaoban_store::now_ms;

use crate::kitchen::{load, save};
use crate::state::SharedState;
use crate::tools::HubTools;

pub const STEPS: &str = "cook_steps";
const MAX_STEPS: usize = 40;
const MAX_TIMER: u32 = 6 * 3600;
const MAX_TIMERS: usize = 12;

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

pub fn spec(l: &Localizer) -> ToolSpec {
    let step = json!({
        "type": "object",
        "properties": {
            "dish": text(l, keys::TOOL_COOK_STEP_DISH),
            "text": text(l, keys::TOOL_COOK_STEP_TEXT),
            "tip": text(l, keys::TOOL_COOK_STEP_TIP),
            "heat": { "type": "string", "enum": ["high", "medium", "low", "none"], "description": l.text(keys::TOOL_COOK_STEP_HEAT) },
            "seconds": { "type": "integer", "minimum": 0, "maximum": MAX_TIMER, "description": l.text(keys::TOOL_COOK_STEP_SECONDS) },
            "after": text(l, keys::TOOL_COOK_STEP_AFTER),
        },
        "required": ["dish", "text", "heat", "seconds"],
        "additionalProperties": false,
    });
    ToolSpec {
        name: STEPS.to_owned(),
        description: l.text(keys::TOOL_COOK_STEPS_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "dishes": { "type": "array", "items": { "type": "string" }, "description": l.text(keys::TOOL_COOK_DISHES) },
                "minutes": { "type": "integer", "minimum": 1, "maximum": 600, "description": l.text(keys::TOOL_COOK_MINUTES) },
                "steps": { "type": "array", "items": step, "minItems": 1, "maxItems": MAX_STEPS },
            },
            "required": ["dishes", "minutes", "steps"],
            "additionalProperties": false,
        }),
    }
}

#[derive(Deserialize)]
struct StepArg {
    dish: String,
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
struct StepsArgs {
    dishes: Vec<String>,
    #[serde(default)]
    minutes: u32,
    steps: Vec<StepArg>,
}

impl HubTools<'_> {
    pub(crate) async fn cook_steps(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<StepsArgs>(arguments) else {
            return json!({ "error": "arguments must be {dishes, minutes, steps: [{dish, text, heat, seconds, tip?, after?}]}" }).to_string();
        };
        let mut kitchen = load(self.state).await;
        let steps: Vec<CookStep> = args
            .steps
            .into_iter()
            .take(MAX_STEPS)
            .map(|step| CookStep {
                dish: step.dish,
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
        kitchen.cook = Some(CookSession {
            dishes: args.dishes,
            servings: kitchen.servings,
            minutes,
            steps,
            current: 0,
            started_at: now_ms(),
        });
        save(self.state, kitchen).await;
        json!({ "saved": true, "hint": "the app now shows the steps; reply in one short sentence" }).to_string()
    }
}

fn arm(state: &SharedState, timer: &CookTimer) {
    let state = std::sync::Arc::clone(state);
    let id = timer.id.clone();
    let wait = u64::try_from((timer.ends_at - now_ms()).max(0)).unwrap_or(0);
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(wait)).await;
        let mut kitchen = load(&state).await;
        let Some(timer) = kitchen.timers.iter_mut().find(|timer| timer.id == id) else {
            return;
        };
        if timer.fired || timer.ends_at > now_ms() + 500 {
            return;
        }
        timer.fired = true;
        let fired = timer.clone();
        save(&state, kitchen).await;
        state.publish(Event::TimerFired { timer: fired });
    });
}

pub async fn rearm(state: &SharedState) {
    for timer in load(state).await.timers.iter().filter(|timer| !timer.fired) {
        arm(state, timer);
    }
}

fn session(kitchen: &mut Kitchen) -> Option<&mut CookSession> {
    kitchen.cook.as_mut()
}

pub async fn go(state: &SharedState, step: u32) -> Kitchen {
    let mut kitchen = load(state).await;
    if let Some(cook) = session(&mut kitchen) {
        let last = u32::try_from(cook.steps.len().saturating_sub(1)).unwrap_or(0);
        cook.current = step.min(last);
    }
    save(state, kitchen).await
}

pub async fn start_timer(state: &SharedState, step: Option<u32>, label: String, after: String, seconds: u32) -> Kitchen {
    let mut kitchen = load(state).await;
    let seconds = seconds.clamp(1, MAX_TIMER);
    let timer = CookTimer {
        id: uuid::Uuid::now_v7().to_string(),
        label,
        after,
        step,
        seconds,
        ends_at: now_ms() + i64::from(seconds) * 1000,
        fired: false,
    };
    if let Some(step) = step {
        kitchen.timers.retain(|known| known.step != Some(step));
    }
    if kitchen.timers.len() >= MAX_TIMERS {
        kitchen.timers.remove(0);
    }
    arm(state, &timer);
    kitchen.timers.push(timer);
    save(state, kitchen).await
}

pub async fn extend(state: &SharedState, id: &str, seconds: u32) -> Kitchen {
    let mut kitchen = load(state).await;
    let mut rearmed = None;
    if let Some(timer) = kitchen.timers.iter_mut().find(|timer| timer.id == id) {
        let base = if timer.fired { now_ms() } else { timer.ends_at };
        timer.ends_at = base + i64::from(seconds.min(MAX_TIMER)) * 1000;
        timer.seconds += seconds;
        timer.fired = false;
        rearmed = Some(timer.clone());
    }
    if let Some(timer) = &rearmed {
        arm(state, timer);
    }
    save(state, kitchen).await
}

pub async fn dismiss(state: &SharedState, id: &str) -> Kitchen {
    let mut kitchen = load(state).await;
    kitchen.timers.retain(|timer| timer.id != id);
    save(state, kitchen).await
}

pub async fn finish(state: &SharedState) -> Kitchen {
    let mut kitchen = load(state).await;
    kitchen.cook = None;
    kitchen.timers.clear();
    save(state, kitchen).await
}
