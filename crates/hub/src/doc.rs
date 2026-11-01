use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{
    Attachment, BlockKind, ContextNote, Doc, DocBlock, DocFormat, DocMark, DocSuggestion, DocSummary, DocVersionInfo,
    ErrorCode, Event, ProtocolError, Request, Response,
};
use xiaoban_store::now_ms;

use crate::state::SharedState;
use crate::tools::HubTools;

pub const START: &str = "doc_start";
pub const SECTION: &str = "doc_section";
pub const EDIT: &str = "doc_edit";
pub const SUGGEST: &str = "doc_suggest";
const MAX_BLOCKS: usize = 800;
const MAX_SECTIONS: usize = 30;

pub fn is_tool(name: &str) -> bool {
    matches!(name, START | SECTION | EDIT | SUGGEST)
}

fn doc_key(id: &str) -> String {
    format!("doc.{id}")
}

fn version_key(id: &str, version: u32) -> String {
    format!("doc.{id}.v{version}")
}

fn thread_key(thread_id: &str) -> String {
    format!("doc.thread.{thread_id}")
}

async fn read<T: serde::de::DeserializeOwned>(state: &SharedState, key: String) -> Option<T> {
    state
        .store
        .setting_owned(key)
        .await
        .ok()
        .flatten()
        .filter(|text| !text.is_empty())
        .and_then(|text| serde_json::from_str(&text).ok())
}

async fn write<T: serde::Serialize>(state: &SharedState, key: String, value: &T) {
    let _ = state
        .store
        .set_setting_owned(key, serde_json::to_string(value).unwrap_or_default())
        .await;
}

pub async fn load(state: &SharedState, id: &str) -> Option<Doc> {
    read(state, doc_key(id)).await
}

pub fn summary(doc: &Doc) -> DocSummary {
    DocSummary {
        id: doc.id.clone(),
        source_thread_id: doc.source_thread_id.clone(),
        title: doc.title.clone(),
        sections: doc
            .blocks
            .iter()
            .filter(|block| block.kind == BlockKind::H2)
            .map(|block| block.text.clone())
            .collect(),
        chars: u32::try_from(doc.blocks.iter().map(|block| block.text.chars().count()).sum::<usize>()).unwrap_or(u32::MAX),
        written: doc.written,
        total: u32::try_from(doc.outline.len()).unwrap_or(0),
        writing: doc.writing,
        updated_at: doc.updated_at,
    }
}

async fn save(state: &SharedState, doc: &mut Doc) {
    doc.updated_at = now_ms();
    write(state, doc_key(&doc.id), doc).await;
    state.publish(Event::DocUpdated { summary: summary(doc) });
}

async fn snapshot(state: &SharedState, doc: &mut Doc, note: String, by_user: bool) {
    doc.version += 1;
    write(state, version_key(&doc.id, doc.version), &doc.blocks).await;
    doc.versions.push(DocVersionInfo {
        version: doc.version,
        note,
        by_user,
        at: now_ms(),
    });
}

fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}

pub async fn for_thread(state: &SharedState, thread_id: &str) -> Option<Doc> {
    let id: String = state.store.setting_owned(thread_key(thread_id)).await.ok().flatten().filter(|id| !id.is_empty())?;
    load(state, &id).await
}

pub async fn is_doc_thread(state: &SharedState, thread_id: &str) -> bool {
    state
        .store
        .setting_owned(thread_key(thread_id))
        .await
        .ok()
        .flatten()
        .is_some_and(|id| !id.is_empty())
}

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

fn blocks_schema(l: &Localizer) -> Value {
    json!({ "type": "array", "items": {
        "type": "object",
        "properties": {
            "kind": { "type": "string", "enum": ["h3", "p", "bullet", "number", "quote"], "description": l.text(keys::TOOL_DOC_KIND) },
            "text": text(l, keys::TOOL_DOC_TEXT),
        },
        "required": ["kind", "text"],
        "additionalProperties": false,
    } })
}

pub fn with_write_specs(mut tools: Vec<ToolSpec>, l: &Localizer) -> Vec<ToolSpec> {
    tools.extend(write_specs(l));
    tools
}

fn write_specs(l: &Localizer) -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: START.to_owned(),
            description: l.text(keys::TOOL_DOC_START_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "title": text(l, keys::TOOL_DOC_TITLE),
                    "subtitle": text(l, keys::TOOL_DOC_SUBTITLE),
                    "sections": { "type": "array", "items": { "type": "string" }, "maxItems": MAX_SECTIONS, "description": l.text(keys::TOOL_DOC_SECTIONS) },
                },
                "required": ["title", "sections"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: SECTION.to_owned(),
            description: l.text(keys::TOOL_DOC_SECTION_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "doc_id": text(l, keys::TOOL_DOC_ID),
                    "heading": text(l, keys::TOOL_DOC_HEADING),
                    "blocks": blocks_schema(l),
                },
                "required": ["doc_id", "heading", "blocks"],
                "additionalProperties": false,
            }),
        },
    ]
}

pub fn edit_specs(l: &Localizer) -> Vec<ToolSpec> {
    let change = json!({
        "type": "object",
        "properties": {
            "op": { "type": "string", "enum": ["replace", "insert_after", "delete"], "description": l.text(keys::TOOL_DOC_OP) },
            "block_id": text(l, keys::TOOL_DOC_BLOCK_ID),
            "blocks": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "kind": { "type": "string", "enum": ["h2", "h3", "p", "bullet", "number", "quote"] },
                        "text": text(l, keys::TOOL_DOC_TEXT),
                    },
                    "required": ["kind", "text"],
                    "additionalProperties": false,
                },
            },
        },
        "required": ["op", "block_id"],
        "additionalProperties": false,
    });
    vec![
        ToolSpec {
            name: EDIT.to_owned(),
            description: l.text(keys::TOOL_DOC_EDIT_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "note": text(l, keys::TOOL_DOC_NOTE),
                    "title": text(l, keys::TOOL_DOC_TITLE),
                    "changes": { "type": "array", "items": change },
                },
                "required": ["note", "changes"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: SUGGEST.to_owned(),
            description: l.text(keys::TOOL_DOC_SUGGEST_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "block_id": text(l, keys::TOOL_DOC_BLOCK_ID),
                    "action": text(l, keys::TOOL_DOC_ACTION),
                    "after": text(l, keys::TOOL_DOC_AFTER),
                },
                "required": ["block_id", "action", "after"],
                "additionalProperties": false,
            }),
        },
    ]
}

fn kind_of(name: &str) -> BlockKind {
    match name {
        "h1" => BlockKind::H1,
        "h2" => BlockKind::H2,
        "h3" => BlockKind::H3,
        "bullet" => BlockKind::Bullet,
        "number" => BlockKind::Number,
        "quote" => BlockKind::Quote,
        _ => BlockKind::P,
    }
}

#[derive(Deserialize)]
struct BlockArg {
    #[serde(default)]
    kind: String,
    #[serde(default)]
    text: String,
}

fn blocks_from(args: Vec<BlockArg>) -> Vec<DocBlock> {
    args.into_iter()
        .filter(|block| !block.text.trim().is_empty())
        .map(|block| DocBlock {
            id: new_id(),
            kind: kind_of(&block.kind),
            text: block.text.trim().to_owned(),
        })
        .collect()
}

#[derive(Deserialize)]
struct StartArgs {
    title: String,
    #[serde(default)]
    subtitle: String,
    sections: Vec<String>,
}

#[derive(Deserialize)]
struct SectionArgs {
    doc_id: String,
    heading: String,
    blocks: Vec<BlockArg>,
}

#[derive(Deserialize)]
struct Change {
    op: String,
    block_id: String,
    #[serde(default)]
    blocks: Vec<BlockArg>,
}

#[derive(Deserialize)]
struct EditArgs {
    note: String,
    #[serde(default)]
    title: Option<String>,
    changes: Vec<Change>,
}

#[derive(Deserialize)]
struct SuggestArgs {
    block_id: String,
    action: String,
    after: String,
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

fn apply(doc: &mut Doc, changes: Vec<Change>) -> usize {
    let mut applied = 0;
    for change in changes {
        let Some(index) = doc.blocks.iter().position(|block| block.id == change.block_id) else {
            continue;
        };
        let fresh = blocks_from(change.blocks);
        match change.op.as_str() {
            "delete" => {
                doc.blocks.remove(index);
                doc.marks.retain(|mark| mark.block_id != change.block_id);
            }
            "insert_after" => {
                for (offset, block) in fresh.into_iter().enumerate() {
                    doc.marks.push(DocMark { block_id: block.id.clone(), before: None });
                    doc.blocks.insert(index + 1 + offset, block);
                }
            }
            _ => {
                let old = doc.blocks.remove(index);
                let mut fresh = fresh.into_iter();
                if let Some(mut first) = fresh.next() {
                    first.id.clone_from(&old.id);
                    if !doc.marks.iter().any(|mark| mark.block_id == old.id) {
                        doc.marks.push(DocMark { block_id: old.id.clone(), before: Some(old.text.clone()) });
                    }
                    doc.blocks.insert(index, first);
                    for (offset, block) in fresh.enumerate() {
                        doc.marks.push(DocMark { block_id: block.id.clone(), before: None });
                        doc.blocks.insert(index + 1 + offset, block);
                    }
                } else {
                    doc.blocks.insert(index, old);
                    continue;
                }
            }
        }
        applied += 1;
    }
    doc.blocks.truncate(MAX_BLOCKS);
    applied
}

impl HubTools<'_> {
    pub(crate) async fn doc_tool(&self, name: &str, arguments: &str) -> String {
        let state = self.state;
        let l = &state.localizer;
        match name {
            START => {
                let Ok(args) = serde_json::from_str::<StartArgs>(arguments) else {
                    return error("arguments must be {title, subtitle?, sections: [...]}");
                };
                let mut doc = Doc {
                    id: new_id(),
                    source_thread_id: self.thread_id.to_owned(),
                    title: args.title.trim().to_owned(),
                    subtitle: args.subtitle.trim().to_owned(),
                    outline: args.sections.into_iter().take(MAX_SECTIONS).collect(),
                    writing: true,
                    blocks: Vec::new(),
                    ..Doc::default()
                };
                doc.blocks.push(DocBlock { id: new_id(), kind: BlockKind::H1, text: doc.title.clone() });
                save(state, &mut doc).await;
                self.attach(Attachment::Doc { doc_id: doc.id.clone() });
                json!({ "doc_id": doc.id, "hint": "now call doc_section once per section, in order" }).to_string()
            }
            SECTION => {
                let Ok(args) = serde_json::from_str::<SectionArgs>(arguments) else {
                    return error("arguments must be {doc_id, heading, blocks: [{kind, text}]}");
                };
                let Some(mut doc) = load(state, &args.doc_id).await else {
                    return error("no document with that id");
                };
                doc.blocks.push(DocBlock { id: new_id(), kind: BlockKind::H2, text: args.heading.trim().to_owned() });
                doc.blocks.extend(blocks_from(args.blocks));
                doc.blocks.truncate(MAX_BLOCKS);
                doc.written += 1;
                let total = u32::try_from(doc.outline.len()).unwrap_or(0);
                let left = total.saturating_sub(doc.written);
                if left == 0 && doc.writing {
                    doc.writing = false;
                    snapshot(state, &mut doc, l.text(keys::DOC_VERSION_FIRST), false).await;
                }
                save(state, &mut doc).await;
                self.attach(Attachment::Doc { doc_id: doc.id.clone() });
                if left == 0 {
                    json!({ "done": true, "hint": "the document is ready; reply in one or two sentences, do not repeat the content" }).to_string()
                } else {
                    json!({ "written": doc.written, "left": left }).to_string()
                }
            }
            EDIT => {
                let Some(mut doc) = for_thread(state, self.thread_id).await else {
                    return error("this conversation has no document");
                };
                let Ok(args) = serde_json::from_str::<EditArgs>(arguments) else {
                    return error("arguments must be {note, title?, changes: [{op, block_id, blocks?}]}");
                };
                if doc.versions.last().is_some_and(|last| last.version == doc.version) && user_changed(state, &doc).await {
                    snapshot(state, &mut doc, l.text(keys::DOC_VERSION_USER), true).await;
                }
                if let Some(title) = args.title.map(|title| title.trim().to_owned()).filter(|title| !title.is_empty()) {
                    doc.title.clone_from(&title);
                    if let Some(first) = doc.blocks.iter_mut().find(|block| block.kind == BlockKind::H1) {
                        first.text = title;
                    }
                }
                let applied = apply(&mut doc, args.changes);
                snapshot(state, &mut doc, args.note, false).await;
                save(state, &mut doc).await;
                json!({ "applied": applied, "version": doc.version, "hint": "changes are shown in green in the document; reply in one short sentence" }).to_string()
            }
            _ => {
                let Some(mut doc) = for_thread(state, self.thread_id).await else {
                    return error("this conversation has no document");
                };
                let Ok(args) = serde_json::from_str::<SuggestArgs>(arguments) else {
                    return error("arguments must be {block_id, action, after}");
                };
                let Some(block) = doc.blocks.iter().find(|block| block.id == args.block_id) else {
                    return error("no block with that id");
                };
                doc.suggestions.retain(|item| item.block_id != args.block_id);
                doc.suggestions.push(DocSuggestion {
                    id: new_id(),
                    block_id: args.block_id,
                    action: args.action,
                    before: block.text.clone(),
                    after: args.after.trim().to_owned(),
                });
                save(state, &mut doc).await;
                json!({ "saved": true, "hint": "the suggestion is shown beside the document with buttons; do not repeat it, reply with at most one short sentence" }).to_string()
            }
        }
    }
}

async fn user_changed(state: &SharedState, doc: &Doc) -> bool {
    let saved: Option<Vec<DocBlock>> = read(state, version_key(&doc.id, doc.version)).await;
    saved.is_some_and(|blocks| blocks != doc.blocks)
}

pub async fn note(state: &SharedState, thread_id: &str) -> Option<ContextNote> {
    let doc = for_thread(state, thread_id).await?;
    let lines: Vec<String> = doc
        .blocks
        .iter()
        .map(|block| format!("[{}|{}] {}", block.id, serde_json::to_value(block.kind).ok().and_then(|value| value.as_str().map(str::to_owned)).unwrap_or_default(), block.text))
        .collect();
    Some(ContextNote {
        label: state.localizer.format(keys::DOC_CONTEXT_LABEL, &[("title", doc.title.as_str())]),
        body: lines.join("\n"),
    })
}

async fn open(state: &SharedState, id: &str) -> Result<Doc, ProtocolError> {
    static OPENING: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    let _guard = OPENING.lock().await;
    let mut doc = load(state, id)
        .await
        .ok_or_else(|| ProtocolError::new(ErrorCode::NotFound, "document not found"))?;
    let parent = state
        .store
        .thread(doc.source_thread_id.clone())
        .await
        .ok()
        .map(|thread| thread.parent_id.unwrap_or(thread.id));
    if let Some(thread) = doc.thread_id.clone()
        && let Ok(found) = state.store.thread(thread.clone()).await
    {
        if found.parent_id.is_none()
            && let Some(parent) = parent
            && let Ok(moved) = state.store.set_thread_parent(thread, parent).await
        {
            state.publish(Event::ThreadUpdated { thread: moved });
        }
        return Ok(doc);
    }
    let created = state
        .store
        .create_child_thread(Some(doc.title.clone()), parent)
        .await
        .map_err(|failure| ProtocolError::new(ErrorCode::Internal, failure.to_string()))?;
    let _ = state.store.set_setting_owned(thread_key(&created.id), doc.id.clone()).await;
    state.publish(Event::ThreadUpdated { thread: created.clone() });
    doc.thread_id = Some(created.id);
    save(state, &mut doc).await;
    Ok(doc)
}

fn markdown(doc: &Doc) -> String {
    let mut out = String::new();
    let mut number = 0;
    for block in &doc.blocks {
        if block.kind != BlockKind::Number {
            number = 0;
        }
        let line = match block.kind {
            BlockKind::H1 => format!("# {}\n", block.text),
            BlockKind::H2 => format!("\n## {}\n", block.text),
            BlockKind::H3 => format!("\n### {}\n", block.text),
            BlockKind::Bullet => format!("- {}", block.text),
            BlockKind::Number => {
                number += 1;
                format!("{number}. {}", block.text)
            }
            BlockKind::Quote => format!("> {}\n", block.text),
            BlockKind::P => format!("{}\n", block.text),
        };
        out.push_str(&line);
        out.push('\n');
        if block.kind == BlockKind::H1 && !doc.subtitle.is_empty() {
            out.push_str(&doc.subtitle);
            out.push_str("\n\n");
        }
    }
    out
}

fn runs(text: &str, size: usize) -> docx_rs::Paragraph {
    let mut paragraph = docx_rs::Paragraph::new();
    for (index, part) in text.split("**").enumerate() {
        if part.is_empty() {
            continue;
        }
        let mut run = docx_rs::Run::new().add_text(part).size(size);
        if index % 2 == 1 {
            run = run.bold();
        }
        paragraph = paragraph.add_run(run);
    }
    paragraph
}

fn docx(doc: &Doc, path: &std::path::Path) -> Result<(), String> {
    let mut file = docx_rs::Docx::new();
    let mut number = 0;
    for block in &doc.blocks {
        if block.kind != BlockKind::Number {
            number = 0;
        }
        let paragraph = match block.kind {
            BlockKind::H1 => runs(&format!("**{}**", block.text), 40),
            BlockKind::H2 => runs(&format!("**{}**", block.text), 32),
            BlockKind::H3 => runs(&format!("**{}**", block.text), 26),
            BlockKind::Bullet => runs(&format!("• {}", block.text), 22),
            BlockKind::Number => {
                number += 1;
                runs(&format!("{number}. {}", block.text), 22)
            }
            BlockKind::Quote => runs(&block.text, 22).indent(Some(420), None, None, None),
            BlockKind::P => runs(&block.text, 22),
        };
        file = file.add_paragraph(paragraph);
        if block.kind == BlockKind::H1 && !doc.subtitle.is_empty() {
            file = file.add_paragraph(runs(&doc.subtitle, 20));
        }
    }
    let out = std::fs::File::create(path).map_err(|error| error.to_string())?;
    file.build().pack(out).map_err(|error| error.to_string())
}

fn unique(path: &std::path::Path) -> std::path::PathBuf {
    if !path.exists() {
        return path.to_path_buf();
    }
    let stem = path.file_stem().map(|stem| stem.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = path.extension().map(|ext| ext.to_string_lossy().into_owned()).unwrap_or_default();
    let dir = path.parent().map(std::path::Path::to_path_buf).unwrap_or_default();
    (2..1000)
        .map(|n| dir.join(format!("{stem} ({n}).{ext}")))
        .find(|candidate| !candidate.exists())
        .unwrap_or_else(|| path.to_path_buf())
}

pub async fn handle(state: &SharedState, local: bool, request: Request) -> Result<Response, ProtocolError> {
    let id = match &request {
        Request::Doc { id }
        | Request::DocSummary { id }
        | Request::OpenDoc { id }
        | Request::SetDocBlocks { id, .. }
        | Request::ResolveMark { id, .. }
        | Request::ResolveSuggestion { id, .. }
        | Request::RestoreDocVersion { id, .. }
        | Request::DocVersionBlocks { id, .. }
        | Request::ExportDoc { id, .. } => id.clone(),
        _ => return Err(ProtocolError::new(ErrorCode::BadRequest, "not a document request")),
    };
    let missing = || ProtocolError::new(ErrorCode::NotFound, "document not found");
    match request {
        Request::DocSummary { .. } => {
            let doc = load(state, &id).await.ok_or_else(missing)?;
            return Ok(Response::DocSummary { summary: summary(&doc) });
        }
        Request::OpenDoc { .. } => return Ok(Response::Doc { doc: open(state, &id).await? }),
        Request::DocVersionBlocks { version, .. } => {
            let blocks: Vec<DocBlock> = read(state, version_key(&id, version)).await.unwrap_or_default();
            return Ok(Response::DocBlocks { blocks });
        }
        Request::ExportDoc { format, path, .. } => {
            if !local {
                return Err(ProtocolError::new(ErrorCode::Unauthorized, "only the hub's own machine can export"));
            }
            let doc = load(state, &id).await.ok_or_else(missing)?;
            let target = unique(std::path::Path::new(&path));
            let result = match format {
                DocFormat::Docx => {
                    let target = target.clone();
                    tokio::task::spawn_blocking(move || docx(&doc, &target)).await.unwrap_or_else(|_| Err("stopped".to_owned()))
                }
                DocFormat::Markdown => std::fs::write(&target, markdown(&doc)).map_err(|error| error.to_string()),
            };
            result.map_err(|failure| ProtocolError::new(ErrorCode::Internal, failure))?;
            return Ok(Response::Exported { path: target.to_string_lossy().into_owned() });
        }
        _ => {}
    }
    let doc = load(state, &id).await.ok_or_else(missing)?;
    Ok(Response::Doc { doc: change(state, &id, doc, request).await })
}

async fn change(state: &SharedState, id: &str, mut doc: Doc, request: Request) -> Doc {
    match request {
        Request::SetDocBlocks { blocks, .. } => {
            let blocks: Vec<DocBlock> = blocks.into_iter().take(MAX_BLOCKS).collect();
            for block in &blocks {
                let before = doc.blocks.iter().find(|known| known.id == block.id);
                if before.is_none_or(|known| known.text != block.text) {
                    doc.marks.retain(|mark| mark.block_id != block.id);
                }
            }
            doc.marks.retain(|mark| blocks.iter().any(|block| block.id == mark.block_id));
            if let Some(first) = blocks.iter().find(|block| block.kind == BlockKind::H1) {
                doc.title.clone_from(&first.text);
            }
            doc.blocks = blocks;
            save(state, &mut doc).await;
        }
        Request::ResolveMark { block_id, keep, .. } => {
            if let Some(index) = doc.marks.iter().position(|mark| mark.block_id == block_id) {
                let mark = doc.marks.remove(index);
                if !keep {
                    match mark.before {
                        Some(before) => {
                            if let Some(block) = doc.blocks.iter_mut().find(|block| block.id == block_id) {
                                block.text = before;
                            }
                        }
                        None => doc.blocks.retain(|block| block.id != block_id),
                    }
                }
            }
            save(state, &mut doc).await;
        }
        Request::ResolveSuggestion { suggestion_id, accept, .. } => {
            if let Some(index) = doc.suggestions.iter().position(|item| item.id == suggestion_id) {
                let item = doc.suggestions.remove(index);
                if accept && let Some(block) = doc.blocks.iter_mut().find(|block| block.id == item.block_id) {
                    if !doc.marks.iter().any(|mark| mark.block_id == item.block_id) {
                        doc.marks.push(DocMark { block_id: item.block_id.clone(), before: Some(block.text.clone()) });
                    }
                    block.text = item.after;
                }
            }
            save(state, &mut doc).await;
        }
        Request::RestoreDocVersion { version, .. } => {
            if let Some(blocks) = read::<Vec<DocBlock>>(state, version_key(id, version)).await {
                doc.blocks = blocks;
                doc.marks.clear();
                doc.suggestions.clear();
                let note = state.localizer.format(keys::DOC_VERSION_RESTORED, &[("version", &version.to_string())]);
                snapshot(state, &mut doc, note, true).await;
                save(state, &mut doc).await;
            }
        }
        _ => {}
    }
    doc
}

#[cfg(test)]
mod tests {
    use super::*;

    fn block(id: &str, text: &str) -> DocBlock {
        DocBlock { id: id.to_owned(), kind: BlockKind::P, text: text.to_owned() }
    }

    #[test]
    fn edits_replace_insert_and_delete_with_marks() {
        let mut doc = Doc { blocks: vec![block("a", "one"), block("b", "two"), block("c", "three")], ..Doc::default() };
        let applied = apply(
            &mut doc,
            vec![
                Change { op: "replace".into(), block_id: "a".into(), blocks: vec![BlockArg { kind: "p".into(), text: "ONE".into() }] },
                Change { op: "insert_after".into(), block_id: "b".into(), blocks: vec![BlockArg { kind: "bullet".into(), text: "new".into() }] },
                Change { op: "delete".into(), block_id: "c".into(), blocks: vec![] },
            ],
        );
        assert_eq!(applied, 3);
        let texts: Vec<&str> = doc.blocks.iter().map(|block| block.text.as_str()).collect();
        assert_eq!(texts, ["ONE", "two", "new"]);
        assert_eq!(doc.blocks[0].id, "a");
        assert_eq!(doc.marks.len(), 2);
        assert_eq!(doc.marks[0].before.as_deref(), Some("one"));
    }

    #[test]
    fn markdown_numbers_lists_and_keeps_headings() {
        let doc = Doc {
            subtitle: "sub".into(),
            blocks: vec![
                DocBlock { id: "1".into(), kind: BlockKind::H1, text: "T".into() },
                DocBlock { id: "2".into(), kind: BlockKind::Number, text: "x".into() },
                DocBlock { id: "3".into(), kind: BlockKind::Number, text: "y".into() },
            ],
            ..Doc::default()
        };
        let out = markdown(&doc);
        assert!(out.starts_with("# T\n"));
        assert!(out.contains("1. x") && out.contains("2. y"));
    }

    #[test]
    fn docx_file_is_written() {
        let doc = Doc {
            blocks: vec![
                DocBlock { id: "1".into(), kind: BlockKind::H1, text: "标题".into() },
                DocBlock { id: "2".into(), kind: BlockKind::P, text: "正文 **加粗** 结束".into() },
            ],
            ..Doc::default()
        };
        let path = std::env::temp_dir().join(format!("doc-test-{}.docx", new_id()));
        docx(&doc, &path).unwrap();
        assert!(std::fs::metadata(&path).unwrap().len() > 1000);
    }
}
