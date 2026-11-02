//! Tool packs: the everyday tools grouped by what they are for.
//!
//! Every request carries the tool definitions first, so the size of the list is paid for on every
//! call. A pack is a group a plain conversation can leave out until it is needed. A tool that is
//! in no pack is always sent, which keeps a new tool visible (and in the budget test) by default.

use std::collections::BTreeSet;

use serde_json::json;
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Localizer, keys};

use crate::state::SharedState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Pack {
    Trip,
    Home,
    Schedule,
    Computer,
    Docs,
    Kitchen,
    Mail,
    Files,
    Web,
}

pub type PackSet = BTreeSet<Pack>;

impl Pack {
    pub const ALL: [Self; 9] = [
        Self::Trip,
        Self::Home,
        Self::Schedule,
        Self::Computer,
        Self::Docs,
        Self::Kitchen,
        Self::Mail,
        Self::Files,
        Self::Web,
    ];

    pub const fn id(self) -> &'static str {
        match self {
            Self::Trip => "trip",
            Self::Home => "home",
            Self::Schedule => "schedule",
            Self::Computer => "computer",
            Self::Docs => "docs",
            Self::Kitchen => "kitchen",
            Self::Mail => "mail",
            Self::Files => "files",
            Self::Web => "web",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|pack| pack.id() == id.trim())
    }

    pub const fn tools(self) -> &'static [&'static str] {
        match self {
            Self::Trip => &[
                "save_trip",
                "save_place_detail",
                "check_price_in_app",
                "note_app_price",
                "log_trip_expense",
            ],
            Self::Home => &["floorplan_save", "floorplan_edit"],
            Self::Schedule => &[
                "propose_event",
                "read_calendar",
                "propose_schedule",
                "report_schedule",
                "add_todo",
                "list_todos",
                "complete_todo",
                "update_todo",
            ],
            Self::Computer => &[
                "find_apps",
                "open_app",
                "look_at_app",
                "click",
                "type_text",
                "press_keys",
                "do_steps",
            ],
            Self::Docs => &[
                "doc_start",
                "doc_section",
                "sheet_create",
                "slides_start",
                "slides_page",
            ],
            Self::Kitchen => &["recipe", "life"],
            Self::Mail => &["search_mail", "read_mail", "draft_reply"],
            Self::Files => &["file_search", "file_read"],
            Self::Web => &["browse", "check_page"],
        }
    }
}

pub const LOAD_TOOLS: &str = "load_tools";

fn describe(pack: Pack, l: &Localizer, can_operate: bool) -> String {
    l.text(match pack {
        Pack::Computer if !can_operate => keys::PACK_COMPUTER_OPEN,
        Pack::Trip => keys::PACK_TRIP,
        Pack::Home => keys::PACK_HOME,
        Pack::Schedule => keys::PACK_SCHEDULE,
        Pack::Computer => keys::PACK_COMPUTER,
        Pack::Docs => keys::PACK_DOCS,
        Pack::Kitchen => keys::PACK_KITCHEN,
        Pack::Mail => keys::PACK_MAIL,
        Pack::Files => keys::PACK_FILES,
        Pack::Web => keys::PACK_WEB,
    })
}

pub fn spec(l: &Localizer) -> ToolSpec {
    ToolSpec {
        name: LOAD_TOOLS.to_owned(),
        description: l.text(keys::TOOL_LOAD_TOOLS_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "packs": {
                    "type": "array",
                    "minItems": 1,
                    "items": { "type": "string", "enum": Pack::ALL.map(Pack::id) },
                    "description": l.text(keys::TOOL_LOAD_TOOLS_PACKS),
                },
            },
            "required": ["packs"],
        }),
    }
}

/// The part of the system prompt that tells the model which packs it can still load.
pub fn catalog(l: &Localizer, loaded: &PackSet, can_operate: bool) -> Option<String> {
    let missing: Vec<String> = Pack::ALL
        .into_iter()
        .filter(|pack| !loaded.contains(pack))
        .map(|pack| format!("- {}: {}", pack.id(), describe(pack, l, can_operate)))
        .collect();
    if missing.is_empty() {
        return None;
    }
    Some(format!(
        "{}\n{}",
        l.text(keys::PROMPT_PACKS),
        missing.join("\n")
    ))
}

/// Tools that read or drive another app's window. A device that cannot do that never offers them.
const OPERATING: [&str; 7] = [
    "look_at_app",
    "click",
    "type_text",
    "press_keys",
    "do_steps",
    "check_price_in_app",
    "note_app_price",
];

/// Drops the tools that need an operator this device does not have.
pub fn without_operating(tools: Vec<ToolSpec>, can_operate: bool) -> Vec<ToolSpec> {
    if can_operate {
        return tools;
    }
    tools
        .into_iter()
        .filter(|tool| !OPERATING.contains(&tool.name.as_str()))
        .collect()
}

pub fn pack_of(tool: &str) -> Option<Pack> {
    Pack::ALL
        .into_iter()
        .find(|pack| pack.tools().contains(&tool))
}

pub fn all() -> PackSet {
    Pack::ALL.into_iter().collect()
}

/// What stays of a tool list once the packs a conversation has not loaded are left out. The
/// order of the list is kept, so the result depends only on which packs are loaded.
pub fn filter<'a>(
    tools: impl IntoIterator<Item = &'a ToolSpec>,
    loaded: &PackSet,
) -> Vec<ToolSpec> {
    tools
        .into_iter()
        .filter(|tool| pack_of(&tool.name).is_none_or(|pack| loaded.contains(&pack)))
        .cloned()
        .collect()
}

#[derive(serde::Deserialize)]
struct LoadArgs {
    packs: Vec<String>,
}

impl crate::tools::HubTools<'_> {
    pub(crate) async fn load_tools(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<LoadArgs>(arguments) else {
            return json!({ "error": "arguments must be {packs: [\"trip\", ...]}" }).to_string();
        };
        if !self.state.lazy_packs() {
            return json!({ "note": "every tool is already available" }).to_string();
        }
        let mut wanted = Vec::new();
        for id in &args.packs {
            let Some(pack) = Pack::from_id(id) else {
                let valid: Vec<&str> = Pack::ALL.iter().map(|pack| pack.id()).collect();
                return json!({ "error": format!("no pack called {id}; the packs are {}", valid.join(", ")) }).to_string();
            };
            wanted.push(pack);
        }
        let added = load(self.state, self.thread_id, &wanted).await;
        if !added.is_empty() {
            self.pack_changed
                .store(true, std::sync::atomic::Ordering::SeqCst);
        }
        let ids = |packs: &[Pack]| packs.iter().map(|pack| pack.id()).collect::<Vec<_>>();
        json!({
            "loaded": ids(&added),
            "already_loaded": ids(&wanted.iter().copied().filter(|pack| !added.contains(pack)).collect::<Vec<_>>()),
            "tools": added.iter().flat_map(|pack| pack.tools().iter().copied()).collect::<Vec<_>>(),
            "note": "the tools can be called from your next step",
        })
        .to_string()
    }
}

fn key(thread_id: &str) -> String {
    format!("packs.{thread_id}")
}

/// Packs a conversation needs because of what it already holds, without the model asking: it
/// was opened from a trip card, a floor plan or a schedule.
async fn implied(state: &SharedState, thread_id: &str) -> PackSet {
    let mut packs = PackSet::new();
    if crate::floorplan::has_plan(state, thread_id).await {
        packs.insert(Pack::Home);
    }
    if state
        .store
        .latest_trip_in_thread(thread_id.to_owned())
        .await
        .ok()
        .flatten()
        .is_some()
    {
        packs.insert(Pack::Trip);
    }
    if crate::schedules::note(state, thread_id).await.is_some() {
        packs.insert(Pack::Schedule);
    }
    packs
}

async fn saved(state: &SharedState, thread_id: &str) -> PackSet {
    let ids = state
        .store
        .setting_owned(key(thread_id))
        .await
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default();
    ids.iter().filter_map(|id| Pack::from_id(id)).collect()
}

/// The packs this conversation has loaded. While on-demand loading is off, that is all of them.
pub async fn loaded(state: &SharedState, thread_id: &str) -> PackSet {
    if !state.lazy_packs() {
        return all();
    }
    let mut packs = saved(state, thread_id).await;
    packs.extend(implied(state, thread_id).await);
    packs
}

/// Adds packs to a conversation for good; returns the ones that were not loaded before.
pub async fn load(state: &SharedState, thread_id: &str, wanted: &[Pack]) -> Vec<Pack> {
    let have = loaded(state, thread_id).await;
    let mut keep = saved(state, thread_id).await;
    let mut added = Vec::new();
    for pack in wanted {
        if !have.contains(pack) && !added.contains(pack) {
            added.push(*pack);
        }
        keep.insert(*pack);
    }
    if !added.is_empty() {
        let ids: Vec<&str> = keep.iter().map(|pack| pack.id()).collect();
        let _ = state
            .store
            .set_setting_owned(
                key(thread_id),
                serde_json::to_string(&ids).unwrap_or_default(),
            )
            .await;
    }
    added
}

#[cfg(test)]
mod tests {
    use super::*;
    use xiaoban_i18n::{Locale, Localizer};

    fn everyday_tools() -> Vec<ToolSpec> {
        let localizer = Localizer::new(Locale::ZhCn);
        let mut tools = crate::slides::with_write_specs(
            crate::sheet::with_create_spec(
                crate::doc::with_write_specs(crate::tools::specs(&localizer), &localizer),
                &localizer,
            ),
            &localizer,
        );
        tools.push(crate::life::spec(&localizer));
        tools
    }

    #[test]
    fn every_pack_names_real_tools_and_no_tool_is_in_two_packs() {
        let names: Vec<String> = everyday_tools().into_iter().map(|tool| tool.name).collect();
        for pack in Pack::ALL {
            for tool in pack.tools() {
                assert!(
                    names.iter().any(|name| name == tool),
                    "{} lists {tool}, which is not a tool any more",
                    pack.id()
                );
                assert_eq!(pack_of(tool), Some(pack), "{tool} is in two packs");
            }
        }
    }

    #[test]
    fn with_every_pack_loaded_nothing_is_left_out() {
        let tools = everyday_tools();
        let kept = filter(&tools, &all());
        assert_eq!(kept, tools);
    }

    #[test]
    fn with_none_loaded_only_the_core_is_left() {
        let tools = everyday_tools();
        let kept = filter(&tools, &PackSet::new());
        assert!(kept.iter().all(|tool| pack_of(&tool.name).is_none()));
        for core in ["remember", "web_search", "ask_user", "plan", "spawn_agents"] {
            assert!(kept.iter().any(|tool| tool.name == core), "{core}");
        }
        assert!(!kept.iter().any(|tool| tool.name == "save_trip"));
    }

    #[test]
    fn the_result_depends_on_which_packs_are_loaded_not_on_their_order() {
        let tools = everyday_tools();
        let a: PackSet = [Pack::Trip, Pack::Mail].into_iter().collect();
        let b: PackSet = [Pack::Mail, Pack::Trip].into_iter().collect();
        assert_eq!(filter(&tools, &a), filter(&tools, &b));
    }

    #[test]
    fn ids_round_trip() {
        for pack in Pack::ALL {
            assert_eq!(Pack::from_id(pack.id()), Some(pack));
        }
        assert_eq!(Pack::from_id(" trip "), Some(Pack::Trip));
        assert_eq!(Pack::from_id("nope"), None);
    }
}
