use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::Value;
use xiaoban_protocol::{CheckOutcome, GithubRef, RefCheck, RefState, Workspace};

use crate::state::SharedState;

const FRESH: Duration = Duration::from_secs(300);
const TIMEOUT: Duration = Duration::from_secs(20);
const MAX_NUMBERS: usize = 40;
const PINS_KEY: &str = "thread.pins.";

type Known = (Instant, Option<GithubRef>);

#[derive(Debug, Default)]
pub struct Cache {
    repos: Mutex<HashMap<String, Option<(String, String)>>>,
    refs: Mutex<HashMap<(String, u32), Known>>,
}

async fn gh(dir: &Path, args: &[&str]) -> Option<String> {
    let (ok, text) = gh_raw(dir, args).await?;
    ok.then_some(text)
}

async fn gh_raw(dir: &Path, args: &[&str]) -> Option<(bool, String)> {
    let binary = crate::vcs_tools::gh_binary()?;
    let mut command = tokio::process::Command::new(binary);
    command
        .args(args)
        .current_dir(dir)
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_NO_UPDATE_NOTIFIER", "1")
        .stdin(std::process::Stdio::null())
        .kill_on_drop(true);
    let output = tokio::time::timeout(TIMEOUT, command.output()).await.ok()?.ok()?;
    Some((
        output.status.success(),
        String::from_utf8_lossy(&output.stdout).into_owned(),
    ))
}

async fn repo(state: &SharedState, workspace: &Workspace) -> Option<(String, String)> {
    if let Some(known) = state.github_cache.repos.lock().unwrap().get(&workspace.id) {
        return known.clone();
    }
    let dir = crate::workspace::root(workspace);
    let found = gh(&dir, &["repo", "view", "--json", "owner,name"])
        .await
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .and_then(|value| {
            Some((
                value["owner"]["login"].as_str()?.to_owned(),
                value["name"].as_str()?.to_owned(),
            ))
        });
    state
        .github_cache
        .repos
        .lock()
        .unwrap()
        .insert(workspace.id.clone(), found.clone());
    found
}

const FIELDS: &str = "__typename ... on PullRequest { number title state isDraft url author { login } headRefName baseRefName changedFiles comments { totalCount } commits(last: 1) { nodes { commit { statusCheckRollup { contexts(first: 60) { nodes { __typename ... on CheckRun { name conclusion status } ... on StatusContext { context state } } } } } } } } ... on Issue { number title state url author { login } comments { totalCount } }";

fn outcome(node: &Value) -> Option<RefCheck> {
    if node["__typename"] == "CheckRun" {
        let name = node["name"].as_str()?.to_owned();
        let outcome = match (node["status"].as_str(), node["conclusion"].as_str()) {
            (Some(status), _) if status != "COMPLETED" => CheckOutcome::Pending,
            (_, Some("SUCCESS" | "NEUTRAL")) => CheckOutcome::Passed,
            (_, Some("SKIPPED")) => CheckOutcome::Skipped,
            _ => CheckOutcome::Failed,
        };
        return Some(RefCheck { name, outcome });
    }
    let name = node["context"].as_str()?.to_owned();
    let outcome = match node["state"].as_str() {
        Some("SUCCESS") => CheckOutcome::Passed,
        Some("PENDING" | "EXPECTED") => CheckOutcome::Pending,
        _ => CheckOutcome::Failed,
    };
    Some(RefCheck { name, outcome })
}

fn parse(node: &Value, repo: &str) -> Option<GithubRef> {
    let pull = node["__typename"] == "PullRequest";
    if !pull && node["__typename"] != "Issue" {
        return None;
    }
    let state = match (node["state"].as_str(), node["isDraft"].as_bool()) {
        (Some("MERGED"), _) => RefState::Merged,
        (Some("CLOSED"), _) => RefState::Closed,
        (_, Some(true)) => RefState::Draft,
        _ => RefState::Open,
    };
    let checks = node["commits"]["nodes"]
        .as_array()
        .and_then(|nodes| nodes.first())
        .and_then(|first| first["commit"]["statusCheckRollup"]["contexts"]["nodes"].as_array())
        .map(|nodes| nodes.iter().filter_map(outcome).collect())
        .unwrap_or_default();
    Some(GithubRef {
        number: u32::try_from(node["number"].as_u64()?).ok()?,
        pull,
        repo: repo.to_owned(),
        state,
        title: node["title"].as_str()?.to_owned(),
        author: node["author"]["login"].as_str().unwrap_or_default().to_owned(),
        url: node["url"].as_str()?.to_owned(),
        head: node["headRefName"].as_str().map(str::to_owned),
        base: node["baseRefName"].as_str().map(str::to_owned),
        files: node["changedFiles"].as_u64().and_then(|n| u32::try_from(n).ok()),
        comments: node["comments"]["totalCount"]
            .as_u64()
            .and_then(|n| u32::try_from(n).ok())
            .unwrap_or(0),
        checks,
    })
}

pub async fn lookup(state: &SharedState, workspace: &Workspace, numbers: Vec<u32>) -> Vec<GithubRef> {
    let Some((owner, name)) = repo(state, workspace).await else {
        return Vec::new();
    };
    let repo_name = format!("{owner}/{name}");
    let mut wanted: Vec<u32> = numbers.into_iter().filter(|n| *n > 0).collect();
    wanted.sort_unstable();
    wanted.dedup();
    wanted.truncate(MAX_NUMBERS);
    let mut found = Vec::new();
    let mut missing = Vec::new();
    {
        let cache = state.github_cache.refs.lock().unwrap();
        for number in &wanted {
            match cache.get(&(workspace.id.clone(), *number)) {
                Some((at, known)) if at.elapsed() < FRESH => found.extend(known.clone()),
                _ => missing.push(*number),
            }
        }
    }
    if missing.is_empty() {
        return found;
    }
    let aliases = missing
        .iter()
        .map(|number| format!("n{number}: issueOrPullRequest(number: {number}) {{ {FIELDS} }}"))
        .collect::<Vec<_>>()
        .join(" ");
    let query = format!(
        "query {{ repository(owner: \"{owner}\", name: \"{name}\") {{ {aliases} }} }}"
    );
    let dir = crate::workspace::root(workspace);
    let field = format!("query={query}");
    let Some((_, text)) = gh_raw(&dir, &["api", "graphql", "-f", &field]).await else {
        return found;
    };
    let value: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
    let repository = &value["data"]["repository"];
    if repository.is_null() {
        return found;
    }
    let mut cache = state.github_cache.refs.lock().unwrap();
    for number in missing {
        let parsed = parse(&repository[format!("n{number}")], &repo_name);
        cache.insert((workspace.id.clone(), number), (Instant::now(), parsed.clone()));
        found.extend(parsed);
    }
    found
}

async fn saved(state: &SharedState, thread_id: &str) -> (Vec<u32>, Vec<u32>) {
    let value: Value = state
        .store
        .setting_owned(format!("{PINS_KEY}{thread_id}"))
        .await
        .ok()
        .flatten()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or(Value::Null);
    let list = |key: &str| -> Vec<u32> {
        value[key]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_u64().and_then(|n| u32::try_from(n).ok()))
                    .collect()
            })
            .unwrap_or_default()
    };
    (list("pinned"), list("hidden"))
}

pub async fn pins(state: &SharedState, thread_id: &str) -> (Vec<u32>, Vec<u32>) {
    saved(state, thread_id).await
}

pub async fn pin(state: &SharedState, thread_id: &str, number: u32, on: bool) -> (Vec<u32>, Vec<u32>) {
    let (mut pinned, mut hidden) = saved(state, thread_id).await;
    pinned.retain(|n| *n != number);
    hidden.retain(|n| *n != number);
    if on {
        pinned.push(number);
    } else {
        hidden.push(number);
    }
    let _ = state
        .store
        .set_setting_owned(
            format!("{PINS_KEY}{thread_id}"),
            serde_json::json!({ "pinned": pinned, "hidden": hidden }).to_string(),
        )
        .await;
    (pinned, hidden)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_pull_request_with_checks() {
        let node: Value = serde_json::from_str(
            r#"{"__typename":"PullRequest","number":42,"title":"Fix","state":"OPEN","isDraft":false,"url":"u","author":{"login":"a"},"headRefName":"h","baseRefName":"main","changedFiles":3,"comments":{"totalCount":1},
            "commits":{"nodes":[{"commit":{"statusCheckRollup":{"contexts":{"nodes":[
              {"__typename":"CheckRun","name":"test","conclusion":"FAILURE","status":"COMPLETED"},
              {"__typename":"CheckRun","name":"lint","conclusion":"SUCCESS","status":"COMPLETED"},
              {"__typename":"CheckRun","name":"build","conclusion":null,"status":"IN_PROGRESS"}]}}}}]}}"#,
        )
        .unwrap();
        let parsed = parse(&node, "o/r").unwrap();
        assert_eq!((parsed.number, parsed.pull, parsed.state), (42, true, RefState::Open));
        let outcomes: Vec<CheckOutcome> = parsed.checks.iter().map(|check| check.outcome).collect();
        assert_eq!(outcomes, [CheckOutcome::Failed, CheckOutcome::Passed, CheckOutcome::Pending]);
        let issue: Value = serde_json::from_str(
            r#"{"__typename":"Issue","number":7,"title":"Bug","state":"CLOSED","url":"u","author":{"login":"b"},"comments":{"totalCount":0}}"#,
        )
        .unwrap();
        let parsed = parse(&issue, "o/r").unwrap();
        assert_eq!((parsed.pull, parsed.state), (false, RefState::Closed));
        assert!(parse(&Value::Null, "o/r").is_none());
    }
}
