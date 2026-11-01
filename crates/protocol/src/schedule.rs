use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ScheduleRule {
    Once {
        #[ts(type = "number")]
        at: i64,
    },
    Daily {
        minute: u16,
    },
    Weekly {
        weekdays: Vec<u8>,
        minute: u16,
    },
    Monthly {
        days: Vec<u8>,
        minute: u16,
    },
    Every {
        minutes: u32,
        #[serde(default)]
        from: Option<u16>,
        #[serde(default)]
        to: Option<u16>,
    },
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ScheduleStop {
    #[default]
    Never,
    Until {
        date: String,
    },
    Count {
        runs: u32,
    },
    Condition {
        text: String,
    },
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ScheduleOutput {
    #[default]
    NewThread,
    SameThread,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ScheduleNotify {
    #[default]
    Done,
    Changed,
    Off,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ScheduleState {
    #[default]
    Draft,
    Active,
    Paused,
    Finished,
    Applied,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum RunMark {
    Scheduled,
    Catchup,
    Manual,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct ScheduleResult {
    #[ts(type = "number")]
    pub at: i64,
    #[ts(type = "number")]
    pub duration_ms: i64,
    pub ok: bool,
    pub status: String,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub id: String,
    pub title: String,
    pub task: String,
    pub rule: ScheduleRule,
    #[serde(default)]
    pub stop: ScheduleStop,
    #[serde(default)]
    pub output: ScheduleOutput,
    #[serde(default)]
    pub notify: ScheduleNotify,
    #[serde(default)]
    pub state: ScheduleState,
    pub origin_thread_id: String,
    #[serde(default)]
    pub thread_id: Option<String>,
    #[serde(default)]
    pub replaces: Option<String>,
    #[serde(default)]
    #[ts(type = "number | null")]
    pub next_at: Option<i64>,
    #[serde(default)]
    pub runs: u32,
    #[serde(default)]
    pub last: Option<ScheduleResult>,
    #[ts(type = "number")]
    pub created_at: i64,
}
