use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use xiaoban_agent::HttpConnector;
use xiaoban_hub::{
    DeepseekWeb, Hub, HubConfig, HubHandle, HubRuntime, MemorySecrets, NoApps, NoLocator,
    NoOperator, NoPresence, NoRouter, OpenMeteo, Prompts, SecretStore,
};
use xiaoban_i18n::Locale;
use xiaoban_protocol::ProviderId;

static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
static RUNNING: Mutex<Option<HubHandle>> = Mutex::new(None);

fn runtime() -> &'static tokio::runtime::Runtime {
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("tokio runtime")
    })
}

fn locale_of(tag: &str) -> Locale {
    if tag.to_ascii_lowercase().starts_with("zh") {
        Locale::ZhCn
    } else {
        Locale::En
    }
}

fn secrets_from(json: &str) -> Arc<MemorySecrets> {
    let secrets = Arc::new(MemorySecrets::default());
    let keys: HashMap<String, String> = serde_json::from_str(json).unwrap_or_default();
    for (provider, key) in keys {
        if let Some(provider) = ProviderId::parse(&provider) {
            let _ = secrets.save(provider, &key);
        }
    }
    secrets
}

pub fn start(data_dir: PathBuf, locale: &str, secrets_json: &str, name: &str) -> anyhow::Result<u16> {
    let mut running = RUNNING.lock().unwrap();
    if let Some(handle) = running.as_ref() {
        return Ok(handle.addr.port());
    }
    let locale = locale_of(locale);
    let runtime_config = HubRuntime {
        locale,
        prompts: Prompts::for_locale(locale),
        connector: Arc::new(HttpConnector),
        secrets: secrets_from(secrets_json),
        locator: Arc::new(NoLocator),
        presence: Arc::new(NoPresence),
        weather: Arc::new(OpenMeteo::for_locale(locale)),
        router: Arc::new(NoRouter),
        apps: Arc::new(NoApps),
        operator: Arc::new(NoOperator),
        web: Arc::new(DeepseekWeb::new()),
        fallback: None,
        auto_titles: true,
        auto_thinking: true,
    };
    let config = HubConfig {
        data_dir: Some(data_dir),
        bind: SocketAddr::from(([127, 0, 0, 1], 0)),
        name: name.to_owned(),
        advertise: false,
    };
    let handle = runtime().block_on(Hub::start(config, runtime_config))?;
    let port = handle.addr.port();
    *running = Some(handle);
    Ok(port)
}

pub fn stop() {
    let handle = RUNNING.lock().unwrap().take();
    if let Some(handle) = handle {
        runtime().block_on(handle.shutdown());
    }
}

#[cfg(target_os = "android")]
#[allow(unsafe_code)]
mod android {
    use jni::JNIEnv;
    use jni::objects::{JClass, JString};
    use jni::sys::jint;

    fn text(env: &mut JNIEnv<'_>, value: &JString<'_>) -> String {
        env.get_string(value).map(Into::into).unwrap_or_default()
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn Java_app_xiaoban_hub_XiaobanHubNative_start<'local>(
        mut env: JNIEnv<'local>,
        _class: JClass<'local>,
        data_dir: JString<'local>,
        locale: JString<'local>,
        secrets: JString<'local>,
        name: JString<'local>,
    ) -> jint {
        let data_dir = text(&mut env, &data_dir);
        let locale = text(&mut env, &locale);
        let secrets = text(&mut env, &secrets);
        let name = text(&mut env, &name);
        match super::start(data_dir.into(), &locale, &secrets, &name) {
            Ok(port) => jint::from(port),
            Err(error) => {
                tracing::error!(%error, "could not start the phone hub");
                -1
            }
        }
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn Java_app_xiaoban_hub_XiaobanHubNative_stop<'local>(
        _env: JNIEnv<'local>,
        _class: JClass<'local>,
    ) {
        super::stop();
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn starts_and_stops_a_local_hub() {
        let dir = std::env::temp_dir().join(format!("xiaoban-mobile-{}", std::process::id()));
        let port = super::start(dir.clone(), "zh-CN", r#"{"deepseek":"sk-test"}"#, "phone").unwrap();
        assert!(port > 0);
        assert_eq!(super::start(dir.clone(), "zh-CN", "{}", "phone").unwrap(), port);
        super::stop();
        let _ = std::fs::remove_dir_all(dir);
    }
}
