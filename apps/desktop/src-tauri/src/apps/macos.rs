use std::path::{Path, PathBuf};
use std::process::Command;

use objc2_foundation::{NSBundle, NSFileManager, NSString};
use xiaoban_hub::AppEntry;

const ROOTS: [&str; 4] = [
    "/Applications",
    "/Applications/Utilities",
    "/System/Applications",
    "/System/Applications/Utilities",
];

fn bundles(dir: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.path())
                .filter(|path| path.extension().is_some_and(|ext| ext == "app"))
                .collect()
        })
        .unwrap_or_default()
}

fn text(bundle: &NSBundle, key: &str) -> Option<String> {
    let value = bundle.objectForInfoDictionaryKey(&NSString::from_str(key))?;
    let value = value.downcast_ref::<NSString>()?.to_string();
    (!value.trim().is_empty()).then_some(value)
}

fn entry(path: &Path, files: &NSFileManager) -> Option<AppEntry> {
    let path_text = path.to_str()?;
    let bundle = NSBundle::bundleWithPath(&NSString::from_str(path_text))?;
    let id = bundle.bundleIdentifier()?.to_string();
    let shown = files
        .displayNameAtPath(&NSString::from_str(path_text))
        .to_string();
    let name = shown.strip_suffix(".app").unwrap_or(&shown).to_owned();
    let stem = path.file_stem()?.to_string_lossy().into_owned();
    let mut aliases: Vec<String> = [
        Some(stem),
        text(&bundle, "CFBundleName"),
        text(&bundle, "CFBundleDisplayName"),
    ]
    .into_iter()
    .flatten()
    .filter(|alias| *alias != name)
    .collect();
    aliases.dedup();
    Some(AppEntry { id, name, aliases })
}

pub fn scan() -> Vec<AppEntry> {
    let files = NSFileManager::defaultManager();
    let mut roots: Vec<PathBuf> = ROOTS.iter().map(PathBuf::from).collect();
    if let Some(home) = super::home() {
        roots.push(home.join("Applications"));
    }
    let mut apps: Vec<AppEntry> = roots
        .iter()
        .flat_map(|root| bundles(root))
        .filter_map(|path| entry(&path, &files))
        .collect();
    apps.sort_by(|a, b| a.id.cmp(&b.id));
    apps.dedup_by(|a, b| a.id == b.id);
    apps
}

pub fn open(id: &str) -> std::io::Result<()> {
    let status = Command::new("/usr/bin/open").arg("-b").arg(id).status()?;
    if status.success() {
        Ok(())
    } else {
        Err(std::io::Error::other(format!("open exited with {status}")))
    }
}
