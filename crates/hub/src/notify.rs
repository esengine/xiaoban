use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::broadcast::error::RecvError;
use tokio_util::sync::CancellationToken;
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{
    ConfirmChoice, ConfirmKind, ConfirmRequest, Event, FailureKind, Notice, NoticeChoice,
    NotifyCategory, NotifyLevel, NotifyRing, NotifyScene, NotifySettings, ProtocolError, Request,
    Response,
};
use xiaoban_store::now_ms;

use crate::state::SharedState;

const KEY: &str = "notify.settings";
const KID_MS: i64 = 2 * 3600 * 1000;
const ACTIVE_SECONDS: u64 = 120;
const BODY_CHARS: usize = 160;
const DAY_MINUTES: u16 = 24 * 60;
const BATCHES: [u16; 2] = [12 * 60, 18 * 60];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Decision {
    pub level: NotifyLevel,
    pub ring: NotifyRing,
    pub defer_to: Option<u16>,
}

fn fresh(mut settings: NotifySettings, now: i64) -> NotifySettings {
    if settings.scene == NotifyScene::Kid && settings.scene_until.is_none_or(|until| until <= now) {
        settings.scene = NotifyScene::Normal;
        settings.scene_until = None;
    }
    if settings.scene != NotifyScene::Kid {
        settings.scene_until = None;
    }
    settings
}

pub async fn load(state: &SharedState) -> NotifySettings {
    let stored = state
        .store
        .setting_owned(KEY.to_owned())
        .await
        .ok()
        .flatten()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default();
    fresh(stored, now_ms())
}

fn merged(previous: NotifySettings, next: NotifySettings, now: i64) -> NotifySettings {
    let scene_until = match next.scene {
        NotifyScene::Kid => Some(match previous.scene_until {
            Some(until) if previous.scene == NotifyScene::Kid && until > now => until,
            _ => now + KID_MS,
        }),
        _ => None,
    };
    NotifySettings {
        scene_until,
        quiet_start: next.quiet_start % DAY_MINUTES,
        quiet_end: next.quiet_end % DAY_MINUTES,
        ..next
    }
}

async fn save(state: &SharedState, next: NotifySettings) -> NotifySettings {
    let settings = merged(load(state).await, next, now_ms());
    let _ = state
        .store
        .set_setting_owned(
            KEY.to_owned(),
            serde_json::to_string(&settings).unwrap_or_default(),
        )
        .await;
    settings
}

pub async fn handle(state: &SharedState, request: Request) -> Result<Response, ProtocolError> {
    let settings = match request {
        Request::SetNotifySettings { settings } => save(state, settings).await,
        _ => load(state).await,
    };
    Ok(Response::NotifySettings { settings })
}

fn in_window(start: u16, end: u16, minute: u16) -> bool {
    if start <= end {
        start <= minute && minute < end
    } else {
        minute >= start || minute < end
    }
}

fn next_batch(minute: u16) -> u16 {
    BATCHES
        .into_iter()
        .find(|batch| minute < *batch)
        .unwrap_or(BATCHES[0])
}

fn ring_for(settings: &NotifySettings, idle: Option<u64>) -> NotifyRing {
    if settings.one_device && idle.is_some_and(|seconds| seconds < ACTIVE_SECONDS) {
        NotifyRing::Computer
    } else {
        NotifyRing::Everywhere
    }
}

pub fn decide(
    settings: &NotifySettings,
    category: NotifyCategory,
    minute: u16,
    idle: Option<u64>,
) -> Decision {
    let base = settings.levels.of(category);
    let rings = matches!(category, NotifyCategory::Confirm | NotifyCategory::Remind);
    let mut defer_to = None;
    let mut level = match settings.scene {
        NotifyScene::Normal => base,
        NotifyScene::Kid | NotifyScene::Trip if rings => base,
        NotifyScene::Kid | NotifyScene::Trip => base.max(NotifyLevel::Daily),
        NotifyScene::Work => {
            if category == NotifyCategory::Family && base == NotifyLevel::Now {
                defer_to = Some(next_batch(minute));
            }
            base
        }
    };
    if level == NotifyLevel::Now
        && settings.quiet
        && in_window(settings.quiet_start, settings.quiet_end, minute)
    {
        if category == NotifyCategory::Confirm {
            defer_to = Some(settings.quiet_end);
        } else {
            level = NotifyLevel::Daily;
            defer_to = None;
        }
    }
    Decision {
        level,
        ring: ring_for(settings, idle),
        defer_to,
    }
}

fn local_minute() -> u16 {
    let now = jiff::Zoned::now();
    u16::try_from(now.hour()).unwrap_or(0) * 60 + u16::try_from(now.minute()).unwrap_or(0)
}

fn wait_for(minute: u16) -> Duration {
    let now = jiff::Zoned::now();
    let time = jiff::civil::time(
        i8::try_from(minute / 60).unwrap_or(0),
        i8::try_from(minute % 60).unwrap_or(0),
        0,
        0,
    );
    let Ok(mut target) = now.date().to_datetime(time).to_zoned(now.time_zone().clone()) else {
        return Duration::from_secs(3600);
    };
    if target <= now {
        target = target
            .checked_add(jiff::Span::new().days(1))
            .unwrap_or(target);
    }
    let millis = target.timestamp().as_millisecond() - now.timestamp().as_millisecond();
    Duration::from_millis(u64::try_from(millis).unwrap_or(0))
}

#[derive(Debug, Clone)]
struct Draft {
    id: String,
    category: NotifyCategory,
    title: String,
    body: String,
    thread_id: Option<String>,
    confirm_id: Option<String>,
    choices: Vec<NoticeChoice>,
    reply: bool,
}

impl Draft {
    fn notice(self, level: NotifyLevel, ring: NotifyRing) -> Notice {
        Notice {
            id: self.id,
            title: self.title,
            body: self.body,
            category: self.category,
            level,
            ring,
            thread_id: self.thread_id,
            confirm_id: self.confirm_id,
            choices: self.choices,
            reply: self.reply,
        }
    }
}

fn choice(choice: ConfirmChoice, label: String, primary: bool) -> NoticeChoice {
    NoticeChoice {
        choice,
        label,
        primary,
    }
}

#[allow(clippy::too_many_lines)]
pub fn confirm_text(l: &Localizer, kind: &ConfirmKind) -> (String, String, Vec<NoticeChoice>) {
    use ConfirmChoice::{Always, Edit, No, Once, Yes};
    match kind {
        ConfirmKind::AllowApp { app } => (
            l.format(keys::CONFIRM_ALLOW_TITLE, &[("app", app)]),
            l.text(keys::CONFIRM_ALLOW_HINT),
            vec![
                choice(No, l.text(keys::CONFIRM_ALLOW_NO), false),
                choice(Once, l.text(keys::CONFIRM_ALLOW_ONCE), false),
                choice(Always, l.text(keys::CONFIRM_ALLOW_ALWAYS), true),
            ],
        ),
        ConfirmKind::BorrowMouse { app } => (
            l.format(keys::CONFIRM_MOUSE_TITLE, &[("app", app)]),
            l.text(keys::CONFIRM_MOUSE_HINT),
            vec![
                choice(No, l.text(keys::CONFIRM_MOUSE_NO), false),
                choice(Once, l.text(keys::CONFIRM_MOUSE_ONCE), false),
                choice(Always, l.text(keys::CONFIRM_MOUSE_ALWAYS), true),
            ],
        ),
        ConfirmKind::OpenSubthreads { titles, reason } => {
            let count = titles.len().to_string();
            let mut body = vec![reason.clone()];
            body.extend(
                titles
                    .iter()
                    .map(|title| l.format(keys::CONFIRM_SUBTHREADS_ITEM, &[("title", title)])),
            );
            (
                l.format(keys::CONFIRM_SUBTHREADS_TITLE, &[("count", &count)]),
                body.join("\n"),
                vec![
                    choice(No, l.text(keys::CONFIRM_SUBTHREADS_NO), false),
                    choice(Edit, l.text(keys::CONFIRM_SUBTHREADS_EDIT), false),
                    choice(Yes, l.text(keys::CONFIRM_SUBTHREADS_YES), true),
                ],
            )
        }
        ConfirmKind::Action { title, detail } => (
            title.clone(),
            if detail.trim().is_empty() {
                l.text(keys::CONFIRM_ACTION_HINT)
            } else {
                detail.clone()
            },
            vec![
                choice(No, l.text(keys::CONFIRM_ACTION_NO), false),
                choice(Edit, l.text(keys::CONFIRM_ACTION_EDIT), false),
                choice(Yes, l.text(keys::CONFIRM_ACTION_YES), true),
            ],
        ),
        ConfirmKind::PriceCheck {
            app,
            item,
            detail,
            phone,
        } => (
            l.format(
                if *phone {
                    keys::CONFIRM_PRICE_TITLE
                } else {
                    keys::CONFIRM_PRICE_TITLE_COMPUTER
                },
                &[("app", app), ("item", item)],
            ),
            format!(
                "{detail}\n{}",
                l.text(if *phone {
                    keys::CONFIRM_PRICE_HINT
                } else {
                    keys::CONFIRM_PRICE_HINT_COMPUTER
                })
            ),
            vec![
                choice(Yes, l.text(keys::CONFIRM_PRICE_YES), true),
                choice(No, l.text(keys::CONFIRM_PRICE_NO), false),
            ],
        ),
        ConfirmKind::RunCommand { command, rule, .. } => {
            let mut choices = vec![choice(No, l.text(keys::CONFIRM_RUN_NO), false)];
            if !rule.is_empty() {
                choices.push(choice(
                    Always,
                    l.format(keys::CONFIRM_RUN_ALWAYS, &[("rule", rule)]),
                    false,
                ));
            }
            choices.push(choice(Once, l.text(keys::CONFIRM_RUN_ONCE), true));
            (l.text(keys::CONFIRM_RUN_TITLE), command.clone(), choices)
        }
        ConfirmKind::ReadOutside { path, folder } => (
            l.text(keys::CONFIRM_READ_TITLE),
            path.clone(),
            vec![
                choice(No, l.text(keys::CONFIRM_RUN_NO), false),
                choice(
                    Always,
                    l.format(keys::CONFIRM_READ_ALWAYS, &[("folder", folder)]),
                    false,
                ),
                choice(Once, l.text(keys::CONFIRM_RUN_ONCE), true),
            ],
        ),
        ConfirmKind::WriteOutside { path, folder, .. } => (
            l.text(keys::CONFIRM_WRITE_TITLE),
            path.clone(),
            vec![
                choice(No, l.text(keys::CONFIRM_RUN_NO), false),
                choice(
                    Always,
                    l.format(keys::CONFIRM_WRITE_ALWAYS, &[("folder", folder)]),
                    false,
                ),
                choice(Once, l.text(keys::CONFIRM_RUN_ONCE), true),
            ],
        ),
        ConfirmKind::Permissions => (
            l.text(keys::CONFIRM_PERMISSIONS_TITLE),
            l.text(keys::CONFIRM_PERMISSIONS_HINT),
            Vec::new(),
        ),
    }
}

pub fn confirm_notice_id(confirm_id: &str) -> String {
    format!("confirm:{confirm_id}")
}

fn confirm_draft(l: &Localizer, confirm: &ConfirmRequest) -> Draft {
    let (title, body, choices) = confirm_text(l, &confirm.kind);
    Draft {
        id: confirm_notice_id(&confirm.id),
        category: NotifyCategory::Confirm,
        title,
        body,
        thread_id: Some(confirm.thread_id.clone()),
        confirm_id: Some(confirm.id.clone()),
        choices,
        reply: false,
    }
}

fn excerpt(text: &str) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if flat.chars().count() <= BODY_CHARS {
        return flat;
    }
    let mut cut: String = flat.chars().take(BODY_CHARS).collect();
    cut.push('…');
    cut
}

async fn thread_title(state: &SharedState, thread_id: &str) -> String {
    state
        .store
        .thread(thread_id.to_owned())
        .await
        .ok()
        .and_then(|thread| thread.title)
        .filter(|title| !title.trim().is_empty())
        .unwrap_or_else(|| state.localizer.text(keys::APP_NAME))
}

async fn draft_for(
    state: &SharedState,
    turns: &mut HashMap<String, String>,
    event: Event,
) -> Option<Draft> {
    let l = &state.localizer;
    match event {
        Event::TurnStarted {
            thread_id, turn_id, ..
        } => {
            turns.insert(turn_id, thread_id);
            None
        }
        Event::ConfirmRequested { confirm } => Some(confirm_draft(l, &confirm)),
        Event::ConfirmResolved { confirm_id, .. } => {
            state.publish(Event::NoticeWithdrawn {
                id: confirm_notice_id(&confirm_id),
            });
            None
        }
        Event::TurnCompleted {
            turn_id, message, ..
        } => {
            turns.remove(&turn_id);
            let body = excerpt(&message.text);
            if body.is_empty() {
                return None;
            }
            Some(Draft {
                id: format!("turn:{turn_id}"),
                category: NotifyCategory::Done,
                title: thread_title(state, &message.thread_id).await,
                body,
                thread_id: Some(message.thread_id),
                confirm_id: None,
                choices: Vec::new(),
                reply: true,
            })
        }
        Event::TurnFailed { turn_id, failure } => {
            let thread_id = turns.remove(&turn_id);
            if failure.kind == FailureKind::Cancelled {
                return None;
            }
            let title = match &thread_id {
                Some(thread_id) => thread_title(state, thread_id).await,
                None => l.text(keys::APP_NAME),
            };
            Some(Draft {
                id: format!("failed:{turn_id}"),
                category: NotifyCategory::Error,
                title,
                body: l.text(keys::NOTIFY_FAILED_BODY),
                thread_id,
                confirm_id: None,
                choices: Vec::new(),
                reply: false,
            })
        }
        Event::TimerFired { timer } => Some(Draft {
            id: format!("timer:{}:{}", timer.id, timer.ends_at),
            category: NotifyCategory::Remind,
            title: l.format(keys::TIMER_DONE_TITLE, &[("label", &timer.label)]),
            body: if timer.after.trim().is_empty() {
                l.text(keys::TIMER_DONE_BODY)
            } else {
                timer.after
            },
            thread_id: None,
            confirm_id: None,
            choices: Vec::new(),
            reply: false,
        }),
        Event::PrepDue { task } => Some(Draft {
            id: format!("prep:{}:{}:{}", task.date, task.time, task.text),
            category: NotifyCategory::Remind,
            title: l.text(keys::PREP_DUE_TITLE),
            body: task.text,
            thread_id: None,
            confirm_id: None,
            choices: Vec::new(),
            reply: false,
        }),
        Event::WeatherAlert {
            title,
            body,
            morning,
        } => Some(Draft {
            id: format!("weather:{}", uuid::Uuid::now_v7()),
            category: if morning {
                NotifyCategory::Morning
            } else {
                NotifyCategory::Idea
            },
            title,
            body,
            thread_id: None,
            confirm_id: None,
            choices: Vec::new(),
            reply: false,
        }),
        _ => None,
    }
}

fn still_pending(state: &SharedState, draft: &Draft) -> bool {
    draft.confirm_id.as_ref().is_none_or(|id| {
        state
            .confirms
            .pending()
            .iter()
            .any(|confirm| &confirm.id == id)
    })
}

async fn raise(state: &SharedState, draft: Draft, shutdown: &CancellationToken) {
    let settings = load(state).await;
    let decision = decide(
        &settings,
        draft.category,
        local_minute(),
        state.presence.idle_seconds(),
    );
    if decision.level == NotifyLevel::Mute {
        return;
    }
    if let Some(minute) = decision.defer_to {
        let state = Arc::clone(state);
        let stop = shutdown.clone();
        tokio::spawn(async move {
            tokio::select! {
                () = tokio::time::sleep(wait_for(minute)) => {}
                () = stop.cancelled() => return,
            }
            if !still_pending(&state, &draft) {
                return;
            }
            let settings = load(&state).await;
            let ring = ring_for(&settings, state.presence.idle_seconds());
            state.publish(Event::Notify {
                notice: draft.notice(NotifyLevel::Now, ring),
            });
        });
        return;
    }
    state.publish(Event::Notify {
        notice: draft.notice(decision.level, decision.ring),
    });
}

pub fn watch(state: SharedState, shutdown: CancellationToken) {
    let mut events = state.events.subscribe();
    tokio::spawn(async move {
        let mut turns = HashMap::new();
        loop {
            let event = tokio::select! {
                event = events.recv() => event,
                () = shutdown.cancelled() => return,
            };
            match event {
                Ok(event) => {
                    if let Some(draft) = draft_for(&state, &mut turns, event).await {
                        raise(&state, draft, &shutdown).await;
                    }
                }
                Err(RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "notice watcher lagged");
                }
                Err(RecvError::Closed) => return,
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings() -> NotifySettings {
        NotifySettings::default()
    }

    #[test]
    fn follows_the_levels_in_the_usual_scene() {
        let s = settings();
        let noon = 12 * 60;
        assert_eq!(decide(&s, NotifyCategory::Confirm, noon, None).level, NotifyLevel::Now);
        assert_eq!(decide(&s, NotifyCategory::Remind, noon, None).level, NotifyLevel::Now);
        assert_eq!(decide(&s, NotifyCategory::Done, noon, None).level, NotifyLevel::Daily);
        assert_eq!(decide(&s, NotifyCategory::Family, noon, None).level, NotifyLevel::Mute);
        assert_eq!(decide(&s, NotifyCategory::Done, noon, None).defer_to, None);
    }

    #[test]
    fn quiet_hours_hold_confirmations_until_morning() {
        let s = settings();
        let night = 23 * 60;
        let confirm = decide(&s, NotifyCategory::Confirm, night, None);
        assert_eq!(confirm.level, NotifyLevel::Now);
        assert_eq!(confirm.defer_to, Some(7 * 60 + 30));
        let remind = decide(&s, NotifyCategory::Remind, 3 * 60, None);
        assert_eq!(remind.level, NotifyLevel::Daily);
        assert_eq!(remind.defer_to, None);
        let off = NotifySettings { quiet: false, ..s };
        assert_eq!(decide(&off, NotifyCategory::Remind, night, None).level, NotifyLevel::Now);
        assert_eq!(decide(&s, NotifyCategory::Remind, 8 * 60, None).level, NotifyLevel::Now);
    }

    #[test]
    fn scenes_change_what_rings() {
        let mut levels = settings().levels;
        levels.error = NotifyLevel::Now;
        levels.family = NotifyLevel::Now;
        let kid = NotifySettings { scene: NotifyScene::Kid, levels, ..settings() };
        assert_eq!(decide(&kid, NotifyCategory::Remind, 600, None).level, NotifyLevel::Now);
        assert_eq!(decide(&kid, NotifyCategory::Error, 600, None).level, NotifyLevel::Daily);
        let work = NotifySettings { scene: NotifyScene::Work, levels, ..settings() };
        assert_eq!(decide(&work, NotifyCategory::Family, 600, None).defer_to, Some(720));
        assert_eq!(decide(&work, NotifyCategory::Family, 800, None).defer_to, Some(1080));
        assert_eq!(decide(&work, NotifyCategory::Family, 1200, None).defer_to, Some(720));
        assert_eq!(decide(&work, NotifyCategory::Error, 600, None).defer_to, None);
        let trip = NotifySettings { scene: NotifyScene::Trip, levels, ..settings() };
        assert_eq!(decide(&trip, NotifyCategory::Family, 600, None).level, NotifyLevel::Daily);
        assert_eq!(decide(&trip, NotifyCategory::Confirm, 600, None).level, NotifyLevel::Now);
    }

    #[test]
    fn only_the_computer_rings_while_it_is_used() {
        let s = settings();
        assert_eq!(decide(&s, NotifyCategory::Confirm, 600, Some(10)).ring, NotifyRing::Computer);
        assert_eq!(decide(&s, NotifyCategory::Confirm, 600, Some(900)).ring, NotifyRing::Everywhere);
        assert_eq!(decide(&s, NotifyCategory::Confirm, 600, None).ring, NotifyRing::Everywhere);
        let both = NotifySettings { one_device: false, ..s };
        assert_eq!(decide(&both, NotifyCategory::Confirm, 600, Some(10)).ring, NotifyRing::Everywhere);
    }

    #[test]
    fn kid_scene_restores_itself() {
        let now = 1_000_000;
        let picked = merged(settings(), NotifySettings { scene: NotifyScene::Kid, ..settings() }, now);
        assert_eq!(picked.scene_until, Some(now + KID_MS));
        assert_eq!(fresh(picked, now + 1).scene, NotifyScene::Kid);
        assert_eq!(fresh(picked, now + KID_MS).scene, NotifyScene::Normal);
        let again = merged(picked, picked, now + 10);
        assert_eq!(again.scene_until, picked.scene_until);
        let normal = merged(picked, NotifySettings { scene: NotifyScene::Normal, ..picked }, now);
        assert_eq!(normal.scene_until, None);
    }

    #[test]
    fn confirm_choices_carry_labels() {
        let l = Localizer::new(xiaoban_i18n::Locale::ZhCn);
        let (title, body, choices) = confirm_text(
            &l,
            &ConfirmKind::Action {
                title: "Book the carpenter".into(),
                detail: "Tomorrow 9:00".into(),
            },
        );
        assert_eq!(title, "Book the carpenter");
        assert_eq!(body, "Tomorrow 9:00");
        assert_eq!(choices.len(), 3);
        assert!(choices[2].primary);
        assert_eq!(choices[2].choice, ConfirmChoice::Yes);
        assert_ne!(choices[0].label, "");
    }
}
