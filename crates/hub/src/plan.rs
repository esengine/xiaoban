use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use serde_json::json;
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{
    ContextNote, ErrorCode, Event, Plan, PlanAction, PlanQuestion, PlanStatus, PlanStep,
    ProtocolError, Request, Response, StepOutput, StepOutputKind, StepStatus,
};

use crate::state::SharedState;
use crate::tools::HubTools;

pub const PLAN: &str = "plan";
const KEY: &str = "plan.";
const INDEX: &str = "plan.index";
const MAX_STEPS: usize = 20;
const MAX_AUTO_RUNS: u32 = 30;
const WAIT_STEP: Duration = Duration::from_millis(300);
const WAIT_TRIES: u32 = 200;
const SNIPPET: usize = 200;

#[derive(Default)]
struct Progress {
    moved: bool,
    runs: u32,
}

static PROGRESS: Mutex<Option<HashMap<String, Progress>>> = Mutex::new(None);

fn with_progress<T>(thread_id: &str, change: impl FnOnce(&mut Progress) -> T) -> T {
    let mut guard = PROGRESS.lock().unwrap();
    let map = guard.get_or_insert_with(HashMap::new);
    change(map.entry(thread_id.to_owned()).or_default())
}

pub async fn load(state: &SharedState, thread_id: &str) -> Option<Plan> {
    let raw = state
        .store
        .setting_owned(format!("{KEY}{thread_id}"))
        .await
        .ok()??;
    serde_json::from_str(&raw).ok()
}

async fn index(state: &SharedState) -> Vec<String> {
    state
        .store
        .setting_owned(INDEX.to_owned())
        .await
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

async fn set_index(state: &SharedState, ids: &[String]) {
    let _ = state
        .store
        .set_setting_owned(INDEX.to_owned(), serde_json::to_string(ids).unwrap_or_default())
        .await;
}

async fn save(state: &SharedState, mut plan: Plan) -> Plan {
    plan.updated_at = xiaoban_store::now_ms();
    if plan.status == PlanStatus::Done {
        remove(state, &plan.thread_id).await;
        return plan;
    }
    let _ = state
        .store
        .set_setting_owned(
            format!("{KEY}{}", plan.thread_id),
            serde_json::to_string(&plan).unwrap_or_default(),
        )
        .await;
    let mut ids = index(state).await;
    if !ids.contains(&plan.thread_id) {
        ids.push(plan.thread_id.clone());
        set_index(state, &ids).await;
    }
    state.publish(Event::PlanUpdated {
        thread_id: plan.thread_id.clone(),
        plan: Some(plan.clone()),
    });
    plan
}

async fn remove(state: &SharedState, thread_id: &str) {
    let _ = state
        .store
        .set_setting_owned(format!("{KEY}{thread_id}"), String::new())
        .await;
    let ids: Vec<String> = index(state)
        .await
        .into_iter()
        .filter(|id| id != thread_id)
        .collect();
    set_index(state, &ids).await;
    state.publish(Event::PlanUpdated {
        thread_id: thread_id.to_owned(),
        plan: None,
    });
}

pub async fn list(state: &SharedState) -> Vec<Plan> {
    let mut plans = Vec::new();
    for id in index(state).await {
        if let Some(plan) = load(state, &id).await {
            plans.push(plan);
        }
    }
    plans.sort_by_key(|plan| std::cmp::Reverse(plan.updated_at));
    plans
}

fn describe(plan: &Plan) -> String {
    let status = |status: StepStatus| match status {
        StepStatus::Todo => "todo",
        StepStatus::Running => "running",
        StepStatus::Done => "done",
        StepStatus::Skipped => "skipped",
    };
    let mut lines = vec![format!(
        "{} · v{} · {}",
        plan.title,
        plan.version,
        serde_json::to_value(plan.status)
            .ok()
            .and_then(|value| value.as_str().map(str::to_owned))
            .unwrap_or_default()
    )];
    if let Some(bounds) = &plan.bounds {
        lines.push(format!("bounds: {bounds}"));
    }
    for (index, step) in plan.steps.iter().enumerate() {
        lines.push(format!(
            "[{}|{}|{}] {}{}",
            index + 1,
            status(step.status),
            step.due.as_deref().unwrap_or("-"),
            step.title,
            step.output
                .as_ref()
                .map(|output| format!(" → {}", output.label))
                .unwrap_or_default()
        ));
    }
    if let Some(question) = &plan.question {
        lines.push(format!("waiting for the user: {}", question.text));
    }
    lines.join("\n")
}

pub async fn note(state: &SharedState, thread_id: &str) -> Option<ContextNote> {
    let plan = load(state, thread_id).await?;
    (plan.status != PlanStatus::Done).then(|| ContextNote {
        label: state.localizer.text(keys::PLAN_CONTEXT_LABEL),
        body: describe(&plan),
    })
}

pub fn spec(l: &Localizer) -> ToolSpec {
    let text = |key| json!({ "type": "string", "description": l.text(key) });
    ToolSpec {
        name: PLAN.to_owned(),
        description: l.text(keys::TOOL_PLAN_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "action": { "type": "string", "enum": ["propose", "update", "ask"] },
                "title": text(keys::TOOL_PLAN_TITLE),
                "bounds": text(keys::TOOL_PLAN_BOUNDS),
                "changes": text(keys::TOOL_PLAN_CHANGES),
                "steps": { "type": "array", "maxItems": MAX_STEPS, "items": {
                    "type": "object",
                    "properties": {
                        "title": text(keys::TOOL_PLAN_STEP_TITLE),
                        "due": text(keys::TOOL_PLAN_STEP_DUE),
                        "detail": text(keys::TOOL_PLAN_STEP_DETAIL),
                    },
                    "required": ["title"],
                    "additionalProperties": false,
                } },
                "step": { "type": "integer", "minimum": 1, "description": l.text(keys::TOOL_PLAN_STEP) },
                "status": { "type": "string", "enum": ["running", "done", "skipped"] },
                "note": text(keys::TOOL_PLAN_NOTE),
                "due": text(keys::TOOL_PLAN_STEP_DUE),
                "output": {
                    "type": "object",
                    "properties": {
                        "kind": { "type": "string", "enum": ["doc", "sheet", "deck", "text"] },
                        "label": text(keys::TOOL_PLAN_OUTPUT_LABEL),
                        "id": text(keys::TOOL_PLAN_OUTPUT_ID),
                    },
                    "required": ["kind", "label"],
                    "additionalProperties": false,
                },
                "question": text(keys::TOOL_PLAN_QUESTION),
                "options": { "type": "array", "items": { "type": "string" }, "maxItems": 4 },
            },
            "required": ["action"],
            "additionalProperties": false,
        }),
    }
}

#[derive(Deserialize)]
struct StepArgs {
    title: String,
    #[serde(default)]
    owner: Option<String>,
    #[serde(default)]
    due: Option<String>,
    #[serde(default)]
    detail: Option<String>,
}

#[derive(Deserialize)]
struct OutputArgs {
    kind: String,
    label: String,
    #[serde(default)]
    id: Option<String>,
}

#[derive(Deserialize)]
struct Args {
    action: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    bounds: Option<String>,
    #[serde(default)]
    changes: Option<String>,
    #[serde(default)]
    steps: Vec<StepArgs>,
    #[serde(default)]
    step: Option<usize>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    note: Option<String>,
    #[serde(default)]
    due: Option<String>,
    #[serde(default)]
    output: Option<OutputArgs>,
    #[serde(default)]
    question: Option<String>,
    #[serde(default)]
    options: Vec<String>,
}

fn trimmed(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn reply(plan: &Plan) -> String {
    json!({ "ok": true, "plan": describe(plan) }).to_string()
}

fn failure(message: &str) -> String {
    json!({ "error": message }).to_string()
}

impl HubTools<'_> {
    pub(crate) async fn plan(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<Args>(arguments) else {
            return failure("arguments must be {action, ...}");
        };
        let current = load(self.state, self.thread_id).await;
        match args.action.as_str() {
            "propose" => self.plan_propose(current, args).await,
            "update" => self.plan_update(current, args).await,
            "ask" => self.plan_ask(current, args).await,
            other => failure(&format!("unknown action {other}")),
        }
    }

    async fn plan_propose(&self, current: Option<Plan>, args: Args) -> String {
        let Some(title) = trimmed(args.title).or_else(|| current.as_ref().map(|plan| plan.title.clone())) else {
            return failure("a new plan needs a title");
        };
        let steps: Vec<PlanStep> = args
            .steps
            .into_iter()
            .filter(|step| !step.title.trim().is_empty() && step.owner.as_deref() != Some("you"))
            .take(MAX_STEPS)
            .map(|step| PlanStep {
                title: step.title.trim().to_owned(),
                due: trimmed(step.due),
                detail: trimmed(step.detail),
                ..PlanStep::default()
            })
            .collect();
        if steps.is_empty() {
            return failure("a plan needs at least one step");
        }
        let plan = Plan {
            thread_id: self.thread_id.to_owned(),
            title,
            version: current.as_ref().map_or(1, |plan| plan.version + 1),
            status: PlanStatus::Draft,
            steps,
            changes: trimmed(args.changes),
            bounds: trimmed(args.bounds).or_else(|| current.and_then(|plan| plan.bounds)),
            question: None,
            updated_at: 0,
        };
        reply(&save(self.state, plan).await)
    }

    async fn plan_update(&self, current: Option<Plan>, args: Args) -> String {
        let Some(mut plan) = current else {
            return failure("there is no plan in this conversation; propose one first");
        };
        if plan.status == PlanStatus::Draft {
            return failure("the plan is still a draft; wait until the user approves it");
        }
        let Some(index) = args.step.and_then(|step| step.checked_sub(1)) else {
            return failure("update needs the step number");
        };
        let Some(step) = plan.steps.get_mut(index) else {
            return failure("no such step");
        };
        if let Some(status) = args.status.as_deref() {
            step.status = match status {
                "running" => StepStatus::Running,
                "done" => StepStatus::Done,
                "skipped" => StepStatus::Skipped,
                _ => return failure("status must be running, done or skipped"),
            };
        }
        if let Some(title) = trimmed(args.title) {
            step.title = title;
        }
        if let Some(due) = trimmed(args.due) {
            step.due = Some(due);
        }
        if let Some(note) = trimmed(args.note) {
            step.note = Some(note);
        }
        if let Some(output) = args.output.filter(|output| !output.label.trim().is_empty()) {
            let kind = match output.kind.as_str() {
                "doc" => StepOutputKind::Doc,
                "sheet" => StepOutputKind::Sheet,
                "deck" => StepOutputKind::Deck,
                _ => StepOutputKind::Text,
            };
            step.output = Some(StepOutput {
                kind,
                label: output.label.trim().to_owned(),
                id: trimmed(output.id),
            });
        }
        if plan.status == PlanStatus::Blocked {
            plan.status = PlanStatus::Running;
            plan.question = None;
        }
        if plan
            .steps
            .iter()
            .all(|step| matches!(step.status, StepStatus::Done | StepStatus::Skipped))
        {
            plan.status = PlanStatus::Done;
        }
        with_progress(self.thread_id, |progress| progress.moved = true);
        reply(&save(self.state, plan).await)
    }

    async fn plan_ask(&self, current: Option<Plan>, args: Args) -> String {
        let Some(mut plan) = current else {
            return failure("there is no plan in this conversation");
        };
        let Some(text) = trimmed(args.question) else {
            return failure("ask needs a question");
        };
        plan.status = PlanStatus::Blocked;
        plan.question = Some(PlanQuestion {
            text,
            options: args
                .options
                .into_iter()
                .filter_map(|option| trimmed(Some(option)))
                .take(4)
                .collect(),
        });
        reply(&save(self.state, plan).await)
    }
}

fn next_step(plan: &Plan) -> Option<(usize, &PlanStep)> {
    plan.steps
        .iter()
        .enumerate()
        .find(|(_, step)| matches!(step.status, StepStatus::Todo | StepStatus::Running))
}

fn wire(state: &SharedState, plan: &Plan, lead: &str) -> String {
    format!(
        "{lead}\n\n{}\n{}",
        state.localizer.text(keys::PLAN_CONTEXT_LABEL),
        describe(plan)
    )
}

fn continue_later(state: &SharedState, thread_id: String, wire: String) {
    let state = state.clone();
    tokio::spawn(async move {
        for _ in 0..WAIT_TRIES {
            if state.turns.running_in(&thread_id).is_none() {
                match crate::turns::resume(&state, thread_id.clone(), &wire) {
                    Ok(_) => return,
                    Err(error) if error.code == ErrorCode::Busy => {}
                    Err(error) => {
                        tracing::warn!(detail = %error.detail, "could not continue the plan");
                        return;
                    }
                }
            }
            tokio::time::sleep(WAIT_STEP).await;
        }
    });
}

pub async fn after_turn(state: &SharedState, thread_id: &str, answer: &str) {
    let Some(mut plan) = load(state, thread_id).await else {
        return;
    };
    let moved = with_progress(thread_id, |progress| std::mem::take(&mut progress.moved));
    if plan.status != PlanStatus::Running {
        return;
    }
    let Some((index, _)) = next_step(&plan) else {
        plan.status = PlanStatus::Done;
        save(state, plan).await;
        return;
    };
    let runs = with_progress(thread_id, |progress| {
        progress.runs += 1;
        progress.runs
    });
    if !moved || runs > MAX_AUTO_RUNS {
        let text: String = answer.trim().chars().take(SNIPPET).collect();
        plan.status = PlanStatus::Blocked;
        plan.question = Some(PlanQuestion {
            text: if text.is_empty() {
                state
                    .localizer
                    .format(keys::PLAN_STUCK, &[("step", &(index + 1).to_string())])
            } else {
                text
            },
            options: Vec::new(),
        });
        save(state, plan).await;
        return;
    }
    let lead = state.localizer.text(keys::PLAN_CONTINUE);
    continue_later(state, thread_id.to_owned(), wire(state, &plan, &lead));
}

fn start(state: &SharedState, plan: &Plan, lead: &str) {
    with_progress(&plan.thread_id, |progress| {
        progress.runs = 0;
        progress.moved = false;
    });
    continue_later(state, plan.thread_id.clone(), wire(state, plan, lead));
}

fn missing() -> ProtocolError {
    ProtocolError::new(ErrorCode::NotFound, "this conversation has no plan")
}

async fn act(state: &SharedState, thread_id: &str, action: PlanAction) -> Result<Option<Plan>, ProtocolError> {
    if action == PlanAction::Dismiss {
        remove(state, thread_id).await;
        return Ok(None);
    }
    let mut plan = load(state, thread_id).await.ok_or_else(missing)?;
    let l = &state.localizer;
    let lead = match action {
        PlanAction::Approve => {
            plan.status = PlanStatus::Running;
            plan.question = None;
            Some(l.format(
                keys::PLAN_APPROVED,
                &[("title", &plan.title), ("version", &plan.version.to_string())],
            ))
        }
        PlanAction::Pause => {
            plan.status = PlanStatus::Paused;
            None
        }
        PlanAction::Resume => {
            plan.status = PlanStatus::Running;
            plan.question = None;
            Some(l.text(keys::PLAN_RESUMED))
        }
        PlanAction::Choose { option } => {
            plan.status = PlanStatus::Running;
            plan.question = None;
            Some(l.format(keys::PLAN_CHOSEN, &[("option", &option)]))
        }
        PlanAction::StepDone { step } => {
            let index = usize::try_from(step).unwrap_or(0).checked_sub(1).ok_or_else(missing)?;
            let target = plan.steps.get_mut(index).ok_or_else(missing)?;
            target.status = StepStatus::Done;
            let title = target.title.clone();
            if plan.status != PlanStatus::Paused {
                plan.status = PlanStatus::Running;
            }
            (plan.status == PlanStatus::Running).then(|| {
                l.format(
                    keys::PLAN_STEP_DONE,
                    &[("step", &step.to_string()), ("title", &title)],
                )
            })
        }
        PlanAction::Dismiss => None,
    };
    if next_step(&plan).is_none() && plan.status == PlanStatus::Running {
        plan.status = PlanStatus::Done;
    }
    let plan = save(state, plan).await;
    if let Some(lead) = lead.filter(|_| plan.status == PlanStatus::Running) {
        start(state, &plan, &lead);
    }
    Ok(Some(plan))
}

pub async fn handle(state: &SharedState, request: Request) -> Result<Response, ProtocolError> {
    match request {
        Request::Plan { thread_id } => Ok(Response::Plan {
            plan: load(state, &thread_id).await,
        }),
        Request::ListPlans => Ok(Response::Plans {
            plans: list(state).await,
        }),
        Request::PlanAction { thread_id, action } => Ok(Response::Plan {
            plan: act(state, &thread_id, action).await?,
        }),
        _ => Err(ProtocolError::new(ErrorCode::BadRequest, "not a plan request")),
    }
}
