use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ConfirmChoice;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum NotifyCategory {
    Confirm,
    Remind,
    Error,
    Morning,
    Done,
    Idea,
    Report,
    Family,
}

impl NotifyCategory {
    pub const ALL: [Self; 8] = [
        Self::Confirm,
        Self::Remind,
        Self::Error,
        Self::Morning,
        Self::Done,
        Self::Idea,
        Self::Report,
        Self::Family,
    ];
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum NotifyLevel {
    #[default]
    Now,
    Daily,
    Mute,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum NotifyScene {
    #[default]
    Normal,
    Kid,
    Work,
    Trip,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum NotifyRing {
    #[default]
    Everywhere,
    Computer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct NotifyLevels {
    pub remind: NotifyLevel,
    pub error: NotifyLevel,
    pub morning: NotifyLevel,
    pub done: NotifyLevel,
    pub idea: NotifyLevel,
    pub report: NotifyLevel,
    pub family: NotifyLevel,
}

impl Default for NotifyLevels {
    fn default() -> Self {
        Self {
            remind: NotifyLevel::Now,
            error: NotifyLevel::Now,
            morning: NotifyLevel::Daily,
            done: NotifyLevel::Daily,
            idea: NotifyLevel::Daily,
            report: NotifyLevel::Daily,
            family: NotifyLevel::Mute,
        }
    }
}

impl NotifyLevels {
    pub fn of(&self, category: NotifyCategory) -> NotifyLevel {
        match category {
            NotifyCategory::Confirm => NotifyLevel::Now,
            NotifyCategory::Remind => self.remind,
            NotifyCategory::Error => self.error,
            NotifyCategory::Morning => self.morning,
            NotifyCategory::Done => self.done,
            NotifyCategory::Idea => self.idea,
            NotifyCategory::Report => self.report,
            NotifyCategory::Family => self.family,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct NotifySettings {
    pub levels: NotifyLevels,
    pub scene: NotifyScene,
    #[ts(type = "number | null")]
    pub scene_until: Option<i64>,
    pub quiet: bool,
    pub quiet_start: u16,
    pub quiet_end: u16,
    pub one_device: bool,
}

impl Default for NotifySettings {
    fn default() -> Self {
        Self {
            levels: NotifyLevels::default(),
            scene: NotifyScene::Normal,
            scene_until: None,
            quiet: true,
            quiet_start: 22 * 60 + 30,
            quiet_end: 7 * 60 + 30,
            one_device: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct NoticeChoice {
    pub choice: ConfirmChoice,
    pub label: String,
    pub primary: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub id: String,
    pub title: String,
    pub body: String,
    pub category: NotifyCategory,
    pub level: NotifyLevel,
    pub ring: NotifyRing,
    pub thread_id: Option<String>,
    pub confirm_id: Option<String>,
    pub choices: Vec<NoticeChoice>,
    pub reply: bool,
}
