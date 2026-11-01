use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key as MessageKey, Localizer, keys};
use xiaoban_protocol::{ConfirmChoice, ConfirmKind, ErrorCode, ProtocolError, Request, Response};

use crate::apps::AppEntry;
use crate::operate::{ActFailure, UiAction};
use crate::state::SharedState;
use crate::tools::HubTools;
use crate::{confirms, pauses};

pub const LOOK_AT_APP: &str = "look_at_app";
pub const CLICK: &str = "click";
pub const TYPE_TEXT: &str = "type_text";
pub const PRESS_KEYS: &str = "press_keys";
pub const CONFIRM: &str = "confirm";
pub const DO_STEPS: &str = "do_steps";
const ALLOWED_KEY: &str = "operate.allowed";
const MOUSE_KEY: &str = "operate.mouse";
const MAX_STEPS: usize = 30;
const SETTLE: std::time::Duration = std::time::Duration::from_millis(300);

fn text(l: &Localizer, key: MessageKey) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

fn element(l: &Localizer) -> Value {
    json!({ "type": "integer", "minimum": 0, "description": l.text(keys::TOOL_OPERATE_ELEMENT) })
}

fn spec(name: &str, description: String, properties: &Value, required: &[&str]) -> ToolSpec {
    ToolSpec {
        name: name.to_owned(),
        description,
        parameters: json!({
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": false,
        }),
    }
}

pub fn specs(l: &Localizer) -> Vec<ToolSpec> {
    let app = text(l, keys::TOOL_OPERATE_APP);
    vec![
        spec(
            LOOK_AT_APP,
            l.text(keys::TOOL_LOOK_AT_APP_DESCRIPTION),
            &json!({ "app": app, "name": text(l, keys::TOOL_OPERATE_APP_NAME) }),
            &["app", "name"],
        ),
        spec(
            CLICK,
            l.text(keys::TOOL_CLICK_DESCRIPTION),
            &json!({ "app": app, "element": element(l), "label": text(l, keys::TOOL_OPERATE_LABEL) }),
            &["app", "element", "label"],
        ),
        spec(
            TYPE_TEXT,
            l.text(keys::TOOL_TYPE_TEXT_DESCRIPTION),
            &json!({
                "app": app,
                "element": element(l),
                "label": text(l, keys::TOOL_OPERATE_LABEL),
                "text": text(l, keys::TOOL_TYPE_TEXT_TEXT),
            }),
            &["app", "element", "label", "text"],
        ),
        spec(
            PRESS_KEYS,
            l.text(keys::TOOL_PRESS_KEYS_DESCRIPTION),
            &json!({ "app": app, "keys": text(l, keys::TOOL_PRESS_KEYS_KEYS) }),
            &["app", "keys"],
        ),
        spec(
            DO_STEPS,
            l.text(keys::TOOL_DO_STEPS_DESCRIPTION),
            &json!({
                "app": app,
                "summary": text(l, keys::TOOL_DO_STEPS_SUMMARY),
                "steps": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": MAX_STEPS,
                    "description": l.text(keys::TOOL_DO_STEPS_STEPS),
                    "items": {
                        "type": "object",
                        "properties": {
                            "do": { "type": "string", "enum": ["click", "type", "keys", "text"] },
                            "element": element(l),
                            "label": text(l, keys::TOOL_OPERATE_LABEL),
                            "text": text(l, keys::TOOL_TYPE_TEXT_TEXT),
                            "keys": text(l, keys::TOOL_PRESS_KEYS_KEYS),
                        },
                        "required": ["do"],
                        "additionalProperties": false,
                    },
                },
            }),
            &["app", "summary", "steps"],
        ),
        spec(
            CONFIRM,
            l.text(keys::TOOL_CONFIRM_DESCRIPTION),
            &json!({
                "title": text(l, keys::TOOL_CONFIRM_TITLE),
                "detail": text(l, keys::TOOL_CONFIRM_DETAIL),
            }),
            &["title", "detail"],
        ),
    ]
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

#[derive(Deserialize)]
struct AppArgs {
    app: String,
}

#[derive(Deserialize)]
struct ElementArgs {
    app: String,
    element: u32,
    text: Option<String>,
}

#[derive(Deserialize)]
struct KeyArgs {
    app: String,
    keys: String,
}

#[derive(Deserialize)]
struct StepsArgs {
    app: String,
    steps: Vec<Step>,
}

#[derive(Deserialize)]
#[serde(tag = "do", rename_all = "lowercase")]
enum Step {
    Click { element: u32 },
    Type { element: u32, text: String },
    Keys { keys: String },
    Text { text: String },
}

#[derive(Deserialize)]
struct ConfirmArgs {
    title: String,
    detail: String,
}

async fn allowed(state: &SharedState) -> Vec<String> {
    remembered(state, ALLOWED_KEY).await
}

async fn remembered(state: &SharedState, key: &'static str) -> Vec<String> {
    state
        .store
        .setting(key)
        .await
        .ok()
        .flatten()
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

async fn allow_always(state: &SharedState, app_id: &str) {
    remember(state, ALLOWED_KEY, app_id).await;
}

async fn remember(state: &SharedState, key: &'static str, app_id: &str) {
    let mut apps = remembered(state, key).await;
    if !apps.iter().any(|known| known == app_id) {
        apps.push(app_id.to_owned());
    }
    if let Ok(json) = serde_json::to_string(&apps)
        && let Err(failure) = state.store.set_setting(key, json).await
    {
        tracing::error!(%failure, "could not remember the allowed app");
    }
}

impl HubTools<'_> {
    pub(crate) async fn ask(&self, kind: ConfirmKind) -> ConfirmChoice {
        confirms::ask(self.state, self.turn_id, self.thread_id, kind, &self.cancel).await
    }

    async fn before_acting(&self) {
        pauses::wait_while_paused(self.state, self.turn_id, &self.cancel).await;
    }

    async fn ensure(&self, app_id: &str) -> Result<AppEntry, String> {
        self.price_app_guard(app_id)?;
        let apps = self.state.apps.list().await;
        let app = apps
            .into_iter()
            .find(|app| app.id == app_id)
            .ok_or_else(|| {
                error("unknown app id; call find_apps first and use an id it returned")
            })?;
        if !self.state.operator.permissions().control {
            let choice = self.ask(ConfirmKind::Permissions).await;
            if choice == ConfirmChoice::No || !self.state.operator.permissions().control {
                return Err(error(
                    "the user has not allowed Xiaoban to control this computer; tell them what you would have done and stop",
                ));
            }
        }
        let known = self.allowed_once.lock().unwrap().contains(&app.id)
            || allowed(self.state).await.contains(&app.id);
        if !known {
            match self
                .ask(ConfirmKind::AllowApp {
                    app: app.name.clone(),
                })
                .await
            {
                ConfirmChoice::Always => allow_always(self.state, &app.id).await,
                ConfirmChoice::Once | ConfirmChoice::Yes => {
                    self.allowed_once.lock().unwrap().push(app.id.clone());
                }
                ConfirmChoice::Edit | ConfirmChoice::No => {
                    return Err(error(
                        "the user did not allow operating this app; tell them which steps they need to do themselves",
                    ));
                }
            }
        }
        Ok(app)
    }

    pub(crate) async fn look_at_app(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<AppArgs>(arguments) else {
            return error("arguments must be {app, name}");
        };
        let app = match self.ensure(&args.app).await {
            Ok(app) => app,
            Err(failure) => return failure,
        };
        self.before_acting().await;
        let result = self.state.operator.snapshot(app.id.clone()).await;
        if let Ok(snapshot) = &result {
            self.record_screen(&app.id, snapshot);
        }
        match result {
            Ok(snapshot) if snapshot.elements.is_empty() => error(
                "this app exposes no buttons or fields to Xiaoban (it may be drawn in a way the system cannot read); do not guess, tell the user which steps they need to do themselves",
            ),
            Ok(snapshot) => serde_json::to_string(&snapshot).unwrap_or_default(),
            Err(failure) => error(&failure),
        }
    }

    async fn mouse_allowed(&self, app_id: &str) -> bool {
        self.mouse_once
            .lock()
            .unwrap()
            .iter()
            .any(|known| known == app_id)
            || remembered(self.state, MOUSE_KEY)
                .await
                .iter()
                .any(|known| known == app_id)
    }

    async fn act(&self, app: &AppEntry, index: u32, action: UiAction) -> Result<(), String> {
        let allow = self.mouse_allowed(&app.id).await;
        let first = self
            .state
            .operator
            .act(app.id.clone(), index, action.clone(), allow)
            .await;
        match first {
            Ok(()) => return Ok(()),
            Err(ActFailure::Failed(failure)) => return Err(failure),
            Err(ActFailure::NeedsMouse) => {}
        }
        match self
            .ask(ConfirmKind::BorrowMouse {
                app: app.name.clone(),
            })
            .await
        {
            ConfirmChoice::Always => remember(self.state, MOUSE_KEY, &app.id).await,
            ConfirmChoice::Once | ConfirmChoice::Yes => {
                self.mouse_once.lock().unwrap().push(app.id.clone());
            }
            ConfirmChoice::Edit | ConfirmChoice::No => {
                return Err(
                    "this app only reacts to the real mouse and the user chose to do this step themselves; tell them exactly what to click and stop"
                        .to_owned(),
                );
            }
        }
        self.before_acting().await;
        self.state
            .operator
            .act(app.id.clone(), index, action, true)
            .await
            .map_err(|failure| match failure {
                ActFailure::Failed(failure) => failure,
                ActFailure::NeedsMouse => "the app did not react to the mouse either".to_owned(),
            })
    }

    async fn screen(&self, app_id: &str) -> Value {
        tokio::time::sleep(SETTLE).await;
        match self.state.operator.snapshot(app_id.to_owned()).await {
            Ok(snapshot) => {
                self.record_screen(app_id, &snapshot);
                serde_json::to_value(&snapshot).unwrap_or(Value::Null)
            }
            Err(failure) => json!({ "error": failure }),
        }
    }

    async fn step(&self, app: &AppEntry, step: Step) -> Result<(), String> {
        self.before_acting().await;
        if self.cancel.is_cancelled() {
            return Err("stopped by the user".to_owned());
        }
        match &step {
            Step::Click { element } => self.price_step_guard(&app.id, *element, false)?,
            Step::Type { element, .. } => self.price_step_guard(&app.id, *element, true)?,
            Step::Keys { .. } | Step::Text { .. } => {}
        }
        match step {
            Step::Click { element } => self.act(app, element, UiAction::Press).await,
            Step::Type { element, text } => self.act(app, element, UiAction::SetText(text)).await,
            Step::Keys { keys } => self.state.operator.keys(app.id.clone(), keys).await,
            Step::Text { text } => self.state.operator.type_into(app.id.clone(), text).await,
        }
    }

    async fn after(&self, app: &AppEntry, result: Result<(), String>) -> String {
        let screen = self.screen(&app.id).await;
        match result {
            Ok(()) => json!({ "done": true, "screen": screen }).to_string(),
            Err(failure) => json!({ "error": failure, "screen": screen }).to_string(),
        }
    }

    pub(crate) async fn element_action(&self, arguments: &str, typing: bool) -> String {
        let Ok(args) = serde_json::from_str::<ElementArgs>(arguments) else {
            return error("arguments must be {app, element, label}");
        };
        let step = match (typing, args.text) {
            (false, _) => Step::Click {
                element: args.element,
            },
            (true, Some(text)) => Step::Type {
                element: args.element,
                text,
            },
            (true, None) => return error("type_text needs text"),
        };
        let app = match self.ensure(&args.app).await {
            Ok(app) => app,
            Err(failure) => return failure,
        };
        let result = self.step(&app, step).await;
        self.after(&app, result).await
    }

    pub(crate) async fn press_keys(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<KeyArgs>(arguments) else {
            return error("arguments must be {app, keys}");
        };
        let app = match self.ensure(&args.app).await {
            Ok(app) => app,
            Err(failure) => return failure,
        };
        let result = self.step(&app, Step::Keys { keys: args.keys }).await;
        self.after(&app, result).await
    }

    pub(crate) async fn do_steps(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<StepsArgs>(arguments) else {
            return error(
                "arguments must be {app, summary, steps: [{do, element?, text?, keys?}]}",
            );
        };
        if args.steps.is_empty() || args.steps.len() > MAX_STEPS {
            return error("give between 1 and 30 steps");
        }
        let app = match self.ensure(&args.app).await {
            Ok(app) => app,
            Err(failure) => return failure,
        };
        let total = args.steps.len();
        for (index, step) in args.steps.into_iter().enumerate() {
            if let Err(failure) = self.step(&app, step).await {
                let screen = self.screen(&app.id).await;
                return json!({
                    "error": failure,
                    "finished_steps": index,
                    "failed_step": index,
                    "screen": screen,
                })
                .to_string();
            }
        }
        let screen = self.screen(&app.id).await;
        json!({ "done": true, "finished_steps": total, "screen": screen }).to_string()
    }

    pub(crate) async fn confirm(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<ConfirmArgs>(arguments) else {
            return error("arguments must be {title, detail}");
        };
        let choice = self
            .ask(ConfirmKind::Action {
                title: args.title,
                detail: args.detail,
            })
            .await;
        let answer = match choice {
            ConfirmChoice::Yes | ConfirmChoice::Once | ConfirmChoice::Always => "yes",
            ConfirmChoice::Edit => "edit: ask the user what to change before doing it",
            ConfirmChoice::No => "no: do not do it",
        };
        json!({ "answer": answer }).to_string()
    }
}

pub fn handle(state: &SharedState, request: Request) -> Result<Response, ProtocolError> {
    match request {
        Request::AnswerConfirm { confirm_id, choice } => {
            if state.confirms.answer(&confirm_id, choice) {
                Ok(Response::Ack)
            } else {
                Err(ProtocolError::new(
                    ErrorCode::NotFound,
                    "that confirmation is no longer waiting",
                ))
            }
        }
        Request::PendingConfirms => Ok(Response::PendingConfirms {
            confirms: state.confirms.pending(),
        }),
        Request::OperateStatus => Ok(Response::OperateStatus {
            permissions: state.operator.permissions(),
        }),
        Request::BackgroundTurn { turn_id } => {
            if !state.turns.background(&turn_id) {
                return Err(ProtocolError::new(
                    ErrorCode::NotFound,
                    "that reply has already finished",
                ));
            }
            state.publish(xiaoban_protocol::Event::TurnBackgrounded { turn_id });
            Ok(Response::Ack)
        }
        Request::PauseTurn { turn_id } => {
            pauses::set(state, &turn_id, true, false);
            Ok(Response::Ack)
        }
        Request::ResumeTurn { turn_id } => {
            pauses::set(state, &turn_id, false, false);
            Ok(Response::Ack)
        }
        Request::AddNote { turn_id, text } => {
            let text = text.trim();
            if text.is_empty() {
                return Err(ProtocolError::new(
                    ErrorCode::BadRequest,
                    "the note is empty",
                ));
            }
            if !state.pauses.add_note(&turn_id, text) {
                return Err(ProtocolError::new(
                    ErrorCode::NotFound,
                    "that reply has already finished",
                ));
            }
            Ok(Response::Ack)
        }
        _ => Err(ProtocolError::new(
            ErrorCode::BadRequest,
            "not an operate request",
        )),
    }
}
