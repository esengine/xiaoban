use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

pub const LABEL: &str = "island";
pub const MAIN: &str = "main";
pub const OPEN_THREAD_EVENT: &str = "main://open-thread";
const GAP_BELOW_MENU_BAR: f64 = 8.0;
const START_WIDTH: f64 = 132.0;
const START_HEIGHT: f64 = 36.0;

pub fn create(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("")
        .inner_size(START_WIDTH, START_HEIGHT)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focused(false)
        .visible(true)
        .build()?;
    window.set_ignore_cursor_events(true)?;
    place(&window, START_WIDTH, START_HEIGHT)?;
    Ok(window)
}

fn place(window: &WebviewWindow, width: f64, height: f64) -> tauri::Result<()> {
    let Some(monitor) = window.primary_monitor()? else {
        return Ok(());
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let left = f64::from(area.position.x) / scale;
    let top = f64::from(area.position.y) / scale;
    let span = f64::from(area.size.width) / scale;
    window.set_size(LogicalSize::new(width, height))?;
    window.set_position(LogicalPosition::new(
        left + (span - width) / 2.0,
        top + GAP_BELOW_MENU_BAR,
    ))
}

pub fn keep_running_when_closed(app: &AppHandle) {
    let Some(main) = app.get_webview_window(MAIN) else {
        return;
    };
    let handle = main.clone();
    main.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = handle.hide();
        }
    });
}

pub fn show_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window(MAIN) {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
}

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(LABEL)
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn main_visible(app: AppHandle) -> bool {
    app.get_webview_window(MAIN).is_some_and(|main| {
        main.is_visible().unwrap_or(false) && !main.is_minimized().unwrap_or(false)
    })
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn island_resize(app: AppHandle, width: f64, height: f64) {
    if let Some(island) = window(&app) {
        let _ = place(&island, width, height);
    }
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn island_visible(app: AppHandle, visible: bool) {
    if let Some(island) = window(&app) {
        let _ = island.set_ignore_cursor_events(!visible);
    }
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn island_open_main(app: AppHandle, thread_id: Option<String>) {
    show_main(&app);
    if let Some(thread_id) = thread_id {
        let _ = app.emit_to(MAIN, OPEN_THREAD_EVENT, thread_id);
    }
}
