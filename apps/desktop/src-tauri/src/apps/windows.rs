use std::path::{Path, PathBuf};
use std::process::Command;

use xiaoban_hub::AppEntry;

fn start_menus() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(data) = std::env::var_os("ProgramData") {
        roots.push(PathBuf::from(data).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    if let Some(data) = std::env::var_os("APPDATA") {
        roots.push(PathBuf::from(data).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    roots
}

fn shortcuts(dir: &Path, depth: u8, found: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() && depth > 0 {
            shortcuts(&path, depth - 1, found);
        } else if path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("lnk"))
        {
            found.push(path);
        }
    }
}

pub fn scan() -> Vec<AppEntry> {
    let mut found = Vec::new();
    for root in start_menus() {
        shortcuts(&root, 2, &mut found);
    }
    let mut apps: Vec<AppEntry> = found
        .into_iter()
        .filter_map(|path| {
            let name = path.file_stem()?.to_string_lossy().into_owned();
            Some(AppEntry {
                id: path.to_string_lossy().into_owned(),
                name,
                aliases: Vec::new(),
            })
        })
        .collect();
    apps.sort_by(|a, b| a.name.cmp(&b.name));
    apps.dedup_by(|a, b| a.name == b.name);
    apps
}

pub fn open(id: &str) -> std::io::Result<()> {
    Command::new("explorer.exe").arg(id).spawn().map(drop)
}
