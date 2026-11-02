use std::path::Path;
use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{ChatMessage, ChatRole, NoTools, StablePrefix, Transcript};
use xiaoban_i18n::{Key, keys};
use xiaoban_protocol::{
    ContextNote, ErrorCode, ProtocolError, Response, ShareAction, ShareKind, ShareSuggestion,
    SharedItem, Thread,
};

use crate::files::{Files, Peek};
use crate::state::SharedState;

const MAX_ACTIONS: usize = 3;
const MAX_THREADS: usize = 15;
const TEXT_CHARS: usize = 2_000;
const EXCERPT_CHARS: usize = 3_000;
const TITLE_CHARS: usize = 40;
const MAX_IMAGES: usize = 3;
const FETCH_WAIT: Duration = Duration::from_secs(8);
const MODEL_WAIT: Duration = Duration::from_secs(30);

type Handled = Result<Response, ProtocolError>;

#[derive(Debug, Default, Deserialize)]
struct Guess {
    title: Option<String>,
    source: Option<String>,
    thread: Option<String>,
    #[serde(default)]
    actions: Vec<GuessAction>,
}

#[derive(Debug, Deserialize)]
struct GuessAction {
    label: Option<String>,
    hint: Option<String>,
    prompt: Option<String>,
    done: Option<String>,
    #[serde(default)]
    remember: bool,
}

struct Page {
    title: String,
    content: String,
}

fn bad_request(detail: &str) -> ProtocolError {
    ProtocolError::new(ErrorCode::BadRequest, detail)
}

fn filled(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != "null")
        .map(str::to_owned)
}

fn clip(text: &str, max: usize) -> String {
    if text.chars().count() <= max {
        text.to_owned()
    } else {
        let mut clipped: String = text.chars().take(max).collect();
        clipped.push('…');
        clipped
    }
}

fn link_in(text: &str) -> Option<String> {
    let start = text.find("https://").or_else(|| text.find("http://"))?;
    let link: String = text[start..]
        .chars()
        .take_while(|c| {
            !c.is_whitespace()
                && !matches!(c, '"' | '<' | '>' | '\u{300D}' | '\u{FF09}' | '\u{FF0C}')
        })
        .collect();
    (link.len() > "https://".len()).then_some(link)
}

fn name_of(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn source_of(item: &SharedItem) -> Option<String> {
    let text = item.text.as_deref().unwrap_or_default();
    if let Some(link) = link_in(text) {
        return Some(link);
    }
    if !item.files.is_empty() {
        let names: Vec<String> = item.files.iter().map(|path| name_of(path)).collect();
        return Some(names.join(", "));
    }
    filled(item.subject.as_deref())
}

fn parse(text: &str) -> Guess {
    let start = text.find('{');
    let end = text.rfind('}');
    let guess = match (start, end) {
        (Some(start), Some(end)) if start < end => {
            serde_json::from_str::<Guess>(&text[start..=end]).ok()
        }
        _ => None,
    };
    guess.unwrap_or_else(|| {
        tracing::warn!(text, "unreadable share guess");
        Guess::default()
    })
}

fn checked(state: &SharedState, local: bool, item: &SharedItem) -> Result<(), ProtocolError> {
    if item.files.len() > crate::files::MAX_FILES {
        return Err(bad_request("at most 9 files per share"));
    }
    if !local && item.files.iter().any(|file| !state.files.is_upload(file)) {
        return Err(bad_request("files can only be attached on this computer"));
    }
    let empty = item.files.is_empty()
        && filled(item.text.as_deref()).is_none()
        && filled(item.subject.as_deref()).is_none();
    if empty {
        return Err(bad_request("nothing was shared"));
    }
    Ok(())
}

async fn primary(state: &SharedState) -> Result<Option<String>, ProtocolError> {
    Ok(crate::preferences::load(state).await?.primary_thread_id)
}

async fn landing(state: &SharedState) -> Result<String, ProtocolError> {
    if let Some(id) = primary(state).await? {
        return Ok(id);
    }
    let thread = state.store.create_thread(None).await?;
    state.publish(xiaoban_protocol::Event::ThreadUpdated {
        thread: thread.clone(),
    });
    Ok(thread.id)
}

async fn candidates(
    state: &SharedState,
    primary: Option<&str>,
) -> Result<Vec<Thread>, ProtocolError> {
    let mut threads: Vec<Thread> = state
        .store
        .list_threads()
        .await?
        .into_iter()
        .filter(|thread| {
            Some(thread.id.as_str()) != primary
                && thread.parent_id.is_none()
                && thread.workspace_id.is_none()
                && filled(thread.title.as_deref()).is_some()
        })
        .collect();
    threads.sort_by_key(|thread| std::cmp::Reverse(thread.updated_at));
    threads.truncate(MAX_THREADS);
    Ok(threads)
}

async fn page(state: &SharedState, link: &str) -> Option<Page> {
    let key = crate::trip_requests::search_key(state)?;
    let fetched = tokio::time::timeout(FETCH_WAIT, state.web.fetch(key, link.to_owned()))
        .await
        .ok()?
        .ok()?;
    Some(Page {
        title: fetched.title,
        content: fetched.content,
    })
}

async fn peeks(paths: &[String]) -> Vec<Peek> {
    let paths = paths.to_vec();
    tokio::task::spawn_blocking(move || {
        paths
            .iter()
            .filter_map(|path| Files::peek(Path::new(path)).ok())
            .collect()
    })
    .await
    .unwrap_or_default()
}

fn fallback(state: &SharedState, kind: ShareKind) -> Vec<ShareAction> {
    let sets: &[(Key, Key, Key, bool)] = match kind {
        ShareKind::Image => &[
            (
                keys::SHARE_IMAGE_TODO,
                keys::SHARE_IMAGE_TODO_PROMPT,
                keys::SHARE_IMAGE_TODO_DONE,
                false,
            ),
            (
                keys::SHARE_IMAGE_CALENDAR,
                keys::SHARE_IMAGE_CALENDAR_PROMPT,
                keys::SHARE_IMAGE_CALENDAR_DONE,
                false,
            ),
            (
                keys::SHARE_IMAGE_EXPLAIN,
                keys::SHARE_IMAGE_EXPLAIN_PROMPT,
                keys::SHARE_IMAGE_EXPLAIN_DONE,
                false,
            ),
        ],
        ShareKind::Link => &[
            (
                keys::SHARE_LINK_HIGHLIGHTS,
                keys::SHARE_LINK_HIGHLIGHTS_PROMPT,
                keys::SHARE_LINK_HIGHLIGHTS_DONE,
                true,
            ),
            (
                keys::SHARE_LINK_LATER,
                keys::SHARE_LINK_LATER_PROMPT,
                keys::SHARE_LINK_LATER_DONE,
                false,
            ),
        ],
        ShareKind::File => &[
            (
                keys::SHARE_FILE_REMEMBER,
                keys::SHARE_FILE_REMEMBER_PROMPT,
                keys::SHARE_FILE_REMEMBER_DONE,
                true,
            ),
            (
                keys::SHARE_FILE_REMIND,
                keys::SHARE_FILE_REMIND_PROMPT,
                keys::SHARE_FILE_REMIND_DONE,
                false,
            ),
            (
                keys::SHARE_FILE_RISKS,
                keys::SHARE_FILE_RISKS_PROMPT,
                keys::SHARE_FILE_RISKS_DONE,
                false,
            ),
        ],
        ShareKind::Text => &[
            (
                keys::SHARE_TEXT_REMEMBER,
                keys::SHARE_TEXT_REMEMBER_PROMPT,
                keys::SHARE_TEXT_REMEMBER_DONE,
                true,
            ),
            (
                keys::SHARE_TEXT_TODO,
                keys::SHARE_TEXT_TODO_PROMPT,
                keys::SHARE_TEXT_TODO_DONE,
                false,
            ),
        ],
    };
    let l = &state.localizer;
    sets.iter()
        .map(|(label, prompt, done, remember)| ShareAction {
            label: l.text(*label),
            hint: None,
            prompt: l.text(*prompt),
            done: l.text(*done),
            remember: *remember,
        })
        .collect()
}

fn actions(state: &SharedState, guessed: Vec<GuessAction>) -> Vec<ShareAction> {
    guessed
        .into_iter()
        .filter_map(|action| {
            let label = filled(action.label.as_deref())?;
            let prompt = filled(action.prompt.as_deref())?;
            let done = filled(action.done.as_deref()).unwrap_or_else(|| {
                state
                    .localizer
                    .format(keys::SHARE_DONE_DEFAULT, &[("label", &label)])
            });
            Some(ShareAction {
                hint: filled(action.hint.as_deref()),
                label,
                prompt,
                done,
                remember: action.remember,
            })
        })
        .take(MAX_ACTIONS)
        .collect()
}

async fn guess(state: &SharedState, wire: String, images: Vec<String>) -> Guess {
    let prefix = StablePrefix::new(state.localizer.text(keys::PROMPT_SHARE_SUGGEST));
    let model = (!images.is_empty())
        .then(|| crate::turns::vision_model(state))
        .flatten();
    let (events, _) = mpsc::channel(1);
    let agent = state.active().agent.without_thinking();
    let transcript = Transcript::default();
    let run = agent.run_turn_with(
        &prefix,
        &transcript,
        ChatMessage::new(ChatRole::User, wire).with_images(images),
        model,
        &NoTools,
        events,
        CancellationToken::new(),
    );
    match tokio::time::timeout(MODEL_WAIT, run).await {
        Ok(Ok(outcome)) => parse(&outcome.text),
        Ok(Err(error)) => {
            tracing::warn!(%error, "share guess failed");
            Guess::default()
        }
        Err(_) => {
            tracing::warn!("share guess timed out");
            Guess::default()
        }
    }
}

fn default_title(state: &SharedState, item: &SharedItem, peeked: &[Peek]) -> String {
    if let Some(subject) = filled(item.subject.as_deref()) {
        return clip(&subject, TITLE_CHARS);
    }
    match item.kind {
        ShareKind::Image => state.localizer.text(keys::SHARE_TITLE_IMAGE),
        ShareKind::File => peeked
            .first()
            .map(|peek| peek.name.clone())
            .unwrap_or_default(),
        ShareKind::Link | ShareKind::Text => filled(item.text.as_deref()).map_or_else(
            || state.localizer.text(keys::SHARE_TITLE_TEXT),
            |text| clip(text.lines().next().unwrap_or_default(), TITLE_CHARS),
        ),
    }
}

pub async fn suggest(state: &SharedState, local: bool, item: SharedItem) -> Handled {
    checked(state, local, &item)?;
    let primary = primary(state).await?;
    let threads = candidates(state, primary.as_deref()).await?;
    let plans = crate::plan::list(state).await;
    let text = filled(item.text.as_deref());
    let link = text.as_deref().and_then(link_in);
    let page = match &link {
        Some(link) if item.kind != ShareKind::File && item.kind != ShareKind::Image => {
            page(state, link).await
        }
        _ => None,
    };
    let peeked = peeks(&item.files).await;
    let images: Vec<String> = peeked
        .iter()
        .filter_map(|peek| peek.image.clone())
        .take(MAX_IMAGES)
        .collect();
    let wire = json!({
        "kind": item.kind,
        "subject": item.subject,
        "text": text.as_deref().map(|text| clip(text, TEXT_CHARS)),
        "page": page.as_ref().map(|page| json!({
            "title": page.title,
            "excerpt": clip(&page.content, EXCERPT_CHARS),
            "chars": page.content.chars().count(),
        })),
        "files": peeked.iter().map(|peek| json!({
            "name": peek.name,
            "pages": peek.pages,
            "preview": peek.text,
        })).collect::<Vec<Value>>(),
        "threads": threads.iter().map(|thread| json!({
            "id": thread.id,
            "title": thread.title,
            "plan": plans.iter().find(|plan| plan.thread_id == thread.id).map(|plan| plan.title.clone()),
            "last": thread.last_message.as_deref().map(|last| clip(last, 80)),
        })).collect::<Vec<Value>>(),
        "now": jiff::Zoned::now().strftime("%Y-%m-%d %A %H:%M").to_string(),
    })
    .to_string();
    let guessed = guess(state, wire, images).await;
    let mut chosen = actions(state, guessed.actions);
    if chosen.len() < 2 {
        chosen = fallback(state, item.kind);
    }
    let target = guessed
        .thread
        .as_deref()
        .and_then(|id| threads.iter().find(|thread| thread.id == id.trim()));
    let title = filled(guessed.title.as_deref())
        .or_else(|| {
            page.as_ref()
                .and_then(|page| filled(Some(page.title.as_str())))
        })
        .unwrap_or_else(|| default_title(state, &item, &peeked));
    let source = filled(guessed.source.as_deref()).or_else(|| {
        link.as_deref()
            .and_then(|link| link.split('/').nth(2).map(str::to_owned))
    });
    let size: u64 = peeked.iter().map(|peek| peek.size).sum();
    let pages = peeked.iter().filter_map(|peek| peek.pages).sum::<u32>();
    Ok(Response::ShareSuggested {
        suggestion: ShareSuggestion {
            title: clip(&title, TITLE_CHARS * 2),
            source,
            pages: (pages > 0).then_some(pages),
            chars: page
                .as_ref()
                .and_then(|page| u32::try_from(page.content.chars().count()).ok()),
            size: (size > 0).then_some(size),
            actions: chosen,
            thread_id: target
                .map(|thread| thread.id.clone())
                .or(primary)
                .unwrap_or_default(),
            thread_title: target.and_then(|thread| thread.title.clone()),
        },
    })
}

pub async fn send(
    state: &SharedState,
    local: bool,
    item: SharedItem,
    thread_id: String,
    prompt: &str,
    remember: bool,
) -> Handled {
    checked(state, local, &item)?;
    let prompt = filled(Some(prompt)).ok_or_else(|| bad_request("message is empty"))?;
    let thread_id = match state.store.thread(thread_id).await {
        Ok(thread) => thread.id,
        Err(_) => landing(state).await?,
    };
    let shared = match item.kind {
        ShareKind::Link | ShareKind::Text => filled(item.text.as_deref()),
        ShareKind::Image | ShareKind::File => None,
    };
    let text = match shared {
        Some(shared) if !prompt.contains(&shared) => format!("{prompt}\n\n{shared}"),
        _ => prompt,
    };
    let source = source_of(&item);
    let mut context = Vec::new();
    if let Some(subject) = filled(item.subject.as_deref()) {
        context.push(ContextNote {
            label: state.localizer.text(keys::SHARE_CONTEXT_LABEL),
            body: subject,
        });
    }
    if remember && let Some(source) = &source {
        context.push(ContextNote {
            label: state.localizer.text(keys::SHARE_CONTEXT_LABEL),
            body: state
                .localizer
                .format(keys::SHARE_REMEMBER_RULE, &[("source", source)]),
        });
    }
    let (turn_id, message) =
        crate::turns::start(state, thread_id, text, context, None, item.files, None).await?;
    Ok(Response::TurnAccepted { turn_id, message })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links_are_cut_out_of_shared_text() {
        assert_eq!(
            link_in("2026 年家装避坑指南 https://mp.weixin.qq.com/s/abc 来自公众号").as_deref(),
            Some("https://mp.weixin.qq.com/s/abc")
        );
        assert_eq!(link_in("没有链接"), None);
        assert_eq!(link_in("https:// "), None);
    }

    #[test]
    fn guesses_tolerate_fences_and_nulls() {
        let guess = parse(
            "```json\n{\"title\":\"房屋租赁合同.pdf\",\"source\":null,\"thread\":\"null\",\"actions\":[{\"label\":\"记住要点\",\"hint\":\"租金、押金\",\"prompt\":\"读完记住要点\",\"done\":\"读完记住\",\"remember\":true}]}\n```",
        );
        assert_eq!(guess.title.as_deref(), Some("房屋租赁合同.pdf"));
        assert_eq!(filled(guess.thread.as_deref()), None);
        assert_eq!(guess.actions.len(), 1);
        assert!(guess.actions[0].remember);
        assert!(parse("不是 JSON").actions.is_empty());
    }

    #[test]
    fn sources_prefer_links_then_file_names() {
        let item = SharedItem {
            kind: ShareKind::File,
            text: None,
            subject: None,
            files: vec!["/tmp/uploads/1/房屋租赁合同.pdf".into()],
        };
        assert_eq!(source_of(&item).as_deref(), Some("房屋租赁合同.pdf"));
        let link = SharedItem {
            kind: ShareKind::Link,
            text: Some("看看这个 https://example.com/a".into()),
            subject: None,
            files: Vec::new(),
        };
        assert_eq!(source_of(&link).as_deref(), Some("https://example.com/a"));
    }
}
