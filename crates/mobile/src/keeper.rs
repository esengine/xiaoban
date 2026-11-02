use std::collections::HashMap;
use std::sync::Mutex;

use serde_json::{Value, json};
use tokio::sync::broadcast::error::RecvError;
use xiaoban_hub::LocalLink;
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{Event, Request, Response, Schedule, ScheduleState};

use crate::operator::Bridge;

static RUNNING: Mutex<Vec<String>> = Mutex::new(Vec::new());

pub fn running() -> Vec<String> {
    RUNNING.lock().unwrap().clone()
}

#[derive(Default)]
struct Watch {
    turns: HashMap<String, (String, i64)>,
    titles: HashMap<String, String>,
    wakes: HashMap<String, i64>,
}

fn next_wake(schedule: &Schedule) -> Option<i64> {
    (schedule.state == ScheduleState::Active)
        .then_some(schedule.next_at)
        .flatten()
}

impl Watch {
    fn schedule(&mut self, schedule: &Schedule) {
        match next_wake(schedule) {
            Some(at) => self.wakes.insert(schedule.id.clone(), at),
            None => self.wakes.remove(&schedule.id),
        };
    }

    fn keep(&self, l: &Localizer) -> Value {
        *RUNNING.lock().unwrap() = self.turns.keys().cloned().collect();
        let mut turns: Vec<_> = self.turns.values().collect();
        turns.sort_by_key(|(_, started)| *started);
        let items: Vec<Value> = turns
            .iter()
            .map(|(thread, started)| {
                let title = self
                    .titles
                    .get(thread)
                    .cloned()
                    .unwrap_or_else(|| l.text(keys::APP_NAME));
                json!({ "threadId": thread, "title": title, "startedAt": started })
            })
            .collect();
        let count = items.len().to_string();
        json!({
            "op": "keep",
            "items": items,
            "texts": {
                "title": l.format(keys::KEEP_RUNNING_TITLE, &[("count", &count)]),
                "working": l.text(keys::KEEP_RUNNING_WORKING),
                "stop": l.text(keys::KEEP_RUNNING_STOP),
                "open": l.text(keys::KEEP_RUNNING_OPEN),
                "channel": l.text(keys::KEEP_RUNNING_CHANNEL),
                "waking": l.text(keys::KEEP_RUNNING_WAKING),
            },
        })
    }

    fn wake(&self) -> Value {
        json!({ "op": "wake", "at": self.wakes.values().min() })
    }
}

async fn titles(link: &LocalLink) -> HashMap<String, String> {
    match link.request(Request::ListThreads).await {
        Ok(Response::Threads { threads }) => threads
            .into_iter()
            .filter_map(|thread| thread.title.map(|title| (thread.id, title)))
            .collect(),
        _ => HashMap::new(),
    }
}

async fn send(bridge: &Bridge, op: Value) {
    let bridge = bridge.clone();
    let _ = tokio::task::spawn_blocking(move || bridge(op.to_string())).await;
}

pub async fn watch(link: LocalLink, bridge: Bridge, l: Localizer) {
    let mut events = link.events();
    let mut state = Watch {
        titles: titles(&link).await,
        ..Watch::default()
    };
    if let Ok(Response::Schedules { schedules }) = link.request(Request::ListSchedules).await {
        for schedule in &schedules {
            state.schedule(schedule);
        }
    }
    send(&bridge, state.wake()).await;
    loop {
        let event = tokio::select! {
            event = events.recv() => event,
            () = link.closed() => {
                send(&bridge, json!({ "op": "keep", "items": [] })).await;
                return;
            }
        };
        let event = match event {
            Ok(event) => event,
            Err(RecvError::Lagged(_)) => continue,
            Err(RecvError::Closed) => return,
        };
        match event {
            Event::TurnStarted {
                thread_id,
                turn_id,
                started_at,
            } => {
                if !state.titles.contains_key(&thread_id) {
                    state.titles = titles(&link).await;
                }
                state.turns.insert(turn_id, (thread_id, started_at));
                send(&bridge, state.keep(&l)).await;
            }
            Event::TurnCompleted { turn_id, .. } | Event::TurnFailed { turn_id, .. } => {
                if state.turns.remove(&turn_id).is_some() {
                    send(&bridge, state.keep(&l)).await;
                }
            }
            Event::ScheduleUpdated { schedule } => {
                state.schedule(&schedule);
                send(&bridge, state.wake()).await;
            }
            Event::ScheduleRemoved { id } => {
                state.wakes.remove(&id);
                send(&bridge, state.wake()).await;
            }
            _ => {}
        }
    }
}
