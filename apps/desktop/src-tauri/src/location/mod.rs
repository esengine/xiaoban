use std::sync::Arc;

use tauri::AppHandle;
use xiaoban_hub::Locator;

#[cfg(target_os = "macos")]
#[allow(unsafe_code, deprecated)]
mod macos;

#[cfg(target_os = "macos")]
pub fn system(app: AppHandle) -> Arc<dyn Locator> {
    Arc::new(macos::CoreLocator::new(app))
}

#[cfg(not(target_os = "macos"))]
pub fn system(_app: AppHandle) -> Arc<dyn Locator> {
    Arc::new(xiaoban_hub::NoLocator)
}
