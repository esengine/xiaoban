use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{NoTools, StablePrefix, Transcript};
use xiaoban_i18n::keys;
use xiaoban_protocol::{CommitInfo, FileDiff, Workspace};

use crate::state::SharedState;
use crate::workspace::{self, GitOutput};

const LOG_LIMIT: u32 = 200;
const DETAIL_FILES: usize = 40;
const DRAFT_DIFF_CHARS: usize = 12_000;
const SEP: char = '\u{1f}';

fn failed(output: Option<GitOutput>) -> Result<String, String> {
    match output {
        Some(output) if output.ok => Ok(output.stdout),
        Some(output) => Err(output
            .stderr
            .trim()
            .lines()
            .last()
            .unwrap_or("git failed")
            .to_owned()),
        None => Err("git did not answer".to_owned()),
    }
}

pub async fn log(workspace: &Workspace, all: bool, limit: u32) -> Vec<CommitInfo> {
    let dir = workspace::root(workspace);
    let count = limit.clamp(1, LOG_LIMIT).to_string();
    let format = format!("--format=%H{SEP}%h{SEP}%s{SEP}%an{SEP}%at{SEP}%P");
    let mut args = vec!["log", format.as_str(), "-n", count.as_str()];
    if all {
        args.push("--all");
    }
    let Some(output) = workspace::git(&dir, &args).await else {
        return Vec::new();
    };
    output
        .stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.split(SEP);
            Some(CommitInfo {
                hash: parts.next()?.to_owned(),
                short: parts.next()?.to_owned(),
                subject: parts.next()?.to_owned(),
                author: parts.next()?.to_owned(),
                time: parts.next()?.parse::<i64>().ok()? * 1000,
                merge: parts.next().is_some_and(|parents| parents.split(' ').count() > 1),
            })
        })
        .collect()
}

async fn blob(dir: &std::path::Path, spec: &str) -> Option<Vec<u8>> {
    let binary = workspace::git_binary()?;
    let output = tokio::process::Command::new(binary)
        .args(["show", spec])
        .current_dir(dir)
        .kill_on_drop(true)
        .output()
        .await
        .ok()?;
    output.status.success().then_some(output.stdout)
}

pub async fn commit_files(workspace: &Workspace, hash: &str) -> Result<Vec<FileDiff>, String> {
    if hash.starts_with('-') || hash.is_empty() {
        return Err("bad commit".to_owned());
    }
    let dir = workspace::root(workspace);
    let names = failed(
        workspace::git(
            &dir,
            &["diff-tree", "--no-commit-id", "-r", "--name-only", "--root", "-m", "--first-parent", hash],
        )
        .await,
    )?;
    let mut files = Vec::new();
    for path in names.lines().filter(|line| !line.is_empty()).take(DETAIL_FILES) {
        let before = blob(&dir, &format!("{hash}^:{path}")).await;
        let after = blob(&dir, &format!("{hash}:{path}")).await;
        files.extend(crate::changes::file_diff(path.to_owned(), before.as_deref(), after.as_deref()));
    }
    Ok(files)
}

pub async fn working_files(workspace: &Workspace) -> Vec<FileDiff> {
    let dir = workspace::root(workspace);
    let info = workspace::info(workspace).await;
    let mut files = Vec::new();
    for changed in info.changed.iter().take(DETAIL_FILES) {
        let before = blob(&dir, &format!("HEAD:{}", changed.path)).await;
        let after = std::fs::read(dir.join(&changed.path)).ok();
        files.extend(crate::changes::file_diff(changed.path.clone(), before.as_deref(), after.as_deref()));
    }
    files
}

pub async fn commit(workspace: &Workspace, message: &str, paths: &[String], push: bool) -> Result<(), String> {
    let message = message.trim();
    if message.is_empty() {
        return Err("the commit message is empty".to_owned());
    }
    if paths.is_empty() || paths.iter().any(|path| path.starts_with('-')) {
        return Err("pick the files to commit".to_owned());
    }
    let dir = workspace::root(workspace);
    let mut add = vec!["add", "-A", "--"];
    add.extend(paths.iter().map(String::as_str));
    failed(workspace::git(&dir, &add).await)?;
    let mut commit = vec!["commit", "-m", message, "--"];
    commit.extend(paths.iter().map(String::as_str));
    failed(workspace::git(&dir, &commit).await)?;
    if push {
        self::push(workspace).await?;
    }
    Ok(())
}

pub async fn push(workspace: &Workspace) -> Result<(), String> {
    let dir = workspace::root(workspace);
    let info = workspace::info(workspace).await;
    if info.upstream.is_some() {
        failed(workspace::git(&dir, &["push"]).await).map(|_| ())
    } else {
        failed(workspace::git(&dir, &["push", "-u", "origin", "HEAD"]).await).map(|_| ())
    }
}

pub async fn init(workspace: &Workspace) -> Result<(), String> {
    failed(workspace::git(&workspace::root(workspace), &["init"]).await).map(|_| ())
}

pub async fn pull_request(workspace: &Workspace) -> Result<String, String> {
    push(workspace).await?;
    let binary = crate::vcs_tools::gh_binary().ok_or("the GitHub CLI (gh) is not installed")?;
    let output = tokio::process::Command::new(binary)
        .args(["pr", "create", "--fill"])
        .current_dir(workspace::root(workspace))
        .env("GH_PROMPT_DISABLED", "1")
        .stdin(std::process::Stdio::null())
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|failure| failure.to_string())?;
    let text = String::from_utf8_lossy(&output.stdout).into_owned();
    let url = text
        .lines()
        .rev()
        .find(|line| line.starts_with("https://"))
        .map(str::to_owned);
    if let Some(url) = url {
        return Ok(url);
    }
    let err = String::from_utf8_lossy(&output.stderr);
    err.split_whitespace()
        .find(|word| word.starts_with("https://") && word.contains("/pull/"))
        .map(str::to_owned)
        .ok_or_else(|| err.trim().lines().last().unwrap_or("gh pr create failed").to_owned())
}

pub async fn draft_message(state: &SharedState, workspace: &Workspace, paths: &[String]) -> Option<String> {
    let dir = workspace::root(workspace);
    let mut diff_args = vec!["diff", "HEAD", "--"];
    diff_args.extend(paths.iter().map(String::as_str));
    let diff = workspace::git(&dir, &diff_args).await.map(|output| output.stdout).unwrap_or_default();
    let mut status_args = vec!["status", "--short", "--"];
    status_args.extend(paths.iter().map(String::as_str));
    let status = workspace::git(&dir, &status_args).await.map(|output| output.stdout).unwrap_or_default();
    let recent = workspace::git(&dir, &["log", "--format=%s", "-n", "12"])
        .await
        .map(|output| output.stdout)
        .unwrap_or_default();
    let diff: String = diff.chars().take(DRAFT_DIFF_CHARS).collect();
    let input = format!(
        "{}\n{recent}\n\n{}\n{status}\n\n{}\n{diff}",
        state.localizer.text(keys::COMMIT_DRAFT_RECENT),
        state.localizer.text(keys::COMMIT_DRAFT_FILES),
        state.localizer.text(keys::COMMIT_DRAFT_DIFF),
    );
    let prefix = StablePrefix::new(state.localizer.text(keys::PROMPT_COMMIT_MESSAGE));
    let (events, _) = mpsc::channel(1);
    let outcome = state
        .active()
        .agent
        .without_thinking()
        .run_turn(&prefix, &Transcript::default(), &input, &NoTools, events, CancellationToken::new())
        .await
        .ok()?;
    if let Err(failure) = state.store.record_memory_usage(outcome.usage).await {
        tracing::warn!(%failure, "could not record commit message usage");
    }
    let text = outcome.text.trim().trim_matches('`').trim().to_owned();
    (!text.is_empty()).then_some(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn commits_selected_files_and_reads_history() {
        if workspace::git_binary().is_none() {
            return;
        }
        let dir = std::env::temp_dir().join(format!("xiaoban-ops-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(&dir).unwrap();
        let workspace = Workspace {
            id: "w".to_owned(),
            name: "w".to_owned(),
            path: dir.to_string_lossy().into_owned(),
            created_at: 0,
            active_at: 0,
        };
        init(&workspace).await.unwrap();
        let run = |args: &[&str]| {
            std::process::Command::new("git").args(args).current_dir(&dir).output().unwrap();
        };
        run(&["config", "user.name", "t"]);
        run(&["config", "user.email", "t@t"]);
        std::fs::write(dir.join("a.txt"), "one\n").unwrap();
        std::fs::write(dir.join("b.txt"), "keep\n").unwrap();
        commit(&workspace, "first", &["a.txt".to_owned()], false).await.unwrap();
        let history = log(&workspace, false, 10).await;
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].subject, "first");
        let files = commit_files(&workspace, &history[0].hash).await.unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "a.txt");
        std::fs::write(dir.join("a.txt"), "two\n").unwrap();
        let working = working_files(&workspace).await;
        let paths: Vec<&str> = working.iter().map(|file| file.path.as_str()).collect();
        assert!(paths.contains(&"a.txt") && paths.contains(&"b.txt"));
        assert!(commit(&workspace, "  ", &["a.txt".to_owned()], false).await.is_err());
        assert!(commit_files(&workspace, "--all").await.is_err());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
