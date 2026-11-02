//! Taking a workspace's files out as one file or a zip, and bringing files or a zip in. Nothing is
//! ever overwritten on the way in.

use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

const MAX_EXPORT: u64 = 40_000_000;
const MAX_IMPORT: usize = 40_000_000;
const MAX_UNPACKED: u64 = 120_000_000;
const MAX_ENTRIES: usize = 3000;

pub struct Packed {
    pub name: String,
    pub mime: &'static str,
    pub bytes: Vec<u8>,
}

/// What an import did: files written, and files left out because the name was already there or the
/// path was not allowed.
#[derive(Debug, PartialEq, Eq)]
pub struct Imported {
    pub saved: u32,
    pub skipped: u32,
}

fn kept(name: &std::ffi::OsStr) -> bool {
    name != ".git"
}

fn collect(dir: &Path, base: &Path, out: &mut Vec<(PathBuf, PathBuf)>) -> Result<(), String> {
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .collect();
    entries.sort_by_key(std::fs::DirEntry::file_name);
    for entry in entries {
        if !kept(&entry.file_name()) {
            continue;
        }
        let kind = entry.file_type().map_err(|error| error.to_string())?;
        if kind.is_symlink() {
            continue;
        }
        let path = entry.path();
        if kind.is_dir() {
            collect(&path, base, out)?;
        } else if let Ok(relative) = path.strip_prefix(base) {
            out.push((path.clone(), relative.to_path_buf()));
        }
    }
    Ok(())
}

fn slashed(path: &Path) -> String {
    path.components()
        .filter_map(|part| match part {
            Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

/// The whole workspace as a zip, or one file of it as it is.
pub fn export(root: &Path, file: Option<&Path>, workspace_name: &str) -> Result<Packed, String> {
    if let Some(file) = file {
        let size = std::fs::metadata(file).map_err(|error| error.to_string())?.len();
        if !file.is_file() || size > MAX_EXPORT {
            return Err("not a file that can be taken out".to_owned());
        }
        let name = file
            .file_name()
            .map_or_else(|| "file".to_owned(), |name| name.to_string_lossy().into_owned());
        let bytes = std::fs::read(file).map_err(|error| error.to_string())?;
        return Ok(Packed {
            name,
            mime: "application/octet-stream",
            bytes,
        });
    }
    let mut files = Vec::new();
    collect(root, root, &mut files)?;
    let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    let mut total = 0_u64;
    for (path, relative) in files {
        total += std::fs::metadata(&path).map_err(|error| error.to_string())?.len();
        if total > MAX_EXPORT {
            return Err("the workspace is too big to take out at once".to_owned());
        }
        writer
            .start_file(slashed(&relative), options)
            .map_err(|error| error.to_string())?;
        let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
        writer.write_all(&bytes).map_err(|error| error.to_string())?;
    }
    let bytes = writer
        .finish()
        .map_err(|error| error.to_string())?
        .into_inner();
    let stem: String = workspace_name
        .chars()
        .map(|c| if c.is_control() || "\\/:*?\"<>|".contains(c) { '_' } else { c })
        .collect();
    let stem = stem.trim();
    Ok(Packed {
        name: format!("{}.zip", if stem.is_empty() { "workspace" } else { stem }),
        mime: "application/zip",
        bytes,
    })
}

/// A path that does not exist yet: `name`, else `name (2)`, `name (3)`…
fn unused(path: &Path) -> PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let stem = path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default();
    let extension = path
        .extension()
        .map(|extension| format!(".{}", extension.to_string_lossy()));
    let folder = path.parent().unwrap_or(Path::new(""));
    (2..1000)
        .map(|n| folder.join(format!("{stem} ({n}){}", extension.clone().unwrap_or_default())))
        .find(|candidate| !candidate.exists())
        .unwrap_or_else(|| path.to_path_buf())
}

fn plain_name(name: &str) -> Option<String> {
    let name = name.rsplit(['/', '\\']).next().unwrap_or_default().trim();
    (!name.is_empty() && name != "." && name != ".." && kept(std::ffi::OsStr::new(name)))
        .then(|| name.to_owned())
}

/// Bring a file in. A zip is opened into the folder `into`; anything else is put there under its
/// own name (or a free one). Entries whose name already exists are skipped, never replaced.
pub fn import(into: &Path, name: &str, bytes: &[u8]) -> Result<Imported, String> {
    if bytes.len() > MAX_IMPORT {
        return Err("the file is too big".to_owned());
    }
    let name = plain_name(name).ok_or_else(|| "the file has no usable name".to_owned())?;
    std::fs::create_dir_all(into).map_err(|error| error.to_string())?;
    let is_zip = name.to_ascii_lowercase().ends_with(".zip") && bytes.starts_with(b"PK");
    if !is_zip {
        std::fs::write(unused(&into.join(name)), bytes).map_err(|error| error.to_string())?;
        return Ok(Imported { saved: 1, skipped: 0 });
    }
    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|error| error.to_string())?;
    if archive.len() > MAX_ENTRIES {
        return Err("too many files in the zip".to_owned());
    }
    let mut saved = 0;
    let mut skipped = 0;
    let mut unpacked = 0_u64;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let allowed = entry
            .enclosed_name()
            .filter(|relative| relative.components().all(|part| matches!(part, Component::Normal(n) if kept(n))));
        let Some(relative) = allowed else {
            skipped += 1;
            continue;
        };
        let target = into.join(relative);
        if target.exists() {
            skipped += 1;
            continue;
        }
        unpacked += entry.size();
        if unpacked > MAX_UNPACKED {
            return Err("the zip is too big once opened".to_owned());
        }
        if let Some(folder) = target.parent() {
            std::fs::create_dir_all(folder).map_err(|error| error.to_string())?;
        }
        let mut content = Vec::new();
        entry
            .by_ref()
            .take(MAX_UNPACKED)
            .read_to_end(&mut content)
            .map_err(|error| error.to_string())?;
        std::fs::write(&target, content).map_err(|error| error.to_string())?;
        saved += 1;
    }
    Ok(Imported { saved, skipped })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("xiaoban-transfer-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_workspace_goes_out_as_a_zip_without_git_and_comes_back_in() {
        let source = folder();
        std::fs::create_dir_all(source.join("sub")).unwrap();
        std::fs::create_dir_all(source.join(".git")).unwrap();
        std::fs::write(source.join("a.txt"), "one").unwrap();
        std::fs::write(source.join("sub/b.txt"), "two").unwrap();
        std::fs::write(source.join(".git/config"), "secret").unwrap();
        let packed = export(&source, None, "我的/项目").unwrap();
        assert_eq!(packed.name, "我的_项目.zip");

        let target = folder();
        let done = import(&target, &packed.name, &packed.bytes).unwrap();
        assert_eq!(done, Imported { saved: 2, skipped: 0 });
        assert_eq!(std::fs::read_to_string(target.join("sub/b.txt")).unwrap(), "two");
        assert!(!target.join(".git").exists());

        let again = import(&target, &packed.name, &packed.bytes).unwrap();
        assert_eq!(again, Imported { saved: 0, skipped: 2 });
        let _ = std::fs::remove_dir_all(source);
        let _ = std::fs::remove_dir_all(target);
    }

    #[test]
    fn a_file_keeps_its_name_or_takes_a_free_one_and_never_replaces() {
        let target = folder();
        std::fs::write(target.join("note.txt"), "mine").unwrap();
        import(&target, "note.txt", b"theirs").unwrap();
        assert_eq!(std::fs::read_to_string(target.join("note.txt")).unwrap(), "mine");
        assert_eq!(std::fs::read_to_string(target.join("note (2).txt")).unwrap(), "theirs");
        import(&target, "../../evil.txt", b"x").unwrap();
        assert!(target.join("evil.txt").exists(), "a path in the name is cut to the file name");
        assert!(import(&target, "..", b"x").is_err());
        assert!(import(&target, ".git", b"x").is_err());
        let _ = std::fs::remove_dir_all(target);
    }

    #[test]
    fn a_zip_entry_that_climbs_out_or_is_in_git_is_skipped() {
        let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default();
        for name in ["../escape.txt", ".git/hook", "ok.txt"] {
            writer.start_file(name, options).unwrap();
            writer.write_all(b"x").unwrap();
        }
        let bytes = writer.finish().unwrap().into_inner();
        let target = folder();
        let inner = target.join("inner");
        let done = import(&inner, "pack.zip", &bytes).unwrap();
        assert_eq!(done, Imported { saved: 1, skipped: 2 });
        assert!(!target.join("escape.txt").exists());
        let _ = std::fs::remove_dir_all(target);
    }

    #[test]
    fn one_file_goes_out_as_it_is() {
        let source = folder();
        std::fs::write(source.join("a.txt"), "one").unwrap();
        let packed = export(&source, Some(&source.join("a.txt")), "w").unwrap();
        assert_eq!((packed.name.as_str(), packed.bytes.as_slice()), ("a.txt", b"one".as_slice()));
        assert!(export(&source, Some(&source), "w").is_err());
        let _ = std::fs::remove_dir_all(source);
    }
}
