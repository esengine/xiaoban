use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{Event, HubInfo, Platform, Request, Response};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Credential {
    Local,
    Paired { token: String },
    PairingCode { code: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DeviceHello {
    pub device_id: String,
    pub name: String,
    pub platform: Platform,
    pub credential: Credential,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ClientFrame {
    Hello {
        protocol: u32,
        device: DeviceHello,
    },
    Request {
        #[ts(type = "number")]
        id: u64,
        body: Request,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    UnsupportedProtocol,
    Unauthorized,
    BadRequest,
    NotFound,
    Busy,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProtocolError {
    pub code: ErrorCode,
    pub detail: String,
}

impl ProtocolError {
    pub fn new(code: ErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ServerFrame {
    Welcome {
        protocol: u32,
        hub: HubInfo,
        device_token: Option<String>,
    },
    Response {
        #[ts(type = "number")]
        id: u64,
        body: Response,
    },
    Error {
        #[ts(type = "number | null")]
        id: Option<u64>,
        error: ProtocolError,
    },
    Event {
        event: Event,
    },
}
