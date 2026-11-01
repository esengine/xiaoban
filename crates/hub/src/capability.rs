use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{
    Capability, CapabilityKind, ContextNote, ErrorCode, Event, ProtocolError, Request, Response,
};

use crate::mcp::{self, McpError};
use crate::registry::{self, Found, Runtime, Setup};
use crate::state::SharedState;
use crate::tools::HubTools;

pub const FIND: &str = "find_capability";
pub const SKILL_READ: &str = "skill_read";
const PREFIX: &str = "mcp__";
const STORE_KEY: &str = "capabilities.installed";
const MAX_RESULTS: usize = 5;
const MCP_RESULTS: usize = 3;
const SKILL_RESULTS: usize = 2;
const MAX_NAME: usize = 64;
const MAX_CACHED: usize = 60;
const MAX_TOOL_DESCRIPTION: usize = 1000;
const MAX_SKILL_DESCRIPTION: usize = 300;
const MAX_CANDIDATE_DESCRIPTION: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Installed {
    capability: Capability,
    setup: Setup,
    #[serde(default)]
    tools: Vec<mcp::Tool>,
}

#[derive(Debug)]
pub struct Capabilities {
    dir: PathBuf,
    installed: RwLock<Vec<Installed>>,
    specs: RwLock<Vec<ToolSpec>>,
    routes: RwLock<HashMap<String, (String, String)>>,
    found: Mutex<HashMap<String, Found>>,
    servers: tokio::sync::Mutex<HashMap<String, Arc<mcp::Client>>>,
}

pub fn sanitize(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect()
}

pub fn tool_name(slug: &str, tool: &str) -> String {
    format!("{PREFIX}{}__{}", sanitize(slug), sanitize(tool))
        .chars()
        .take(MAX_NAME)
        .collect()
}

pub fn is_mcp(name: &str) -> bool {
    name.starts_with(PREFIX)
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

fn secret_name(id: &str, key: &str) -> String {
    format!("capability:{id}:{key}")
}

fn localized(l: &Localizer, code: ErrorCode, key: Key) -> ProtocolError {
    ProtocolError::new(code, l.text(key))
}

fn mcp_failure(l: &Localizer, failure: &McpError) -> ProtocolError {
    match failure {
        McpError::NeedsSignIn => localized(l, ErrorCode::BadRequest, keys::CAPABILITY_ERROR_SIGN_IN),
        McpError::Rejected => localized(l, ErrorCode::BadRequest, keys::CAPABILITY_ERROR_REJECTED),
        other => ProtocolError::new(
            ErrorCode::Internal,
            l.format(keys::CAPABILITY_ERROR_CONNECT, &[("detail", &other.to_string())]),
        ),
    }
}

fn runtime_binary(runtime: Runtime) -> Option<PathBuf> {
    let name = runtime.command();
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).collect())
        .unwrap_or_default();
    if let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
        let home = PathBuf::from(home);
        dirs.extend([".local/bin", ".cargo/bin", ".volta/bin"].map(|dir| home.join(dir)));
    }
    if cfg!(unix) {
        dirs.extend(["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from));
    }
    let files: Vec<String> = if cfg!(windows) {
        vec![format!("{name}.cmd"), format!("{name}.exe")]
    } else {
        vec![name.to_owned()]
    };
    dirs.iter()
        .flat_map(|dir| files.iter().map(move |file| dir.join(file)))
        .find(|candidate| candidate.is_file())
}

impl Capabilities {
    pub fn new(data_dir: Option<&Path>) -> Self {
        let dir = data_dir.map_or_else(
            || std::env::temp_dir().join(format!("xiaoban-capabilities-{}", uuid::Uuid::now_v7())),
            |dir| dir.join("capabilities"),
        );
        Self {
            dir,
            installed: RwLock::default(),
            specs: RwLock::default(),
            routes: RwLock::default(),
            found: Mutex::default(),
            servers: tokio::sync::Mutex::default(),
        }
    }

    pub fn extend(&self, tools: &mut Vec<ToolSpec>) {
        tools.extend(self.specs.read().unwrap().iter().cloned());
    }

    pub fn list(&self) -> Vec<Capability> {
        let mut list: Vec<Capability> = self
            .installed
            .read()
            .unwrap()
            .iter()
            .map(|entry| entry.capability.clone())
            .collect();
        list.sort_by_key(|capability| std::cmp::Reverse(capability.installed_at));
        list
    }

    fn get(&self, id: &str) -> Option<Installed> {
        self.installed
            .read()
            .unwrap()
            .iter()
            .find(|entry| entry.capability.id == id)
            .cloned()
    }

    fn skill_path(&self, id: &str) -> PathBuf {
        self.dir.join("skills").join(format!("{}.md", sanitize(id)))
    }

    fn refresh(&self) {
        let installed = self.installed.read().unwrap();
        let mut specs = Vec::new();
        let mut routes = HashMap::new();
        let mut slugs = HashSet::new();
        for entry in installed.iter().filter(|entry| {
            entry.capability.enabled && entry.capability.kind != CapabilityKind::Skill
        }) {
            let name = &entry.capability.name;
            let leaf = sanitize(name.rsplit('/').next().unwrap_or(name));
            let slug = if slugs.insert(leaf.clone()) {
                leaf
            } else {
                sanitize(name)
            };
            for tool in &entry.tools {
                let spec_name = tool_name(&slug, &tool.name);
                if routes.contains_key(&spec_name) {
                    continue;
                }
                let mut parameters = tool.input_schema.clone();
                if !parameters.is_object() {
                    parameters = json!({ "type": "object", "properties": {} });
                }
                if parameters.get("type").is_none() {
                    parameters["type"] = json!("object");
                }
                specs.push(ToolSpec {
                    name: spec_name.clone(),
                    description: clip(
                        &format!("[{}] {}", entry.capability.title, tool.description),
                        MAX_TOOL_DESCRIPTION,
                    ),
                    parameters,
                });
                routes.insert(spec_name, (entry.capability.id.clone(), tool.name.clone()));
            }
        }
        *self.specs.write().unwrap() = specs;
        *self.routes.write().unwrap() = routes;
    }

    fn upsert(&self, entry: Installed) {
        let mut installed = self.installed.write().unwrap();
        match installed
            .iter_mut()
            .find(|existing| existing.capability.id == entry.capability.id)
        {
            Some(existing) => *existing = entry,
            None => installed.push(entry),
        }
    }

    fn change(&self, id: &str, change: impl FnOnce(&mut Installed)) -> Option<Installed> {
        let mut installed = self.installed.write().unwrap();
        let entry = installed.iter_mut().find(|entry| entry.capability.id == id)?;
        change(entry);
        Some(entry.clone())
    }

    fn remember(&self, found: &[Found]) {
        let mut cache = self.found.lock().unwrap();
        if cache.len() > MAX_CACHED {
            cache.clear();
        }
        for item in found {
            cache.insert(item.capability.id.clone(), item.clone());
        }
    }

    fn cached(&self, id: &str) -> Option<Found> {
        self.found.lock().unwrap().get(id).cloned()
    }

    fn mark(&self, mut capability: Capability) -> Capability {
        if let Some(entry) = self.get(&capability.id) {
            capability.installed = true;
            capability.enabled = entry.capability.enabled;
            capability.uses = entry.capability.uses;
            capability.installed_at = entry.capability.installed_at;
            capability.tools = entry.capability.tools;
        }
        capability
    }

    pub async fn disconnect(&self, id: &str) {
        self.servers.lock().await.remove(id);
    }

    pub async fn shutdown(&self) {
        self.servers.lock().await.clear();
    }

    fn enabled_skills(&self) -> Vec<Capability> {
        self.installed
            .read()
            .unwrap()
            .iter()
            .filter(|entry| entry.capability.enabled && entry.capability.kind == CapabilityKind::Skill)
            .map(|entry| entry.capability.clone())
            .collect()
    }
}

async fn persist(state: &SharedState) {
    let installed = state.capabilities.installed.read().unwrap().clone();
    let _ = state
        .store
        .set_setting_owned(
            STORE_KEY.to_owned(),
            serde_json::to_string(&installed).unwrap_or_default(),
        )
        .await;
    state.capabilities.refresh();
    state.publish(Event::CapabilitiesChanged {
        capabilities: state.capabilities.list(),
    });
}

pub async fn restore(state: &SharedState) {
    let installed: Vec<Installed> = state
        .store
        .setting_owned(STORE_KEY.to_owned())
        .await
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    *state.capabilities.installed.write().unwrap() = installed;
    state.capabilities.refresh();
}

pub async fn search(state: &SharedState, query: &str) -> Result<Vec<Capability>, ProtocolError> {
    let l = &state.localizer;
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let (servers, skills) = tokio::join!(
        registry::search_mcp(query, l, MCP_RESULTS),
        registry::search_skills(query, l, SKILL_RESULTS)
    );
    let servers = match servers {
        Ok(servers) => servers,
        Err(failure) if skills.is_empty() => {
            tracing::warn!(%failure, "capability search failed");
            return Err(localized(l, ErrorCode::Internal, keys::CAPABILITY_ERROR_SEARCH));
        }
        Err(failure) => {
            tracing::warn!(%failure, "mcp registry search failed");
            Vec::new()
        }
    };
    let mut seen = HashSet::new();
    let found: Vec<Found> = servers
        .into_iter()
        .chain(skills)
        .filter(|found| seen.insert(found.capability.name.to_lowercase()))
        .take(MAX_RESULTS)
        .collect();
    state.capabilities.remember(&found);
    Ok(found
        .into_iter()
        .map(|found| state.capabilities.mark(found.capability))
        .collect())
}

async fn locate(state: &SharedState, id: &str) -> Result<Found, ProtocolError> {
    let l = &state.localizer;
    if let Some(found) = state.capabilities.cached(id) {
        return Ok(found);
    }
    if let Some(entry) = state.capabilities.get(id) {
        return Ok(Found {
            capability: entry.capability,
            setup: entry.setup,
        });
    }
    if let Some(reference) = registry::skill_ref(id) {
        let found = registry::resolve_skill(&reference, l)
            .await
            .ok_or_else(|| localized(l, ErrorCode::NotFound, keys::CAPABILITY_ERROR_SKILL))?;
        state.capabilities.remember(std::slice::from_ref(&found));
        return Ok(found);
    }
    Err(localized(l, ErrorCode::NotFound, keys::CAPABILITY_ERROR_NOT_FOUND))
}

fn secret(state: &SharedState, id: &str, key: &str) -> Option<String> {
    state
        .secrets
        .load_named(&secret_name(id, key))
        .ok()
        .flatten()
        .filter(|value| !value.is_empty())
}

async fn connect(state: &SharedState, id: &str, setup: &Setup) -> Result<mcp::Client, ProtocolError> {
    let l = &state.localizer;
    let lookup = |key: &str| secret(state, id, key);
    match setup {
        Setup::Remote { url, headers } => {
            let headers = headers
                .iter()
                .filter_map(|field| Some((field.name.clone(), field.value(lookup)?)))
                .collect();
            mcp::Client::connect_http(url, headers)
                .await
                .map_err(|failure| mcp_failure(l, &failure))
        }
        Setup::Local {
            runtime,
            package,
            version,
            env,
        } => {
            let binary = runtime_binary(*runtime).ok_or_else(|| {
                ProtocolError::new(
                    ErrorCode::BadRequest,
                    l.format(keys::CAPABILITY_ERROR_RUNTIME, &[("runtime", runtime.command())]),
                )
            })?;
            let mut command = tokio::process::Command::new(&binary);
            let target = if version.is_empty() {
                package.clone()
            } else {
                format!("{package}@{version}")
            };
            match runtime {
                Runtime::Npm => command.arg("-y").arg(target),
                Runtime::Pypi => command.arg(target),
            };
            if let Some(dir) = binary.parent() {
                let mut paths = vec![dir.to_path_buf()];
                if let Some(path) = std::env::var_os("PATH") {
                    paths.extend(std::env::split_paths(&path));
                }
                if let Ok(joined) = std::env::join_paths(paths) {
                    command.env("PATH", joined);
                }
            }
            for field in env {
                if let Some(value) = field.value(lookup) {
                    command.env(&field.name, value);
                }
            }
            mcp::Client::connect_stdio(command)
                .await
                .map_err(|failure| mcp_failure(l, &failure))
        }
        Setup::Skill { .. } => Err(localized(l, ErrorCode::BadRequest, keys::CAPABILITY_ERROR_UNSUPPORTED)),
    }
}

async fn client(state: &SharedState, id: &str) -> Result<Arc<mcp::Client>, ProtocolError> {
    let mut servers = state.capabilities.servers.lock().await;
    if let Some(client) = servers.get(id) {
        return Ok(Arc::clone(client));
    }
    let entry = state
        .capabilities
        .get(id)
        .ok_or_else(|| localized(&state.localizer, ErrorCode::NotFound, keys::CAPABILITY_ERROR_NOT_FOUND))?;
    let client = Arc::new(connect(state, id, &entry.setup).await?);
    servers.insert(id.to_owned(), Arc::clone(&client));
    drop(servers);
    if let Ok(tools) = client.list_tools().await
        && tools != entry.tools
    {
        state.capabilities.change(id, |entry| {
            entry.capability.tools = tools.iter().map(|tool| tool.name.clone()).collect();
            entry.tools = tools;
        });
        persist(state).await;
    }
    Ok(client)
}

fn missing_inputs(state: &SharedState, found: &Found, secrets: &HashMap<String, String>) -> Vec<String> {
    found
        .capability
        .inputs
        .iter()
        .filter(|input| input.required)
        .filter(|input| {
            secrets.get(&input.key).is_none_or(|value| value.trim().is_empty())
                && secret(state, &found.capability.id, &input.key).is_none()
        })
        .map(|input| input.key.clone())
        .collect()
}

fn save_secrets(state: &SharedState, id: &str, secrets: &HashMap<String, String>, keys_allowed: &[String]) -> Result<(), ProtocolError> {
    for (key, value) in secrets {
        if !keys_allowed.contains(key) || value.trim().is_empty() {
            continue;
        }
        state
            .secrets
            .save_named(&secret_name(id, key), Some(value.trim()))
            .map_err(|failure| {
                tracing::error!(%failure, "could not store a capability secret");
                localized(&state.localizer, ErrorCode::Internal, keys::CAPABILITY_ERROR_KEYCHAIN)
            })?;
    }
    Ok(())
}

fn forget_secrets(state: &SharedState, id: &str, keys_known: &[String]) {
    for key in keys_known {
        let _ = state.secrets.save_named(&secret_name(id, key), None);
    }
}

async fn write_skill(path: &Path, body: &str) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        tokio::fs::create_dir_all(dir).await?;
    }
    tokio::fs::write(path, body).await
}

async fn prepare(state: &SharedState, found: &Found) -> Result<Vec<mcp::Tool>, ProtocolError> {
    let l = &state.localizer;
    let id = &found.capability.id;
    match &found.setup {
        Setup::Skill { url } => {
            let body = registry::fetch_text(url)
                .await
                .filter(|body| registry::frontmatter(body).is_some())
                .ok_or_else(|| localized(l, ErrorCode::BadRequest, keys::CAPABILITY_ERROR_SKILL))?;
            write_skill(&state.capabilities.skill_path(id), &body)
                .await
                .map_err(|failure| ProtocolError::new(ErrorCode::Internal, failure.to_string()))?;
            Ok(Vec::new())
        }
        setup => {
            state.capabilities.disconnect(id).await;
            let client = connect(state, id, setup).await?;
            let tools = client.list_tools().await.map_err(|failure| mcp_failure(l, &failure))?;
            state
                .capabilities
                .servers
                .lock()
                .await
                .insert(id.clone(), Arc::new(client));
            Ok(tools)
        }
    }
}

pub async fn install(
    state: &SharedState,
    id: &str,
    secrets: &HashMap<String, String>,
    acknowledged_risk: bool,
) -> Result<Capability, ProtocolError> {
    let l = &state.localizer;
    let found = locate(state, id).await?;
    let id = found.capability.id.clone();
    if found.capability.kind == CapabilityKind::LocalMcp && !found.capability.verified && !acknowledged_risk {
        return Err(localized(l, ErrorCode::BadRequest, keys::CAPABILITY_ERROR_RISK));
    }
    let missing = missing_inputs(state, &found, secrets);
    if !missing.is_empty() {
        return Err(ProtocolError::new(
            ErrorCode::BadRequest,
            l.format(keys::CAPABILITY_ERROR_MISSING, &[("keys", &missing.join(", "))]),
        ));
    }
    let input_keys: Vec<String> = found.capability.inputs.iter().map(|input| input.key.clone()).collect();
    let previous = state.capabilities.get(&id);
    save_secrets(state, &id, secrets, &input_keys)?;
    let tools = match prepare(state, &found).await {
        Ok(tools) => tools,
        Err(failure) => {
            if previous.is_none() {
                forget_secrets(state, &id, &input_keys);
            }
            return Err(failure);
        }
    };
    let capability = Capability {
        installed: true,
        enabled: true,
        uses: previous.as_ref().map_or(0, |entry| entry.capability.uses),
        installed_at: Some(xiaoban_store::now_ms()),
        tools: tools.iter().map(|tool| tool.name.clone()).collect(),
        ..found.capability
    };
    state.capabilities.upsert(Installed {
        capability: capability.clone(),
        setup: found.setup,
        tools,
    });
    persist(state).await;
    Ok(capability)
}

async fn set_enabled(state: &SharedState, id: &str, enabled: bool) -> Result<(), ProtocolError> {
    state
        .capabilities
        .change(id, |entry| entry.capability.enabled = enabled)
        .ok_or_else(|| localized(&state.localizer, ErrorCode::NotFound, keys::CAPABILITY_ERROR_NOT_FOUND))?;
    if !enabled {
        state.capabilities.disconnect(id).await;
    }
    persist(state).await;
    Ok(())
}

async fn remove(state: &SharedState, id: &str) -> Result<(), ProtocolError> {
    let entry = state
        .capabilities
        .get(id)
        .ok_or_else(|| localized(&state.localizer, ErrorCode::NotFound, keys::CAPABILITY_ERROR_NOT_FOUND))?;
    state.capabilities.disconnect(id).await;
    let input_keys: Vec<String> = entry.capability.inputs.iter().map(|input| input.key.clone()).collect();
    forget_secrets(state, id, &input_keys);
    if entry.capability.kind == CapabilityKind::Skill {
        let _ = tokio::fs::remove_file(state.capabilities.skill_path(id)).await;
    }
    state
        .capabilities
        .installed
        .write()
        .unwrap()
        .retain(|entry| entry.capability.id != id);
    persist(state).await;
    Ok(())
}

pub async fn handle(state: &SharedState, request: Request) -> Result<Response, ProtocolError> {
    match request {
        Request::FindCapabilities { query } => Ok(Response::Capabilities {
            capabilities: search(state, &query).await?,
        }),
        Request::ListCapabilities => Ok(Response::Capabilities {
            capabilities: state.capabilities.list(),
        }),
        Request::InstallCapability {
            id,
            secrets,
            acknowledged_risk,
        } => Ok(Response::Capability {
            capability: install(state, &id, &secrets, acknowledged_risk).await?,
        }),
        Request::SetCapabilityEnabled { id, enabled } => {
            set_enabled(state, &id, enabled).await.map(|()| Response::Ack)
        }
        Request::RemoveCapability { id } => remove(state, &id).await.map(|()| Response::Ack),
        _ => Err(ProtocolError::new(ErrorCode::BadRequest, "not a capability request")),
    }
}

pub fn note(state: &SharedState) -> Option<ContextNote> {
    let skills = state.capabilities.enabled_skills();
    (!skills.is_empty()).then(|| ContextNote {
        label: state.localizer.text(keys::CAPABILITY_SKILLS_LABEL),
        body: skills
            .iter()
            .map(|skill| format!("- {}: {}", skill.name, clip(&skill.description, MAX_SKILL_DESCRIPTION)))
            .collect::<Vec<_>>()
            .join("\n"),
    })
}

pub fn specs(l: &Localizer) -> Vec<ToolSpec> {
    let text = |key| json!({ "type": "string", "description": l.text(key) });
    vec![
        ToolSpec {
            name: FIND.to_owned(),
            description: l.text(keys::TOOL_FIND_CAPABILITY_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": { "query": text(keys::TOOL_FIND_CAPABILITY_QUERY) },
                "required": ["query"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: SKILL_READ.to_owned(),
            description: l.text(keys::TOOL_SKILL_READ_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": { "name": text(keys::TOOL_SKILL_READ_NAME) },
                "required": ["name"],
                "additionalProperties": false,
            }),
        },
    ]
}

fn failure(message: &str) -> String {
    json!({ "error": message }).to_string()
}

fn candidate(capability: &Capability) -> Value {
    json!({
        "id": capability.id,
        "title": capability.title,
        "kind": capability.kind,
        "publisher": capability.publisher,
        "verified": capability.verified,
        "scanned": capability.scanned,
        "installed": capability.installed,
        "description": clip(&capability.description, MAX_CANDIDATE_DESCRIPTION),
        "needs": capability.needs,
    })
}

enum CallError {
    Setup(ProtocolError),
    Mcp(McpError),
}

#[derive(Deserialize)]
struct FindArgs {
    query: String,
}

#[derive(Deserialize)]
struct ReadArgs {
    name: String,
}

impl HubTools<'_> {
    pub(crate) async fn find_capability(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<FindArgs>(arguments) else {
            return failure("arguments must be {query}");
        };
        let l = &self.state.localizer;
        match search(self.state, &args.query).await {
            Ok(found) => {
                self.state.publish(Event::CapabilitiesFound {
                    thread_id: self.thread_id.to_owned(),
                    turn_id: self.turn_id.to_owned(),
                    capabilities: found.clone(),
                });
                let note = if found.is_empty() {
                    l.text(keys::CAPABILITY_FOUND_NONE)
                } else {
                    l.text(keys::CAPABILITY_FOUND_NOTE)
                };
                json!({
                    "candidates": found.iter().map(candidate).collect::<Vec<_>>(),
                    "note": note,
                })
                .to_string()
            }
            Err(error) => failure(&error.detail),
        }
    }

    pub(crate) async fn skill_read(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<ReadArgs>(arguments) else {
            return failure("arguments must be {name}");
        };
        let wanted = args.name.trim().to_lowercase();
        let Some(skill) = self
            .state
            .capabilities
            .enabled_skills()
            .into_iter()
            .find(|skill| skill.name.to_lowercase() == wanted || skill.title.to_lowercase() == wanted)
        else {
            return failure("no installed and enabled skill has that name");
        };
        match tokio::fs::read_to_string(self.state.capabilities.skill_path(&skill.id)).await {
            Ok(body) => body,
            Err(_) => failure("the skill file is missing; ask the user to reinstall it"),
        }
    }

    pub(crate) async fn mcp_tool(&self, name: &str, arguments: &str) -> String {
        let route = self.state.capabilities.routes.read().unwrap().get(name).cloned();
        let Some((id, tool)) = route else {
            return failure(&self.state.localizer.text(keys::CAPABILITY_ERROR_DISABLED));
        };
        let arguments: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let output = match self.call_mcp(&id, &tool, arguments.clone()).await {
            Err(CallError::Mcp(McpError::SessionExpired | McpError::Process(_))) => {
                self.state.capabilities.disconnect(&id).await;
                self.call_mcp(&id, &tool, arguments).await
            }
            other => other,
        };
        match output {
            Ok(text) => {
                self.record_use(&id, &tool).await;
                text
            }
            Err(CallError::Setup(error)) => failure(&error.detail),
            Err(CallError::Mcp(error)) => failure(&mcp_failure(&self.state.localizer, &error).detail),
        }
    }

    async fn call_mcp(&self, id: &str, tool: &str, arguments: Value) -> Result<String, CallError> {
        let client = client(self.state, id).await.map_err(CallError::Setup)?;
        client.call_tool(tool, arguments).await.map_err(CallError::Mcp)
    }

    async fn record_use(&self, id: &str, tool: &str) {
        let Some(entry) = self
            .state
            .capabilities
            .change(id, |entry| entry.capability.uses = entry.capability.uses.saturating_add(1))
        else {
            return;
        };
        let installed = self.state.capabilities.installed.read().unwrap().clone();
        let _ = self
            .state
            .store
            .set_setting_owned(
                STORE_KEY.to_owned(),
                serde_json::to_string(&installed).unwrap_or_default(),
            )
            .await;
        self.state.publish(Event::CapabilityUsed {
            thread_id: self.thread_id.to_owned(),
            turn_id: self.turn_id.to_owned(),
            id: id.to_owned(),
            title: entry.capability.title,
            tool: tool.to_owned(),
            uses: entry.capability.uses,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_names_are_sanitized_and_bounded() {
        assert_eq!(tool_name("notion", "search"), "mcp__notion__search");
        assert_eq!(tool_name("my.server", "get file/v2"), "mcp__my_server__get_file_v2");
        let long = tool_name(&"a".repeat(50), &"b".repeat(50));
        assert_eq!(long.len(), 64);
        assert!(long.starts_with("mcp__aaaa"));
        assert!(is_mcp(&long));
        assert_eq!(sanitize("中文-ok_1"), "__-ok_1");
    }

    #[test]
    fn refresh_builds_routes_for_enabled_servers() {
        let capabilities = Capabilities::new(None);
        let server = |id: &str, name: &str, enabled: bool| Installed {
            capability: Capability {
                id: id.to_owned(),
                name: name.to_owned(),
                title: "T".to_owned(),
                kind: CapabilityKind::RemoteMcp,
                enabled,
                ..Capability::default()
            },
            setup: Setup::Remote { url: "https://x".to_owned(), headers: Vec::new() },
            tools: vec![mcp::Tool { name: "search".to_owned(), description: "d".to_owned(), input_schema: json!({}) }],
        };
        *capabilities.installed.write().unwrap() = vec![
            server("mcp:com.a/notion", "com.a/notion", true),
            server("mcp:com.b/notion", "com.b/notion", true),
            server("mcp:com.c/off", "com.c/off", false),
        ];
        capabilities.refresh();
        let mut tools = Vec::new();
        capabilities.extend(&mut tools);
        let names: Vec<&str> = tools.iter().map(|tool| tool.name.as_str()).collect();
        assert_eq!(names, ["mcp__notion__search", "mcp__com_b_notion__search"]);
        assert_eq!(tools[0].parameters["type"], "object");
        assert_eq!(tools[0].description, "[T] d");
        let routes = capabilities.routes.read().unwrap();
        assert_eq!(routes["mcp__com_b_notion__search"], ("mcp:com.b/notion".to_owned(), "search".to_owned()));
    }
}
