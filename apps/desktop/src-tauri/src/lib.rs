mod calendar;
mod hub;
mod location;
mod voice;

use tauri::{Manager, RunEvent};

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .init();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let running = tauri::async_runtime::block_on(hub::start(
                data_dir,
                location::system(app.handle().clone()),
            ))?;
            app.manage(running);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hub::hub_endpoint,
            calendar::calendar_sync,
            voice::voice_available,
            voice::voice_start,
            voice::voice_stop,
            voice::voice_cancel,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build the desktop app");

    app.run(|handle, event| {
        if let RunEvent::Exit = event
            && let Some(running) = handle.try_state::<hub::RunningHub>()
        {
            tauri::async_runtime::block_on(running.stop());
        }
    });
}
