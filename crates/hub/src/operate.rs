use std::fmt::Debug;

use futures_util::future::BoxFuture;
use serde::Serialize;
use xiaoban_protocol::OperatePermissions;

pub const MAX_ELEMENTS: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct UiElement {
    pub index: u32,
    pub role: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    pub disabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Snapshot {
    pub app: String,
    pub window: Option<String>,
    pub elements: Vec<UiElement>,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UiAction {
    Press,
    /// Pressing a send or pay button the user has just approved.
    PressConfirmed,
    SetText(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActFailure {
    NeedsMouse,
    Failed(String),
}

impl From<String> for ActFailure {
    fn from(message: String) -> Self {
        Self::Failed(message)
    }
}

impl From<&str> for ActFailure {
    fn from(message: &str) -> Self {
        Self::Failed(message.to_owned())
    }
}

pub trait Operator: Debug + Send + Sync + 'static {
    fn permissions(&self) -> OperatePermissions;
    fn snapshot(&self, app_id: String) -> BoxFuture<'static, Result<Snapshot, String>>;
    fn act(
        &self,
        app_id: String,
        index: u32,
        action: UiAction,
        allow_mouse: bool,
    ) -> BoxFuture<'static, Result<(), ActFailure>>;
    fn keys(&self, app_id: String, combo: String) -> BoxFuture<'static, Result<(), String>>;
    fn type_into(&self, app_id: String, text: String) -> BoxFuture<'static, Result<(), String>>;
    fn is_phone(&self) -> bool {
        false
    }
    /// Lets the device's own guard operate a chat or payment app it would otherwise refuse; only
    /// the hub, after the user said yes, ever calls this.
    fn grant(&self, _app_id: &str, _on: bool) {}
    /// Whether this device can look at and drive other apps at all. Opening them is separate.
    fn can_operate(&self) -> bool {
        true
    }
    fn status(&self, _title: Option<String>) {}
}

#[derive(Debug, Clone, Copy, Default)]
pub struct NoOperator;

impl Operator for NoOperator {
    fn permissions(&self) -> OperatePermissions {
        OperatePermissions { control: false }
    }

    fn can_operate(&self) -> bool {
        false
    }

    fn snapshot(&self, _: String) -> BoxFuture<'static, Result<Snapshot, String>> {
        Box::pin(async { Err("this hub cannot operate apps".to_owned()) })
    }

    fn act(
        &self,
        _: String,
        _: u32,
        _: UiAction,
        _: bool,
    ) -> BoxFuture<'static, Result<(), ActFailure>> {
        Box::pin(async { Err("this hub cannot operate apps".into()) })
    }

    fn keys(&self, _: String, _: String) -> BoxFuture<'static, Result<(), String>> {
        Box::pin(async { Err("this hub cannot operate apps".to_owned()) })
    }

    fn type_into(&self, _: String, _: String) -> BoxFuture<'static, Result<(), String>> {
        Box::pin(async { Err("this hub cannot operate apps".to_owned()) })
    }
}
