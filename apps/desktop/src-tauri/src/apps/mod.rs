use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use futures_util::future::BoxFuture;
use xiaoban_hub::{AppEntry, Apps};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

const FRESH_FOR: Duration = Duration::from_secs(60);

type Cache = Option<(Instant, Arc<[AppEntry]>)>;

#[derive(Debug, Clone, Default)]
pub struct SystemApps {
    cache: Arc<Mutex<Cache>>,
}

fn scan() -> Vec<AppEntry> {
    #[cfg(target_os = "macos")]
    {
        macos::scan()
    }
    #[cfg(windows)]
    {
        windows::scan()
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        Vec::new()
    }
}

fn launch(id: &str) -> std::io::Result<()> {
    #[cfg(target_os = "macos")]
    {
        macos::open(id)
    }
    #[cfg(windows)]
    {
        windows::open(id)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = id;
        Err(std::io::Error::other("opening apps is not supported here"))
    }
}

impl SystemApps {
    fn cached(&self) -> Option<Arc<[AppEntry]>> {
        let cache = self.cache.lock().unwrap();
        cache
            .as_ref()
            .filter(|(at, _)| at.elapsed() < FRESH_FOR)
            .map(|(_, apps)| Arc::clone(apps))
    }
}

pub fn system() -> SystemApps {
    SystemApps::default()
}

pub fn home() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)
}

impl Apps for SystemApps {
    fn list(&self) -> BoxFuture<'static, Vec<AppEntry>> {
        let this = self.clone();
        Box::pin(async move {
            if let Some(apps) = this.cached() {
                return apps.to_vec();
            }
            let apps: Arc<[AppEntry]> = tauri::async_runtime::spawn_blocking(scan)
                .await
                .unwrap_or_default()
                .into();
            *this.cache.lock().unwrap() = Some((Instant::now(), Arc::clone(&apps)));
            apps.to_vec()
        })
    }

    fn open(&self, id: String) -> BoxFuture<'static, Result<(), String>> {
        Box::pin(async move {
            tauri::async_runtime::spawn_blocking(move || launch(&id))
                .await
                .map_err(|error| error.to_string())?
                .map_err(|error| error.to_string())
        })
    }
}
