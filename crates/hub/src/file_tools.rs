use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Localizer, keys};

use crate::tools::HubTools;

pub const FILE_SEARCH: &str = "file_search";
pub const FILE_READ: &str = "file_read";

fn text(l: &Localizer, key: xiaoban_i18n::Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

pub fn specs(l: &Localizer) -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: FILE_SEARCH.to_owned(),
            description: l.text(keys::TOOL_FILE_SEARCH_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "file": text(l, keys::TOOL_FILE_ID),
                    "query": text(l, keys::TOOL_FILE_QUERY),
                },
                "required": ["file", "query"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: FILE_READ.to_owned(),
            description: l.text(keys::TOOL_FILE_READ_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "file": text(l, keys::TOOL_FILE_ID),
                    "from": { "type": "integer", "minimum": 1, "description": l.text(keys::TOOL_FILE_FROM) },
                    "to": { "type": "integer", "minimum": 1, "description": l.text(keys::TOOL_FILE_TO) },
                },
                "required": ["file", "from", "to"],
                "additionalProperties": false,
            }),
        },
    ]
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

#[derive(Deserialize)]
struct SearchArgs {
    file: String,
    query: String,
}

#[derive(Deserialize)]
struct ReadArgs {
    file: String,
    from: usize,
    to: usize,
}

impl HubTools<'_> {
    async fn owns(&self, file: &str) -> bool {
        self.state
            .store
            .list_messages(self.thread_id.to_owned())
            .await
            .is_ok_and(|messages| {
                messages
                    .iter()
                    .any(|message| message.files.iter().any(|known| known.id == file))
            })
    }

    pub(crate) async fn file_search(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<SearchArgs>(arguments) else {
            return error("arguments must be {file, query}");
        };
        if !self.owns(&args.file).await {
            return error("no file with that id in this conversation");
        }
        match self.state.files.search(&args.file, &args.query) {
            Some(hits) if hits.is_empty() => {
                json!({ "hits": [], "hint": "nothing matched; try other words or read the outline pages" })
                    .to_string()
            }
            Some(hits) => json!({
                "hits": hits
                    .into_iter()
                    .map(|(page, snippet)| json!({ "page": page, "snippet": snippet }))
                    .collect::<Vec<_>>(),
            })
            .to_string(),
            None => error("this file has no readable text"),
        }
    }

    pub(crate) async fn file_read(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<ReadArgs>(arguments) else {
            return error("arguments must be {file, from, to}");
        };
        if !self.owns(&args.file).await {
            return error("no file with that id in this conversation");
        }
        match self.state.files.read(&args.file, args.from, args.to) {
            Some((text, last, more)) => {
                json!({ "text": text, "last_page": last, "more": more }).to_string()
            }
            None => error("this file has no readable text"),
        }
    }
}

pub const RECALL: &str = "recall";

pub fn recall_spec(l: &Localizer) -> ToolSpec {
    ToolSpec {
        name: RECALL.to_owned(),
        description: l.text(keys::TOOL_RECALL_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "galaxy": text(l, keys::TOOL_RECALL_GALAXY),
                "query": text(l, keys::TOOL_RECALL_QUERY),
            },
            "additionalProperties": false,
        }),
    }
}

#[derive(Deserialize)]
struct RecallArgs {
    #[serde(default)]
    galaxy: Option<String>,
    #[serde(default)]
    query: Option<String>,
}

impl HubTools<'_> {
    pub(crate) async fn recall(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<RecallArgs>(arguments) else {
            return error("arguments must be {galaxy?, query?}");
        };
        let (Ok(memories), Ok(galaxies)) = (
            self.state.store.list_memories().await,
            self.state.store.list_galaxies().await,
        ) else {
            return error("memories are unavailable right now");
        };
        let links = self.state.store.memory_links().await.unwrap_or_default();
        let recall = crate::memory::Recall {
            memories: &memories,
            galaxies: &galaxies,
            links: &links,
            now: xiaoban_store::now_ms(),
        };
        let found = match (args.galaxy.as_deref(), args.query.as_deref()) {
            (Some(galaxy), _) if !galaxy.trim().is_empty() => recall.galaxy(galaxy),
            (_, Some(query)) if !query.trim().is_empty() => {
                recall.find(query, crate::memory::SEARCH_BUDGET, false)
            }
            _ => return error("give a galaxy name or a query"),
        };
        json!({
            "memories": found
                .iter()
                .map(|memory| json!({
                    "subject": memory.subject,
                    "value": memory.value,
                    "galaxy": memory.galaxy,
                    "kind": memory.kind.as_str(),
                }))
                .collect::<Vec<_>>(),
        })
        .to_string()
    }
}

pub const HISTORY_SEARCH: &str = "history_search";
pub const HISTORY_READ: &str = "history_read";
pub const HISTORY_OUTLINE: &str = "history_outline";
const OUTLINE_SPAN: usize = 20;
const OUTLINE_CHARS: usize = 60;

pub fn history_specs(l: &Localizer) -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: HISTORY_OUTLINE.to_owned(),
            description: l.text(keys::TOOL_HISTORY_OUTLINE_DESCRIPTION),
            parameters: json!({ "type": "object", "properties": {}, "additionalProperties": false }),
        },
        ToolSpec {
            name: HISTORY_SEARCH.to_owned(),
            description: l.text(keys::TOOL_HISTORY_SEARCH_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": { "query": text(l, keys::TOOL_HISTORY_QUERY) },
                "required": ["query"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: HISTORY_READ.to_owned(),
            description: l.text(keys::TOOL_HISTORY_READ_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "at": { "type": "integer", "minimum": 0, "description": l.text(keys::TOOL_HISTORY_AT) },
                },
                "required": ["at"],
                "additionalProperties": false,
            }),
        },
    ]
}

#[derive(Deserialize)]
struct HistorySearchArgs {
    query: String,
}

#[derive(Deserialize)]
struct HistoryReadArgs {
    at: usize,
}

fn role_name(message: &xiaoban_protocol::Message) -> &'static str {
    if message.role == xiaoban_protocol::Role::User {
        "user"
    } else {
        "assistant"
    }
}

impl HubTools<'_> {
    pub(crate) async fn history_outline(&self) -> String {
        let old = crate::archive::archived(self.state, self.thread_id).await;
        if old.is_empty() {
            return error("nothing in this conversation has been archived yet");
        }
        let sections: Vec<Value> = old
            .chunks(OUTLINE_SPAN)
            .enumerate()
            .map(|(index, chunk)| {
                let opener = chunk
                    .iter()
                    .find(|message| message.role == xiaoban_protocol::Role::User)
                    .map(|message| message.text.chars().take(OUTLINE_CHARS).collect::<String>());
                json!({
                    "at": index * OUTLINE_SPAN,
                    "time": chunk.first().map(|message| message.created_at),
                    "opener": opener,
                })
            })
            .collect();
        json!({ "messages": old.len(), "sections": sections }).to_string()
    }

    pub(crate) async fn history_search(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<HistorySearchArgs>(arguments) else {
            return error("arguments must be {query}");
        };
        let old = crate::archive::archived(self.state, self.thread_id).await;
        if old.is_empty() {
            return error("nothing in this conversation has been archived yet");
        }
        let wanted = crate::archive::wanted(&args.query);
        let mut hits: Vec<(usize, usize)> = old
            .iter()
            .enumerate()
            .map(|(index, message)| (index, crate::archive::score(&message.text, &wanted)))
            .filter(|(_, score)| *score > 0)
            .collect();
        hits.sort_by(|a, b| b.1.cmp(&a.1).then(b.0.cmp(&a.0)));
        json!({
            "hits": hits
                .into_iter()
                .take(crate::archive::SEARCH_HITS)
                .map(|(index, _)| {
                    let message = &old[index];
                    json!({
                        "at": index,
                        "role": role_name(message),
                        "time": message.created_at,
                        "snippet": crate::archive::snippet(&message.text),
                    })
                })
                .collect::<Vec<_>>(),
        })
        .to_string()
    }

    pub(crate) async fn history_read(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<HistoryReadArgs>(arguments) else {
            return error("arguments must be {at}");
        };
        let old = crate::archive::archived(self.state, self.thread_id).await;
        if args.at >= old.len() {
            return error("no archived message at that position");
        }
        let start = args.at.saturating_sub(2);
        let mut text = String::new();
        let mut last = start;
        for (index, message) in old.iter().enumerate().skip(start) {
            let line = format!("[{index} {}] {}\n", role_name(message), message.text);
            if text.chars().count() + line.chars().count() > crate::archive::READ_CHARS
                && !text.is_empty()
            {
                break;
            }
            text.push_str(&line);
            last = index;
        }
        json!({ "text": text, "last": last, "more": last + 1 < old.len() }).to_string()
    }
}
