use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{ConfirmChoice, ConfirmKind, DiffKind, DiffLine, Event, Workspace};

use crate::tools::HubTools;
use crate::workspace::{self, Target};

pub const LIST_DIR: &str = "list_dir";
pub const READ_FILE: &str = "read_file";
pub const SEARCH_FILES: &str = "search_files";
pub const WRITE_FILE: &str = "write_file";
pub const EDIT_FILE: &str = "edit_file";
pub const RUN_COMMAND: &str = "run_command";
pub const DELETE_FILE: &str = "delete_file";
pub const MOVE_FILE: &str = "move_file";
const MAX_TREE_FILES: usize = 200;
const MAX_TREE_BYTES: u64 = 20 * 1024 * 1024;

const READ_LINES: usize = 2_000;
const LIST_LIMIT: usize = 500;
const HITS: usize = 200;
const SEARCH_BYTES: u64 = 1_000_000;
const PREVIEW_LINES: usize = 14;
pub const READ_FOLDERS: &str = "workspace.read.";
pub const WRITE_FOLDERS: &str = "workspace.write.";

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

fn spec(name: &str, description: String, properties: &Value, required: &[&str]) -> ToolSpec {
    ToolSpec {
        name: name.to_owned(),
        description,
        parameters: json!({
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": false,
        }),
    }
}

pub fn specs(l: &Localizer) -> Vec<ToolSpec> {
    vec![
        spec(
            LIST_DIR,
            l.text(keys::TOOL_LIST_DIR_DESCRIPTION),
            &json!({
                "path": text(l, keys::TOOL_CODE_PATH),
                "depth": { "type": "integer", "minimum": 1, "maximum": 3, "description": l.text(keys::TOOL_LIST_DIR_DEPTH) },
            }),
            &[],
        ),
        spec(
            READ_FILE,
            l.text(keys::TOOL_READ_FILE_DESCRIPTION),
            &json!({
                "path": text(l, keys::TOOL_CODE_PATH),
                "from": { "type": "integer", "minimum": 1, "description": l.text(keys::TOOL_READ_FILE_FROM) },
                "to": { "type": "integer", "minimum": 1, "description": l.text(keys::TOOL_READ_FILE_TO) },
            }),
            &["path"],
        ),
        spec(
            SEARCH_FILES,
            l.text(keys::TOOL_SEARCH_FILES_DESCRIPTION),
            &json!({
                "query": text(l, keys::TOOL_SEARCH_FILES_QUERY),
                "path": text(l, keys::TOOL_CODE_PATH),
                "names": { "type": "boolean", "description": l.text(keys::TOOL_SEARCH_FILES_NAMES) },
            }),
            &["query"],
        ),
        spec(
            WRITE_FILE,
            l.text(keys::TOOL_WRITE_FILE_DESCRIPTION),
            &json!({
                "path": text(l, keys::TOOL_CODE_PATH),
                "content": text(l, keys::TOOL_WRITE_FILE_CONTENT),
            }),
            &["path", "content"],
        ),
        spec(
            EDIT_FILE,
            l.text(keys::TOOL_EDIT_FILE_DESCRIPTION),
            &json!({
                "path": text(l, keys::TOOL_CODE_PATH),
                "old": text(l, keys::TOOL_EDIT_FILE_OLD),
                "new": text(l, keys::TOOL_EDIT_FILE_NEW),
                "all": { "type": "boolean", "description": l.text(keys::TOOL_EDIT_FILE_ALL) },
            }),
            &["path", "old", "new"],
        ),
        spec(
            RUN_COMMAND,
            l.text(keys::TOOL_RUN_COMMAND_DESCRIPTION),
            &json!({
                "command": text(l, keys::TOOL_RUN_COMMAND_COMMAND),
                "reason": text(l, keys::TOOL_RUN_COMMAND_REASON),
            }),
            &["command", "reason"],
        ),
        spec(
            DELETE_FILE,
            l.text(keys::TOOL_DELETE_FILE_DESCRIPTION),
            &json!({ "path": text(l, keys::TOOL_CODE_PATH) }),
            &["path"],
        ),
        spec(
            MOVE_FILE,
            l.text(keys::TOOL_MOVE_FILE_DESCRIPTION),
            &json!({
                "from": text(l, keys::TOOL_MOVE_FILE_FROM),
                "to": text(l, keys::TOOL_MOVE_FILE_TO),
            }),
            &["from", "to"],
        ),
    ]
}

pub fn is_code_tool(name: &str) -> bool {
    matches!(
        name,
        LIST_DIR
            | READ_FILE
            | SEARCH_FILES
            | WRITE_FILE
            | EDIT_FILE
            | RUN_COMMAND
            | DELETE_FILE
            | MOVE_FILE
            | crate::vcs_tools::GIT
            | crate::vcs_tools::GH
    )
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

pub fn digest(bytes: &[u8]) -> String {
    hex::encode(&Sha256::digest(bytes)[..12])
}

#[derive(Deserialize)]
struct PathArgs {
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    depth: Option<usize>,
}

#[derive(Deserialize)]
struct ReadArgs {
    path: String,
    #[serde(default)]
    from: Option<usize>,
    #[serde(default)]
    to: Option<usize>,
}

#[derive(Deserialize)]
struct SearchArgs {
    query: String,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    names: bool,
}

#[derive(Deserialize)]
struct WriteArgs {
    path: String,
    content: String,
}

#[derive(Deserialize)]
struct EditArgs {
    path: String,
    old: String,
    new: String,
    #[serde(default)]
    all: bool,
}

#[derive(Deserialize)]
struct DeleteArgs {
    path: String,
}

#[derive(Deserialize)]
struct MoveArgs {
    from: String,
    to: String,
}

#[derive(Deserialize)]
struct CommandArgs {
    command: String,
}

fn walk(root: &Path, depth: Option<usize>) -> ignore::Walk {
    let mut builder = ignore::WalkBuilder::new(root);
    builder
        .hidden(false)
        .git_ignore(true)
        .git_global(false)
        .parents(true)
        .require_git(false)
        .filter_entry(|entry| entry.file_name() != ".git")
        .max_depth(depth);
    builder.build()
}

/// Never touch the workspace folder itself or anything under a `.git` folder.
fn guard_tree(workspace: &Workspace, path: &Path) -> Result<(), String> {
    if path == workspace::root(workspace) {
        return Err(error("that is the workspace folder itself"));
    }
    if path.components().any(|part| part.as_os_str() == ".git") {
        return Err(error("git's own folder is off limits; use the git tool instead"));
    }
    Ok(())
}

/// Every file under a folder, refusing trees too big to keep a baseline of.
fn tree_files(folder: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    let mut bytes = 0_u64;
    let mut walk = ignore::WalkBuilder::new(folder);
    walk.standard_filters(false).hidden(false);
    for entry in walk.build() {
        let entry = entry.map_err(|failure| error(&failure.to_string()))?;
        if !entry.file_type().is_some_and(|kind| kind.is_file()) {
            continue;
        }
        if entry.path().components().any(|part| part.as_os_str() == ".git") {
            return Err(error("that folder contains a .git folder; leave it to the user"));
        }
        bytes += entry.metadata().map_or(0, |meta| meta.len());
        files.push(entry.into_path());
        if files.len() > MAX_TREE_FILES || bytes > MAX_TREE_BYTES {
            return Err(error("that folder is too big to do safely here (over 200 files or 20 MB); tell the user to do it themselves"));
        }
    }
    Ok(files)
}

fn copy_then_remove(from: &Path, to: &Path) -> Result<(), String> {
    if from.is_dir() {
        std::fs::create_dir_all(to).map_err(|failure| failure.to_string())?;
        for entry in std::fs::read_dir(from).map_err(|failure| failure.to_string())? {
            let entry = entry.map_err(|failure| failure.to_string())?;
            copy_then_remove(&entry.path(), &to.join(entry.file_name()))?;
        }
        std::fs::remove_dir(from).map_err(|failure| failure.to_string())
    } else {
        std::fs::copy(from, to).map_err(|failure| failure.to_string())?;
        std::fs::remove_file(from).map_err(|failure| failure.to_string())
    }
}

fn preview(old: &str, new: &str) -> Vec<DiffLine> {
    crate::changes::hunks(old, new)
        .0
        .into_iter()
        .flat_map(|hunk| hunk.lines)
        .filter(|line| line.kind != DiffKind::Same)
        .take(PREVIEW_LINES)
        .collect()
}


impl HubTools<'_> {
    async fn workspace(&self) -> Result<Workspace, String> {
        workspace::for_thread(self.state, self.thread_id)
            .await
            .ok_or_else(|| error("this conversation has no workspace; these tools only work in a workspace conversation"))
    }

    fn reads_key(&self, path: &Path) -> (String, PathBuf) {
        (self.thread_id.to_owned(), path.to_path_buf())
    }

    fn remember_read(&self, path: &Path, bytes: &[u8]) {
        self.state
            .code_reads
            .lock()
            .unwrap()
            .insert(self.reads_key(path), digest(bytes));
    }

    fn known(&self, path: &Path) -> Option<String> {
        self.state.code_reads.lock().unwrap().get(&self.reads_key(path)).cloned()
    }

    async fn folders(&self, prefix: &str, workspace: &Workspace) -> Vec<String> {
        self.state
            .store
            .setting_owned(format!("{prefix}{}", workspace.id))
            .await
            .ok()
            .flatten()
            .and_then(|value| serde_json::from_str(&value).ok())
            .unwrap_or_default()
    }

    async fn add_folder(&self, prefix: &str, workspace: &Workspace, folder: &Path) {
        let mut folders = self.folders(prefix, workspace).await;
        let folder = folder.to_string_lossy().into_owned();
        if !folders.contains(&folder) {
            folders.push(folder);
            let _ = self
                .state
                .store
                .set_setting_owned(format!("{prefix}{}", workspace.id), serde_json::to_string(&folders).unwrap_or_default())
                .await;
        }
    }

    async fn within(&self, prefix: &str, workspace: &Workspace, path: &Path) -> bool {
        self.folders(prefix, workspace).await.iter().any(|folder| path.starts_with(folder))
    }

    fn folder_of(path: &Path) -> PathBuf {
        if path.is_dir() {
            path.to_path_buf()
        } else {
            path.parent().map_or_else(|| path.to_path_buf(), Path::to_path_buf)
        }
    }

    async fn may_read(&self, workspace: &Workspace, target: &Target) -> Result<(), String> {
        if target.inside {
            return Ok(());
        }
        let shown = target.path.to_string_lossy().into_owned();
        if self.within(READ_FOLDERS, workspace, &target.path).await
            || self.within(WRITE_FOLDERS, workspace, &target.path).await
            || self.allowed_once.lock().unwrap().contains(&shown)
        {
            return Ok(());
        }
        let folder = Self::folder_of(&target.path);
        match self
            .ask(ConfirmKind::ReadOutside {
                path: workspace::shown(workspace, &target.path),
                folder: workspace::shown(workspace, &folder),
            })
            .await
        {
            ConfirmChoice::Always => {
                self.add_folder(READ_FOLDERS, workspace, &folder).await;
                Ok(())
            }
            ConfirmChoice::Once | ConfirmChoice::Yes => {
                self.allowed_once.lock().unwrap().push(shown);
                Ok(())
            }
            _ => Err(error(
                "the user did not allow reading outside the workspace; work with what is inside or ask them",
            )),
        }
    }

    async fn may_write(&self, workspace: &Workspace, target: &Target, old: &str, new: &str) -> Result<(), String> {
        if target.inside || self.within(WRITE_FOLDERS, workspace, &target.path).await {
            return Ok(());
        }
        let folder = Self::folder_of(&target.path);
        match self
            .ask(ConfirmKind::WriteOutside {
                path: workspace::shown(workspace, &target.path),
                folder: workspace::shown(workspace, &folder),
                preview: preview(old, new),
            })
            .await
        {
            ConfirmChoice::Always => {
                self.add_folder(WRITE_FOLDERS, workspace, &folder).await;
                Ok(())
            }
            ConfirmChoice::Once | ConfirmChoice::Yes => Ok(()),
            _ => Err(error(
                "the user did not allow changing a file outside the workspace; tell them the change instead",
            )),
        }
    }

    async fn save(&self, workspace: &Workspace, path: &Path, before: Option<Vec<u8>>, content: &[u8]) -> Result<(), String> {
        let key = path.to_string_lossy().into_owned();
        self.touched
            .lock()
            .unwrap()
            .entry(path.to_path_buf())
            .or_insert_with(|| before.clone());
        self.state
            .store
            .keep_baseline(self.thread_id.to_owned(), workspace.id.clone(), key, before)
            .await
            .map_err(|failure| error(&failure.to_string()))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|failure| error(&failure.to_string()))?;
        }
        std::fs::write(path, content).map_err(|failure| error(&failure.to_string()))?;
        self.remember_read(path, content);
        self.state.publish(Event::FilesChanged {
            workspace_id: workspace.id.clone(),
            thread_id: Some(self.thread_id.to_owned()),
            paths: vec![workspace::shown(workspace, path)],
        });
        Ok(())
    }

    fn stale(&self, path: &Path, bytes: &[u8]) -> bool {
        self.known(path).is_some_and(|known| known != digest(bytes))
    }

    pub(crate) async fn finish_changes(&self) {
        let touched: Vec<(PathBuf, Option<Vec<u8>>)> = std::mem::take(&mut *self.touched.lock().unwrap()).into_iter().collect();
        if touched.is_empty() {
            return;
        }
        let Ok(workspace) = self.workspace().await else {
            return;
        };
        let files: Vec<_> = touched
            .into_iter()
            .filter_map(|(path, before)| {
                let now = std::fs::read(&path).ok();
                crate::changes::summary(workspace::shown(&workspace, &path), before.as_deref(), now.as_deref())
            })
            .collect();
        if !files.is_empty() {
            self.attach(xiaoban_protocol::Attachment::Changes { files });
        }
    }

    pub(crate) async fn run_code_tool(&self, name: &str, arguments: &str) -> String {
        let workspace = match self.workspace().await {
            Ok(workspace) => workspace,
            Err(failure) => return failure,
        };
        let result = match name {
            LIST_DIR => self.list_dir(&workspace, arguments).await,
            READ_FILE => self.read_file(&workspace, arguments).await,
            SEARCH_FILES => self.search_files(&workspace, arguments).await,
            WRITE_FILE => self.write_file(&workspace, arguments).await,
            EDIT_FILE => self.edit_file(&workspace, arguments).await,
            RUN_COMMAND => self.run_command(&workspace, arguments).await,
            DELETE_FILE => self.delete_file(&workspace, arguments).await,
            MOVE_FILE => self.move_file(&workspace, arguments).await,
            crate::vcs_tools::GIT | crate::vcs_tools::GH => Ok(self.vcs_tool(&workspace, name, arguments).await),
            _ => Err(error("unknown tool")),
        };
        result.unwrap_or_else(|failure| failure)
    }

    async fn list_dir(&self, workspace: &Workspace, arguments: &str) -> Result<String, String> {
        let args: PathArgs = serde_json::from_str(arguments).map_err(|_| error("arguments must be {path?, depth?}"))?;
        let target = workspace::resolve(workspace, args.path.as_deref().unwrap_or("."));
        self.may_read(workspace, &target).await?;
        let depth = args.depth.unwrap_or(1).clamp(1, 3);
        let root = target.path.clone();
        let shown_root = workspace.clone();
        let lines = tokio::task::spawn_blocking(move || {
            walk(&root, Some(depth))
                .filter_map(Result::ok)
                .filter(|entry| entry.depth() > 0)
                .take(LIST_LIMIT)
                .map(|entry| {
                    let mut name = workspace::shown(&shown_root, entry.path());
                    if entry.file_type().is_some_and(|kind| kind.is_dir()) {
                        name.push('/');
                    }
                    name
                })
                .collect::<Vec<_>>()
        })
        .await
        .unwrap_or_default();
        Ok(json!({ "entries": lines, "limited": lines.len() >= LIST_LIMIT }).to_string())
    }

    async fn read_file(&self, workspace: &Workspace, arguments: &str) -> Result<String, String> {
        let args: ReadArgs = serde_json::from_str(arguments).map_err(|_| error("arguments must be {path, from?, to?}"))?;
        let target = workspace::resolve(workspace, &args.path);
        self.may_read(workspace, &target).await?;
        let bytes = std::fs::read(&target.path).map_err(|failure| error(&failure.to_string()))?;
        if crate::changes::binary(&bytes) {
            return Err(error("binary file; cannot show it as text"));
        }
        self.remember_read(&target.path, &bytes);
        let content = String::from_utf8_lossy(&bytes);
        let lines: Vec<&str> = content.split_inclusive('\n').collect();
        let total = lines.len();
        let from = args.from.unwrap_or(1).max(1);
        let to = args.to.unwrap_or(from + READ_LINES - 1).min(total).min(from + READ_LINES - 1);
        let body: String = lines.iter().skip(from - 1).take(to.saturating_sub(from - 1)).copied().collect();
        Ok(json!({
            "path": workspace::shown(workspace, &target.path),
            "from": from,
            "to": to,
            "total_lines": total,
            "content": body,
        })
        .to_string())
    }

    async fn search_files(&self, workspace: &Workspace, arguments: &str) -> Result<String, String> {
        let args: SearchArgs = serde_json::from_str(arguments).map_err(|_| error("arguments must be {query, path?, names?}"))?;
        if args.query.trim().is_empty() {
            return Err(error("query must not be empty"));
        }
        let target = workspace::resolve(workspace, args.path.as_deref().unwrap_or("."));
        self.may_read(workspace, &target).await?;
        let root = target.path.clone();
        let shown_root = workspace.clone();
        let hits = tokio::task::spawn_blocking(move || {
            let mut hits = Vec::new();
            let needle = args.query.to_lowercase();
            let pattern = regex::Regex::new(&args.query).unwrap_or_else(|_| regex::Regex::new(&regex::escape(&args.query)).expect("escaped pattern"));
            for entry in walk(&root, None).filter_map(Result::ok) {
                if hits.len() >= HITS {
                    break;
                }
                let is_file = entry.file_type().is_some_and(|kind| kind.is_file());
                let shown = workspace::shown(&shown_root, entry.path());
                if args.names {
                    if entry.file_name().to_string_lossy().to_lowercase().contains(&needle) {
                        hits.push(json!({ "path": shown }));
                    }
                    continue;
                }
                if !is_file || entry.metadata().map_or(true, |meta| meta.len() > SEARCH_BYTES) {
                    continue;
                }
                let Ok(bytes) = std::fs::read(entry.path()) else { continue };
                if crate::changes::binary(&bytes) {
                    continue;
                }
                let content = String::from_utf8_lossy(&bytes);
                for (index, line) in content.lines().enumerate() {
                    if pattern.is_match(line) {
                        hits.push(json!({ "path": shown, "line": index + 1, "text": line.chars().take(200).collect::<String>() }));
                        if hits.len() >= HITS {
                            break;
                        }
                    }
                }
            }
            hits
        })
        .await
        .unwrap_or_default();
        Ok(json!({ "hits": hits, "limited": hits.len() >= HITS }).to_string())
    }

    async fn write_file(&self, workspace: &Workspace, arguments: &str) -> Result<String, String> {
        let args: WriteArgs = serde_json::from_str(arguments).map_err(|_| error("arguments must be {path, content}"))?;
        let target = workspace::resolve(workspace, &args.path);
        if target.path.is_dir() {
            return Err(error("that path is a folder"));
        }
        let before = std::fs::read(&target.path).ok();
        if let Some(bytes) = &before {
            match self.known(&target.path) {
                None => return Err(error("read the file before overwriting it, or use edit_file")),
                Some(_) if self.stale(&target.path, bytes) => {
                    return Err(error("the file changed since you read it (the user may have edited it); read it again before writing"));
                }
                Some(_) => {}
            }
        }
        let old = before.as_deref().map(String::from_utf8_lossy).unwrap_or_default().into_owned();
        self.may_write(workspace, &target, &old, &args.content).await?;
        self.save(workspace, &target.path, before, args.content.as_bytes()).await?;
        Ok(json!({ "written": workspace::shown(workspace, &target.path), "lines": args.content.lines().count() }).to_string())
    }

    async fn edit_file(&self, workspace: &Workspace, arguments: &str) -> Result<String, String> {
        let args: EditArgs = serde_json::from_str(arguments).map_err(|_| error("arguments must be {path, old, new, all?}"))?;
        if args.old.is_empty() {
            return Err(error("old must not be empty; use write_file to create a file"));
        }
        let target = workspace::resolve(workspace, &args.path);
        let bytes = std::fs::read(&target.path).map_err(|_| error("file not found; use write_file to create it"))?;
        if crate::changes::binary(&bytes) {
            return Err(error("binary file; cannot edit it as text"));
        }
        if self.stale(&target.path, &bytes) {
            return Err(error("the file changed since you read it (the user may have edited it); read it again, then edit"));
        }
        let content = String::from_utf8_lossy(&bytes).into_owned();
        let count = content.matches(&args.old).count();
        if count == 0 {
            return Err(error("old text not found; read the file and copy the text exactly, including whitespace"));
        }
        if count > 1 && !args.all {
            return Err(error(&format!("old text appears {count} times; include more surrounding lines so it is unique, or set all to true")));
        }
        let updated = if args.all {
            content.replace(&args.old, &args.new)
        } else {
            content.replacen(&args.old, &args.new, 1)
        };
        self.may_write(workspace, &target, &content, &updated).await?;
        self.save(workspace, &target.path, Some(bytes), updated.as_bytes()).await?;
        Ok(json!({ "edited": workspace::shown(workspace, &target.path), "replacements": if args.all { count } else { 1 } }).to_string())
    }

    /// Remembers what a file looked like before this turn touched it, so the change card can show and undo it.
    async fn track(&self, workspace: &Workspace, path: &Path, before: Option<Vec<u8>>) -> Result<(), String> {
        self.touched
            .lock()
            .unwrap()
            .entry(path.to_path_buf())
            .or_insert_with(|| before.clone());
        self.state
            .store
            .keep_baseline(self.thread_id.to_owned(), workspace.id.clone(), path.to_string_lossy().into_owned(), before)
            .await
            .map_err(|failure| error(&failure.to_string()))
    }

    fn announce(&self, workspace: &Workspace, paths: &[PathBuf]) {
        self.state.publish(Event::FilesChanged {
            workspace_id: workspace.id.clone(),
            thread_id: Some(self.thread_id.to_owned()),
            paths: paths.iter().map(|path| workspace::shown(workspace, path)).collect(),
        });
    }

    async fn delete_file(&self, workspace: &Workspace, arguments: &str) -> Result<String, String> {
        let args: DeleteArgs = serde_json::from_str(arguments).map_err(|_| error("arguments must be {path}"))?;
        let target = workspace::resolve(workspace, &args.path);
        guard_tree(workspace, &target.path)?;
        if !target.path.exists() {
            return Err(error("nothing exists at that path"));
        }
        if target.path.is_dir() {
            if !target.inside {
                return Err(error("only single files can be deleted outside the workspace; tell the user which folder to remove"));
            }
            let files = tree_files(&target.path)?;
            let mut saved = Vec::new();
            for file in &files {
                saved.push((file.clone(), std::fs::read(file).map_err(|failure| error(&failure.to_string()))?));
            }
            for (file, bytes) in saved {
                self.track(workspace, &file, Some(bytes)).await?;
            }
            std::fs::remove_dir_all(&target.path).map_err(|failure| error(&failure.to_string()))?;
            self.announce(workspace, &files);
            return Ok(json!({
                "deleted": workspace::shown(workspace, &target.path),
                "files": files.len(),
                "undo": "the user can restore it from the changes card",
            })
            .to_string());
        }
        let bytes = std::fs::read(&target.path).map_err(|failure| error(&failure.to_string()))?;
        if self.stale(&target.path, &bytes) {
            return Err(error("the file changed since you read it (the user may have edited it); read it again before deleting"));
        }
        let old = String::from_utf8_lossy(&bytes).into_owned();
        self.may_write(workspace, &target, &old, "").await?;
        self.track(workspace, &target.path, Some(bytes)).await?;
        std::fs::remove_file(&target.path).map_err(|failure| error(&failure.to_string()))?;
        self.state
            .code_reads
            .lock()
            .unwrap()
            .remove(&self.reads_key(&target.path));
        self.announce(workspace, std::slice::from_ref(&target.path));
        Ok(json!({
            "deleted": workspace::shown(workspace, &target.path),
            "undo": "the user can restore it from the changes card",
        })
        .to_string())
    }

    async fn move_file(&self, workspace: &Workspace, arguments: &str) -> Result<String, String> {
        let args: MoveArgs = serde_json::from_str(arguments).map_err(|_| error("arguments must be {from, to}"))?;
        let from = workspace::resolve(workspace, &args.from);
        let to = workspace::resolve(workspace, &args.to);
        guard_tree(workspace, &from.path)?;
        guard_tree(workspace, &to.path)?;
        if !from.path.exists() {
            return Err(error("nothing exists at the from path"));
        }
        if to.path.exists() {
            return Err(error("something already exists at the to path; pick another name or delete it first"));
        }
        if to.path.starts_with(&from.path) {
            return Err(error("cannot move a folder into itself"));
        }
        let folder = from.path.is_dir();
        if folder && (!from.inside || !to.inside) {
            return Err(error("folders can only be moved inside the workspace; tell the user which folder to move"));
        }
        let files = if folder { tree_files(&from.path)? } else { vec![from.path.clone()] };
        let mut saved = Vec::new();
        for file in &files {
            let bytes = std::fs::read(file).map_err(|failure| error(&failure.to_string()))?;
            if !folder && self.stale(file, &bytes) {
                return Err(error("the file changed since you read it (the user may have edited it); read it again before moving"));
            }
            saved.push((file.clone(), bytes));
        }
        if !folder {
            let old = String::from_utf8_lossy(&saved[0].1).into_owned();
            self.may_write(workspace, &from, &old, "").await?;
            self.may_write(workspace, &to, "", &old).await?;
        }
        let renamed: Vec<PathBuf> = if folder {
            files
                .iter()
                .map(|file| to.path.join(file.strip_prefix(&from.path).unwrap_or(Path::new(""))))
                .collect()
        } else {
            vec![to.path.clone()]
        };
        for ((file, bytes), moved) in saved.into_iter().zip(&renamed) {
            self.track(workspace, &file, Some(bytes)).await?;
            self.track(workspace, moved, None).await?;
        }
        if let Some(parent) = to.path.parent() {
            std::fs::create_dir_all(parent).map_err(|failure| error(&failure.to_string()))?;
        }
        if std::fs::rename(&from.path, &to.path).is_err() {
            copy_then_remove(&from.path, &to.path).map_err(|failure| error(&failure))?;
        }
        {
            let mut known = self.state.code_reads.lock().unwrap();
            for file in &files {
                known.remove(&self.reads_key(file));
            }
        }
        let mut changed = files.clone();
        changed.extend(renamed);
        self.announce(workspace, &changed);
        Ok(json!({
            "moved": workspace::shown(workspace, &from.path),
            "to": workspace::shown(workspace, &to.path),
            "files": files.len(),
        })
        .to_string())
    }

    async fn run_command(&self, workspace: &Workspace, arguments: &str) -> Result<String, String> {
        let args: CommandArgs = serde_json::from_str(arguments).map_err(|_| error("arguments must be {command, reason}"))?;
        let command = args.command.trim().to_owned();
        if command.is_empty() {
            return Err(error("command must not be empty"));
        }
        let rules = crate::commands::rules(self.state, &workspace.id).await;
        if !crate::commands::allowed_by(&rules, &command) {
            let rule = if crate::commands::chained(&command) {
                String::new()
            } else {
                crate::commands::rule(&command)
            };
            match self
                .ask(ConfirmKind::RunCommand {
                    command: command.clone(),
                    cwd: workspace::pretty(&workspace::root(workspace)),
                    rule: rule.clone(),
                })
                .await
            {
                ConfirmChoice::Always if !rule.is_empty() => {
                    crate::commands::allow(self.state, &workspace.id, rule).await;
                }
                ConfirmChoice::Once | ConfirmChoice::Yes | ConfirmChoice::Always => {}
                _ => {
                    return Err(error(
                        "the user did not allow running this command; do not retry it. Tell them the exact command so they can run it themselves",
                    ));
                }
            }
        }
        crate::pauses::wait_while_paused(self.state, self.turn_id, &self.cancel).await;
        let finished = crate::commands::run(self.state, workspace, Some(self.thread_id), &command, false, &self.cancel)
            .await
            .map_err(|failure| error(&failure))?;
        Ok(crate::commands::for_model(&finished))
    }

}
