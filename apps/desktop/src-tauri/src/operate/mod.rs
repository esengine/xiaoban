use std::sync::Arc;

use xiaoban_hub::Operator;

#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
mod macos;

#[cfg(target_os = "macos")]
pub fn system(app: tauri::AppHandle) -> Arc<dyn Operator> {
    Arc::new(macos::MacOperator::start(app))
}

#[cfg(not(target_os = "macos"))]
pub fn system(_app: tauri::AppHandle) -> Arc<dyn Operator> {
    Arc::new(xiaoban_hub::NoOperator)
}
