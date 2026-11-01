use std::path::Path;

use xiaoban_protocol::{ConflictBlock, ConflictChoice, ConflictFile, Workspace};

use crate::workspace;

const CONFLICT_CODES: [&str; 7] = ["UU", "AA", "DD", "AU", "UA", "DU", "UD"];

pub fn operation(dir: &Path) -> Option<&'static str> {
    let git = dir.join(".git");
    if git.join("MERGE_HEAD").exists() {
        Some("merge")
    } else if git.join("rebase-merge").exists() || git.join("rebase-apply").exists() {
        Some("rebase")
    } else if git.join("CHERRY_PICK_HEAD").exists() {
        Some("cherry-pick")
    } else if git.join("REVERT_HEAD").exists() {
        Some("revert")
    } else {
        None
    }
}

pub fn conflicted(status_line: &str) -> bool {
    status_line.len() > 3 && CONFLICT_CODES.contains(&&status_line[..2])
}

struct Parsed {
    blocks: Vec<ConflictBlock>,
    spans: Vec<(usize, usize)>,
}

fn parse(text: &str) -> Parsed {
    let lines: Vec<&str> = text.split_inclusive('\n').collect();
    let mut blocks = Vec::new();
    let mut spans = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        if !lines[i].starts_with("<<<<<<<") {
            i += 1;
            continue;
        }
        let start = i;
        let ours_label = lines[i].trim_start_matches('<').trim().to_owned();
        let (mut ours, mut base, mut theirs) = (Vec::new(), None::<Vec<String>>, Vec::new());
        let mut part = 0;
        i += 1;
        let mut end = None;
        while i < lines.len() {
            let line = lines[i];
            if line.starts_with("|||||||") && part == 0 {
                part = 1;
                base = Some(Vec::new());
            } else if line.starts_with("=======") && part < 2 {
                part = 2;
            } else if line.starts_with(">>>>>>>") && part == 2 {
                end = Some((i, line.trim_start_matches('>').trim().to_owned()));
                break;
            } else {
                let text = line.trim_end_matches(['\n', '\r']).to_owned();
                match part {
                    0 => ours.push(text),
                    1 => base.get_or_insert_with(Vec::new).push(text),
                    _ => theirs.push(text),
                }
            }
            i += 1;
        }
        let Some((stop, theirs_label)) = end else { break };
        blocks.push(ConflictBlock {
            index: u32::try_from(blocks.len()).unwrap_or(u32::MAX),
            line: u32::try_from(start + 1).unwrap_or(u32::MAX),
            ours,
            theirs,
            base,
            ours_label,
            theirs_label,
        });
        spans.push((start, stop));
        i = stop + 1;
    }
    Parsed { blocks, spans }
}

pub async fn files(workspace: &Workspace) -> Vec<ConflictFile> {
    let dir = workspace::root(workspace);
    let Some(status) = workspace::git(&dir, &["status", "--porcelain=v1"]).await else {
        return Vec::new();
    };
    status
        .stdout
        .lines()
        .filter(|line| conflicted(line))
        .map(|line| {
            let path = line[3..].trim_matches('"').to_owned();
            let text = std::fs::read_to_string(dir.join(&path)).unwrap_or_default();
            ConflictFile {
                path,
                blocks: parse(&text).blocks,
            }
        })
        .collect()
}

fn pick(block: &ConflictBlock, choice: ConflictChoice, custom: Option<&str>) -> Vec<String> {
    match choice {
        ConflictChoice::Ours => block.ours.clone(),
        ConflictChoice::Theirs => block.theirs.clone(),
        ConflictChoice::Both => block.ours.iter().chain(&block.theirs).cloned().collect(),
        ConflictChoice::Text => custom
            .unwrap_or_default()
            .split('\n')
            .map(str::to_owned)
            .collect(),
    }
}

pub fn apply(text: &str, index: usize, choice: ConflictChoice, custom: Option<&str>) -> Option<String> {
    let parsed = parse(text);
    let block = parsed.blocks.get(index)?;
    let (start, stop) = *parsed.spans.get(index)?;
    let newline = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let lines: Vec<&str> = text.split_inclusive('\n').collect();
    let mut out = String::with_capacity(text.len());
    out.extend(lines[..start].iter().copied());
    for line in pick(block, choice, custom) {
        out.push_str(&line);
        out.push_str(newline);
    }
    out.extend(lines[stop + 1..].iter().copied());
    Some(out)
}

pub async fn resolve(
    workspace: &Workspace,
    path: &str,
    index: u32,
    choice: ConflictChoice,
    custom: Option<&str>,
) -> Result<(), String> {
    let target = workspace::resolve(workspace, path);
    if !target.inside {
        return Err("outside the workspace".to_owned());
    }
    let text = std::fs::read_to_string(&target.path).map_err(|failure| failure.to_string())?;
    let updated = apply(&text, index as usize, choice, custom).ok_or("no such conflict")?;
    std::fs::write(&target.path, &updated).map_err(|failure| failure.to_string())?;
    if parse(&updated).blocks.is_empty() {
        let dir = workspace::root(workspace);
        workspace::git(&dir, &["add", "--", path]).await;
    }
    Ok(())
}

fn last_error(output: Option<workspace::GitOutput>) -> Result<(), String> {
    match output {
        Some(output) if output.ok => Ok(()),
        Some(output) => Err(output.stderr.trim().lines().last().unwrap_or("git failed").to_owned()),
        None => Err("git did not answer".to_owned()),
    }
}

pub async fn finish(workspace: &Workspace) -> Result<(), String> {
    let dir = workspace::root(workspace);
    if !files(workspace).await.is_empty() {
        return Err("there are still conflicts".to_owned());
    }
    let continued = match operation(&dir) {
        Some("rebase") => ["rebase", "--continue"],
        Some("cherry-pick") => ["cherry-pick", "--continue"],
        Some("revert") => ["revert", "--continue"],
        _ => ["commit", "--no-edit"],
    };
    let binary = workspace::git_binary().ok_or("git is not installed")?;
    let output = tokio::process::Command::new(binary)
        .args(continued)
        .current_dir(&dir)
        .env("GIT_EDITOR", "true")
        .env("GIT_TERMINAL_PROMPT", "0")
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|failure| failure.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr)
            .trim()
            .lines()
            .last()
            .unwrap_or("git failed")
            .to_owned())
    }
}

pub async fn abort(workspace: &Workspace) -> Result<(), String> {
    let dir = workspace::root(workspace);
    let args = match operation(&dir) {
        Some("rebase") => ["rebase", "--abort"],
        Some("cherry-pick") => ["cherry-pick", "--abort"],
        Some("revert") => ["revert", "--abort"],
        _ => ["merge", "--abort"],
    };
    last_error(workspace::git(&dir, &args).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEXT: &str = "top\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> main\nmiddle\n<<<<<<< HEAD\na\n||||||| base\nb\n=======\nc\n>>>>>>> main\nend\n";

    #[test]
    fn reads_and_resolves_blocks() {
        let parsed = parse(TEXT);
        assert_eq!(parsed.blocks.len(), 2);
        assert_eq!(parsed.blocks[0].ours, ["ours"]);
        assert_eq!(parsed.blocks[0].theirs, ["theirs"]);
        assert_eq!(parsed.blocks[0].theirs_label, "main");
        assert_eq!(parsed.blocks[1].base.as_deref(), Some(&["b".to_owned()][..]));
        let first = apply(TEXT, 0, ConflictChoice::Theirs, None).unwrap();
        assert!(first.starts_with("top\ntheirs\nmiddle\n<<<<<<<"));
        let both = apply(&first, 0, ConflictChoice::Both, None).unwrap();
        assert_eq!(both, "top\ntheirs\nmiddle\na\nc\nend\n");
        let custom = apply(TEXT, 1, ConflictChoice::Text, Some("merged")).unwrap();
        assert!(custom.contains("middle\nmerged\nend\n"));
        assert!(apply(TEXT, 5, ConflictChoice::Ours, None).is_none());
    }

    #[tokio::test]
    async fn resolves_a_real_merge() {
        if workspace::git_binary().is_none() {
            return;
        }
        let dir = std::env::temp_dir().join(format!("xiaoban-merge-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(&dir).unwrap();
        let run = |args: &[&str]| {
            std::process::Command::new("git")
                .args(["-c", "user.name=t", "-c", "user.email=t@t"])
                .args(args)
                .current_dir(&dir)
                .output()
                .unwrap();
        };
        run(&["init", "-q", "-b", "main"]);
        run(&["config", "user.name", "test"]);
        run(&["config", "user.email", "test@example.com"]);
        std::fs::write(dir.join("a.txt"), "one\n").unwrap();
        run(&["add", "."]);
        run(&["commit", "-qm", "init"]);
        run(&["switch", "-qc", "side"]);
        std::fs::write(dir.join("a.txt"), "side\n").unwrap();
        run(&["commit", "-qam", "side"]);
        run(&["switch", "-q", "main"]);
        std::fs::write(dir.join("a.txt"), "main\n").unwrap();
        run(&["commit", "-qam", "main"]);
        run(&["merge", "side"]);
        let workspace = Workspace {
            id: "w".to_owned(),
            name: "w".to_owned(),
            path: dir.to_string_lossy().into_owned(),
            created_at: 0,
            active_at: 0,
        };
        let info = workspace::info(&workspace).await;
        assert_eq!(info.operation.as_deref(), Some("merge"));
        assert_eq!(info.conflicts, ["a.txt"]);
        let found = files(&workspace).await;
        assert_eq!(found[0].blocks[0].theirs, ["side"]);
        assert!(finish(&workspace).await.is_err());
        resolve(&workspace, "a.txt", 0, ConflictChoice::Both, None).await.unwrap();
        assert_eq!(files(&workspace).await, Vec::new());
        finish(&workspace).await.unwrap();
        let done = workspace::info(&workspace).await;
        assert_eq!((done.operation, done.conflicts.len()), (None, 0));
        assert_eq!(std::fs::read_to_string(dir.join("a.txt")).unwrap(), "main\nside\n");
        std::fs::remove_dir_all(dir).unwrap();
    }
}
