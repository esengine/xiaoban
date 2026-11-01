mod apps;
mod calendar;
mod hub;
mod island;
mod location;
mod operate;
mod overlay;
mod stored;
mod uploads;
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
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let running = tauri::async_runtime::block_on(hub::start(
                data_dir,
                location::system(app.handle().clone()),
                operate::system(app.handle().clone()),
            ))?;
            app.manage(running);
            island::keep_running_when_closed(app.handle());
            island::create(app.handle())?;
            overlay::create(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hub::hub_endpoint,
            calendar::calendar_sync,
            island::island_resize,
            island::island_drag,
            island::island_open_main,
            island::island_moved,
            island::island_home,
            island::island_snooze,
            island::island_quit,
            uploads::describe_files,
            uploads::stash_file,
            uploads::save_image,
            uploads::preview_image,
            stored::file_open,
            stored::file_reveal,
            stored::file_copy,
            stored::file_save_as,
            stored::pick_folder,
            stored::open_in_editor,
            stored::list_editors,
            voice::voice_available,
            voice::voice_start,
            voice::voice_stop,
            voice::voice_cancel,
        ])
        .build(tauri::generate_context!())
        .expect("failed to build the desktop app");

    app.run(|handle, event| {
        if let RunEvent::Reopen { .. } = event {
            island::show_main(handle);
        }
        if let RunEvent::Exit = event
            && let Some(running) = handle.try_state::<hub::RunningHub>()
        {
            tauri::async_runtime::block_on(running.stop());
        }
    });
}
