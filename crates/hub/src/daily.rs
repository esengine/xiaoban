use xiaoban_protocol::{DailyCard, DailyLayout, ProtocolError, Request, Response};

use crate::state::SharedState;

const KEY: &str = "daily.layout";
const MAX_CARDS: usize = 40;

pub async fn load(state: &SharedState) -> DailyLayout {
    state
        .store
        .setting_owned(KEY.to_owned())
        .await
        .ok()
        .flatten()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub async fn handle(state: &SharedState, request: Request) -> Result<Response, ProtocolError> {
    if let Request::SetDailyLayout { layout } = request {
        let mut seen = std::collections::HashSet::new();
        let cards: Vec<DailyCard> = layout
            .cards
            .into_iter()
            .filter(|card| !card.id.is_empty() && card.id.len() <= 40 && seen.insert(card.id.clone()))
            .take(MAX_CARDS)
            .collect();
        let _ = state
            .store
            .set_setting_owned(KEY.to_owned(), serde_json::to_string(&DailyLayout { cards }).unwrap_or_default())
            .await;
    }
    Ok(Response::DailyLayout {
        layout: load(state).await,
    })
}
