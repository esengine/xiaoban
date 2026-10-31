use std::collections::{HashMap, HashSet};
use std::time::Duration;

use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{NoTools, StablePrefix, Transcript};
use xiaoban_protocol::{Memory, MemoryCategory, MemoryGalaxy};

use crate::state::SharedState;

const CHECK_EVERY: Duration = Duration::from_secs(10 * 60);
const DAY_MS: i64 = 86_400_000;
const NEW_MEMORIES: usize = 50;
const LAST_KEY: &str = "memory.tidy.last";
const COUNT_KEY: &str = "memory.tidy.count";
const LOG_KEY: &str = "memory.tidy.log";
const LOOSE_BATCH: usize = 40;

#[derive(Debug, Default, Deserialize)]
struct Plan {
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    aliases: Option<Vec<String>>,
    #[serde(default)]
    merge: Vec<Merge>,
    #[serde(default)]
    replace: Vec<Replace>,
    #[serde(default)]
    alias_updates: AliasUpdates,
    #[serde(default)]
    moves: Vec<Move>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum AliasUpdates {
    Map(HashMap<String, Vec<String>>),
    List(Vec<AliasUpdate>),
}

impl Default for AliasUpdates {
    fn default() -> Self {
        Self::List(Vec::new())
    }
}

#[derive(Debug, Deserialize)]
struct AliasUpdate {
    id: String,
    aliases: Vec<String>,
}

impl AliasUpdates {
    fn into_pairs(self) -> Vec<(String, Vec<String>)> {
        match self {
            Self::Map(map) => map.into_iter().collect(),
            Self::List(list) => list
                .into_iter()
                .map(|update| (update.id, update.aliases))
                .collect(),
        }
    }
}

#[derive(Debug, Deserialize)]
struct Merge {
    keep: String,
    drop: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct Replace {
    old: String,
    new: String,
}

#[derive(Debug, Deserialize)]
struct Move {
    id: String,
    galaxy: String,
    #[serde(default)]
    cluster: Option<String>,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct Tally {
    pub merged: usize,
    pub replaced: usize,
    pub moved: usize,
    pub summaries: usize,
}

fn parse(text: &str) -> Option<Plan> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    (start < end)
        .then(|| serde_json::from_str(&text[start..=end]).ok())
        .flatten()
}

fn describe(memories: &[Memory]) -> serde_json::Value {
    memories
        .iter()
        .map(|memory| {
            json!({
                "id": memory.id,
                "subject": memory.subject,
                "value": memory.value,
                "kind": memory.kind.as_str(),
                "aliases": memory.aliases,
            })
        })
        .collect()
}

async fn ask(state: &SharedState, input: String) -> Option<Plan> {
    let prefix = StablePrefix::new(state.localizer.text(xiaoban_i18n::keys::PROMPT_MEMORY_TIDY));
    let (events, _) = mpsc::channel(1);
    let outcome = state
        .active()
        .agent
        .run_turn(
            &prefix,
            &Transcript::default(),
            &input,
            &NoTools,
            events,
            CancellationToken::new(),
        )
        .await
        .ok()?;
    if let Err(failure) = state.store.record_memory_usage(outcome.usage).await {
        tracing::warn!(%failure, "could not record memory usage");
    }
    let plan = parse(&outcome.text);
    if plan.is_none() {
        tracing::warn!(text = outcome.text, "unreadable tidy plan");
    }
    plan
}

async fn apply(state: &SharedState, plan: Plan, allowed: &HashSet<String>, tally: &mut Tally) {
    let store = &state.store;
    let known = |id: &String| allowed.contains(id);
    for merge in plan.merge.iter().filter(|merge| known(&merge.keep)) {
        for drop in merge
            .drop
            .iter()
            .filter(|drop| known(drop) && **drop != merge.keep)
        {
            if store
                .supersede_memory(drop.clone(), merge.keep.clone())
                .await
                .is_ok()
            {
                tally.merged += 1;
            }
        }
    }
    for replace in plan
        .replace
        .iter()
        .filter(|replace| known(&replace.old) && known(&replace.new))
    {
        if store
            .supersede_memory(replace.old.clone(), replace.new.clone())
            .await
            .is_ok()
        {
            tally.replaced += 1;
        }
    }
    for (id, aliases) in plan
        .alias_updates
        .into_pairs()
        .into_iter()
        .filter(|(id, _)| known(id))
    {
        let _ = store.set_memory_aliases(id, aliases).await;
    }
    for movement in plan
        .moves
        .into_iter()
        .filter(|movement| known(&movement.id))
    {
        let galaxy = movement.galaxy.trim().to_owned();
        if galaxy.is_empty() {
            continue;
        }
        let cluster = MemoryCategory::parse(movement.cluster.as_deref().unwrap_or_default());
        if store
            .place_memory(movement.id, galaxy, cluster)
            .await
            .is_ok()
        {
            tally.moved += 1;
        }
    }
}

async fn tidy_galaxy(state: &SharedState, galaxy: &MemoryGalaxy, tally: &mut Tally) {
    let Ok(memories) = state.store.galaxy_memories(galaxy.id.clone()).await else {
        return;
    };
    let input = json!({
        "galaxy": { "name": galaxy.name, "cluster": galaxy.cluster.as_str(), "summary": galaxy.summary, "aliases": galaxy.aliases },
        "memories": describe(&memories),
    })
    .to_string();
    let Some(mut plan) = ask(state, input).await else {
        return;
    };
    let allowed: HashSet<String> = memories.iter().map(|memory| memory.id.clone()).collect();
    let summary = plan
        .summary
        .take()
        .unwrap_or_else(|| galaxy.summary.clone());
    let aliases = plan
        .aliases
        .take()
        .unwrap_or_else(|| galaxy.aliases.clone());
    apply(state, plan, &allowed, tally).await;
    if state
        .store
        .tidy_galaxy(galaxy.id.clone(), summary, aliases)
        .await
        .is_ok()
    {
        tally.summaries += 1;
    }
}

async fn place_loose(
    state: &SharedState,
    memories: &[Memory],
    galaxies: &[MemoryGalaxy],
    tally: &mut Tally,
) {
    for batch in memories.chunks(LOOSE_BATCH) {
        let input = json!({
            "task": "place",
            "galaxies": galaxies.iter().map(|galaxy| json!({ "name": galaxy.name, "cluster": galaxy.cluster.as_str() })).collect::<Vec<_>>(),
            "clusters": MemoryCategory::ALL.map(MemoryCategory::as_str),
            "memories": describe(batch),
        })
        .to_string();
        let Some(plan) = ask(state, input).await else {
            continue;
        };
        let allowed: HashSet<String> = batch.iter().map(|memory| memory.id.clone()).collect();
        apply(state, plan, &allowed, tally).await;
    }
}

pub async fn run(state: &SharedState) -> Tally {
    let mut tally = Tally::default();
    let (Ok(memories), Ok(galaxies)) = (
        state.store.list_memories().await,
        state.store.list_galaxies().await,
    ) else {
        return tally;
    };
    let loose: Vec<Memory> = memories
        .into_iter()
        .filter(|memory| memory.galaxy.is_none())
        .collect();
    if !loose.is_empty() {
        place_loose(state, &loose, &galaxies, &mut tally).await;
    }
    let dirty = state.store.dirty_galaxies().await.unwrap_or_default();
    for galaxy in &dirty {
        tidy_galaxy(state, galaxy, &mut tally).await;
    }
    let now = xiaoban_store::now_ms();
    let count = state
        .store
        .list_memories()
        .await
        .map_or(0, |memories| memories.len());
    let _ = state.store.set_setting(LAST_KEY, now.to_string()).await;
    let _ = state.store.set_setting(COUNT_KEY, count.to_string()).await;
    let log = json!({
        "at": now,
        "merged": tally.merged,
        "replaced": tally.replaced,
        "moved": tally.moved,
        "summaries": tally.summaries,
    });
    let _ = state.store.set_setting(LOG_KEY, log.to_string()).await;
    tracing::info!(?tally, "memory tidied");
    tally
}

async fn due(state: &SharedState) -> bool {
    let setting = |key: &'static str| async move {
        state
            .store
            .setting(key)
            .await
            .ok()
            .flatten()
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap_or(0)
    };
    let last = setting(LAST_KEY).await;
    let count = setting(COUNT_KEY).await;
    let Ok(memories) = state.store.list_memories().await else {
        return false;
    };
    let grown = usize::try_from(count).map_or(true, |count| memories.len() >= count + NEW_MEMORIES);
    let loose = memories.iter().any(|memory| memory.galaxy.is_none());
    let dirty = !state
        .store
        .dirty_galaxies()
        .await
        .unwrap_or_default()
        .is_empty();
    let changed = dirty || loose;
    let day_passed = xiaoban_store::now_ms() - last >= DAY_MS;
    grown || (day_passed && changed)
}

pub fn watch(state: SharedState, shutdown: CancellationToken) {
    tokio::spawn(async move {
        loop {
            tokio::select! {
                () = shutdown.cancelled() => return,
                () = tokio::time::sleep(CHECK_EVERY) => {}
            }
            if state.active().model.is_none() || state.turns.busy() || !due(&state).await {
                continue;
            }
            run(&state).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plans_are_read_from_the_model_answer() {
        let plan = parse(
            r#"好的：{"summary":"儿子 6 岁，花生过敏","aliases":["孩子"],"merge":[{"keep":"a","drop":["b"]}],"replace":[],"alias_updates":{"a":["娃"]},"moves":[{"id":"c","galaxy":"学校","cluster":"family"}]}"#,
        )
        .unwrap();
        assert_eq!(plan.summary.as_deref(), Some("儿子 6 岁，花生过敏"));
        assert_eq!(plan.merge[0].drop, ["b"]);
        assert_eq!(
            plan.alias_updates.into_pairs(),
            [("a".to_owned(), vec!["娃".to_owned()])]
        );
        assert_eq!(plan.moves[0].galaxy, "学校");
        assert!(parse("没有 JSON").is_none());
        let listed =
            parse(r#"{"alias_updates":[{"id":"a","aliases":["家人"]}],"moves":[]}"#).unwrap();
        assert_eq!(listed.alias_updates.into_pairs()[0].1, ["家人"]);
        let empty = parse(r#"{"summary":"","alias_updates":[],"moves":[]}"#).unwrap();
        assert_eq!(empty.alias_updates.into_pairs(), Vec::new());
    }
}
