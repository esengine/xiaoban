use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key as MessageKey, Localizer, keys};
use xiaoban_protocol::{ConfirmChoice, ConfirmKind, ErrorCode, ProtocolError, Request, Response};

use crate::apps::AppEntry;
use crate::operate::UiAction;
use crate::state::SharedState;
use crate::tools::HubTools;
use crate::{confirms, pauses};

pub const LOOK_AT_APP: &str = "look_at_app";
pub const CLICK: &str = "click";
pub const TYPE_TEXT: &str = "type_text";
pub const PRESS_KEYS: &str = "press_keys";
pub const CONFIRM: &str = "confirm";
const ALLOWED_KEY: &str = "operate.allowed";

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
struct ConfirmArgs {
    title: String,
    detail: String,
}

async fn allowed(state: &SharedState) -> Vec<String> {
    state
        .store
        .setting(ALLOWED_KEY)
        .await
        .ok()
        .flatten()
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default()
}

async fn allow_always(state: &SharedState, app_id: &str) {
    let mut apps = allowed(state).await;
    if !apps.iter().any(|known| known == app_id) {
        apps.push(app_id.to_owned());
    }
    if let Ok(json) = serde_json::to_string(&apps)
        && let Err(failure) = state.store.set_setting(ALLOWED_KEY, json).await
    {
        tracing::error!(%failure, "could not remember the allowed app");
    }
}

impl HubTools<'_> {
    async fn ask(&self, kind: ConfirmKind) -> ConfirmChoice {
        confirms::ask(self.state, self.turn_id, self.thread_id, kind, &self.cancel).await
    }

    async fn before_acting(&self) {
        pauses::wait_while_paused(self.state, self.turn_id, &self.cancel).await;
    }

    async fn ensure(&self, app_id: &str) -> Result<AppEntry, String> {
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
        let result = self.state.operator.snapshot(app.id).await;
        match result {
            Ok(snapshot) if snapshot.elements.is_empty() => error(
                "this app exposes no buttons or fields to Xiaoban (it may be drawn in a way the system cannot read); do not guess, tell the user which steps they need to do themselves",
            ),
            Ok(snapshot) => serde_json::to_string(&snapshot).unwrap_or_default(),
            Err(failure) => error(&failure),
        }
    }

    pub(crate) async fn element_action(&self, arguments: &str, typing: bool) -> String {
        let Ok(args) = serde_json::from_str::<ElementArgs>(arguments) else {
            return error("arguments must be {app, element, label}");
        };
        let action = match (typing, args.text) {
            (false, _) => UiAction::Press,
            (true, Some(text)) => UiAction::SetText(text),
            (true, None) => return error("type_text needs text"),
        };
        let app = match self.ensure(&args.app).await {
            Ok(app) => app,
            Err(failure) => return failure,
        };
        self.before_acting().await;
        let result = self.state.operator.act(app.id, args.element, action).await;
        match result {
            Ok(()) => json!({ "done": true, "hint": "the screen may have changed; look again before relying on element numbers" }).to_string(),
            Err(failure) => error(&failure),
        }
    }

    pub(crate) async fn press_keys(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<KeyArgs>(arguments) else {
            return error("arguments must be {app, keys}");
        };
        let app = match self.ensure(&args.app).await {
            Ok(app) => app,
            Err(failure) => return failure,
        };
        self.before_acting().await;
        let result = self.state.operator.keys(app.id, args.keys).await;
        match result {
            Ok(()) => json!({ "done": true }).to_string(),
            Err(failure) => error(&failure),
        }
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
