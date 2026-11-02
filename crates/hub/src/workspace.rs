use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;

use xiaoban_protocol::{Branch, ChangeStatus, ChangedFile, DirEntry, GitInfo, Workspace};

use crate::state::SharedState;

const GIT_TIMEOUT: Duration = Duration::from_secs(20);
const DIR_LIMIT: usize = 2_000;

pub fn home() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)
}

pub fn expand(input: &str) -> PathBuf {
    let trimmed = input.trim();
    if let Some(rest) = trimmed.strip_prefix("~/").or_else(|| trimmed.strip_prefix("~\\"))
        && let Some(home) = home()
    {
        return home.join(rest);
    }
    if trimmed == "~"
        && let Some(home) = home()
    {
        return home;
    }
    PathBuf::from(trimmed)
}

fn lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for part in path.components() {
        match part {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

pub fn real(path: &Path) -> PathBuf {
    let path = lexical(path);
    let mut existing = path.clone();
    let mut rest = Vec::new();
    while !existing.exists() {
        let Some(name) = existing.file_name().map(std::ffi::OsStr::to_os_string) else {
            break;
        };
        rest.push(name);
        if !existing.pop() {
            break;
        }
    }
    let mut resolved = std::fs::canonicalize(&existing).unwrap_or(existing);
    for name in rest.into_iter().rev() {
        resolved.push(name);
    }
    resolved
}

pub struct Target {
    pub path: PathBuf,
    pub inside: bool,
}

pub fn root(workspace: &Workspace) -> PathBuf {
    real(Path::new(&workspace.path))
}

pub fn resolve(workspace: &Workspace, input: &str) -> Target {
    let root = root(workspace);
    let given = expand(input);
    let joined = if given.is_absolute() {
        given
    } else {
        root.join(given)
    };
    let path = real(&joined);
    let inside = path.starts_with(&root);
    Target { path, inside }
}

pub fn shown(workspace: &Workspace, path: &Path) -> String {
    let root = root(workspace);
    if let Ok(relative) = path.strip_prefix(&root) {
        let text = relative.to_string_lossy().replace('\\', "/");
        return if text.is_empty() { ".".to_owned() } else { text };
    }
    pretty(path)
}

pub fn pretty(path: &Path) -> String {
    if let Some(home) = home()
        && let Ok(relative) = path.strip_prefix(&home)
    {
        return format!("~/{}", relative.to_string_lossy().replace('\\', "/"));
    }
    path.to_string_lossy().into_owned()
}

/// Where workspaces made by `NewWorkspace` live; `None` for a hub without a data folder.
pub fn managed_root(state: &SharedState) -> Option<PathBuf> {
    state.data_dir.as_ref().map(|dir| dir.join("workspaces"))
}

/// A name that is safe to use as a folder name on any system: no separators or characters a file
/// system rejects, no leading or trailing dots and spaces, and not too long.
pub fn safe_folder_name(name: &str) -> Option<String> {
    let cleaned: String = name
        .trim()
        .chars()
        .map(|c| if c.is_control() || "\\/:*?\"<>|".contains(c) { '_' } else { c })
        .collect();
    let cleaned: String = cleaned.trim_matches(|c: char| c == '.' || c.is_whitespace()).chars().take(60).collect();
    (!cleaned.is_empty()).then_some(cleaned)
}

/// Creates an empty folder for a workspace, adding a number when the name is already taken.
pub fn fresh_folder(root: &Path, name: &str) -> Result<PathBuf, String> {
    let base = safe_folder_name(name).ok_or("the name has nothing usable in it")?;
    std::fs::create_dir_all(root).map_err(|failure| failure.to_string())?;
    for number in 1..1000 {
        let leaf = if number == 1 { base.clone() } else { format!("{base} {number}") };
        let candidate = root.join(leaf);
        match std::fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(failure) if failure.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(failure) => return Err(failure.to_string()),
        }
    }
    Err("too many workspaces with that name".to_owned())
}

pub fn folder_name(path: &Path) -> String {
    path.file_name()
        .map_or_else(|| path.to_string_lossy().into_owned(), |name| name.to_string_lossy().into_owned())
}

pub async fn for_thread(state: &SharedState, thread_id: &str) -> Option<Workspace> {
    let thread = state.store.thread(thread_id.to_owned()).await.ok()?;
    let id = thread.workspace_id?;
    state.store.workspace(id).await.ok()
}

pub fn list_dir(workspace: &Workspace, input: &str) -> Result<Vec<DirEntry>, String> {
    let target = resolve(workspace, input);
    if !target.inside {
        return Err("outside the workspace".to_owned());
    }
    let reader = std::fs::read_dir(&target.path).map_err(|failure| failure.to_string())?;
    let mut entries: Vec<DirEntry> = reader
        .filter_map(Result::ok)
        .filter(|entry| entry.file_name() != ".git")
        .take(DIR_LIMIT)
        .map(|entry| {
            let path = entry.path();
            DirEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                dir: path.is_dir(),
                path: shown(workspace, &path),
            }
        })
        .collect();
    entries.sort_by(|a, b| b.dir.cmp(&a.dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

fn find_git() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let names: &[&str] = if cfg!(windows) { &["git.exe", "git.cmd"] } else { &["git"] };
    let mut dirs: Vec<PathBuf> = std::env::split_paths(&path).collect();
    if cfg!(target_os = "macos") {
        dirs.extend(["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from));
    }
    for dir in dirs {
        for name in names {
            let candidate = dir.join(name);
            if !candidate.is_file() {
                continue;
            }
            if cfg!(target_os = "macos") && candidate == Path::new("/usr/bin/git") {
                let tools = std::process::Command::new("xcode-select").arg("-p").output();
                if !tools.is_ok_and(|output| output.status.success()) {
                    continue;
                }
            }
            return Some(candidate);
        }
    }
    None
}

pub fn git_binary() -> Option<&'static Path> {
    static GIT: OnceLock<Option<PathBuf>> = OnceLock::new();
    GIT.get_or_init(find_git).as_deref()
}

pub struct GitOutput {
    pub ok: bool,
    pub stdout: String,
    pub stderr: String,
}

pub async fn git(dir: &Path, args: &[&str]) -> Option<GitOutput> {
    let binary = git_binary()?;
    let mut command = tokio::process::Command::new(binary);
    command
        .args(args)
        .current_dir(dir)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .kill_on_drop(true);
    let output = tokio::time::timeout(GIT_TIMEOUT, command.output()).await.ok()?.ok()?;
    Some(GitOutput {
        ok: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}

pub async fn is_repository(dir: &Path) -> bool {
    git(dir, &["rev-parse", "--is-inside-work-tree"])
        .await
        .is_some_and(|output| output.ok && output.stdout.trim() == "true")
}

fn parse_branch(line: &str) -> (Option<String>, Option<String>, u32, u32) {
    let head = line.trim_start_matches("## ");
    let (names, counts) = head.split_once(" [").map_or((head, ""), |(a, b)| (a, b));
    let (branch, upstream) = names
        .split_once("...")
        .map_or((names.to_owned(), None), |(a, b)| (a.to_owned(), Some(b.to_owned())));
    let branch = branch
        .strip_prefix("No commits yet on ")
        .map_or(branch.clone(), str::to_owned);
    let number = |label: &str| {
        counts
            .split(", ")
            .find_map(|part| part.trim_end_matches(']').strip_prefix(label))
            .and_then(|n| n.trim().parse().ok())
            .unwrap_or(0)
    };
    let branch = (branch != "HEAD (no branch)").then_some(branch);
    (branch, upstream, number("ahead "), number("behind "))
}

pub async fn info(workspace: &Workspace) -> GitInfo {
    let dir = root(workspace);
    let mut info = GitInfo {
        installed: git_binary().is_some(),
        repository: false,
        branch: None,
        upstream: None,
        ahead: 0,
        behind: 0,
        changed: Vec::new(),
        stash: None,
        operation: None,
        conflicts: Vec::new(),
    };
    if !info.installed || !is_repository(&dir).await {
        return info;
    }
    info.repository = true;
    let Some(status) = git(&dir, &["status", "--porcelain=v1", "-b", "--untracked-files=all"]).await else {
        return info;
    };
    let mut lines = status.stdout.lines();
    if let Some(first) = lines.next() {
        (info.branch, info.upstream, info.ahead, info.behind) = parse_branch(first);
    }
    if let Some(branch) = &info.branch {
        info.stash = stash_for(&dir, branch).await;
    }
    let counts = git(&dir, &["diff", "HEAD", "--numstat"]).await;
    let numstat: Vec<(u32, u32, String)> = counts
        .map(|output| {
            output
                .stdout
                .lines()
                .filter_map(|line| {
                    let mut parts = line.splitn(3, '\t');
                    let added = parts.next()?.parse().unwrap_or(0);
                    let removed = parts.next()?.parse().unwrap_or(0);
                    Some((added, removed, parts.next()?.to_owned()))
                })
                .collect()
        })
        .unwrap_or_default();
    info.operation = crate::conflicts::operation(&dir).map(str::to_owned);
    for line in lines {
        if line.len() < 4 {
            continue;
        }
        if crate::conflicts::conflicted(line) {
            info.conflicts.push(line[3..].trim_matches('"').to_owned());
        }
        let code = &line[..2];
        let path = line[3..].rsplit(" -> ").next().unwrap_or_default().trim_matches('"').to_owned();
        let status = if code.contains('?') || code.contains('A') {
            ChangeStatus::Added
        } else if code.contains('D') {
            ChangeStatus::Deleted
        } else {
            ChangeStatus::Modified
        };
        let (added, removed) = numstat
            .iter()
            .find(|(_, _, name)| *name == path)
            .map_or((0, 0), |(a, r, _)| (*a, *r));
        info.changed.push(ChangedFile {
            path,
            status,
            added,
            removed,
        });
    }
    info
}

fn track(text: &str) -> (u32, u32) {
    let number = |label: &str| {
        text.trim_matches(['[', ']'])
            .split(", ")
            .find_map(|part| part.strip_prefix(label))
            .and_then(|n| n.trim().parse().ok())
            .unwrap_or(0)
    };
    (number("ahead "), number("behind "))
}

pub async fn branches(workspace: &Workspace) -> Vec<Branch> {
    let dir = root(workspace);
    let Some(output) = git(
        &dir,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname)%09%(HEAD)%09%(committerdate:unix)%09%(upstream:short)%09%(upstream:track)",
            "refs/heads",
            "refs/remotes",
        ],
    )
    .await
    else {
        return Vec::new();
    };
    let mut list: Vec<Branch> = output
        .stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.split('\t');
            let full = parts.next()?;
            let head = parts.next()? == "*";
            let time: i64 = parts.next()?.parse().unwrap_or(0);
            let upstream = parts.next().filter(|value| !value.is_empty()).map(str::to_owned);
            let (ahead, behind) = track(parts.next().unwrap_or_default());
            let (name, remote) = if let Some(local) = full.strip_prefix("refs/heads/") {
                (local.to_owned(), false)
            } else {
                (full.strip_prefix("refs/remotes/")?.to_owned(), true)
            };
            (!name.ends_with("/HEAD")).then_some(Branch {
                name,
                current: head,
                remote,
                upstream,
                ahead,
                behind,
                updated_at: time * 1000,
            })
        })
        .collect();
    let locals: Vec<String> = list.iter().filter(|b| !b.remote).map(|b| b.name.clone()).collect();
    list.retain(|branch| {
        !branch.remote
            || !locals
                .iter()
                .any(|local| branch.name.split_once('/').is_some_and(|(_, rest)| rest == local))
    });
    list
}

fn failed(output: Option<GitOutput>) -> Result<(), String> {
    match output {
        Some(output) if output.ok => Ok(()),
        Some(output) => Err(output.stderr.trim().lines().last().unwrap_or("git failed").to_owned()),
        None => Err("git did not answer".to_owned()),
    }
}

pub async fn switch(workspace: &Workspace, name: &str, create: bool, stash: bool) -> Result<(), String> {
    let dir = root(workspace);
    let name = name.trim();
    if name.is_empty() || name.starts_with('-') {
        return Err("bad branch name".to_owned());
    }
    if stash {
        let from = info(workspace).await.branch.unwrap_or_default();
        let message = format!("xiaoban: {from}");
        failed(git(&dir, &["stash", "push", "--include-untracked", "-m", &message]).await)?;
    }
    if create {
        return failed(git(&dir, &["switch", "-c", name]).await);
    }
    let local = name.split_once('/').map_or(name, |(_, rest)| rest);
    let remote = branches(workspace).await.into_iter().any(|b| b.remote && b.name == name);
    if remote {
        return failed(git(&dir, &["switch", local]).await);
    }
    failed(git(&dir, &["switch", name]).await)
}

async fn stash_for(dir: &Path, branch: &str) -> Option<String> {
    let list = git(dir, &["stash", "list", "--format=%gd%x09%gs"]).await?;
    let mark = format!("xiaoban: {branch}");
    list.stdout.lines().find_map(|line| {
        let (reference, subject) = line.split_once('\t')?;
        subject.ends_with(&mark).then(|| reference.to_owned())
    })
}

pub async fn restore(workspace: &Workspace) -> Result<(), String> {
    let dir = root(workspace);
    let branch = info(workspace).await.branch.ok_or("no branch")?;
    let reference = stash_for(&dir, &branch).await.ok_or("nothing put aside on this branch")?;
    failed(git(&dir, &["stash", "pop", &reference]).await)
}

pub async fn pull(workspace: &Workspace) -> Result<(), String> {
    failed(git(&root(workspace), &["pull", "--ff-only"]).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_names_are_safe_on_every_system() {
        assert_eq!(safe_folder_name(" 周报:模板/v2 ").as_deref(), Some("周报_模板_v2"));
        assert_eq!(safe_folder_name(r"a\b*c?").as_deref(), Some("a_b_c_"));
        assert_eq!(safe_folder_name("..hidden.. ").as_deref(), Some("hidden"));
        assert_eq!(safe_folder_name("   "), None);
        assert_eq!(safe_folder_name("..."), None);
        assert_eq!(safe_folder_name(&"x".repeat(100)).unwrap().chars().count(), 60);
    }

    #[test]
    fn a_taken_name_gets_a_number() {
        let root = std::env::temp_dir().join(format!("xiaoban-fresh-{}", uuid::Uuid::now_v7()));
        let first = fresh_folder(&root, "demo").unwrap();
        let second = fresh_folder(&root, "demo").unwrap();
        let third = fresh_folder(&root, "demo").unwrap();
        assert_eq!(first.file_name().unwrap(), "demo");
        assert_eq!(second.file_name().unwrap(), "demo 2");
        assert_eq!(third.file_name().unwrap(), "demo 3");
        assert!(fresh_folder(&root, "///").is_ok(), "a name of only separators still gets a folder");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn reads_branch_lines() {
        assert_eq!(
            parse_branch("## fix/login...origin/fix/login [ahead 2, behind 1]"),
            (Some("fix/login".to_owned()), Some("origin/fix/login".to_owned()), 2, 1)
        );
        assert_eq!(parse_branch("## main"), (Some("main".to_owned()), None, 0, 0));
        assert_eq!(parse_branch("## No commits yet on main"), (Some("main".to_owned()), None, 0, 0));
    }

    #[test]
    fn keeps_paths_inside_the_root() {
        let dir = std::env::temp_dir().join(format!("xiaoban-ws-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(dir.join("src")).unwrap();
        let workspace = Workspace {
            id: "w".to_owned(),
            name: "w".to_owned(),
            path: dir.to_string_lossy().into_owned(),
            created_at: 0,
            active_at: 0,
        };
        assert!(resolve(&workspace, "src/new.rs").inside);
        assert!(!resolve(&workspace, "../escape.txt").inside);
        assert!(!resolve(&workspace, "src/../../escape.txt").inside);
        assert_eq!(shown(&workspace, &resolve(&workspace, "src/a.rs").path), "src/a.rs");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[tokio::test]
    async fn switches_branches_and_keeps_changes_aside() {
        if git_binary().is_none() {
            return;
        }
        let dir = std::env::temp_dir().join(format!("xiaoban-git-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(&dir).unwrap();
        let run = |args: &[&str]| {
            std::process::Command::new("git")
                .args(args)
                .current_dir(&dir)
                .output()
                .unwrap()
        };
        run(&["init", "-q", "-b", "main"]);
        std::fs::write(dir.join("a.txt"), "one\n").unwrap();
        run(&["add", "."]);
        run(&["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init"]);
        let workspace = Workspace {
            id: "w".to_owned(),
            name: "w".to_owned(),
            path: dir.to_string_lossy().into_owned(),
            created_at: 0,
            active_at: 0,
        };
        switch(&workspace, "feature", true, false).await.unwrap();
        assert_eq!(info(&workspace).await.branch.as_deref(), Some("feature"));
        std::fs::write(dir.join("a.txt"), "two\n").unwrap();
        switch(&workspace, "main", false, true).await.unwrap();
        let now = info(&workspace).await;
        assert_eq!(now.branch.as_deref(), Some("main"));
        assert_eq!(now.changed, Vec::new());
        let names: Vec<String> = branches(&workspace).await.into_iter().map(|b| b.name).collect();
        assert!(names.contains(&"feature".to_owned()) && names.contains(&"main".to_owned()));
        switch(&workspace, "feature", false, false).await.unwrap();
        assert!(info(&workspace).await.stash.is_some());
        restore(&workspace).await.unwrap();
        let back = info(&workspace).await;
        assert_eq!((back.changed.len(), back.stash), (1, None));
        assert!(switch(&workspace, "-x", false, false).await.is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
