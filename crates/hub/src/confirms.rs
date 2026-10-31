use std::collections::HashMap;
use std::sync::Mutex;

use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;
use xiaoban_protocol::{ConfirmChoice, ConfirmKind, ConfirmRequest, Event};

use crate::state::SharedState;

#[derive(Debug, Default)]
pub struct Confirms {
    pending: Mutex<HashMap<String, (ConfirmRequest, oneshot::Sender<ConfirmChoice>)>>,
}

impl Confirms {
    pub fn pending(&self) -> Vec<ConfirmRequest> {
        self.pending
            .lock()
            .unwrap()
            .values()
            .map(|(request, _)| request.clone())
            .collect()
    }

    pub fn answer(&self, id: &str, choice: ConfirmChoice) -> bool {
        let Some((_, reply)) = self.pending.lock().unwrap().remove(id) else {
            return false;
        };
        reply.send(choice).is_ok()
    }

    fn drop_request(&self, id: &str) {
        self.pending.lock().unwrap().remove(id);
    }
}

pub async fn ask(
    state: &SharedState,
    turn_id: &str,
    thread_id: &str,
    kind: ConfirmKind,
    cancel: &CancellationToken,
) -> ConfirmChoice {
    let request = ConfirmRequest {
        id: uuid::Uuid::now_v7().to_string(),
        turn_id: turn_id.to_owned(),
        thread_id: thread_id.to_owned(),
        kind,
    };
    let (reply, answer) = oneshot::channel();
    state
        .confirms
        .pending
        .lock()
        .unwrap()
        .insert(request.id.clone(), (request.clone(), reply));
    state.publish(Event::ConfirmRequested {
        confirm: request.clone(),
    });
    let choice = tokio::select! {
        choice = answer => choice.unwrap_or(ConfirmChoice::No),
        () = cancel.cancelled() => ConfirmChoice::No,
    };
    state.confirms.drop_request(&request.id);
    state.publish(Event::ConfirmResolved {
        confirm_id: request.id,
        choice,
    });
    choice
}
