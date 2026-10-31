use xiaoban_protocol::{AutonomyLevel, Preferences, ProtocolError};

use crate::state::SharedState;

const AUTONOMY_KEY: &str = "autonomy";
const ONBOARDED_KEY: &str = "onboarded";

pub async fn load(state: &SharedState) -> Result<Preferences, ProtocolError> {
    let autonomy = state
        .store
        .setting(AUTONOMY_KEY)
        .await?
        .as_deref()
        .and_then(AutonomyLevel::parse)
        .unwrap_or_default();
    let onboarded = state.store.setting(ONBOARDED_KEY).await?.as_deref() == Some("true");
    Ok(Preferences {
        autonomy,
        onboarded,
    })
}

pub async fn set_autonomy(state: &SharedState, level: AutonomyLevel) -> Result<(), ProtocolError> {
    Ok(state
        .store
        .set_setting(AUTONOMY_KEY, level.as_str().to_owned())
        .await?)
}

pub async fn complete_onboarding(state: &SharedState) -> Result<(), ProtocolError> {
    Ok(state
        .store
        .set_setting(ONBOARDED_KEY, "true".to_owned())
        .await?)
}
