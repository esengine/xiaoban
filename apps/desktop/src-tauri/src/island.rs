use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Monitor, PhysicalPosition,
    WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};

pub const LABEL: &str = "island";
pub const SLOT: &str = "island-slot";
pub const MAIN: &str = "main";
pub const OPEN_THREAD_EVENT: &str = "main://open-thread";
pub const DROPPED_EVENT: &str = "island://dropped";
pub const HOVER_EVENT: &str = "island://hover";
const HOVER_POLL: Duration = Duration::from_millis(100);
const STATE_FILE: &str = "island.json";
const GAP_BELOW_MENU_BAR: f64 = 8.0;
const MARGIN: f64 = 16.0;
const SNAP_DISTANCE: f64 = 40.0;
const SETTLE: Duration = Duration::from_millis(500);
const IDLE: (f64, f64) = (132.0, 36.0);

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
struct Anchor {
    center_x: f64,
    top: f64,
}

#[derive(Debug)]
pub struct Island {
    anchor: Mutex<Option<Anchor>>,
    size: Mutex<(f64, f64)>,
    dragging: AtomicBool,
    moves: AtomicU64,
    file: PathBuf,
}

fn monitor(window: &WebviewWindow) -> Option<Monitor> {
    window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten())
}

fn home(monitor: &Monitor) -> Anchor {
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    Anchor {
        center_x: (f64::from(area.position.x) + f64::from(area.size.width) / 2.0) / scale,
        top: f64::from(area.position.y) / scale + GAP_BELOW_MENU_BAR,
    }
}

fn on_screen(window: &WebviewWindow, anchor: Anchor) -> bool {
    window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .any(|monitor| {
            let scale = monitor.scale_factor();
            let area = monitor.work_area();
            let left = f64::from(area.position.x) / scale;
            let top = f64::from(area.position.y) / scale;
            let right = left + f64::from(area.size.width) / scale;
            let bottom = top + f64::from(area.size.height) / scale;
            (left..right).contains(&anchor.center_x) && (top - MARGIN..bottom).contains(&anchor.top)
        })
}

impl Island {
    fn load(file: PathBuf) -> Self {
        let anchor = std::fs::read(&file)
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok());
        Self {
            anchor: Mutex::new(anchor),
            size: Mutex::new(IDLE),
            dragging: AtomicBool::new(false),
            moves: AtomicU64::new(0),
            file,
        }
    }

    fn save(&self, anchor: Anchor) {
        if let Ok(json) = serde_json::to_vec(&anchor) {
            let _ = std::fs::write(&self.file, json);
        }
    }

    fn anchor(&self, window: &WebviewWindow) -> Anchor {
        let mut slot = self.anchor.lock().unwrap();
        match *slot {
            Some(anchor) if on_screen(window, anchor) => anchor,
            _ => {
                let anchor = monitor(window).map_or(
                    Anchor {
                        center_x: 0.0,
                        top: 0.0,
                    },
                    |monitor| home(&monitor),
                );
                *slot = Some(anchor);
                anchor
            }
        }
    }

    fn place(&self, window: &WebviewWindow) -> tauri::Result<()> {
        let (width, height) = *self.size.lock().unwrap();
        let anchor = self.anchor(window);
        let (outer_width, outer_height) = (width + MARGIN * 2.0, height + MARGIN * 2.0);
        let mut left = anchor.center_x - outer_width / 2.0;
        if let Some(monitor) = monitor(window) {
            let scale = monitor.scale_factor();
            let area = monitor.work_area();
            let min = f64::from(area.position.x) / scale;
            let max = min + f64::from(area.size.width) / scale - outer_width;
            left = left.clamp(min, max.max(min));
        }
        let position = LogicalPosition::new(left, anchor.top - MARGIN);
        window.set_size(LogicalSize::new(outer_width, outer_height))?;
        window.set_position(position)
    }

    fn moved(&self, app: &AppHandle, window: &WebviewWindow, at: PhysicalPosition<i32>) {
        if !self.dragging.load(Ordering::SeqCst) {
            return;
        }
        let Ok(scale) = window.scale_factor() else {
            return;
        };
        let (width, _) = *self.size.lock().unwrap();
        let logical = at.to_logical::<f64>(scale);
        tracing::debug!(
            x = at.x,
            y = at.y,
            lx = logical.x,
            ly = logical.y,
            "island moved"
        );
        *self.anchor.lock().unwrap() = Some(Anchor {
            center_x: logical.x + MARGIN + width / 2.0,
            top: logical.y + MARGIN,
        });
        let round = self.moves.fetch_add(1, Ordering::SeqCst) + 1;
        settle_after(app, round);
    }

    fn dropped(&self, app: &AppHandle) {
        if !self.dragging.swap(false, Ordering::SeqCst) {
            return;
        }
        let Some(window) = app.get_webview_window(LABEL) else {
            return;
        };
        let current = self.anchor(&window);
        let target = monitor(&window)
            .map(|monitor| home(&monitor))
            .filter(|home| {
                (home.center_x - current.center_x).hypot(home.top - current.top) <= SNAP_DISTANCE
            });
        let anchor = target.unwrap_or(current);
        *self.anchor.lock().unwrap() = Some(anchor);
        self.save(anchor);
        let _ = self.place(&window);
        show_slot(app, false);
        let _ = app.emit(DROPPED_EVENT, ());
    }
}

fn hovering(app: &AppHandle, window: &WebviewWindow) -> bool {
    let (Ok(cursor), Ok(origin), Ok(size), Ok(scale)) = (
        app.cursor_position(),
        window.outer_position(),
        window.outer_size(),
        window.scale_factor(),
    ) else {
        return false;
    };
    let margin = MARGIN * scale;
    let left = f64::from(origin.x) + margin;
    let top = f64::from(origin.y) + margin;
    let right = f64::from(origin.x) + f64::from(size.width) - margin;
    let bottom = f64::from(origin.y) + f64::from(size.height) - margin;
    (left..right).contains(&cursor.x) && (top..bottom).contains(&cursor.y)
}

fn main_shown(app: &AppHandle) -> bool {
    app.get_webview_window(MAIN).is_some_and(|main| {
        main.is_visible().unwrap_or(false) && !main.is_minimized().unwrap_or(false)
    })
}

fn watch(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut inside = false;
        let mut shown = false;
        loop {
            tokio::time::sleep(HOVER_POLL).await;
            let Some(window) = app.get_webview_window(LABEL) else {
                return;
            };
            let wanted = !main_shown(&app);
            if wanted != shown {
                shown = wanted;
                let _ = if wanted { window.show() } else { window.hide() };
                if !wanted {
                    show_slot(&app, false);
                }
            }
            let now = shown && hovering(&app, &window);
            if now != inside {
                inside = now;
                tracing::debug!(now, cursor = ?app.cursor_position(), origin = ?window.outer_position(), "island hover");
                let _ = app.emit(HOVER_EVENT, now);
            }
        }
    });
}

fn settle_after(app: &AppHandle, round: u64) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(SETTLE).await;
        let island = app.state::<Island>();
        if island.moves.load(Ordering::SeqCst) == round {
            island.dropped(&app);
        }
    });
}

fn page(app: &AppHandle, label: &str) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("")
        .inner_size(IDLE.0 + MARGIN * 2.0, IDLE.1 + MARGIN * 2.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .focused(false)
        .accept_first_mouse(true)
        .visible(false)
        .build()
}

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let file = app.path().app_data_dir()?.join(STATE_FILE);
    app.manage(Island::load(file));
    let island = page(app, LABEL)?;
    let slot = page(app, SLOT)?;
    slot.set_ignore_cursor_events(true)?;
    let state = app.state::<Island>();
    state.place(&island)?;
    if let Some(monitor) = monitor(&island) {
        let home = home(&monitor);
        let _ = slot.set_position(LogicalPosition::new(
            home.center_x - f64::midpoint(IDLE.0, MARGIN * 2.0),
            home.top - MARGIN,
        ));
    }
    watch(app);
    let handle = app.clone();
    let window = island.clone();
    island.on_window_event(move |event| {
        if let WindowEvent::Moved(at) = event {
            handle.state::<Island>().moved(&handle, &window, *at);
        }
    });
    Ok(())
}

fn show_slot(app: &AppHandle, visible: bool) {
    if let Some(slot) = app.get_webview_window(SLOT) {
        let _ = if visible { slot.show() } else { slot.hide() };
    }
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

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn island_resize(app: AppHandle, island: tauri::State<'_, Island>, width: f64, height: f64) {
    *island.size.lock().unwrap() = (width, height);
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = island.place(&window);
    }
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn island_drag(app: AppHandle, island: tauri::State<'_, Island>) {
    let Some(window) = app.get_webview_window(LABEL) else {
        return;
    };
    island.dragging.store(true, Ordering::SeqCst);
    tracing::debug!(position = ?window.outer_position(), "island drag started");
    show_slot(&app, true);
    let round = island.moves.load(Ordering::SeqCst);
    if window.start_dragging().is_err() {
        island.dropped(&app);
        return;
    }
    settle_after(&app, round);
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn island_open_main(app: AppHandle, thread_id: Option<String>) {
    show_main(&app);
    if let Some(thread_id) = thread_id {
        let _ = app.emit_to(MAIN, OPEN_THREAD_EVENT, thread_id);
    }
}
