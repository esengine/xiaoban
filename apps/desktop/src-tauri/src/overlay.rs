use tauri::{AppHandle, LogicalPosition, LogicalSize, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "operate-overlay";
pub const POINTER_EVENT: &str = "operate://pointer";

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focused(false)
        .focusable(false)
        .visible(false)
        .build()?;
    window.set_ignore_cursor_events(true)?;
    if let Some(monitor) = window.primary_monitor()? {
        let scale = monitor.scale_factor();
        let position = monitor.position().to_logical::<f64>(scale);
        let size = monitor.size().to_logical::<f64>(scale);
        window.set_position(LogicalPosition::new(position.x, position.y))?;
        window.set_size(LogicalSize::new(size.width, size.height))?;
    }
    window.show()?;
    window.set_ignore_cursor_events(true)
}
