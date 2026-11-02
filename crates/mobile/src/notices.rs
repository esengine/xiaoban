use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::broadcast::error::RecvError;
use xiaoban_hub::LocalLink;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{
    ConfirmChoice, Event, Notice, NotifyCategory, NotifyLevel, NotifyRing, Request,
};

use crate::operator::Bridge;

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
enum Answer {
    Confirm {
        confirm_id: String,
        choice: ConfirmChoice,
    },
    Reply {
        thread_id: String,
        text: String,
    },
    StopAll,
}

fn category_key(category: NotifyCategory) -> Key {
    match category {
        NotifyCategory::Confirm => keys::NOTIFY_CAT_CONFIRM,
        NotifyCategory::Remind => keys::NOTIFY_CAT_REMIND,
        NotifyCategory::Error => keys::NOTIFY_CAT_ERROR,
        NotifyCategory::Morning => keys::NOTIFY_CAT_MORNING,
        NotifyCategory::Done => keys::NOTIFY_CAT_DONE,
        NotifyCategory::Idea => keys::NOTIFY_CAT_IDEA,
        NotifyCategory::Report => keys::NOTIFY_CAT_REPORT,
        NotifyCategory::Family => keys::NOTIFY_CAT_FAMILY,
    }
}

pub fn texts(l: &Localizer, category: NotifyCategory) -> Value {
    json!({
        "category": l.text(category_key(category)),
        "reply": l.text(keys::NOTIFY_REPLY),
        "replyHint": l.text(keys::NOTIFY_REPLY_HINT),
        "replied": l.text(keys::NOTIFY_REPLIED),
        "answeredYes": l.text(keys::NOTIFY_ANSWERED_YES),
        "answeredEdit": l.text(keys::NOTIFY_ANSWERED_EDIT),
        "answeredNo": l.text(keys::NOTIFY_ANSWERED_NO),
        "failed": l.text(keys::NOTIFY_SEND_FAILED),
        "channelUrgent": l.text(keys::NOTIFY_CHANNEL_URGENT),
        "channelQuiet": l.text(keys::NOTIFY_CHANNEL_QUIET),
    })
}

pub fn rings_here(notice: &Notice) -> bool {
    notice.level == NotifyLevel::Now && notice.ring == NotifyRing::Everywhere
}

pub fn op_for(l: &Localizer, event: Event) -> Option<Value> {
    match event {
        Event::Notify { notice } if rings_here(&notice) => Some(json!({
            "op": "notify",
            "route": "local",
            "texts": texts(l, notice.category),
            "notice": notice,
        })),
        Event::NoticeWithdrawn { id } => Some(json!({ "op": "withdraw", "id": id })),
        _ => None,
    }
}

pub async fn forward(link: LocalLink, bridge: Bridge, l: Localizer) {
    let mut events = link.events();
    loop {
        let event = tokio::select! {
            event = events.recv() => event,
            () = link.closed() => return,
        };
        let op = match event {
            Ok(event) => op_for(&l, event),
            Err(RecvError::Lagged(_)) => None,
            Err(RecvError::Closed) => return,
        };
        let Some(op) = op else {
            continue;
        };
        let bridge = bridge.clone();
        let _ = tokio::task::spawn_blocking(move || bridge(op.to_string())).await;
    }
}

pub async fn deliver(link: &LocalLink, raw: &str) -> Value {
    let Ok(answer) = serde_json::from_str::<Answer>(raw) else {
        return json!({ "error": "not an answer" });
    };
    let request = match answer {
        Answer::Confirm { confirm_id, choice } => Request::AnswerConfirm { confirm_id, choice },
        Answer::Reply { thread_id, text } => Request::SendMessage {
            thread_id,
            text,
            context: Vec::new(),
            quote: None,
            files: Vec::new(),
            threads: Vec::new(),
        },
        Answer::StopAll => {
            for turn_id in crate::keeper::running() {
                let _ = link.request(Request::CancelTurn { turn_id }).await;
            }
            return json!({ "ok": true });
        }
    };
    match link.request(request).await {
        Ok(_) => json!({ "ok": true }),
        Err(error) => json!({ "error": error.detail }),
    }
}
