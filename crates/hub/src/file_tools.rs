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
