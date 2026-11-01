use std::fmt;
use std::sync::Arc;

use futures_util::future::BoxFuture;
use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_hub::{
    ActFailure, Agenda, AgendaError, AppEntry, Apps, Locator, MAX_ELEMENTS, Operator, Snapshot, UiAction, UiElement,
};
use xiaoban_protocol::{AgendaItem, Location, OperatePermissions};

pub type Bridge = Arc<dyn Fn(String) -> Result<String, String> + Send + Sync>;

fn ask(bridge: &Bridge, request: &Value) -> Result<Value, String> {
    let reply = bridge(request.to_string())?;
    let value: Value = serde_json::from_str(&reply).map_err(|error| error.to_string())?;
    match value.get("error").and_then(Value::as_str) {
        Some(error) => Err(error.to_owned()),
        None => Ok(value),
    }
}

fn call(bridge: &Bridge, request: Value) -> BoxFuture<'static, Result<Value, String>> {
    let bridge = bridge.clone();
    Box::pin(async move {
        tokio::task::spawn_blocking(move || ask(&bridge, &request))
            .await
            .map_err(|error| error.to_string())?
    })
}

#[derive(Deserialize)]
struct Element {
    role: String,
    label: String,
    #[serde(default)]
    value: Option<String>,
    #[serde(default)]
    disabled: bool,
}

#[derive(Deserialize)]
struct Screen {
    app: String,
    #[serde(default)]
    window: Option<String>,
    elements: Vec<Element>,
}

#[derive(Deserialize)]
struct Installed {
    id: String,
    name: String,
    #[serde(default)]
    aliases: Vec<String>,
}

#[derive(Clone)]
pub struct PhoneOperator {
    bridge: Bridge,
}

impl PhoneOperator {
    pub fn new(bridge: Bridge) -> Self {
        Self { bridge }
    }
}

impl fmt::Debug for PhoneOperator {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("PhoneOperator")
    }
}

impl Operator for PhoneOperator {
    fn permissions(&self) -> OperatePermissions {
        let control = ask(&self.bridge, &json!({ "op": "ready" }))
            .ok()
            .and_then(|value| value.get("ready").and_then(Value::as_bool))
            .unwrap_or(false);
        OperatePermissions { control }
    }

    fn snapshot(&self, app_id: String) -> BoxFuture<'static, Result<Snapshot, String>> {
        let reply = call(&self.bridge, json!({ "op": "snapshot", "app": app_id }));
        Box::pin(async move {
            let screen: Screen =
                serde_json::from_value(reply.await?).map_err(|error| error.to_string())?;
            let truncated = screen.elements.len() > MAX_ELEMENTS;
            let elements = screen
                .elements
                .into_iter()
                .take(MAX_ELEMENTS)
                .zip(0u32..)
                .map(|(element, index)| UiElement {
                    index,
                    role: element.role,
                    label: element.label,
                    value: element.value,
                    disabled: element.disabled,
                })
                .collect();
            Ok(Snapshot {
                app: screen.app,
                window: screen.window,
                elements,
                truncated,
            })
        })
    }

    fn act(
        &self,
        app_id: String,
        index: u32,
        action: UiAction,
        _allow_mouse: bool,
    ) -> BoxFuture<'static, Result<(), ActFailure>> {
        let request = match action {
            UiAction::Press => json!({ "op": "act", "app": app_id, "index": index, "do": "press" }),
            UiAction::SetText(text) => {
                json!({ "op": "act", "app": app_id, "index": index, "do": "set", "text": text })
            }
        };
        let reply = call(&self.bridge, request);
        Box::pin(async move { reply.await.map(|_| ()).map_err(ActFailure::Failed) })
    }

    fn keys(&self, app_id: String, combo: String) -> BoxFuture<'static, Result<(), String>> {
        let reply = call(&self.bridge, json!({ "op": "keys", "app": app_id, "keys": combo }));
        Box::pin(async move { reply.await.map(|_| ()) })
    }

    fn type_into(&self, app_id: String, text: String) -> BoxFuture<'static, Result<(), String>> {
        let reply = call(&self.bridge, json!({ "op": "type", "app": app_id, "text": text }));
        Box::pin(async move { reply.await.map(|_| ()) })
    }

    fn is_phone(&self) -> bool {
        true
    }

    fn status(&self, title: Option<String>) {
        let bridge = self.bridge.clone();
        let request = json!({ "op": "status", "title": title.unwrap_or_default() });
        std::thread::spawn(move || {
            let _ = ask(&bridge, &request);
        });
    }
}

#[derive(Clone)]
pub struct PhoneApps {
    bridge: Bridge,
}

impl PhoneApps {
    pub fn new(bridge: Bridge) -> Self {
        Self { bridge }
    }
}

impl fmt::Debug for PhoneApps {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("PhoneApps")
    }
}

impl Apps for PhoneApps {
    fn list(&self) -> BoxFuture<'static, Vec<AppEntry>> {
        let reply = call(&self.bridge, json!({ "op": "apps" }));
        Box::pin(async move {
            reply
                .await
                .ok()
                .and_then(|value| value.get("apps").cloned())
                .and_then(|apps| serde_json::from_value::<Vec<Installed>>(apps).ok())
                .unwrap_or_default()
                .into_iter()
                .map(|app| AppEntry {
                    id: app.id,
                    name: app.name,
                    aliases: app.aliases,
                })
                .collect()
        })
    }

    fn open(&self, id: String) -> BoxFuture<'static, Result<(), String>> {
        let reply = call(&self.bridge, json!({ "op": "open", "app": id }));
        Box::pin(async move { reply.await.map(|_| ()) })
    }
}

#[derive(Clone)]
pub struct PhoneLocator {
    bridge: Bridge,
}

impl PhoneLocator {
    pub fn new(bridge: Bridge) -> Self {
        Self { bridge }
    }
}

impl fmt::Debug for PhoneLocator {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("PhoneLocator")
    }
}

impl Locator for PhoneLocator {
    fn locate(&self) -> BoxFuture<'static, Location> {
        let reply = call(&self.bridge, json!({ "op": "locate" }));
        Box::pin(async move {
            reply
                .await
                .ok()
                .and_then(|value| serde_json::from_value(value).ok())
                .unwrap_or(Location::Unavailable)
        })
    }
}

#[derive(Clone)]
pub struct PhoneAgenda {
    bridge: Bridge,
}

impl PhoneAgenda {
    pub fn new(bridge: Bridge) -> Self {
        Self { bridge }
    }
}

impl fmt::Debug for PhoneAgenda {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("PhoneAgenda")
    }
}

#[derive(Deserialize)]
struct AgendaReply {
    #[serde(default)]
    status: String,
    #[serde(default)]
    events: Vec<AgendaItem>,
}

impl Agenda for PhoneAgenda {
    fn events(&self, from: i64, to: i64) -> BoxFuture<'static, Result<Vec<AgendaItem>, AgendaError>> {
        let reply = call(&self.bridge, json!({ "op": "calendar", "from": from, "to": to }));
        Box::pin(async move {
            let reply: AgendaReply = reply
                .await
                .ok()
                .and_then(|value| serde_json::from_value(value).ok())
                .ok_or(AgendaError::Unavailable)?;
            match reply.status.as_str() {
                "denied" => Err(AgendaError::Denied),
                "ok" => Ok(reply.events),
                _ => Err(AgendaError::Unavailable),
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fake() -> Bridge {
        Arc::new(|request: String| {
            let request: Value = serde_json::from_str(&request).unwrap();
            Ok(match request["op"].as_str().unwrap() {
                "ready" => json!({ "ready": true }),
                "snapshot" => json!({
                    "app": "Shop",
                    "elements": [
                        { "role": "button", "label": "Checkout" },
                        { "role": "text field", "label": "Search", "value": "noodles" },
                    ],
                }),
                "apps" => json!({ "apps": [{ "id": "com.shop", "name": "Shop", "aliases": ["Old Shop"] }] }),
                "calendar" => json!({
                    "status": "ok",
                    "events": [{ "title": "家长会", "start": request["from"], "end": request["to"], "allDay": false, "location": "", "calendar": "我的日历" }],
                }),
                "locate" => json!({ "status": "found", "city": "Hangzhou", "district": null, "latitude": "30.2", "longitude": "120.1" }),
                "act" if request["index"] == 0 => json!({ "error": "handed over to the user" }),
                _ => json!({ "ok": true }),
            }
            .to_string())
        })
    }

    #[tokio::test]
    async fn forwards_to_the_phone() {
        let operator = PhoneOperator::new(fake());
        assert!(operator.permissions().control);
        let snapshot = operator.snapshot("com.shop".into()).await.unwrap();
        assert_eq!(snapshot.elements[1].index, 1);
        assert_eq!(snapshot.elements[1].value.as_deref(), Some("noodles"));
        assert_eq!(
            operator.act("com.shop".into(), 0, UiAction::Press, false).await,
            Err(ActFailure::Failed("handed over to the user".into()))
        );
        assert!(operator.act("com.shop".into(), 1, UiAction::SetText("x".into()), false).await.is_ok());
        let apps = PhoneApps::new(fake()).list().await;
        assert_eq!(apps[0].name, "Shop");
        assert_eq!(apps[0].aliases, vec!["Old Shop".to_owned()]);
        assert!(matches!(
            PhoneLocator::new(fake()).locate().await,
            Location::Found { city, .. } if city == "Hangzhou"
        ));
        let events = PhoneAgenda::new(fake()).events(1, 2).await.unwrap();
        assert_eq!(events[0].title, "家长会");
        assert_eq!((events[0].start, events[0].end), (1, 2));
    }
}
