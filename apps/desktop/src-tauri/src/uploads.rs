use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Manager};

const PREVIEW_LIMIT: u64 = 8 * 1024 * 1024;
const UPLOADS: &str = "uploads";
const IMAGES: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedFile {
    path: String,
    name: String,
    size: u64,
    image: bool,
    preview: Option<String>,
}

fn describe(path: &str) -> Option<PickedFile> {
    let file = std::path::Path::new(path);
    let meta = std::fs::metadata(file)
        .ok()
        .filter(std::fs::Metadata::is_file)?;
    let name = file.file_name()?.to_string_lossy().into_owned();
    let ext = file
        .extension()
        .map(|ext| ext.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let mime = IMAGES
        .iter()
        .find(|(known, _)| *known == ext)
        .map(|(_, mime)| *mime);
    let preview = mime
        .filter(|_| meta.len() <= PREVIEW_LIMIT)
        .and_then(|mime| {
            let bytes = std::fs::read(file).ok()?;
            let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
            Some(format!("data:{mime};base64,{encoded}"))
        });
    Some(PickedFile {
        path: path.to_owned(),
        name,
        size: meta.len(),
        image: mime.is_some(),
        preview,
    })
}

#[tauri::command]
pub async fn describe_files(paths: Vec<String>) -> Vec<PickedFile> {
    tauri::async_runtime::spawn_blocking(move || {
        paths.iter().filter_map(|path| describe(path)).collect()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn stash_file(app: AppHandle, name: String, bytes: Vec<u8>) -> Result<String, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join(UPLOADS)
        .join(uuid::Uuid::now_v7().to_string());
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let safe: String = name
        .chars()
        .map(|c| {
            if matches!(c, '/' | '\\' | ':') {
                '_'
            } else {
                c
            }
        })
        .collect();
    let path = dir.join(if safe.trim().is_empty() {
        "image.png".to_owned()
    } else {
        safe
    });
    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
