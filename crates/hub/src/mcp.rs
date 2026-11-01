use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::oneshot;

pub const PROTOCOL_VERSION: &str = "2025-06-18";
const SESSION_HEADER: &str = "mcp-session-id";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
const STDIO_START_TIMEOUT: Duration = Duration::from_secs(180);
const CALL_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_OUTPUT: usize = 30_000;
const MAX_PAGES: usize = 10;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum McpError {
    NeedsSignIn,
    Rejected,
    SessionExpired,
    Timeout,
    Http(String),
    Protocol(String),
    Process(String),
    Remote(String),
}

impl std::fmt::Display for McpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NeedsSignIn => f.write_str("the server requires an OAuth sign-in"),
            Self::Rejected => f.write_str("the server rejected the credentials"),
            Self::SessionExpired => f.write_str("the server session expired"),
            Self::Timeout => f.write_str("the server did not answer in time"),
            Self::Http(detail) => write!(f, "http error: {detail}"),
            Self::Protocol(detail) => write!(f, "protocol error: {detail}"),
            Self::Process(detail) => write!(f, "process error: {detail}"),
            Self::Remote(detail) => write!(f, "server error: {detail}"),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Tool {
    pub name: String,
    pub description: String,
    pub input_schema: Value,
}

#[derive(Debug, Default)]
pub struct SseBuffer {
    pending: String,
}

impl SseBuffer {
    pub fn push(&mut self, chunk: &str) -> Vec<String> {
        self.pending.push_str(&chunk.replace("\r\n", "\n").replace('\r', "\n"));
        let mut events = Vec::new();
        while let Some(end) = self.pending.find("\n\n") {
            let block: String = self.pending.drain(..end + 2).collect();
            if let Some(data) = event_data(&block) {
                events.push(data);
            }
        }
        events
    }

    pub fn finish(&mut self) -> Option<String> {
        let block = std::mem::take(&mut self.pending);
        event_data(&block)
    }
}

fn event_data(block: &str) -> Option<String> {
    let lines: Vec<&str> = block
        .lines()
        .filter_map(|line| line.strip_prefix("data:"))
        .map(|data| data.strip_prefix(' ').unwrap_or(data))
        .collect();
    (!lines.is_empty()).then(|| lines.join("\n"))
}

fn find_reply(messages: Vec<Value>, id: u64) -> Option<Value> {
    messages.into_iter().find_map(|message| match message {
        Value::Array(batch) => find_reply(batch, id),
        message if message.get("id").and_then(Value::as_u64) == Some(id) => Some(message),
        _ => None,
    })
}

fn unwrap_reply(reply: &Value) -> Result<Value, McpError> {
    if let Some(error) = reply.get("error") {
        let message = error
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("unknown error");
        return Err(McpError::Remote(message.to_owned()));
    }
    Ok(reply.get("result").cloned().unwrap_or(Value::Null))
}

pub fn parse_tools(result: &Value) -> Vec<Tool> {
    result
        .get("tools")
        .and_then(Value::as_array)
        .map(|tools| {
            tools
                .iter()
                .filter_map(|tool| {
                    let name = tool.get("name")?.as_str()?.to_owned();
                    Some(Tool {
                        name,
                        description: tool
                            .get("description")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_owned(),
                        input_schema: tool
                            .get("inputSchema")
                            .filter(|schema| schema.is_object())
                            .cloned()
                            .unwrap_or_else(|| json!({ "type": "object", "properties": {} })),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn render_result(result: &Value) -> String {
    let mut parts = Vec::new();
    for item in result
        .get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        match item.get("type").and_then(Value::as_str) {
            Some("text") => {
                parts.push(item.get("text").and_then(Value::as_str).unwrap_or_default().to_owned());
            }
            Some("resource") => {
                let resource = item.get("resource").cloned().unwrap_or(Value::Null);
                let text = resource
                    .get("text")
                    .and_then(Value::as_str)
                    .map(str::to_owned)
                    .or_else(|| resource.get("uri").and_then(Value::as_str).map(str::to_owned))
                    .unwrap_or_default();
                parts.push(text);
            }
            Some("resource_link") => {
                parts.push(item.get("uri").and_then(Value::as_str).unwrap_or_default().to_owned());
            }
            Some(other) => parts.push(format!("[{other}]")),
            None => {}
        }
    }
    if parts.is_empty()
        && let Some(structured) = result.get("structuredContent")
    {
        parts.push(structured.to_string());
    }
    let mut text = parts.join("\n");
    if text.chars().count() > MAX_OUTPUT {
        text = text.chars().take(MAX_OUTPUT).collect();
    }
    if result.get("isError").and_then(Value::as_bool) == Some(true) {
        json!({ "error": text }).to_string()
    } else {
        text
    }
}

fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(15))
            .user_agent(concat!("Xiaoban/", env!("CARGO_PKG_VERSION")))
            .build()
            .unwrap_or_default()
    })
}

#[derive(Debug)]
struct HttpTransport {
    url: String,
    headers: Vec<(String, String)>,
    session: Mutex<Option<String>>,
    initialized: Mutex<bool>,
}

impl HttpTransport {
    fn builder(&self, body: &Value) -> reqwest::RequestBuilder {
        let mut request = http()
            .post(&self.url)
            .header("content-type", "application/json")
            .header("accept", "application/json, text/event-stream")
            .json(body);
        if *self.initialized.lock().unwrap() {
            request = request.header("mcp-protocol-version", PROTOCOL_VERSION);
        }
        if let Some(session) = self.session.lock().unwrap().clone() {
            request = request.header(SESSION_HEADER, session);
        }
        for (name, value) in &self.headers {
            request = request.header(name.as_str(), value.as_str());
        }
        request
    }

    async fn send(&self, body: Value, id: Option<u64>) -> Result<Option<Value>, McpError> {
        let response = self
            .builder(&body)
            .send()
            .await
            .map_err(|failure| McpError::Http(failure.to_string()))?;
        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            let challenged = response.headers().contains_key("www-authenticate");
            return Err(if challenged && self.headers.is_empty() {
                McpError::NeedsSignIn
            } else {
                McpError::Rejected
            });
        }
        if status == reqwest::StatusCode::FORBIDDEN {
            return Err(McpError::Rejected);
        }
        if status == reqwest::StatusCode::NOT_FOUND && self.session.lock().unwrap().is_some() {
            return Err(McpError::SessionExpired);
        }
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            let text: String = text.chars().take(300).collect();
            return Err(McpError::Http(format!("{status} {text}")));
        }
        if let Some(session) = response
            .headers()
            .get(SESSION_HEADER)
            .and_then(|value| value.to_str().ok())
        {
            *self.session.lock().unwrap() = Some(session.to_owned());
        }
        let Some(id) = id else {
            return Ok(None);
        };
        let streaming = response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("text/event-stream"));
        if streaming {
            return read_stream(response, id).await.map(Some);
        }
        let text = response
            .text()
            .await
            .map_err(|failure| McpError::Http(failure.to_string()))?;
        let value: Value = serde_json::from_str(&text)
            .map_err(|_| McpError::Protocol("the response is not JSON".to_owned()))?;
        find_reply(vec![value], id)
            .map(Some)
            .ok_or_else(|| McpError::Protocol("no reply with the request id".to_owned()))
    }
}

async fn read_stream(response: reqwest::Response, id: u64) -> Result<Value, McpError> {
    let mut buffer = SseBuffer::default();
    let mut stream = response.bytes_stream();
    let mut carry = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|failure| McpError::Http(failure.to_string()))?;
        carry.extend_from_slice(&chunk);
        let valid = match std::str::from_utf8(&carry) {
            Ok(_) => carry.len(),
            Err(error) => error.valid_up_to(),
        };
        let text = String::from_utf8_lossy(&carry[..valid]).into_owned();
        carry.drain(..valid);
        let messages = buffer
            .push(&text)
            .iter()
            .filter_map(|data| serde_json::from_str(data).ok())
            .collect();
        if let Some(reply) = find_reply(messages, id) {
            return Ok(reply);
        }
    }
    buffer
        .finish()
        .and_then(|data| serde_json::from_str(&data).ok())
        .and_then(|message| find_reply(vec![message], id))
        .ok_or_else(|| McpError::Protocol("the stream ended without a reply".to_owned()))
}

type Pending = Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>;

#[derive(Debug)]
struct StdioTransport {
    stdin: Arc<tokio::sync::Mutex<ChildStdin>>,
    pending: Pending,
    child: Mutex<Option<Child>>,
}

impl StdioTransport {
    fn spawn(mut command: Command) -> Result<Self, McpError> {
        command
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true);
        let mut child = command
            .spawn()
            .map_err(|failure| McpError::Process(failure.to_string()))?;
        let stdin = Arc::new(tokio::sync::Mutex::new(
            child.stdin.take().ok_or_else(|| McpError::Process("no stdin".to_owned()))?,
        ));
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| McpError::Process("no stdout".to_owned()))?;
        let pending: Pending = Arc::default();
        let reader_pending = Arc::clone(&pending);
        let writer = Arc::clone(&stdin);
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let Ok(message) = serde_json::from_str::<Value>(line.trim()) else {
                    continue;
                };
                if message.get("method").is_some() {
                    if let Some(id) = message.get("id").cloned() {
                        let answer = if message.get("method").and_then(Value::as_str) == Some("ping") {
                            json!({ "jsonrpc": "2.0", "id": id, "result": {} })
                        } else {
                            json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": "method not found" } })
                        };
                        let mut stdin = writer.lock().await;
                        let _ = stdin.write_all(format!("{answer}\n").as_bytes()).await;
                        let _ = stdin.flush().await;
                    }
                    continue;
                }
                if let Some(id) = message.get("id").and_then(Value::as_u64)
                    && let Some(sender) = reader_pending.lock().unwrap().remove(&id)
                {
                    let _ = sender.send(message);
                }
            }
            reader_pending.lock().unwrap().clear();
        });
        Ok(Self {
            stdin,
            pending,
            child: Mutex::new(Some(child)),
        })
    }

    async fn send(&self, body: Value, id: Option<u64>) -> Result<Option<Value>, McpError> {
        let receiver = id.map(|id| {
            let (sender, receiver) = oneshot::channel();
            self.pending.lock().unwrap().insert(id, sender);
            receiver
        });
        {
            let mut stdin = self.stdin.lock().await;
            stdin
                .write_all(format!("{body}\n").as_bytes())
                .await
                .map_err(|failure| McpError::Process(failure.to_string()))?;
            stdin
                .flush()
                .await
                .map_err(|failure| McpError::Process(failure.to_string()))?;
        }
        match receiver {
            Some(receiver) => receiver
                .await
                .map(Some)
                .map_err(|_| McpError::Process("the server exited".to_owned())),
            None => Ok(None),
        }
    }

    fn kill(&self) {
        if let Some(mut child) = self.child.lock().unwrap().take() {
            let _ = child.start_kill();
        }
    }
}

#[derive(Debug)]
enum Transport {
    Http(HttpTransport),
    Stdio(Box<StdioTransport>),
}

#[derive(Debug)]
pub struct Client {
    transport: Transport,
    next: AtomicU64,
}

impl Drop for Client {
    fn drop(&mut self) {
        if let Transport::Stdio(stdio) = &self.transport {
            stdio.kill();
        }
    }
}

impl Client {
    pub async fn connect_http(url: &str, headers: Vec<(String, String)>) -> Result<Self, McpError> {
        let client = Self {
            transport: Transport::Http(HttpTransport {
                url: url.to_owned(),
                headers,
                session: Mutex::new(None),
                initialized: Mutex::new(false),
            }),
            next: AtomicU64::new(1),
        };
        client.initialize(CONNECT_TIMEOUT).await?;
        Ok(client)
    }

    pub async fn connect_stdio(command: Command) -> Result<Self, McpError> {
        let client = Self {
            transport: Transport::Stdio(Box::new(StdioTransport::spawn(command)?)),
            next: AtomicU64::new(1),
        };
        client.initialize(STDIO_START_TIMEOUT).await?;
        Ok(client)
    }

    async fn initialize(&self, wait: Duration) -> Result<(), McpError> {
        let params = json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {},
            "clientInfo": { "name": "xiaoban", "version": env!("CARGO_PKG_VERSION") },
        });
        tokio::time::timeout(wait, self.request("initialize", params))
            .await
            .map_err(|_| McpError::Timeout)??;
        if let Transport::Http(http) = &self.transport {
            *http.initialized.lock().unwrap() = true;
        }
        self.notify("notifications/initialized").await
    }

    async fn send(&self, body: Value, id: Option<u64>) -> Result<Option<Value>, McpError> {
        match &self.transport {
            Transport::Http(http) => http.send(body, id).await,
            Transport::Stdio(stdio) => stdio.send(body, id).await,
        }
    }

    async fn request(&self, method: &str, params: Value) -> Result<Value, McpError> {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let body = json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
        let reply = self
            .send(body, Some(id))
            .await?
            .ok_or_else(|| McpError::Protocol("no reply".to_owned()))?;
        unwrap_reply(&reply)
    }

    async fn notify(&self, method: &str) -> Result<(), McpError> {
        self.send(json!({ "jsonrpc": "2.0", "method": method }), None)
            .await
            .map(|_| ())
    }

    pub async fn list_tools(&self) -> Result<Vec<Tool>, McpError> {
        let mut tools = Vec::new();
        let mut cursor: Option<String> = None;
        for _ in 0..MAX_PAGES {
            let params = cursor
                .as_ref()
                .map_or_else(|| json!({}), |cursor| json!({ "cursor": cursor }));
            let result = tokio::time::timeout(CONNECT_TIMEOUT, self.request("tools/list", params))
                .await
                .map_err(|_| McpError::Timeout)??;
            tools.extend(parse_tools(&result));
            cursor = result
                .get("nextCursor")
                .and_then(Value::as_str)
                .filter(|cursor| !cursor.is_empty())
                .map(str::to_owned);
            if cursor.is_none() {
                break;
            }
        }
        Ok(tools)
    }

    pub async fn call_tool(&self, name: &str, arguments: Value) -> Result<String, McpError> {
        let params = json!({ "name": name, "arguments": arguments });
        let result = tokio::time::timeout(CALL_TIMEOUT, self.request("tools/call", params))
            .await
            .map_err(|_| McpError::Timeout)??;
        Ok(render_result(&result))
    }
}

#[cfg(test)]
mod tests {
    use axum::Json;
    use axum::http::{HeaderMap, StatusCode};
    use axum::response::{IntoResponse, Response};
    use axum::routing::post;

    use super::*;

fn sse_messages(text: &str) -> Vec<Value> {
        let mut buffer = SseBuffer::default();
        let mut data = buffer.push(text);
        data.extend(buffer.finish());
        data.iter()
            .filter_map(|item| serde_json::from_str(item).ok())
            .collect()
    }

    #[test]
    fn sse_parsing_handles_split_chunks_and_multiline_data() {
        let mut buffer = SseBuffer::default();
        assert_eq!(buffer.push("event: message\r\ndata: {\"a\":"), Vec::<String>::new());
        let events = buffer.push("1}\r\n\r\nid: 2\ndata: line1\ndata: line2\n\n: comment\n\n");
        assert_eq!(events, vec!["{\"a\":1}".to_owned(), "line1\nline2".to_owned()]);
        assert_eq!(buffer.push("data: tail"), Vec::<String>::new());
        assert_eq!(buffer.finish(), Some("tail".to_owned()));
    }

    #[test]
    fn replies_are_found_in_sse_and_batches() {
        let text = "data: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/progress\"}\n\ndata: {\"jsonrpc\":\"2.0\",\"id\":7,\"result\":{\"ok\":true}}\n\n";
        let reply = find_reply(sse_messages(text), 7).unwrap();
        assert_eq!(unwrap_reply(&reply).unwrap(), json!({ "ok": true }));
        let batch = json!([{ "jsonrpc": "2.0", "id": 3, "error": { "code": -1, "message": "nope" } }]);
        let reply = find_reply(vec![batch], 3).unwrap();
        assert_eq!(unwrap_reply(&reply), Err(McpError::Remote("nope".to_owned())));
        assert!(find_reply(sse_messages(text), 8).is_none());
    }

    #[test]
    fn results_are_flattened_to_text() {
        let result = json!({ "content": [
            { "type": "text", "text": "hello" },
            { "type": "image", "data": "...", "mimeType": "image/png" },
            { "type": "resource", "resource": { "uri": "file:///a", "text": "body" } },
        ] });
        assert_eq!(render_result(&result), "hello\n[image]\nbody");
        let failed = json!({ "content": [{ "type": "text", "text": "bad" }], "isError": true });
        assert_eq!(render_result(&failed), json!({ "error": "bad" }).to_string());
        let structured = json!({ "content": [], "structuredContent": { "n": 1 } });
        assert_eq!(render_result(&structured), "{\"n\":1}");
    }

    async fn rpc(headers: HeaderMap, Json(body): Json<Value>) -> Response {
        let method = body.get("method").and_then(Value::as_str).unwrap_or_default().to_owned();
        let Some(id) = body.get("id").cloned() else {
            return StatusCode::ACCEPTED.into_response();
        };
        if method != "initialize"
            && headers.get(SESSION_HEADER).and_then(|v| v.to_str().ok()) != Some("s-1")
        {
            return (StatusCode::BAD_REQUEST, "missing session").into_response();
        }
        if headers.get("x-key").and_then(|v| v.to_str().ok()) != Some("secret") {
            return StatusCode::UNAUTHORIZED.into_response();
        }
        match method.as_str() {
            "initialize" => (
                [(SESSION_HEADER, "s-1")],
                Json(json!({ "jsonrpc": "2.0", "id": id, "result": {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "test", "version": "1" },
                } })),
            )
                .into_response(),
            "tools/list" => Json(json!({ "jsonrpc": "2.0", "id": id, "result": { "tools": [{
                "name": "echo",
                "description": "Echo text back",
                "inputSchema": { "type": "object", "properties": { "text": { "type": "string" } } },
            }] } }))
            .into_response(),
            "tools/call" => {
                let text = body["params"]["arguments"]["text"].as_str().unwrap_or_default();
                let reply = json!({ "jsonrpc": "2.0", "id": id, "result": {
                    "content": [{ "type": "text", "text": format!("echo: {text}") }],
                } });
                let stream = format!(
                    "event: message\ndata: {}\n\nevent: message\ndata: {reply}\n\n",
                    json!({ "jsonrpc": "2.0", "method": "notifications/message", "params": {} })
                );
                ([("content-type", "text/event-stream")], stream).into_response()
            }
            _ => Json(json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32601, "message": "unknown" } }))
                .into_response(),
        }
    }

    async fn serve(router: axum::Router) -> String {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        format!("http://{addr}/mcp")
    }

    #[tokio::test]
    async fn streamable_http_initialize_list_and_call() {
        let url = serve(axum::Router::new().route("/mcp", post(rpc))).await;
        let headers = vec![("x-key".to_owned(), "secret".to_owned())];
        let client = Client::connect_http(&url, headers).await.unwrap();
        let tools = client.list_tools().await.unwrap();
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].name, "echo");
        assert_eq!(tools[0].input_schema["properties"]["text"]["type"], "string");
        let output = client.call_tool("echo", json!({ "text": "hi" })).await.unwrap();
        assert_eq!(output, "echo: hi");
        let rejected = Client::connect_http(&url, vec![("x-key".to_owned(), "wrong".to_owned())]).await;
        assert_eq!(rejected.unwrap_err(), McpError::Rejected);
    }

    #[tokio::test]
    async fn oauth_challenges_are_reported_as_sign_in() {
        let router = axum::Router::new().route(
            "/mcp",
            post(|| async {
                (
                    StatusCode::UNAUTHORIZED,
                    [("www-authenticate", "Bearer resource_metadata=\"https://x/.well-known\"")],
                )
            }),
        );
        let url = serve(router).await;
        let failure = Client::connect_http(&url, Vec::new()).await.unwrap_err();
        assert_eq!(failure, McpError::NeedsSignIn);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn stdio_initialize_list_and_call() {
        let script = r#"
while IFS= read -r line; do
  id=$(printf '%s' "$line" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
  case "$line" in
    *'"initialize"'*) printf '{"jsonrpc":"2.0","id":%s,"result":{"protocolVersion":"2025-06-18","capabilities":{}}}\n' "$id" ;;
    *'"tools/list"'*) printf '{"jsonrpc":"2.0","id":%s,"result":{"tools":[{"name":"now","inputSchema":{"type":"object"}}]}}\n' "$id" ;;
    *'"tools/call"'*) printf '{"jsonrpc":"2.0","id":%s,"result":{"content":[{"type":"text","text":"noon"}]}}\n' "$id" ;;
  esac
done
"#;
        let mut command = Command::new("sh");
        command.arg("-c").arg(script);
        let client = Client::connect_stdio(command).await.unwrap();
        let tools = client.list_tools().await.unwrap();
        assert_eq!(tools[0].name, "now");
        assert_eq!(client.call_tool("now", json!({})).await.unwrap(), "noon");
    }
}
