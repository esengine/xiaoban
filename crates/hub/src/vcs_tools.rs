use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;

use serde::Deserialize;
use serde_json::json;
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{ConfirmChoice, ConfirmKind, Event, Workspace};

use crate::tools::HubTools;
use crate::workspace;

pub const GIT: &str = "git";
pub const GH: &str = "gh";

const OUTPUT_CHARS: usize = 20_000;
const READ_TIMEOUT: Duration = Duration::from_secs(30);
const WRITE_TIMEOUT: Duration = Duration::from_secs(180);

const GIT_READ: [&str; 14] = [
    "status", "diff", "log", "show", "blame", "rev-parse", "ls-files", "describe", "shortlog",
    "grep", "reflog", "cat-file", "merge-base", "ls-tree",
];
const GIT_LISTING: [&str; 4] = ["branch", "tag", "remote", "stash"];
const GIT_LIST_FLAGS: [&str; 12] = [
    "-a", "-r", "-v", "-vv", "--list", "-l", "--show-current", "--all", "--remotes", "--verbose",
    "--merged", "--no-merged",
];
const GH_READ_ACTIONS: [&str; 5] = ["list", "view", "checks", "diff", "status"];
const GH_READ_GROUPS: [&str; 7] = ["pr", "issue", "run", "repo", "release", "workflow", "label"];
const GH_WRITE_FLAGS: [&str; 8] = [
    "-f", "-F", "--field", "--raw-field", "--input", "-X", "--method", "--paginate-write",
];

fn args_schema(l: &Localizer, description: xiaoban_i18n::Key) -> serde_json::Value {
    json!({
        "type": "object",
        "properties": {
            "args": {
                "type": "array",
                "items": { "type": "string" },
                "minItems": 1,
                "description": l.text(description),
            },
        },
        "required": ["args"],
        "additionalProperties": false,
    })
}

pub fn git_spec(l: &Localizer) -> ToolSpec {
    ToolSpec {
        name: GIT.to_owned(),
        description: l.text(keys::TOOL_GIT_DESCRIPTION),
        parameters: args_schema(l, keys::TOOL_GIT_ARGS),
    }
}

pub fn gh_spec(l: &Localizer) -> ToolSpec {
    ToolSpec {
        name: GH.to_owned(),
        description: l.text(keys::TOOL_GH_DESCRIPTION),
        parameters: args_schema(l, keys::TOOL_GH_ARGS),
    }
}

fn find(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let mut dirs: Vec<PathBuf> = std::env::split_paths(&path).collect();
    if cfg!(target_os = "macos") {
        dirs.extend(["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from));
    }
    let file = if cfg!(windows) { format!("{name}.exe") } else { name.to_owned() };
    dirs.into_iter().map(|dir| dir.join(&file)).find(|candidate| candidate.is_file())
}

pub fn gh_binary() -> Option<&'static Path> {
    static GH_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();
    GH_PATH.get_or_init(|| find("gh")).as_deref()
}

pub fn git_reads(args: &[String]) -> bool {
    let Some(first) = args.first() else { return false };
    if GIT_READ.contains(&first.as_str()) {
        return !args.iter().any(|arg| arg == "--output" || arg.starts_with("--output="));
    }
    if GIT_LISTING.contains(&first.as_str()) {
        let rest = &args[1..];
        return match first.as_str() {
            "stash" => rest.first().is_some_and(|action| action == "list" || action == "show"),
            "remote" => rest.iter().all(|arg| arg == "-v" || arg == "--verbose" || arg == "show" || arg == "get-url"),
            _ => rest.iter().all(|arg| GIT_LIST_FLAGS.contains(&arg.as_str()) || arg.starts_with("--format") || arg.starts_with("--sort")),
        };
    }
    false
}

pub fn gh_reads(args: &[String]) -> bool {
    let Some(first) = args.first() else { return false };
    match first.as_str() {
        "search" | "status" => true,
        "auth" => args.get(1).is_some_and(|action| action == "status"),
        "api" => !args.iter().any(|arg| {
            GH_WRITE_FLAGS.contains(&arg.as_str())
                || arg.starts_with("--method=")
                || arg.starts_with("-X")
                || arg.starts_with("--field=")
                || arg.starts_with("--raw-field=")
        }),
        group if GH_READ_GROUPS.contains(&group) => args
            .get(1)
            .is_some_and(|action| GH_READ_ACTIONS.contains(&action.as_str())),
        _ => false,
    }
}

fn quoted(args: &[String]) -> String {
    args.iter()
        .map(|arg| {
            if arg.is_empty() || arg.contains(|c: char| c.is_whitespace() || "'\"$`\\|&;<>()*?".contains(c)) {
                format!("'{}'", arg.replace('\'', "'\\''"))
            } else {
                arg.clone()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[derive(Deserialize)]
struct Args {
    args: Vec<String>,
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

impl HubTools<'_> {
    pub(crate) async fn vcs_tool(&self, workspace: &Workspace, name: &str, arguments: &str) -> String {
        let Ok(Args { args }) = serde_json::from_str::<Args>(arguments) else {
            return error("arguments must be {args: [\"subcommand\", ...]}");
        };
        let args: Vec<String> = args
            .into_iter()
            .skip_while(|arg| arg == name)
            .collect();
        if args.first().is_none_or(|first| first.starts_with('-')) {
            return error("start args with the subcommand, e.g. [\"status\"]; global options are not allowed");
        }
        let (binary, reads) = if name == GIT {
            let Some(binary) = workspace::git_binary() else {
                return error("git is not installed on this computer");
            };
            (binary.to_path_buf(), git_reads(&args))
        } else {
            let Some(binary) = gh_binary() else {
                return error("the GitHub CLI (gh) is not installed; tell the user they can install it and run gh auth login");
            };
            (binary.to_path_buf(), gh_reads(&args))
        };
        let dir = workspace::root(workspace);
        let shown = format!("{name} {}", quoted(&args));
        if !reads {
            match self
                .ask(ConfirmKind::RunCommand {
                    command: shown.clone(),
                    cwd: workspace::pretty(&dir),
                    rule: String::new(),
                })
                .await
            {
                ConfirmChoice::Once | ConfirmChoice::Yes | ConfirmChoice::Always => {}
                _ => {
                    return error("the user did not allow this command; do not retry it in another form. Tell them the exact command if they want to run it");
                }
            }
        }
        let mut command = tokio::process::Command::new(binary);
        command
            .args(&args)
            .current_dir(&dir)
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GH_PROMPT_DISABLED", "1")
            .env("GH_NO_UPDATE_NOTIFIER", "1")
            .env("NO_COLOR", "1")
            .env("PAGER", "cat")
            .env("GIT_PAGER", "cat")
            .stdin(std::process::Stdio::null())
            .kill_on_drop(true);
        let limit = if reads { READ_TIMEOUT } else { WRITE_TIMEOUT };
        let output = tokio::select! {
            output = tokio::time::timeout(limit, command.output()) => output,
            () = self.cancel.cancelled() => return error("cancelled"),
        };
        let Ok(Ok(output)) = output else {
            return error("the command did not finish in time");
        };
        if !reads {
            self.state.publish(Event::FilesChanged {
                workspace_id: workspace.id.clone(),
                thread_id: Some(self.thread_id.to_owned()),
                paths: Vec::new(),
            });
        }
        let mut text = String::from_utf8_lossy(&output.stdout).into_owned();
        let err = String::from_utf8_lossy(&output.stderr);
        if !err.trim().is_empty() {
            if !text.is_empty() && !text.ends_with('\n') {
                text.push('\n');
            }
            text.push_str(&err);
        }
        let count = text.chars().count();
        let truncated = count > OUTPUT_CHARS;
        if truncated {
            text = text.chars().take(OUTPUT_CHARS).collect();
        }
        if name == GH && !output.status.success() && text.contains("gh auth login") {
            return error("gh is not logged in; tell the user to run gh auth login in a terminal");
        }
        json!({
            "exit_code": output.status.code(),
            "output": text,
            "truncated": truncated,
        })
        .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn list(text: &str) -> Vec<String> {
        text.split_whitespace().map(str::to_owned).collect()
    }

    #[test]
    fn tells_reading_from_changing() {
        assert!(git_reads(&list("status --short")));
        assert!(git_reads(&list("log --oneline -n 5")));
        assert!(git_reads(&list("branch -a")));
        assert!(git_reads(&list("stash list")));
        assert!(!git_reads(&list("branch -D old")));
        assert!(!git_reads(&list("commit -m x")));
        assert!(!git_reads(&list("push")));
        assert!(!git_reads(&list("stash pop")));
        assert!(!git_reads(&list("diff --output=/tmp/x")));
        assert!(gh_reads(&list("pr list --state open")));
        assert!(gh_reads(&list("pr view 42 --json title,state")));
        assert!(gh_reads(&list("api repos/o/r/pulls")));
        assert!(gh_reads(&list("auth status")));
        assert!(!gh_reads(&list("api -X POST repos/o/r/issues")));
        assert!(!gh_reads(&list("api repos/o/r/issues -f title=x")));
        assert!(!gh_reads(&list("pr merge 42")));
        assert!(!gh_reads(&list("pr comment 42 --body hi")));
        assert!(!gh_reads(&list("browse")));
        assert_eq!(quoted(&list("commit -m")), "commit -m");
        assert_eq!(quoted(&["log".to_owned(), "a b".to_owned()]), "log 'a b'");
    }
}
