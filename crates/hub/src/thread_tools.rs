use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{ContextNote, Message, Role, Thread};

use crate::state::SharedState;
use crate::tools::HubTools;

pub const LIST_THREADS: &str = "list_threads";
pub const FIND_THREADS: &str = "find_threads";
pub const READ_THREAD: &str = "read_thread";
const RECENT: usize = 6;
const REFERENCE_CHARS: usize = 2_000;
const READ_CHARS: usize = 6_000;
const MAX_FOUND: usize = 8;
const LIST_PAGE: usize = 30;
const OPENER_CHARS: usize = 60;

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

pub fn specs(l: &Localizer) -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: LIST_THREADS.to_owned(),
            description: l.text(keys::TOOL_LIST_THREADS_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "page": { "type": "integer", "minimum": 0, "description": l.text(keys::TOOL_PAGE) },
                },
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: FIND_THREADS.to_owned(),
            description: l.text(keys::TOOL_FIND_THREADS_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": { "query": text(l, keys::TOOL_FIND_THREADS_QUERY) },
                "required": ["query"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: READ_THREAD.to_owned(),
            description: l.text(keys::TOOL_READ_THREAD_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "thread": text(l, keys::TOOL_READ_THREAD_ID),
                    "page": { "type": "integer", "minimum": 0, "description": l.text(keys::TOOL_READ_THREAD_PAGE) },
                },
                "required": ["thread"],
                "additionalProperties": false,
            }),
        },
    ]
}

fn line(message: &Message) -> String {
    let role = if message.role == Role::User {
        "user"
    } else {
        "assistant"
    };
    format!("[{role}] {}", message.text)
}

fn tail(messages: &[Message], budget: usize) -> String {
    let mut lines: Vec<String> = Vec::new();
    let mut used = 0;
    for message in messages.iter().rev() {
        let entry = line(message);
        let cost = entry.chars().count();
        if used + cost > budget && !lines.is_empty() {
            break;
        }
        used += cost;
        lines.push(entry.chars().take(budget).collect());
    }
    lines.reverse();
    lines.join("\n")
}

fn title_of(thread: &Thread) -> String {
    thread.title.clone().unwrap_or_default()
}

async fn summary(state: &SharedState, thread_id: &str) -> Option<String> {
    state
        .store
        .setting_owned(format!("archive.summary.{thread_id}"))
        .await
        .ok()
        .flatten()
}

pub async fn reference(state: &SharedState, thread_id: &str) -> Option<ContextNote> {
    let thread = state.store.thread(thread_id.to_owned()).await.ok()?;
    let messages = state.store.list_messages(thread_id.to_owned()).await.ok()?;
    let recent: Vec<Message> = messages.iter().rev().take(RECENT).rev().cloned().collect();
    let mut body = String::new();
    if let Some(summary) = summary(state, thread_id).await {
        body.push_str(&summary);
        body.push_str("\n\n");
    }
    body.push_str(&tail(&recent, REFERENCE_CHARS));
    Some(ContextNote {
        label: state.localizer.format(
            keys::THREAD_REFERENCE_LABEL,
            &[("title", &title_of(&thread))],
        ),
        body,
    })
}

#[derive(Deserialize)]
struct FindArgs {
    query: String,
}

#[derive(Deserialize)]
struct ReadArgs {
    thread: String,
    #[serde(default)]
    page: usize,
}

#[derive(Deserialize)]
struct ListArgs {
    #[serde(default)]
    page: usize,
}

fn pages_from_newest(messages: &[Message], budget: usize) -> Vec<(usize, usize)> {
    let mut pages = Vec::new();
    let mut end = messages.len();
    while end > 0 {
        let mut start = end;
        let mut used = 0;
        while start > 0 {
            let cost = line(&messages[start - 1]).chars().count();
            if used + cost > budget && start < end {
                break;
            }
            used += cost;
            start -= 1;
        }
        pages.push((start, end));
        end = start;
    }
    pages
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

impl HubTools<'_> {
    pub(crate) async fn list_threads(&self, arguments: &str) -> String {
        let args = serde_json::from_str::<ListArgs>(arguments).unwrap_or(ListArgs { page: 0 });
        let (Ok(threads), Ok(openers)) = (
            self.state.store.list_threads().await,
            self.state.store.thread_openers().await,
        ) else {
            return error("conversations are unavailable right now");
        };
        let mut others: Vec<&Thread> = threads
            .iter()
            .filter(|thread| thread.id != self.thread_id)
            .collect();
        others.sort_by_key(|thread| std::cmp::Reverse(thread.updated_at));
        let total = others.len();
        json!({
            "page": args.page,
            "pages": total.div_ceil(LIST_PAGE),
            "threads": others
                .into_iter()
                .skip(args.page * LIST_PAGE)
                .take(LIST_PAGE)
                .map(|thread| {
                    let opener = openers.iter().find(|(id, _, _)| *id == thread.id);
                    json!({
                        "id": thread.id,
                        "title": title_of(thread),
                        "updated": thread.updated_at,
                        "messages": opener.map_or(0, |(_, _, count)| *count),
                        "opener": opener.map(|(_, text, _)| text.chars().take(OPENER_CHARS).collect::<String>()),
                    })
                })
                .collect::<Vec<_>>(),
        })
        .to_string()
    }

    pub(crate) async fn find_threads(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<FindArgs>(arguments) else {
            return error("arguments must be {query}");
        };
        let Ok(threads) = self.state.store.list_threads().await else {
            return error("conversations are unavailable right now");
        };
        let wanted = crate::archive::wanted(&args.query);
        let mut found = Vec::new();
        for thread in threads.iter().filter(|thread| thread.id != self.thread_id) {
            let messages = self
                .state
                .store
                .list_messages(thread.id.clone())
                .await
                .unwrap_or_default();
            let title_hits = crate::archive::score(&title_of(thread), &wanted) * 3;
            let body_hits: usize = messages
                .iter()
                .map(|message| crate::archive::score(&message.text, &wanted))
                .max()
                .unwrap_or(0);
            let score = title_hits + body_hits;
            if score > 0 {
                found.push((
                    score,
                    thread,
                    messages
                        .last()
                        .map(|message| crate::archive::snippet(&message.text)),
                ));
            }
        }
        found.sort_by_key(|(score, _, _)| std::cmp::Reverse(*score));
        json!({
            "threads": found
                .into_iter()
                .take(MAX_FOUND)
                .map(|(_, thread, last)| json!({
                    "id": thread.id,
                    "title": title_of(thread),
                    "last": last,
                    "updated": thread.updated_at,
                }))
                .collect::<Vec<_>>(),
        })
        .to_string()
    }

    pub(crate) async fn read_thread(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<ReadArgs>(arguments) else {
            return error("arguments must be {thread}");
        };
        let Ok(thread) = self.state.store.thread(args.thread.clone()).await else {
            return error("no conversation with that id; use find_threads first");
        };
        let messages = self
            .state
            .store
            .list_messages(args.thread.clone())
            .await
            .unwrap_or_default();
        let pages = pages_from_newest(&messages, READ_CHARS);
        let Some((start, end)) = pages.get(args.page).copied() else {
            return error("no such page; the conversation is shorter");
        };
        let text: Vec<String> = messages[start..end]
            .iter()
            .map(|message| line(message).chars().take(READ_CHARS).collect())
            .collect();
        json!({
            "title": title_of(&thread),
            "summary": if args.page == 0 { summary(self.state, &args.thread).await } else { None },
            "page": args.page,
            "older_pages": pages.len() - args.page - 1,
            "text": text.join("\n"),
        })
        .to_string()
    }
}
