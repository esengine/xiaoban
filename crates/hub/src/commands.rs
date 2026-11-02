use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use std::sync::{Arc, Mutex};

use tokio::io::AsyncReadExt;
use tokio_util::sync::CancellationToken;
use xiaoban_protocol::{CommandRun, Event, Workspace};

use crate::state::SharedState;

pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(600);
const LIVE_EVERY: Duration = Duration::from_millis(300);
const RESULT_CHARS: usize = 12_000;
const CHAINING: [&str; 8] = [";", "&&", "||", "|", ">", "<", "`", "$("];

/// The program and flag that run a command line: `cmd` on Windows, the system `sh` on Android (it
/// has no zsh and no login shell), the user's own shell elsewhere.
fn shell_program(windows: bool, android: bool, shell: Option<&str>) -> (String, &'static str) {
    if windows {
        ("cmd".to_owned(), "/C")
    } else if android {
        ("/system/bin/sh".to_owned(), "-c")
    } else {
        (shell.unwrap_or("/bin/zsh").to_owned(), "-lc")
    }
}

fn shell(command: &str, dir: &Path) -> tokio::process::Command {
    let (program, flag) = shell_program(
        cfg!(windows),
        cfg!(target_os = "android"),
        std::env::var("SHELL").ok().as_deref(),
    );
    let mut process = {
        let mut process = tokio::process::Command::new(program);
        process.arg(flag).arg(command);
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

pub fn rules_key(workspace_id: &str) -> String {
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
    let stop = cancel.child_token();
    state
        .running_commands
        .lock()
        .unwrap()
        .insert(started.id.clone(), stop.clone());
    let output = Arc::new(Mutex::new(Vec::<u8>::new()));
    let pump = |pipe: Option<Box<dyn tokio::io::AsyncRead + Unpin + Send>>| {
        let output = Arc::clone(&output);
        async move {
            let Some(mut pipe) = pipe else { return };
            let mut chunk = vec![0_u8; 4096];
            while let Ok(read) = pipe.read(&mut chunk).await {
                if read == 0 {
                    break;
                }
                output.lock().unwrap().extend_from_slice(&chunk[..read]);
            }
        }
    };
    let out = pump(child.stdout.take().map(|pipe| Box::new(pipe) as Box<dyn tokio::io::AsyncRead + Unpin + Send>));
    let err = pump(child.stderr.take().map(|pipe| Box::new(pipe) as Box<dyn tokio::io::AsyncRead + Unpin + Send>));
    let live = async {
        let mut shown = 0;
        loop {
            tokio::time::sleep(LIVE_EVERY).await;
            let text = {
                let bytes = output.lock().unwrap();
                if bytes.len() == shown {
                    continue;
                }
                shown = bytes.len();
                String::from_utf8_lossy(&bytes).into_owned()
            };
            let mut partial = started.clone();
            partial.output = text;
            state.publish(Event::CommandUpdated { command: partial });
        }
    };
    let waited = async {
        let ((), (), status) = tokio::join!(out, err, child.wait());
        status.ok().and_then(|status| status.code())
    };
    let (exit_code, timed_out) = tokio::select! {
        code = waited => (code, false),
        () = live => (None, false),
        () = tokio::time::sleep(DEFAULT_TIMEOUT) => (None, true),
        () = stop.cancelled() => (None, false),
    };
    state.running_commands.lock().unwrap().remove(&started.id);
    let output = String::from_utf8_lossy(&output.lock().unwrap()).into_owned();
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

pub fn stop(state: &SharedState, command_id: &str) -> bool {
    state
        .running_commands
        .lock()
        .unwrap()
        .get(command_id)
        .map(CancellationToken::cancel)
        .is_some()
}

#[cfg(test)]
mod shell_tests {
    use super::*;

    #[test]
    fn each_system_runs_commands_its_own_way() {
        assert_eq!(shell_program(true, false, Some("zsh")), ("cmd".to_owned(), "/C"));
        assert_eq!(shell_program(false, true, Some("/bin/zsh")), ("/system/bin/sh".to_owned(), "-c"));
        assert_eq!(shell_program(false, false, Some("/bin/bash")), ("/bin/bash".to_owned(), "-lc"));
        assert_eq!(shell_program(false, false, None), ("/bin/zsh".to_owned(), "-lc"));
    }
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
