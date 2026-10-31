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
    SetText(String),
}

pub trait Operator: Debug + Send + Sync + 'static {
    fn permissions(&self) -> OperatePermissions;
    fn snapshot(&self, app_id: String) -> BoxFuture<'static, Result<Snapshot, String>>;
    fn act(
        &self,
        app_id: String,
        index: u32,
        action: UiAction,
    ) -> BoxFuture<'static, Result<(), String>>;
    fn keys(&self, app_id: String, combo: String) -> BoxFuture<'static, Result<(), String>>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct NoOperator;

impl Operator for NoOperator {
    fn permissions(&self) -> OperatePermissions {
        OperatePermissions {
            control: false,
            capture: false,
        }
    }

    fn snapshot(&self, _: String) -> BoxFuture<'static, Result<Snapshot, String>> {
        Box::pin(async { Err("this hub cannot operate apps".to_owned()) })
    }

    fn act(&self, _: String, _: u32, _: UiAction) -> BoxFuture<'static, Result<(), String>> {
        Box::pin(async { Err("this hub cannot operate apps".to_owned()) })
    }

    fn keys(&self, _: String, _: String) -> BoxFuture<'static, Result<(), String>> {
        Box::pin(async { Err("this hub cannot operate apps".to_owned()) })
    }
}
