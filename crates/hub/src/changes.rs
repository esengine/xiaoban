use std::path::Path;

use similar::{ChangeTag, DiffOp, DiffTag, TextDiff};
use xiaoban_protocol::{ChangeStatus, ChangedFile, DiffHunk, DiffKind, DiffLine, Event, FileDiff};

use crate::state::SharedState;

const CONTEXT: usize = 3;
const SNIFF: usize = 8_000;

pub fn binary(bytes: &[u8]) -> bool {
    bytes[..bytes.len().min(SNIFF)].contains(&0) || std::str::from_utf8(bytes).is_err()
}

fn line_number(index: Option<usize>) -> Option<u32> {
    index.map(|i| u32::try_from(i + 1).unwrap_or(u32::MAX))
}

fn trimmed(value: &str) -> String {
    value.trim_end_matches(['\n', '\r']).to_owned()
}

pub fn hunks(old: &str, new: &str) -> (Vec<DiffHunk>, u32, u32) {
    let diff = TextDiff::from_lines(old, new);
    let mut added = 0;
    let mut removed = 0;
    let mut out = Vec::new();
    for group in diff.grouped_ops(CONTEXT) {
        let Some(first) = group.first() else { continue };
        let mut lines = Vec::new();
        for op in &group {
            for change in diff.iter_changes(op) {
                let kind = match change.tag() {
                    ChangeTag::Equal => DiffKind::Same,
                    ChangeTag::Insert => {
                        added += 1;
                        DiffKind::Added
                    }
                    ChangeTag::Delete => {
                        removed += 1;
                        DiffKind::Removed
                    }
                };
                lines.push(DiffLine {
                    kind,
                    old: line_number(change.old_index()),
                    new: line_number(change.new_index()),
                    text: trimmed(change.value()),
                });
            }
        }
        out.push(DiffHunk {
            old_start: line_number(Some(first.old_range().start)).unwrap_or(1),
            new_start: line_number(Some(first.new_range().start)).unwrap_or(1),
            lines,
        });
    }
    (out, added, removed)
}

pub fn revert_hunk(old: &str, new: &str, index: usize) -> Option<String> {
    let diff = TextDiff::from_lines(old, new);
    let groups = diff.grouped_ops(CONTEXT);
    let target: Vec<DiffOp> = groups.get(index)?.clone();
    let old_lines: Vec<&str> = old.split_inclusive('\n').collect();
    let new_lines: Vec<&str> = new.split_inclusive('\n').collect();
    let mut out = String::with_capacity(new.len());
    for op in diff.ops() {
        let (tag, old_range, new_range) = op.as_tag_tuple();
        let undo = tag != DiffTag::Equal && target.contains(op);
        if undo {
            out.extend(old_lines[old_range].iter().copied());
        } else {
            out.extend(new_lines[new_range].iter().copied());
        }
    }
    Some(out)
}

pub fn summary(path: String, before: Option<&[u8]>, after: Option<&[u8]>) -> Option<ChangedFile> {
    let status = match (before, after) {
        (None, None) => return None,
        (None, Some(_)) => ChangeStatus::Added,
        (Some(_), None) => ChangeStatus::Deleted,
        (Some(a), Some(b)) if a == b => return None,
        (Some(_), Some(_)) => ChangeStatus::Modified,
    };
    let text = |bytes: Option<&[u8]>| bytes.map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
    let (_, added, removed) = if before.is_some_and(binary) || after.is_some_and(binary) {
        (Vec::new(), 0, 0)
    } else {
        hunks(&text(before), &text(after))
    };
    Some(ChangedFile {
        path,
        status,
        added,
        removed,
    })
}

pub fn file_diff(path: String, before: Option<&[u8]>, after: Option<&[u8]>) -> Option<FileDiff> {
    let changed = summary(path, before, after)?;
    let is_binary = before.is_some_and(binary) || after.is_some_and(binary);
    let text = |bytes: Option<&[u8]>| bytes.map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
    let hunks = if is_binary {
        Vec::new()
    } else {
        hunks(&text(before), &text(after)).0
    };
    Some(FileDiff {
        path: changed.path,
        status: changed.status,
        added: changed.added,
        removed: changed.removed,
        binary: is_binary,
        hunks,
    })
}

fn current(path: &Path) -> Option<Vec<u8>> {
    std::fs::read(path).ok()
}

pub async fn thread_changes(state: &SharedState, thread_id: &str) -> Vec<FileDiff> {
    let Some(workspace) = crate::workspace::for_thread(state, thread_id).await else {
        return Vec::new();
    };
    let baselines = state.store.baselines(thread_id.to_owned()).await.unwrap_or_default();
    baselines
        .into_iter()
        .filter_map(|baseline| {
            let path = Path::new(&baseline.path);
            let now = current(path);
            file_diff(
                crate::workspace::shown(&workspace, path),
                baseline.content.as_deref(),
                now.as_deref(),
            )
        })
        .collect()
}

pub async fn revert(
    state: &SharedState,
    thread_id: &str,
    shown_path: &str,
    hunk: Option<u32>,
) -> Result<(), String> {
    let workspace = crate::workspace::for_thread(state, thread_id)
        .await
        .ok_or("not a workspace conversation")?;
    let baselines = state
        .store
        .baselines(thread_id.to_owned())
        .await
        .map_err(|failure| failure.to_string())?;
    let baseline = baselines
        .into_iter()
        .find(|baseline| crate::workspace::shown(&workspace, Path::new(&baseline.path)) == shown_path)
        .ok_or("no change recorded for that file")?;
    let path = Path::new(&baseline.path);
    let now = current(path);
    match hunk {
        None => match &baseline.content {
            Some(content) => std::fs::write(path, content).map_err(|failure| failure.to_string())?,
            None => {
                if path.exists() {
                    std::fs::remove_file(path).map_err(|failure| failure.to_string())?;
                }
            }
        },
        Some(index) => {
            let old = baseline.content.as_deref().map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
            let new = now.as_deref().map(|b| String::from_utf8_lossy(b).into_owned()).unwrap_or_default();
            let reverted = revert_hunk(&old, &new, index as usize).ok_or("no such change block")?;
            std::fs::write(path, reverted).map_err(|failure| failure.to_string())?;
        }
    }
    state.publish(Event::FilesChanged {
        workspace_id: workspace.id,
        thread_id: Some(thread_id.to_owned()),
        paths: vec![shown_path.to_owned()],
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_and_reverts_one_block() {
        let old = (1..=20).map(|n| format!("line {n}")).collect::<Vec<_>>().join("\n") + "\n";
        let new = old.replace("line 2\n", "line two\n").replace("line 18\n", "line eighteen\nextra\n");
        let (blocks, added, removed) = hunks(&old, &new);
        assert_eq!(blocks.len(), 2);
        assert_eq!((added, removed), (3, 2));
        let back = revert_hunk(&old, &new, 1).unwrap();
        assert!(back.contains("line two\n"));
        assert!(back.contains("line 18\n") && !back.contains("extra"));
        let status = summary("a".to_owned(), None, Some(b"x\n")).unwrap();
        assert_eq!((status.status, status.added), (ChangeStatus::Added, 1));
        assert!(summary("a".to_owned(), Some(b"x"), Some(b"x")).is_none());
    }
}
