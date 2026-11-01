use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum PriceSource {
    Web { url: String, site: String },
    App { app: String },
    Estimate { basis: String },
    User,
    None { reason: Option<String>, voided: bool },
}

impl PriceSource {
    pub const fn counts(&self) -> bool {
        !matches!(self, Self::None { .. })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Price {
    pub label: String,
    #[ts(type = "number | null")]
    pub cents: Option<i64>,
    #[ts(type = "number | null")]
    pub unit_cents: Option<i64>,
    pub quantity: Option<u32>,
    pub per: Option<String>,
    pub source: PriceSource,
    #[ts(type = "number | null")]
    pub checked_at: Option<i64>,
    pub applies_to: Option<String>,
}

impl Price {
    pub fn missing(label: String, reason: Option<String>) -> Self {
        Self {
            label,
            cents: None,
            unit_cents: None,
            quantity: None,
            per: None,
            source: PriceSource::None {
                reason,
                voided: false,
            },
            checked_at: None,
            applies_to: None,
        }
    }

    pub fn known(&self) -> Option<i64> {
        self.cents.filter(|_| self.source.counts())
    }
}
