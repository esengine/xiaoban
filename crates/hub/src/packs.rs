//! Tool packs: the everyday tools grouped by what they are for.
//!
//! Every request carries the tool definitions first, so the size of the list is paid for on every
//! call. A pack is a group a plain conversation can leave out until it is needed. A tool that is
//! in no pack is always sent, which keeps a new tool visible (and in the budget test) by default.

use std::collections::BTreeSet;

use xiaoban_agent::ToolSpec;

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
                "weather",
                "locate",
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
                "confirm",
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

fn key(thread_id: &str) -> String {
    format!("packs.{thread_id}")
}

/// The packs this conversation has loaded. While on-demand loading is off, that is all of them.
pub async fn loaded(state: &SharedState, thread_id: &str) -> PackSet {
    if !state.lazy_packs() {
        return all();
    }
    let saved = state
        .store
        .setting_owned(key(thread_id))
        .await
        .ok()
        .flatten()
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default();
    saved.iter().filter_map(|id| Pack::from_id(id)).collect()
}

/// Adds packs to a conversation for good; returns the ones that were not loaded before.
#[allow(dead_code, reason = "the load_tools tool arrives in the next step")]
pub async fn load(state: &SharedState, thread_id: &str, wanted: &[Pack]) -> Vec<Pack> {
    let mut current = loaded(state, thread_id).await;
    let added: Vec<Pack> = wanted
        .iter()
        .copied()
        .filter(|pack| current.insert(*pack))
        .collect();
    if !added.is_empty() {
        let ids: Vec<&str> = current.iter().map(|pack| pack.id()).collect();
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
