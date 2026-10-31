use std::collections::HashMap;
use std::sync::Mutex;

use tokio::sync::watch;
use tokio_util::sync::CancellationToken;
use xiaoban_protocol::Event;

use crate::state::SharedState;

#[derive(Debug, Default)]
pub struct Pauses {
    turns: Mutex<HashMap<String, watch::Sender<bool>>>,
    notes: Mutex<HashMap<String, Vec<String>>>,
}

impl Pauses {
    fn sender(&self, turn_id: &str) -> watch::Sender<bool> {
        self.turns
            .lock()
            .unwrap()
            .entry(turn_id.to_owned())
            .or_insert_with(|| watch::channel(false).0)
            .clone()
    }

    pub fn start(&self, turn_id: &str) {
        self.notes
            .lock()
            .unwrap()
            .insert(turn_id.to_owned(), Vec::new());
    }

    pub fn add_note(&self, turn_id: &str, text: &str) -> bool {
        self.notes
            .lock()
            .unwrap()
            .get_mut(turn_id)
            .map(|notes| notes.push(text.to_owned()))
            .is_some()
    }

    pub fn take_notes(&self, turn_id: &str) -> Vec<String> {
        self.notes
            .lock()
            .unwrap()
            .get_mut(turn_id)
            .map(std::mem::take)
            .unwrap_or_default()
    }

    pub fn forget(&self, turn_id: &str) {
        self.turns.lock().unwrap().remove(turn_id);
        self.notes.lock().unwrap().remove(turn_id);
    }
}

pub fn set(state: &SharedState, turn_id: &str, paused: bool, by_user: bool) {
    let sender = state.pauses.sender(turn_id);
    if *sender.borrow() == paused {
        return;
    }
    sender.send_replace(paused);
    state.publish(Event::TurnPaused {
        turn_id: turn_id.to_owned(),
        paused,
        by_user,
    });
}

pub async fn wait_while_paused(state: &SharedState, turn_id: &str, cancel: &CancellationToken) {
    let mut paused = state.pauses.sender(turn_id).subscribe();
    tokio::select! {
        _ = paused.wait_for(|paused| !paused) => {}
        () = cancel.cancelled() => {}
    }
}
