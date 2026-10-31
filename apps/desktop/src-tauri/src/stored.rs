use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

fn existing(path: &str) -> Result<std::path::PathBuf, String> {
    let file = std::path::PathBuf::from(path);
    if file.is_file() {
        Ok(file)
    } else {
        Err("the file is gone".to_owned())
    }
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn file_open(app: AppHandle, path: String) -> Result<(), String> {
    let file = existing(&path)?;
    app.opener()
        .open_path(file.to_string_lossy(), None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn file_reveal(path: String) -> Result<(), String> {
    let file = existing(&path)?;
    tauri_plugin_opener::reveal_item_in_dir(file).map_err(|error| error.to_string())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn file_copy(path: String) -> Result<(), String> {
    let file = existing(&path)?;
    copy_to_clipboard(&file)
}

#[cfg(target_os = "macos")]
fn copy_to_clipboard(file: &std::path::Path) -> Result<(), String> {
    use objc2::runtime::ProtocolObject;
    use objc2_app_kit::{NSPasteboard, NSPasteboardWriting};
    use objc2_foundation::{NSArray, NSString, NSURL};
    let url = NSURL::fileURLWithPath(&NSString::from_str(&file.to_string_lossy()));
    let item: objc2::rc::Retained<ProtocolObject<dyn NSPasteboardWriting>> =
        ProtocolObject::from_retained(url);
    let board = NSPasteboard::generalPasteboard();
    board.clearContents();
    if board.writeObjects(&NSArray::from_retained_slice(&[item])) {
        Ok(())
    } else {
        Err("the clipboard refused the file".to_owned())
    }
}

#[cfg(target_os = "windows")]
fn copy_to_clipboard(file: &std::path::Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const NO_WINDOW: u32 = 0x0800_0000;
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command", "Set-Clipboard -LiteralPath $args[0]"])
        .arg(file)
        .creation_flags(NO_WINDOW)
        .status()
        .map_err(|error| error.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("the clipboard refused the file".to_owned())
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn copy_to_clipboard(_file: &std::path::Path) -> Result<(), String> {
    Err("copying files is not supported here".to_owned())
}

#[tauri::command]
pub async fn file_save_as(app: AppHandle, path: String, name: String) -> Result<bool, String> {
    let file = existing(&path)?;
    tauri::async_runtime::spawn_blocking(move || {
        let Some(target) = app.dialog().file().set_file_name(&name).blocking_save_file() else {
            return Ok(false);
        };
        let target = target.into_path().map_err(|error| error.to_string())?;
        std::fs::copy(&file, target).map_err(|error| error.to_string())?;
        Ok(true)
    })
    .await
    .map_err(|error| error.to_string())?
}
