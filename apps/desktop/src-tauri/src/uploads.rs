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
    let path = dir.join(clean(&name));
    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

fn unique(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
    let path = std::path::Path::new(name);
    let stem = path
        .file_stem()
        .map_or_else(|| "image".into(), |stem| stem.to_string_lossy());
    let ext = path
        .extension()
        .map(|ext| ext.to_string_lossy().into_owned());
    let named = |index: u32| {
        let base = if index == 0 {
            stem.to_string()
        } else {
            format!("{stem} ({index})")
        };
        dir.join(
            ext.as_ref()
                .map_or(base.clone(), |ext| format!("{base}.{ext}")),
        )
    };
    (0..1_000)
        .map(named)
        .find(|candidate| !candidate.exists())
        .unwrap_or_else(|| dir.join(name))
}

fn clean(name: &str) -> String {
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
    if safe.trim().is_empty() {
        "image.png".to_owned()
    } else {
        safe
    }
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn save_image(app: AppHandle, name: String, bytes: Vec<u8>) -> Result<String, String> {
    let dir = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    let path = unique(&dir, &clean(&name));
    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn preview_image(app: AppHandle, name: String, bytes: Vec<u8>) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let path = stash_file(app.clone(), name, bytes)?;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|error| error.to_string())
}
