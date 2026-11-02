use std::collections::BTreeMap;
use std::fmt::Debug;

use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{PageCheck, ProtocolError, Request, Response};
use xiaoban_store::now_ms;

use crate::state::SharedState;
use crate::tools::HubTools;

pub const CHECK_PAGE: &str = "check_page";
pub const PHONE_WIDTH: u32 = 390;
pub const DESK_WIDTH: u32 = 1280;
const KEY: &str = "page_checks";
const MAX_KEPT: usize = 200;
const MAX_HTML: usize = 400_000;
const SCRIPT: &str = include_str!("page_check.js");

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PageReport {
    pub errors: Vec<String>,
    pub clicked: Vec<String>,
    pub overflow: bool,
    pub title: Option<String>,
    pub text: String,
}

pub trait Pages: Debug + Send + Sync + 'static {
    fn check(&self, html: String, width: u32) -> BoxFuture<'static, Result<PageReport, String>>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct NoPages;

impl Pages for NoPages {
    fn check(&self, _html: String, _width: u32) -> BoxFuture<'static, Result<PageReport, String>> {
        Box::pin(async { Err("no browser is available here".to_owned()) })
    }
}

pub fn hash(code: &str) -> String {
    let mut value: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in code.trim().as_bytes() {
        value ^= u64::from(*byte);
        value = value.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{value:016x}")
}

pub fn inject(html: &str) -> String {
    let tag = format!("<script>{SCRIPT}</script>");
    let lower = html.to_ascii_lowercase();
    if let Some(start) = lower.find("<head")
        && let Some(end) = lower[start..].find('>')
    {
        let at = start + end + 1;
        return format!("{}{tag}{}", &html[..at], &html[at..]);
    }
    format!("{tag}{html}")
}

pub fn spec(l: &Localizer) -> ToolSpec {
    ToolSpec {
        name: CHECK_PAGE.to_owned(),
        description: l.text(keys::TOOL_CHECK_PAGE_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "html": { "type": "string", "description": l.text(keys::TOOL_CHECK_PAGE_HTML) },
            },
            "required": ["html"],
            "additionalProperties": false,
        }),
    }
}

async fn load(state: &SharedState) -> BTreeMap<String, PageCheck> {
    state
        .store
        .setting_owned(KEY.to_owned())
        .await
        .ok()
        .flatten()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

async fn record(state: &SharedState, check: PageCheck) {
    let mut checks = load(state).await;
    checks.insert(check.hash.clone(), check);
    while checks.len() > MAX_KEPT {
        let Some(oldest) = checks
            .iter()
            .min_by_key(|(_, check)| check.at)
            .map(|(hash, _)| hash.clone())
        else {
            break;
        };
        checks.remove(&oldest);
    }
    let _ = state
        .store
        .set_setting_owned(KEY.to_owned(), serde_json::to_string(&checks).unwrap_or_default())
        .await;
}

pub async fn handle(state: &SharedState, request: Request) -> Result<Response, ProtocolError> {
    match request {
        Request::PageCheck { hash } => Ok(Response::PageCheck {
            check: load(state).await.remove(&hash),
        }),
        _ => unreachable!("not a page request"),
    }
}

#[derive(Deserialize)]
struct Args {
    html: String,
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

pub fn summarize(reports: &[(u32, PageReport)]) -> (bool, Vec<String>, bool, u32) {
    let mut errors: Vec<String> = Vec::new();
    for (_, report) in reports {
        for error in &report.errors {
            if !errors.contains(error) {
                errors.push(error.clone());
            }
        }
    }
    let overflow = reports
        .iter()
        .any(|(width, report)| *width == PHONE_WIDTH && report.overflow);
    let clicked = reports
        .iter()
        .map(|(_, report)| u32::try_from(report.clicked.len()).unwrap_or(u32::MAX))
        .max()
        .unwrap_or(0);
    (errors.is_empty() && !overflow, errors, overflow, clicked)
}

impl HubTools<'_> {
    pub(crate) async fn check_page(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<Args>(arguments) else {
            return error("arguments must be {html}");
        };
        let html = args.html.trim().to_owned();
        if html.is_empty() {
            return error("html is empty");
        }
        if html.len() > MAX_HTML {
            return error("the page is too large to check");
        }
        let injected = inject(&html);
        let mut reports = Vec::new();
        for width in [PHONE_WIDTH, DESK_WIDTH] {
            match self.state.pages.check(injected.clone(), width).await {
                Ok(report) => reports.push((width, report)),
                Err(failure) => {
                    return json!({
                        "checked": false,
                        "reason": failure,
                        "hint": "the page could not be opened in a browser here; give it to the user as it is and say plainly that it was not checked",
                    })
                    .to_string();
                }
            }
        }
        let (ok, errors, overflow, clicked) = summarize(&reports);
        let check = PageCheck {
            hash: hash(&html),
            ok,
            at: now_ms(),
            errors: errors.clone(),
            overflow,
            widths: reports.iter().map(|(width, _)| *width).collect(),
            clicked,
        };
        record(self.state, check).await;
        let details: Vec<Value> = reports
            .iter()
            .map(|(width, report)| {
                json!({
                    "width": width,
                    "errors": report.errors,
                    "clicked": report.clicked,
                    "overflowsSideways": report.overflow,
                    "title": report.title,
                    "visibleText": report.text,
                })
            })
            .collect();
        json!({
            "checked": true,
            "ok": ok,
            "results": details,
            "hint": if ok {
                "the page passed; put exactly this same HTML in your reply"
            } else {
                "fix these problems and call check_page again with the fixed page (at most three tries in total); if it still fails, say plainly what is wrong"
            },
        })
        .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn injects_the_checker_into_the_head() {
        let page = inject("<!doctype html><html><head><title>x</title></head><body></body></html>");
        assert!(page.starts_with("<!doctype html><html><head><script>"));
        assert!(inject("<p>hi</p>").starts_with("<script>"));
    }

    #[test]
    fn hashes_ignore_surrounding_space() {
        assert_eq!(hash("  <p>a</p>\n"), hash("<p>a</p>"));
        assert_ne!(hash("<p>a</p>"), hash("<p>b</p>"));
        assert_eq!(hash(""), "cbf29ce484222325");
    }

    #[test]
    fn phone_overflow_and_errors_fail_the_check() {
        let clean = PageReport::default();
        let wide = PageReport { overflow: true, ..PageReport::default() };
        let broken = PageReport { errors: vec!["x is not defined".into()], ..PageReport::default() };
        assert!(summarize(&[(PHONE_WIDTH, clean.clone()), (DESK_WIDTH, wide.clone())]).0);
        assert!(!summarize(&[(PHONE_WIDTH, wide), (DESK_WIDTH, clean.clone())]).0);
        assert!(!summarize(&[(PHONE_WIDTH, clean), (DESK_WIDTH, broken)]).0);
    }
}
