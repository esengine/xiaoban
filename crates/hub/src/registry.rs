use std::collections::HashSet;
use std::sync::OnceLock;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{Capability, CapabilityInput, CapabilityKind};

pub const MCP_REGISTRY: &str = "https://registry.modelcontextprotocol.io/v0.1/servers";
pub const SKILLS_SEARCH: &str = "https://skills.sh/api/search";
const SKILLS_SITE: &str = "https://skills.sh";
const RAW: &str = "https://raw.githubusercontent.com";
const GITHUB_API: &str = "https://api.github.com/repos";
pub const SOURCE_MCP: &str = "mcp_registry";
pub const SOURCE_SKILLS: &str = "skills";
const TIMEOUT: Duration = Duration::from_secs(15);
const FETCH_LIMIT: u32 = 20;
const MAX_SKILL_BYTES: usize = 200_000;
const SKILL_PATHS: [&str; 4] = ["skills/{id}/SKILL.md", "{id}/SKILL.md", ".claude/skills/{id}/SKILL.md", "SKILL.md"];
const WRAPPER_NAMESPACES: [&str; 1] = ["ai.smithery"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Runtime {
    Npm,
    Pypi,
}

impl Runtime {
    pub fn command(self) -> &'static str {
        match self {
            Self::Npm => "npx",
            Self::Pypi => "uvx",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Field {
    pub name: String,
    pub template: Option<String>,
    pub keys: Vec<String>,
}

impl Field {
    pub fn value(&self, lookup: impl Fn(&str) -> Option<String>) -> Option<String> {
        match &self.template {
            Some(template) if !self.keys.is_empty() => {
                let mut value = template.clone();
                for key in &self.keys {
                    value = value.replace(&format!("{{{key}}}"), &lookup(key)?);
                }
                Some(value)
            }
            Some(template) => Some(template.clone()),
            None => self.keys.first().and_then(|key| lookup(key)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Setup {
    Skill {
        url: String,
    },
    Remote {
        url: String,
        headers: Vec<Field>,
    },
    Local {
        runtime: Runtime,
        package: String,
        version: String,
        env: Vec<Field>,
    },
}

#[derive(Debug, Clone, PartialEq)]
pub struct Found {
    pub capability: Capability,
    pub setup: Setup,
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        xiaoban_agent::http_builder()
            .timeout(TIMEOUT)
            .user_agent(concat!("Xiaoban/", env!("CARGO_PKG_VERSION"), " (local desktop app)"))
            .build()
            .unwrap_or_default()
    })
}

pub fn classify(name: &str) -> (String, bool) {
    let namespace = name.split('/').next().unwrap_or(name);
    let parts: Vec<&str> = namespace.split('.').filter(|part| !part.is_empty()).collect();
    if let ["io", "github", user, ..] = parts.as_slice() {
        return (format!("github.com/{user}"), false);
    }
    if parts.len() < 2 {
        return (namespace.to_owned(), false);
    }
    let domain: Vec<&str> = parts.iter().rev().copied().collect();
    let domain = domain.join(".");
    let wrapper = WRAPPER_NAMESPACES.contains(&namespace);
    (domain, !wrapper)
}

fn text(value: &Value, key: &str) -> String {
    value.get(key).and_then(Value::as_str).unwrap_or_default().trim().to_owned()
}

fn placeholders(template: &str) -> Vec<String> {
    let mut keys = Vec::new();
    let mut rest = template;
    while let Some(start) = rest.find('{') {
        let after = &rest[start + 1..];
        let Some(end) = after.find('}') else { break };
        let key = after[..end].trim();
        if !key.is_empty() && !keys.iter().any(|known| known == key) {
            keys.push(key.to_owned());
        }
        rest = &after[end + 1..];
    }
    keys
}

fn fields(items: Option<&Value>, inputs: &mut Vec<CapabilityInput>) -> Vec<Field> {
    let mut fields = Vec::new();
    for item in items.and_then(Value::as_array).into_iter().flatten() {
        let name = text(item, "name");
        if name.is_empty() {
            continue;
        }
        let required = item.get("isRequired").and_then(Value::as_bool).unwrap_or(false);
        let secret = item.get("isSecret").and_then(Value::as_bool).unwrap_or(false);
        let description = text(item, "description");
        let template = item
            .get("value")
            .or_else(|| item.get("default"))
            .and_then(Value::as_str)
            .map(str::to_owned)
            .filter(|value| !value.is_empty());
        let keys = match &template {
            Some(template) => placeholders(template),
            None => vec![name.clone()],
        };
        if template.is_some() && keys.is_empty() && !secret {
            fields.push(Field { name, template, keys });
            continue;
        }
        if !required && template.is_none() && !secret {
            continue;
        }
        for key in &keys {
            if !inputs.iter().any(|input| &input.key == key) {
                inputs.push(CapabilityInput {
                    key: key.clone(),
                    description: description.clone(),
                    secret,
                    required: required || template.is_some(),
                });
            }
        }
        fields.push(Field { name, template, keys });
    }
    fields
}

fn needs_lines(l: &Localizer, inputs: &[CapabilityInput]) -> Vec<String> {
    inputs
        .iter()
        .filter(|input| input.required)
        .map(|input| {
            let key = if input.secret {
                keys::CAPABILITY_NEED_SECRET
            } else {
                keys::CAPABILITY_NEED_INPUT
            };
            l.format(key, &[("key", &input.key), ("description", &input.description)])
        })
        .collect()
}

fn host(url: &str) -> String {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .unwrap_or_else(|| url.to_owned())
}

fn active(entry: &Value) -> bool {
    entry
        .pointer("/_meta/io.modelcontextprotocol.registry~1official/status")
        .and_then(Value::as_str)
        .is_none_or(|status| status == "active")
}

pub fn parse_server(server: &Value, l: &Localizer) -> Option<Found> {
    let name = text(server, "name");
    if name.is_empty() {
        return None;
    }
    let (publisher, verified) = classify(&name);
    let mut inputs = Vec::new();
    let remote = server
        .get("remotes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|remote| text(remote, "type") == "streamable-http" && !text(remote, "url").is_empty());
    let (kind, setup, mut needs) = if let Some(remote) = remote {
        let url = text(remote, "url");
        let headers = fields(remote.get("headers"), &mut inputs);
        let needs = vec![l.format(keys::CAPABILITY_NEED_REMOTE, &[("host", &host(&url))])];
        (CapabilityKind::RemoteMcp, Setup::Remote { url, headers }, needs)
    } else {
        let package = server
            .get("packages")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .find(|package| {
                matches!(text(package, "registryType").as_str(), "npm" | "pypi")
                    && package
                        .pointer("/transport/type")
                        .and_then(Value::as_str)
                        .is_none_or(|transport| transport == "stdio")
            })?;
        let runtime = if text(package, "registryType") == "npm" {
            Runtime::Npm
        } else {
            Runtime::Pypi
        };
        let identifier = text(package, "identifier");
        if identifier.is_empty() {
            return None;
        }
        let version = text(package, "version");
        let env = fields(package.get("environmentVariables"), &mut inputs);
        let mut needs = vec![l.format(
            keys::CAPABILITY_NEED_LOCAL,
            &[("package", &identifier), ("runtime", runtime.command())],
        )];
        if !verified {
            needs.push(l.text(keys::CAPABILITY_NEED_UNVERIFIED));
        }
        let setup = Setup::Local {
            runtime,
            package: identifier,
            version,
            env,
        };
        (CapabilityKind::LocalMcp, setup, needs)
    };
    needs.extend(needs_lines(l, &inputs));
    let title = Some(text(server, "title"))
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| name.rsplit('/').next().unwrap_or(&name).to_owned());
    let repository = server
        .pointer("/repository/url")
        .and_then(Value::as_str)
        .filter(|url| !url.is_empty())
        .map(str::to_owned);
    Some(Found {
        capability: Capability {
            id: format!("mcp:{name}"),
            title,
            kind,
            source: SOURCE_MCP.to_owned(),
            publisher,
            verified,
            scanned: None,
            version: text(server, "version"),
            description: text(server, "description"),
            repository,
            needs,
            inputs,
            name,
            ..Capability::default()
        },
        setup,
    })
}

fn official(publisher: &str, query: &str) -> bool {
    let brand = publisher.split('.').next().unwrap_or_default().to_lowercase();
    !brand.is_empty()
        && query
            .to_lowercase()
            .split(|c: char| !c.is_alphanumeric())
            .any(|word| word == brand)
}

pub fn parse_registry(body: &Value, l: &Localizer, query: &str, limit: usize) -> Vec<Found> {
    let mut seen = HashSet::new();
    let mut found: Vec<Found> = body
        .get("servers")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|entry| active(entry))
        .filter_map(|entry| parse_server(entry.get("server")?, l))
        .filter(|found| seen.insert(found.capability.name.to_lowercase()))
        .collect();
    found.sort_by_key(|found| {
        (
            !(found.capability.verified && official(&found.capability.publisher, query)),
            !found.capability.verified,
            found.capability.kind != CapabilityKind::RemoteMcp,
        )
    });
    found.truncate(limit);
    found
}

pub async fn search_mcp(query: &str, l: &Localizer, limit: usize) -> Result<Vec<Found>, String> {
    let response = client()
        .get(MCP_REGISTRY)
        .query(&[
            ("search", query),
            ("version", "latest"),
            ("limit", &FETCH_LIMIT.to_string()),
        ])
        .send()
        .await
        .map_err(|failure| failure.to_string())?;
    if !response.status().is_success() {
        return Err(format!("registry answered {}", response.status()));
    }
    let body: Value = response.json().await.map_err(|failure| failure.to_string())?;
    Ok(parse_registry(&body, l, query, limit))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillHit {
    pub source: String,
    pub skill: String,
    pub installs: u64,
}

pub fn parse_skill_hits(body: &Value) -> Vec<SkillHit> {
    body.get("skills")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|hit| {
            let source = text(hit, "source");
            let skill = text(hit, "skillId");
            (source.split('/').count() == 2 && !skill.is_empty()).then(|| SkillHit {
                source,
                skill,
                installs: hit.get("installs").and_then(Value::as_u64).unwrap_or(0),
            })
        })
        .collect()
}

pub fn frontmatter(text: &str) -> Option<(String, String)> {
    let text = text.trim_start_matches('\u{feff}');
    let rest = text.strip_prefix("---")?;
    let end = rest.find("\n---")?;
    let block = &rest[..end];
    let mut name = None;
    let mut description = None;
    let lines: Vec<&str> = block.lines().collect();
    let mut index = 0;
    while index < lines.len() {
        let line = lines[index];
        index += 1;
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if line.starts_with(char::is_whitespace) {
            continue;
        }
        let mut value = value.trim().to_owned();
        if matches!(value.as_str(), "|" | ">" | "|-" | ">-" | "|+" | ">+") {
            let mut folded = Vec::new();
            while index < lines.len() && (lines[index].starts_with(char::is_whitespace) || lines[index].is_empty()) {
                folded.push(lines[index].trim());
                index += 1;
            }
            folded.join(" ").trim().clone_into(&mut value);
        }
        let value = value
            .trim_matches(|c| c == '"' || c == '\'')
            .trim()
            .to_owned();
        match key.trim() {
            "name" => name = Some(value),
            "description" => description = Some(value),
            _ => {}
        }
    }
    let name = name.filter(|name| !name.is_empty())?;
    Some((name, description.unwrap_or_default()))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillRef {
    pub owner: String,
    pub repo: String,
    pub reference: String,
    pub path: Option<String>,
    pub skill: Option<String>,
}

impl SkillRef {
    pub fn raw(&self, path: &str) -> String {
        format!("{RAW}/{}/{}/{}/{}", self.owner, self.repo, self.reference, path.trim_start_matches('/'))
    }

    pub fn id(&self) -> String {
        let leaf = self
            .skill
            .clone()
            .or_else(|| {
                self.path
                    .as_deref()
                    .map(|path| path.trim_end_matches("SKILL.md").trim_matches('/'))
                    .and_then(|path| path.rsplit('/').next())
                    .filter(|leaf| !leaf.is_empty())
                    .map(str::to_owned)
            })
            .unwrap_or_else(|| self.repo.clone());
        format!("skill:{}/{}/{leaf}", self.owner, self.repo)
    }
}

fn valid_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment != ".."
        && segment
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

pub fn skill_ref(input: &str) -> Option<SkillRef> {
    let input = input.trim().trim_end_matches('/');
    let input = input.strip_prefix("skill:").unwrap_or(input);
    if let Some(rest) = input
        .strip_prefix("https://github.com/")
        .or_else(|| input.strip_prefix("http://github.com/"))
        .or_else(|| input.strip_prefix("github.com/"))
    {
        let parts: Vec<&str> = rest.split('/').collect();
        let (owner, repo) = (*parts.first()?, parts.get(1)?.trim_end_matches(".git"));
        if !valid_segment(owner) || !valid_segment(repo) {
            return None;
        }
        let (reference, path) = match parts.get(2) {
            Some(&("tree" | "blob")) => {
                let reference = (*parts.get(3)?).to_owned();
                let path = parts[4..].join("/");
                (reference, (!path.is_empty()).then_some(path))
            }
            None => ("HEAD".to_owned(), None),
            Some(_) => return None,
        };
        if !valid_segment(&reference) || path.as_deref().is_some_and(|path| !path.split('/').all(valid_segment)) {
            return None;
        }
        let path = path.map(|path| {
            if path.ends_with("SKILL.md") {
                path
            } else {
                format!("{path}/SKILL.md")
            }
        });
        return Some(SkillRef {
            owner: owner.to_owned(),
            repo: repo.to_owned(),
            reference,
            path: Some(path.unwrap_or_else(|| "SKILL.md".to_owned())),
            skill: None,
        });
    }
    if let Some(rest) = input.strip_prefix("https://raw.githubusercontent.com/") {
        let parts: Vec<&str> = rest.split('/').collect();
        if parts.len() < 4 || !parts.iter().all(|part| valid_segment(part)) || !rest.ends_with("SKILL.md") {
            return None;
        }
        return Some(SkillRef {
            owner: parts[0].to_owned(),
            repo: parts[1].to_owned(),
            reference: parts[2].to_owned(),
            path: Some(parts[3..].join("/")),
            skill: None,
        });
    }
    let parts: Vec<&str> = input.split('/').collect();
    if parts.len() == 3 && parts.iter().all(|part| valid_segment(part)) {
        return Some(SkillRef {
            owner: parts[0].to_owned(),
            repo: parts[1].to_owned(),
            reference: "HEAD".to_owned(),
            path: None,
            skill: Some(parts[2].to_owned()),
        });
    }
    None
}

pub async fn fetch_text(url: &str) -> Option<String> {
    let response = client().get(url).send().await.ok()?;
    if !response.status().is_success() {
        return None;
    }
    let text = response.text().await.ok()?;
    (text.len() <= MAX_SKILL_BYTES).then_some(text)
}

async fn tree_path(reference: &SkillRef, skill: &str) -> Option<String> {
    let url = format!(
        "{GITHUB_API}/{}/{}/git/trees/{}?recursive=1",
        reference.owner, reference.repo, reference.reference
    );
    let body: Value = client()
        .get(url)
        .header("accept", "application/vnd.github+json")
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    let suffix = format!("/{skill}/SKILL.md");
    body.get("tree")?
        .as_array()?
        .iter()
        .filter_map(|item| item.get("path")?.as_str())
        .find(|path| path.ends_with(&suffix))
        .map(str::to_owned)
}

pub async fn fetch_skill(reference: &SkillRef) -> Option<(String, String)> {
    if let Some(path) = &reference.path {
        let url = reference.raw(path);
        return fetch_text(&url).await.map(|body| (url, body));
    }
    let skill = reference.skill.as_deref()?;
    for pattern in SKILL_PATHS {
        let url = reference.raw(&pattern.replace("{id}", skill));
        if let Some(body) = fetch_text(&url).await
            && frontmatter(&body).is_some()
        {
            return Some((url, body));
        }
    }
    let path = tree_path(reference, skill).await?;
    let url = reference.raw(&path);
    fetch_text(&url).await.map(|body| (url, body))
}

pub fn audits(page: &str) -> Option<bool> {
    let start = page.find("Security Audits")?;
    let section = &page[start..];
    let section = &section[..section.len().min(6000)];
    let mut verdicts = Vec::new();
    for verdict in ["Pass", "Warn", "Fail"] {
        let marker = format!(">{verdict}<");
        let spaced = format!("> {verdict} <");
        let count = section.matches(&marker).count() + section.matches(&spaced).count();
        verdicts.push(count);
    }
    match verdicts.as_slice() {
        [0, 0, 0] => None,
        [_, 0, 0] => Some(true),
        _ => Some(false),
    }
}

async fn scanned(source: &str, skill: &str) -> Option<bool> {
    let page = fetch_text(&format!("{SKILLS_SITE}/{source}/{skill}")).await?;
    audits(&page)
}

pub fn skill_found(reference: &SkillRef, url: String, body: &str, scanned: Option<bool>, l: &Localizer) -> Option<Found> {
    let (name, description) = frontmatter(body)?;
    Some(Found {
        capability: Capability {
            id: reference.id(),
            title: name.clone(),
            name,
            kind: CapabilityKind::Skill,
            source: SOURCE_SKILLS.to_owned(),
            publisher: format!("github.com/{}", reference.owner),
            verified: false,
            scanned,
            version: reference.reference.clone(),
            description,
            repository: Some(format!("https://github.com/{}/{}", reference.owner, reference.repo)),
            needs: vec![l.text(keys::CAPABILITY_NEED_SKILL)],
            ..Capability::default()
        },
        setup: Setup::Skill { url },
    })
}

pub async fn resolve_skill(reference: &SkillRef, l: &Localizer) -> Option<Found> {
    let (url, body) = fetch_skill(reference).await?;
    let audit = match &reference.skill {
        Some(skill) => scanned(&format!("{}/{}", reference.owner, reference.repo), skill).await,
        None => None,
    };
    skill_found(reference, url, &body, audit, l)
}

pub async fn search_skills(query: &str, l: &Localizer, limit: usize) -> Vec<Found> {
    let Ok(response) = client().get(SKILLS_SEARCH).query(&[("q", query)]).send().await else {
        return Vec::new();
    };
    let Ok(body) = response.json::<Value>().await else {
        return Vec::new();
    };
    let mut seen = HashSet::new();
    let hits: Vec<SkillHit> = parse_skill_hits(&body)
        .into_iter()
        .filter(|hit| seen.insert(hit.skill.to_lowercase()))
        .take(limit)
        .collect();
    let lookups = hits.iter().map(|hit| {
        let mut parts = hit.source.split('/');
        let reference = SkillRef {
            owner: parts.next().unwrap_or_default().to_owned(),
            repo: parts.next().unwrap_or_default().to_owned(),
            reference: "HEAD".to_owned(),
            path: None,
            skill: Some(hit.skill.clone()),
        };
        async move { resolve_skill(&reference, l).await }
    });
    futures_util::future::join_all(lookups)
        .await
        .into_iter()
        .flatten()
        .collect()
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use xiaoban_i18n::Locale;

    use super::*;

    fn sample() -> Value {
        json!({ "servers": [
            { "server": {
                "name": "ai.smithery/smithery-notion",
                "description": "wrapper",
                "version": "1.0.0",
                "remotes": [{ "type": "streamable-http", "url": "https://server.smithery.ai/@smithery/notion/mcp",
                    "headers": [{ "name": "Authorization", "description": "Bearer token", "isRequired": true, "isSecret": true, "value": "Bearer {smithery_api_key}" }] }]
            }, "_meta": { "io.modelcontextprotocol.registry/official": { "status": "active" } } },
            { "server": {
                "name": "io.github.someone/notion-mcp",
                "description": "personal",
                "version": "0.2.0",
                "repository": { "url": "https://github.com/someone/notion-mcp" },
                "packages": [{ "registryType": "npm", "identifier": "notion-mcp", "version": "0.2.0", "transport": { "type": "stdio" },
                    "environmentVariables": [
                        { "name": "NOTION_TOKEN", "description": "Integration token", "isRequired": true, "isSecret": true },
                        { "name": "LOG_LEVEL", "description": "optional" }
                    ] }]
            } },
            { "server": {
                "name": "com.notion/mcp",
                "title": "Notion",
                "description": "official",
                "version": "1.0.0",
                "remotes": [{ "type": "sse", "url": "https://mcp.notion.com/sse" }, { "type": "streamable-http", "url": "https://mcp.notion.com/mcp" }]
            } },
            { "server": { "name": "com.notion/mcp", "version": "0.9.0", "remotes": [{ "type": "streamable-http", "url": "https://x" }] } },
            { "server": { "name": "com.example/old", "remotes": [{ "type": "streamable-http", "url": "https://x" }] },
              "_meta": { "io.modelcontextprotocol.registry/official": { "status": "deleted" } } },
            { "server": { "name": "com.example/oci-only", "packages": [{ "registryType": "oci", "identifier": "x" }] } },
        ], "metadata": { "count": 6 } })
    }

    #[test]
    fn namespaces_are_classified() {
        assert_eq!(classify("com.notion/mcp"), ("notion.com".to_owned(), true));
        assert_eq!(classify("io.github.someone/x"), ("github.com/someone".to_owned(), false));
        assert_eq!(classify("ai.smithery/smithery-notion"), ("smithery.ai".to_owned(), false));
        assert_eq!(classify("weird"), ("weird".to_owned(), false));
    }

    #[test]
    fn registry_results_are_parsed_ranked_and_deduped() {
        let l = Localizer::new(Locale::En);
        let found = parse_registry(&sample(), &l, "notion", 5);
        let ids: Vec<&str> = found.iter().map(|found| found.capability.id.as_str()).collect();
        assert_eq!(ids, ["mcp:com.notion/mcp", "mcp:ai.smithery/smithery-notion", "mcp:io.github.someone/notion-mcp"]);

        let notion = &found[0];
        assert_eq!(notion.capability.kind, CapabilityKind::RemoteMcp);
        assert!(notion.capability.verified);
        assert_eq!(notion.capability.title, "Notion");
        assert_eq!(notion.setup, Setup::Remote { url: "https://mcp.notion.com/mcp".to_owned(), headers: Vec::new() });

        let smithery = &found[1];
        assert!(!smithery.capability.verified);
        assert_eq!(smithery.capability.inputs.len(), 1);
        assert_eq!(smithery.capability.inputs[0].key, "smithery_api_key");
        assert!(smithery.capability.inputs[0].secret);
        let Setup::Remote { headers, .. } = &smithery.setup else { panic!("remote") };
        let value = headers[0].value(|key| (key == "smithery_api_key").then(|| "k1".to_owned()));
        assert_eq!(value.as_deref(), Some("Bearer k1"));

        let local = &found[2];
        assert_eq!(local.capability.kind, CapabilityKind::LocalMcp);
        assert_eq!(local.capability.publisher, "github.com/someone");
        assert_eq!(local.capability.repository.as_deref(), Some("https://github.com/someone/notion-mcp"));
        assert_eq!(local.capability.inputs.iter().map(|i| i.key.as_str()).collect::<Vec<_>>(), ["NOTION_TOKEN"]);
        assert!(local.capability.needs.iter().any(|line| line.contains("npx")));
        assert!(local.capability.needs.iter().any(|line| line.contains("NOTION_TOKEN")));
        let Setup::Local { runtime, package, version, env } = &local.setup else { panic!("local") };
        assert_eq!((*runtime, package.as_str(), version.as_str()), (Runtime::Npm, "notion-mcp", "0.2.0"));
        assert_eq!(env[0].value(|_| Some("t".to_owned())).as_deref(), Some("t"));

        assert_eq!(parse_registry(&sample(), &l, "notion", 2).len(), 2);
        let mut body = sample();
        body["servers"][0]["server"]["name"] = json!("com.acme/notion");
        let ranked = parse_registry(&body, &l, "notion pages", 5);
        assert_eq!(ranked[0].capability.id, "mcp:com.notion/mcp");
        assert_eq!(ranked[1].capability.id, "mcp:com.acme/notion");
    }

    #[test]
    fn skill_hits_and_frontmatter_are_parsed() {
        let body = json!({ "skills": [
            { "id": "anthropics/skills/pdf", "source": "anthropics/skills", "skillId": "pdf", "name": "pdf", "installs": 10 },
            { "id": "bad", "source": "nope", "skillId": "x" },
        ] });
        let hits = parse_skill_hits(&body);
        assert_eq!(hits, vec![SkillHit { source: "anthropics/skills".to_owned(), skill: "pdf".to_owned(), installs: 10 }]);

        let text = "---\nname: pdf\ndescription: \"Work with PDF files: read, merge.\"\nlicense: MIT\n---\n# Body";
        assert_eq!(frontmatter(text), Some(("pdf".to_owned(), "Work with PDF files: read, merge.".to_owned())));
        let folded = "---\nname: x\ndescription: >\n  first line\n  second line\n---\n";
        assert_eq!(frontmatter(folded), Some(("x".to_owned(), "first line second line".to_owned())));
        assert_eq!(frontmatter("# no frontmatter"), None);
    }

    #[test]
    fn skill_references_are_understood() {
        let tree = skill_ref("https://github.com/anthropics/skills/tree/main/skills/pdf").unwrap();
        assert_eq!(tree.raw(tree.path.as_deref().unwrap()), "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md");
        assert_eq!(tree.id(), "skill:anthropics/skills/pdf");
        let blob = skill_ref("https://github.com/o/r/blob/v1/a/SKILL.md").unwrap();
        assert_eq!(blob.path.as_deref(), Some("a/SKILL.md"));
        let repo = skill_ref("github.com/o/r").unwrap();
        assert_eq!((repo.reference.as_str(), repo.path.as_deref()), ("HEAD", Some("SKILL.md")));
        assert_eq!(repo.id(), "skill:o/r/r");
        let short = skill_ref("skill:anthropics/skills/pdf").unwrap();
        assert_eq!(short.skill.as_deref(), Some("pdf"));
        assert_eq!(short.id(), "skill:anthropics/skills/pdf");
        assert!(skill_ref("https://github.com/o/r/tree/main/../../etc").is_none());
        assert!(skill_ref("https://example.com/x").is_none());
    }

    #[test]
    fn audit_verdicts_are_read() {
        let page = "<h3>Security Audits</h3><span>Gen Agent Trust Hub</span><span>Pass</span><span>Snyk</span><span>Warn</span>";
        assert_eq!(audits(page), Some(false));
        assert_eq!(audits("<h3>Security Audits</h3><span>Socket</span><span>Pass</span>"), Some(true));
        assert_eq!(audits("<p>nothing</p>"), None);
    }

    #[tokio::test]
    #[ignore = "hits the live MCP registry and skills.sh"]
    async fn live_search() {
        let l = Localizer::new(Locale::En);
        let found = search_mcp("notion", &l, 5).await.unwrap();
        assert_ne!(found, Vec::new());
        let skills = search_skills("pdf", &l, 2).await;
        for item in found.iter().chain(&skills) {
            let c = &item.capability;
            eprintln!("{} | {} | {:?} | {} | verified={} scanned={:?} | {:?}", c.id, c.title, c.kind, c.publisher, c.verified, c.scanned, c.needs);
        }
        assert_ne!(skills, Vec::new());
        assert!(skills.iter().all(|found| matches!(found.setup, Setup::Skill { .. })));
    }
}
