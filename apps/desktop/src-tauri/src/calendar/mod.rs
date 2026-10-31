use serde::Serialize;
use tauri::AppHandle;
use xiaoban_protocol::TripCalendar;

#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
mod macos;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum SyncOutcome {
    Added {
        added: usize,
    },
    #[cfg_attr(target_os = "macos", allow(dead_code))]
    Handed {
        handed: usize,
    },
    Status(Status),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Denied,
    Failed,
}

#[tauri::command]
pub async fn calendar_sync(app: AppHandle, calendar: TripCalendar, name: String) -> SyncOutcome {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        tauri::async_runtime::spawn_blocking(move || macos::sync(&calendar, &name))
            .await
            .unwrap_or(SyncOutcome::Status(Status::Failed))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = name;
        hand_over(&app, &calendar)
    }
}

#[cfg(not(target_os = "macos"))]
fn hand_over(app: &AppHandle, calendar: &TripCalendar) -> SyncOutcome {
    use tauri::Manager;
    use tauri_plugin_opener::OpenerExt;

    let written = app
        .path()
        .temp_dir()
        .map_err(|error| error.to_string())
        .and_then(|dir| {
            let path = dir.join(format!("xiaoban-{}.ics", calendar.trip_id));
            std::fs::write(&path, &calendar.ics).map_err(|error| error.to_string())?;
            app.opener()
                .open_path(path.to_string_lossy(), None::<&str>)
                .map_err(|error| error.to_string())
        });
    match written {
        Ok(()) => SyncOutcome::Handed {
            handed: calendar.events.len(),
        },
        Err(error) => {
            tracing::warn!(%error, "could not hand the trip to the calendar app");
            SyncOutcome::Status(Status::Failed)
        }
    }
}
