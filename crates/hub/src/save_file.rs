//! `save_file`: put a text file the user asked for into their Desktop, Documents or Downloads.
//!
//! A plain conversation has no workspace to write into, so this is the one way it can leave a
//! file behind. It never overwrites, never writes programs or scripts, and asks first.

use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::json;
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{ConfirmChoice, ConfirmKind, DiffKind, DiffLine};

use crate::tools::HubTools;
use crate::workspace;

pub const SAVE_FILE: &str = "save_file";
const FOLDERS_KEY: &str = "save.folders";
const MAX_BYTES: usize = 1_000_000;
const PREVIEW_LINES: usize = 12;
const KINDS: [&str; 3] = ["desktop", "documents", "downloads"];

/// Files that run when opened; leave those to the user.
const REFUSED: [&str; 19] = [
    "exe", "bat", "cmd", "com", "scr", "msi", "dll", "ps1", "psm1", "vbs", "vbe", "wsf", "lnk",
    "reg", "jar", "app", "command", "sh", "pif",
];

pub fn spec(l: &Localizer) -> ToolSpec {
    let text = |key| json!({ "type": "string", "description": l.text(key) });
    ToolSpec {
        name: SAVE_FILE.to_owned(),
        description: l.text(keys::TOOL_SAVE_FILE_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "name": text(keys::TOOL_SAVE_FILE_NAME),
                "content": text(keys::TOOL_SAVE_FILE_CONTENT),
                "folder": {
                    "type": "string",
                    "enum": KINDS,
                    "description": l.text(keys::TOOL_SAVE_FILE_FOLDER),
                },
                "open": {
                    "type": "boolean",
                    "description": l.text(keys::TOOL_SAVE_FILE_OPEN),
                },
            },
            "required": ["name", "content"],
        }),
    }
}

#[derive(Deserialize)]
struct Args {
    name: String,
    content: String,
    #[serde(default)]
    folder: Option<String>,
    #[serde(default)]
    open: bool,
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

/// Where Desktop, Documents and Downloads are. A Windows desktop backed up by `OneDrive` lives
/// under `OneDrive`, not under the profile folder.
fn folder_for(kind: &str, home: &Path, onedrive: &[PathBuf]) -> Option<PathBuf> {
    let leaf = match kind {
        "desktop" => "Desktop",
        "documents" => "Documents",
        "downloads" => "Downloads",
        _ => return None,
    };
    onedrive
        .iter()
        .map(|root| root.join(leaf))
        .chain([home.join(leaf)])
        .find(|candidate| candidate.is_dir())
        .or_else(|| Some(home.join(leaf)))
}

fn onedrive_roots() -> Vec<PathBuf> {
    ["OneDrive", "OneDriveConsumer", "OneDriveCommercial"]
        .into_iter()
        .filter_map(std::env::var_os)
        .map(PathBuf::from)
        .collect()
}

/// A plain file name: no folders, nothing the file system would reject, not a program.
fn clean_name(name: &str) -> Result<String, &'static str> {
    let name = name.trim();
    if name.is_empty() || name.len() > 120 {
        return Err("the file name must be 1 to 120 characters");
    }
    if name == "." || name == ".." || name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|']) {
        return Err("the file name must be a plain name without folders or special characters; use the folder argument for where it goes");
    }
    if name.chars().any(char::is_control) || name.ends_with('.') || name.ends_with(' ') {
        return Err("the file name has characters the file system will not accept");
    }
    let extension = Path::new(name)
        .extension()
        .and_then(|part| part.to_str())
        .map(str::to_lowercase);
    match extension {
        Some(extension) if REFUSED.contains(&extension.as_str()) => Err(
            "programs and scripts are not saved from here; tell the user the code and let them save it themselves",
        ),
        _ => Ok(name.to_owned()),
    }
}

fn preview(content: &str) -> Vec<DiffLine> {
    content
        .lines()
        .take(PREVIEW_LINES)
        .enumerate()
        .map(|(index, line)| DiffLine {
            kind: DiffKind::Added,
            old: None,
            new: u32::try_from(index + 1).ok(),
            text: line.chars().take(200).collect(),
        })
        .collect()
}

/// Writes a new file; never replaces one that is there.
fn write_new(folder: &Path, name: &str, content: &str) -> Result<PathBuf, String> {
    std::fs::create_dir_all(folder).map_err(|failure| failure.to_string())?;
    let target = folder.join(name);
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|failure| {
            if failure.kind() == std::io::ErrorKind::AlreadyExists {
                "a file with that name is already there; pick another name, and never replace the user's file".to_owned()
            } else {
                failure.to_string()
            }
        })?;
    std::io::Write::write_all(&mut file, content.as_bytes()).map_err(|failure| failure.to_string())?;
    Ok(target)
}

fn open_with_default(path: &Path) {
    let mut command = if cfg!(windows) {
        std::process::Command::new("explorer")
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open")
    } else {
        std::process::Command::new("xdg-open")
    };
    let _ = command
        .arg(path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
}

impl HubTools<'_> {
    async fn remembered_folders(&self) -> Vec<String> {
        self.state
            .store
            .setting_owned(FOLDERS_KEY.to_owned())
            .await
            .ok()
            .flatten()
            .and_then(|value| serde_json::from_str(&value).ok())
            .unwrap_or_default()
    }

    pub(crate) async fn save_file(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<Args>(arguments) else {
            return error("arguments must be {name, content, folder?, open?}");
        };
        let name = match clean_name(&args.name) {
            Ok(name) => name,
            Err(message) => return error(message),
        };
        if args.content.len() > MAX_BYTES {
            return error("the content is over 1 MB; save a smaller file");
        }
        let kind = args.folder.as_deref().unwrap_or("desktop");
        let Some(home) = workspace::home() else {
            return error("could not find the user's home folder");
        };
        let Some(folder) = folder_for(kind, &home, &onedrive_roots()) else {
            return error("folder must be desktop, documents or downloads");
        };
        let target = folder.join(&name);
        if target.exists() {
            return error("a file with that name is already there; pick another name, and never replace the user's file");
        }
        let shown = target.to_string_lossy().into_owned();
        let folder_text = folder.to_string_lossy().into_owned();
        if !self.remembered_folders().await.contains(&folder_text) {
            match self
                .ask(ConfirmKind::SaveFile {
                    path: shown.clone(),
                    folder: folder_text.clone(),
                    preview: preview(&args.content),
                })
                .await
            {
                ConfirmChoice::Always => {
                    let mut folders = self.remembered_folders().await;
                    folders.push(folder_text);
                    let _ = self
                        .state
                        .store
                        .set_setting_owned(
                            FOLDERS_KEY.to_owned(),
                            serde_json::to_string(&folders).unwrap_or_default(),
                        )
                        .await;
                }
                ConfirmChoice::Once | ConfirmChoice::Yes => {}
                _ => return error("the user did not want the file saved; tell them the content instead"),
            }
        }
        match write_new(&folder, &name, &args.content) {
            Ok(path) => {
                let opened = args.open && !self.state.operator.is_phone();
                if opened {
                    open_with_default(&path);
                }
                json!({ "saved": path.to_string_lossy(), "opened": opened }).to_string()
            }
            Err(message) => error(&message),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_are_plain_and_never_programs() {
        assert_eq!(clean_name(" 小车.html ").as_deref(), Ok("小车.html"));
        assert_eq!(clean_name("notes.md").as_deref(), Ok("notes.md"));
        for bad in ["", "..", "a/b.txt", "a\\b.txt", "x:y.txt", "a?.txt", "tail.", "run.EXE", "go.bat", "x.ps1", "x.sh"] {
            assert!(clean_name(bad).is_err(), "{bad} should be refused");
        }
        assert!(clean_name(&"a".repeat(121)).is_err());
    }

    #[test]
    fn the_desktop_follows_onedrive_when_it_is_there() {
        let base = std::env::temp_dir().join(format!("xiaoban-save-{}", uuid::Uuid::now_v7()));
        let home = base.join("home");
        let cloud = base.join("OneDrive");
        std::fs::create_dir_all(home.join("Desktop")).unwrap();
        std::fs::create_dir_all(cloud.join("Desktop")).unwrap();
        assert_eq!(folder_for("desktop", &home, std::slice::from_ref(&cloud)), Some(cloud.join("Desktop")));
        assert_eq!(folder_for("desktop", &home, &[]), Some(home.join("Desktop")));
        // No Documents folder anywhere: fall back to the plain home one, to be created.
        assert_eq!(folder_for("documents", &home, &[cloud]), Some(home.join("Documents")));
        assert_eq!(folder_for("system", &home, &[]), None);
        let _ = std::fs::remove_dir_all(base);
    }

    #[test]
    fn a_file_is_written_once_and_never_replaced() {
        let folder = std::env::temp_dir().join(format!("xiaoban-save-{}", uuid::Uuid::now_v7()));
        let path = write_new(&folder, "bike.html", "<h1>骑车</h1>\n").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "<h1>骑车</h1>\n");
        let again = write_new(&folder, "bike.html", "other").unwrap_err();
        assert!(again.contains("already there"), "{again}");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "<h1>骑车</h1>\n");
        let _ = std::fs::remove_dir_all(folder);
    }

    #[test]
    fn the_preview_shows_the_start_of_the_file() {
        let lines = preview(&"line\n".repeat(30));
        assert_eq!(lines.len(), PREVIEW_LINES);
        assert_eq!(lines[0].new, Some(1));
        assert!(lines.iter().all(|line| line.kind == DiffKind::Added));
    }
}
