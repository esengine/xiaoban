use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: String,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub active_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub dir: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ChangeStatus {
    Added,
    Modified,
    Deleted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum DiffKind {
    Same,
    Added,
    Removed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: DiffKind,
    pub old: Option<u32>,
    pub new: Option<u32>,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub old_start: u32,
    pub new_start: u32,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub status: ChangeStatus,
    pub added: u32,
    pub removed: u32,
    pub binary: bool,
    pub hunks: Vec<DiffHunk>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ChangedFile {
    pub path: String,
    pub status: ChangeStatus,
    pub added: u32,
    pub removed: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    pub installed: bool,
    pub repository: bool,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub changed: Vec<ChangedFile>,
    #[serde(default)]
    pub stash: Option<String>,
    #[serde(default)]
    pub operation: Option<String>,
    #[serde(default)]
    pub conflicts: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ConflictChoice {
    Ours,
    Theirs,
    Both,
    Text,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ConflictBlock {
    pub index: u32,
    pub line: u32,
    pub ours: Vec<String>,
    pub theirs: Vec<String>,
    pub base: Option<Vec<String>>,
    pub ours_label: String,
    pub theirs_label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    pub path: String,
    pub blocks: Vec<ConflictBlock>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub current: bool,
    pub remote: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum RefState {
    Open,
    Draft,
    Merged,
    Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum CheckOutcome {
    Passed,
    Failed,
    Pending,
    Skipped,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct RefCheck {
    pub name: String,
    pub outcome: CheckOutcome,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct GithubRef {
    pub number: u32,
    pub pull: bool,
    pub repo: String,
    pub state: RefState,
    pub title: String,
    pub author: String,
    pub url: String,
    pub head: Option<String>,
    pub base: Option<String>,
    pub files: Option<u32>,
    pub comments: u32,
    pub checks: Vec<RefCheck>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Allowance {
    Command,
    Read,
    Write,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSettings {
    pub commands: Vec<String>,
    pub read: Vec<String>,
    pub write: Vec<String>,
    pub editor: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub hash: String,
    pub short: String,
    pub subject: String,
    pub author: String,
    #[ts(type = "number")]
    pub time: i64,
    pub merge: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CommandRun {
    pub id: String,
    pub workspace_id: String,
    pub thread_id: Option<String>,
    pub command: String,
    pub by_user: bool,
    pub exit_code: Option<i32>,
    pub output: String,
    #[ts(type = "number")]
    pub started_at: i64,
    #[ts(type = "number | null")]
    pub duration_ms: Option<i64>,
}
