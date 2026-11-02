use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum MailProvider {
    #[default]
    Qq,
    Netease,
    Gmail,
    Outlook,
    Other,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum MailFailure {
    BadPassword,
    Refused,
    Unreachable,
    BadAddress,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum MailCategory {
    Bill,
    Trip,
    Parcel,
    Reply,
    Promo,
    #[default]
    Other,
}

impl MailCategory {
    pub const ALL: [Self; 6] = [
        Self::Bill,
        Self::Trip,
        Self::Parcel,
        Self::Reply,
        Self::Promo,
        Self::Other,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Bill => "bill",
            Self::Trip => "trip",
            Self::Parcel => "parcel",
            Self::Reply => "reply",
            Self::Promo => "promo",
            Self::Other => "other",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|category| category.as_str() == raw.trim())
    }

    pub const fn worth(self) -> bool {
        matches!(self, Self::Bill | Self::Trip | Self::Parcel | Self::Reply)
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct MailBill {
    #[ts(type = "number | null")]
    pub cents: Option<i64>,
    #[ts(type = "number | null")]
    pub minimum_cents: Option<i64>,
    pub due: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct MailTrip {
    pub number: Option<String>,
    pub date: Option<String>,
    pub time: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub station: Option<String>,
    pub tickets: Option<u32>,
    #[ts(type = "number | null")]
    pub start: Option<i64>,
    pub trip_thread_id: Option<String>,
    pub trip_city: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct MailParcel {
    pub merchant: Option<String>,
    pub item: Option<String>,
    pub status: Option<String>,
    pub eta: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct MailItem {
    pub id: String,
    pub from_name: String,
    pub from_address: String,
    pub subject: String,
    pub title: String,
    pub summary: String,
    #[ts(type = "number")]
    pub at: i64,
    pub category: MailCategory,
    pub bill: Option<MailBill>,
    pub trip: Option<MailTrip>,
    pub parcel: Option<MailParcel>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct MailToday {
    pub total: u32,
    pub items: Vec<MailItem>,
    pub folded: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct MailStatus {
    pub connected: bool,
    pub provider: Option<MailProvider>,
    pub address: Option<String>,
    pub total: u32,
    #[ts(type = "number | null")]
    pub checked_at: Option<i64>,
    pub syncing: bool,
    pub failure: Option<MailFailure>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct MailDraft {
    pub mail_id: String,
    pub to: String,
    pub to_name: String,
    pub subject: String,
    pub text: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct MailOriginal {
    pub item: MailItem,
    pub text: String,
    pub truncated: bool,
}
