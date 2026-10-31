use xiaoban_agent::{ChatMessage, ChatRole};
use xiaoban_i18n::keys;
use xiaoban_protocol::{AutonomyLevel, Event, Preferences, ProtocolError};
use xiaoban_store::{EpochReason, NewMessage};

use crate::state::SharedState;
use crate::turns;

const AUTONOMY_KEY: &str = "autonomy";
const ONBOARDED_KEY: &str = "onboarded";
const PRIMARY_THREAD_KEY: &str = "primary_thread";

pub async fn load(state: &SharedState) -> Result<Preferences, ProtocolError> {
    let autonomy = state
        .store
        .setting(AUTONOMY_KEY)
        .await?
        .as_deref()
        .and_then(AutonomyLevel::parse)
        .unwrap_or_default();
    let onboarded = state.store.setting(ONBOARDED_KEY).await?.as_deref() == Some("true");
    if onboarded {
        ensure_primary_thread(state).await?;
    }
    let primary_thread_id = state.store.setting(PRIMARY_THREAD_KEY).await?;
    Ok(Preferences {
        autonomy,
        onboarded,
        primary_thread_id,
    })
}

pub async fn set_autonomy(state: &SharedState, level: AutonomyLevel) -> Result<(), ProtocolError> {
    Ok(state
        .store
        .set_setting(AUTONOMY_KEY, level.as_str().to_owned())
        .await?)
}

async fn greeting(state: &SharedState) -> Result<Vec<String>, ProtocolError> {
    let name_subject = state.localizer.text(keys::MEMORY_TOPIC_PREFERRED_NAME);
    let name = state
        .store
        .list_memories()
        .await?
        .into_iter()
        .find(|memory| memory.subject == name_subject)
        .map(|memory| memory.value);
    let hello = match name {
        Some(name) => state
            .localizer
            .format(keys::HOME_GREETING_NAMED, &[("name", &name)]),
        None => state.localizer.text(keys::HOME_GREETING),
    };
    Ok(vec![
        hello,
        state.localizer.text(keys::HOME_GREETING_SUGGEST),
    ])
}

async fn ensure_primary_thread(state: &SharedState) -> Result<(), ProtocolError> {
    if state.store.setting(PRIMARY_THREAD_KEY).await?.is_some() {
        return Ok(());
    }
    let thread = state.store.create_thread(None).await?;
    let lines = greeting(state).await?;
    for line in &lines {
        state
            .store
            .append_message(thread.id.clone(), NewMessage::assistant(line.clone()))
            .await?;
    }
    turns::begin_epoch(
        state,
        &thread.id,
        EpochReason::Started,
        lines
            .into_iter()
            .map(|line| ChatMessage::new(ChatRole::Assistant, line))
            .collect(),
    )
    .await?;
    state
        .store
        .set_setting(PRIMARY_THREAD_KEY, thread.id.clone())
        .await?;
    let thread = state.store.thread(thread.id).await?;
    state.publish(Event::ThreadUpdated { thread });
    Ok(())
}

pub async fn complete_onboarding(state: &SharedState) -> Result<(), ProtocolError> {
    ensure_primary_thread(state).await?;
    Ok(state
        .store
        .set_setting(ONBOARDED_KEY, "true".to_owned())
        .await?)
}
