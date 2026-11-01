use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use tokio::io::AsyncReadExt;
use tokio_util::sync::CancellationToken;
use xiaoban_protocol::{CommandRun, Event, Workspace};

use crate::state::SharedState;

pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(600);
const RESULT_CHARS: usize = 12_000;
const CHAINING: [&str; 8] = [";", "&&", "||", "|", ">", "<", "`", "$("];

fn shell(command: &str, dir: &Path) -> tokio::process::Command {
    let mut process = if cfg!(windows) {
        let mut process = tokio::process::Command::new("cmd");
        process.arg("/C").arg(command);
        process
    } else {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_owned());
        let mut process = tokio::process::Command::new(shell);
        process.arg("-lc").arg(command);
        process
    };
    process
        .current_dir(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("GIT_TERMINAL_PROMPT", "0")
        .kill_on_drop(true);
    process
}

pub fn rule(command: &str) -> String {
    let mut words = command.split_whitespace();
    let first = words.next().unwrap_or_default();
    match words.next() {
        Some(second) if !second.starts_with('-') && !second.contains(['/', '\\', '.', '=']) => {
            format!("{first} {second}")
        }
        _ => first.to_owned(),
    }
}

pub fn chained(command: &str) -> bool {
    CHAINING.iter().any(|mark| command.contains(mark)) || command.contains('\n')
}

pub fn allowed_by(rules: &[String], command: &str) -> bool {
    let command = command.trim();
    !chained(command)
        && rules
            .iter()
            .any(|rule| command == rule || command.starts_with(&format!("{rule} ")))
}

fn rules_key(workspace_id: &str) -> String {
    format!("workspace.allow.{workspace_id}")
}

pub async fn rules(state: &SharedState, workspace_id: &str) -> Vec<String> {
    state
        .store
        .setting_owned(rules_key(workspace_id))
        .await
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_str(&value).ok())
        .unwrap_or_default()
}

pub async fn allow(state: &SharedState, workspace_id: &str, rule: String) {
    let mut current = rules(state, workspace_id).await;
    if !current.contains(&rule) {
        current.push(rule);
        let _ = state
            .store
            .set_setting_owned(rules_key(workspace_id), serde_json::to_string(&current).unwrap_or_default())
            .await;
    }
}

pub struct Finished {
    pub run: CommandRun,
    pub timed_out: bool,
}

pub async fn run(
    state: &SharedState,
    workspace: &Workspace,
    thread_id: Option<&str>,
    command: &str,
    by_user: bool,
    cancel: &CancellationToken,
) -> Result<Finished, String> {
    let started = state
        .store
        .start_command(
            workspace.id.clone(),
            thread_id.map(str::to_owned),
            command.to_owned(),
            by_user,
        )
        .await
        .map_err(|failure| failure.to_string())?;
    state.publish(Event::CommandUpdated {
        command: started.clone(),
    });
    let dir = crate::workspace::root(workspace);
    let mut child = shell(command, &dir).spawn().map_err(|failure| failure.to_string())?;
    let mut stdout = child.stdout.take();
    let mut stderr = child.stderr.take();
    let read_out = async {
        let mut buf = Vec::new();
        if let Some(pipe) = stdout.as_mut() {
            let _ = pipe.read_to_end(&mut buf).await;
        }
        buf
    };
    let read_err = async {
        let mut buf = Vec::new();
        if let Some(pipe) = stderr.as_mut() {
            let _ = pipe.read_to_end(&mut buf).await;
        }
        buf
    };
    let waited = async {
        let (out, err, status) = tokio::join!(read_out, read_err, child.wait());
        (out, err, status)
    };
    let (exit_code, output, timed_out) = tokio::select! {
        (out, err, status) = waited => {
            let mut text = String::from_utf8_lossy(&out).into_owned();
            let err = String::from_utf8_lossy(&err);
            if !err.trim().is_empty() {
                if !text.is_empty() && !text.ends_with('\n') {
                    text.push('\n');
                }
                text.push_str(&err);
            }
            (status.ok().and_then(|status| status.code()), text, false)
        }
        () = tokio::time::sleep(DEFAULT_TIMEOUT) => (None, String::new(), true),
        () = cancel.cancelled() => (None, String::new(), false),
    };
    let finished = state
        .store
        .finish_command(started.id, exit_code, output)
        .await
        .map_err(|failure| failure.to_string())?;
    state.publish(Event::CommandUpdated {
        command: finished.clone(),
    });
    state.publish(Event::FilesChanged {
        workspace_id: workspace.id.clone(),
        thread_id: thread_id.map(str::to_owned),
        paths: Vec::new(),
    });
    Ok(Finished {
        run: finished,
        timed_out,
    })
}

pub fn for_model(finished: &Finished) -> String {
    let output = &finished.run.output;
    let count = output.chars().count();
    let tail: String = if count > RESULT_CHARS {
        output.chars().skip(count - RESULT_CHARS).collect()
    } else {
        output.clone()
    };
    serde_json::json!({
        "exit_code": finished.run.exit_code,
        "timed_out": finished.timed_out,
        "output": tail,
        "truncated": count > RESULT_CHARS,
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_only_matching_simple_commands() {
        assert_eq!(rule("pnpm test --filter auth"), "pnpm test");
        assert_eq!(rule("cargo test -p hub"), "cargo test");
        assert_eq!(rule("ls -la"), "ls");
        assert_eq!(rule("node scripts/build.js"), "node");
        let rules = vec!["pnpm test".to_owned()];
        assert!(allowed_by(&rules, "pnpm test --filter auth"));
        assert!(allowed_by(&rules, "pnpm test"));
        assert!(!allowed_by(&rules, "pnpm testing"));
        assert!(!allowed_by(&rules, "pnpm test && rm -rf ~"));
        assert!(!allowed_by(&rules, "pnpm test; curl x"));
    }
}
