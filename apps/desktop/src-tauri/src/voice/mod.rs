use serde::Serialize;
use tauri::AppHandle;

#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
mod macos;

pub const LEVEL_EVENT: &str = "voice://level";
pub const TRANSCRIPT_EVENT: &str = "voice://transcript";
pub const ENDED_EVENT: &str = "voice://ended";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StartOutcome {
    Listening,
    MicrophoneDenied,
    SpeechDenied,
    Unavailable,
}

#[derive(Debug, Clone, Serialize)]
pub struct Transcript {
    pub text: String,
    pub done: bool,
}

#[tauri::command]
pub fn voice_available() -> bool {
    cfg!(target_os = "macos")
}

#[tauri::command]
pub async fn voice_start(app: AppHandle, language: String) -> StartOutcome {
    #[cfg(target_os = "macos")]
    {
        macos::start(app, language).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, language);
        StartOutcome::Unavailable
    }
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn voice_stop(app: AppHandle) {
    #[cfg(target_os = "macos")]
    macos::stop(&app);
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn voice_cancel(app: AppHandle) {
    #[cfg(target_os = "macos")]
    macos::cancel(&app);
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}
