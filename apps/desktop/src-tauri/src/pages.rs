use std::collections::HashMap;
use std::fmt;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use futures_util::future::BoxFuture;
use serde_json::json;
use tauri::http::{Request, Response, StatusCode, header};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;
use xiaoban_hub::PageReport;

const TIMEOUT: Duration = Duration::from_secs(25);
const PAGE_POLICY: &str = "default-src * data: blob: 'unsafe-inline' 'unsafe-eval'";

static PAGES: LazyLock<Mutex<HashMap<String, String>>> = LazyLock::new(Mutex::default);
static WAITING: LazyLock<Mutex<HashMap<String, oneshot::Sender<PageReport>>>> =
    LazyLock::new(Mutex::default);

pub struct DesktopPages {
    app: AppHandle,
}

impl fmt::Debug for DesktopPages {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("DesktopPages")
    }
}

pub fn system(app: AppHandle) -> std::sync::Arc<dyn xiaoban_hub::Pages> {
    std::sync::Arc::new(DesktopPages { app })
}

fn keep(html: String) -> String {
    let id = uuid::Uuid::now_v7().simple().to_string();
    PAGES.lock().unwrap().insert(id.clone(), html);
    id
}

impl xiaoban_hub::Pages for DesktopPages {
    fn check(&self, html: String, width: u32) -> BoxFuture<'static, Result<PageReport, String>> {
        let id = keep(html);
        let (sender, receiver) = oneshot::channel();
        WAITING.lock().unwrap().insert(id.clone(), sender);
        let sent = self
            .app
            .emit_to("main", "page-check", json!({ "id": id, "width": width }));
        Box::pin(async move {
            let outcome = if let Err(error) = sent {
                Err(error.to_string())
            } else {
                match tokio::time::timeout(TIMEOUT, receiver).await {
                    Ok(Ok(report)) => Ok(report),
                    Ok(Err(_)) => Err("the browser gave no answer".to_owned()),
                    Err(_) => Ok(PageReport {
                        errors: vec!["the page did not finish loading within 25 seconds".to_owned()],
                        ..PageReport::default()
                    }),
                }
            };
            WAITING.lock().unwrap().remove(&id);
            PAGES.lock().unwrap().remove(&id);
            outcome
        })
    }
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn page_check_done(id: String, report: PageReport) {
    if let Some(sender) = WAITING.lock().unwrap().remove(&id) {
        let _ = sender.send(report);
    }
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn page_keep(text: String) -> String {
    let mut pages = PAGES.lock().unwrap();
    if pages.len() > 50 {
        pages.clear();
    }
    drop(pages);
    keep(text)
}

pub fn protocol(request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let id = request.uri().path().trim_start_matches('/').to_owned();
    let page = PAGES.lock().unwrap().get(&id).cloned();
    let builder = Response::builder()
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .header("Content-Security-Policy", PAGE_POLICY);
    match page {
        Some(html) => builder.status(StatusCode::OK).body(html.into_bytes()),
        None => builder.status(StatusCode::NOT_FOUND).body(Vec::new()),
    }
    .unwrap_or_else(|_| Response::new(Vec::new()))
}
