use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use xiaoban_agent::HttpConnector;
use xiaoban_hub::{
    Agenda, Apps, DeepseekWeb, Hub, HubConfig, HubHandle, HubRuntime, Locator, MemorySecrets, NoApps, NoLocator,
    NoAgenda, NoOperator, NoPresence, NoRouter, OpenMeteo, Operator, Prompts, SecretStore,
};
use xiaoban_i18n::{Locale, Localizer};
use xiaoban_protocol::ProviderId;

static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
static RUNNING: Mutex<Option<HubHandle>> = Mutex::new(None);
static BRIDGE: OnceLock<operator::Bridge> = OnceLock::new();

mod keeper;
mod notices;
mod operator;

struct Hands {
    operator: Arc<dyn Operator>,
    apps: Arc<dyn Apps>,
    locator: Arc<dyn Locator>,
    agenda: Arc<dyn Agenda>,
}

fn hands() -> Hands {
    match BRIDGE.get() {
        Some(bridge) => Hands {
            operator: Arc::new(operator::PhoneOperator::new(bridge.clone())),
            apps: Arc::new(operator::PhoneApps::new(bridge.clone())),
            locator: Arc::new(operator::PhoneLocator::new(bridge.clone())),
            agenda: Arc::new(operator::PhoneAgenda::new(bridge.clone())),
        },
        None => Hands {
            operator: Arc::new(NoOperator),
            apps: Arc::new(NoApps),
            locator: Arc::new(NoLocator),
            agenda: Arc::new(NoAgenda),
        },
    }
}

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

fn runtime_config(locale: Locale, secrets_json: &str) -> HubRuntime {
    let Hands { operator, apps, locator, agenda } = hands();
    HubRuntime {
        locale,
        prompts: Prompts::for_phone(locale),
        connector: Arc::new(HttpConnector),
        secrets: secrets_from(secrets_json),
        locator,
        agenda,
        presence: Arc::new(NoPresence),
        weather: Arc::new(OpenMeteo::for_locale(locale)),
        router: Arc::new(NoRouter),
        apps,
        operator,
        web: Arc::new(DeepseekWeb::new()),
        fallback: None,
        auto_titles: true,
        auto_thinking: true,
    }
}

pub fn start(data_dir: PathBuf, locale: &str, secrets_json: &str, name: &str) -> anyhow::Result<u16> {
    let mut running = RUNNING.lock().unwrap();
    if let Some(handle) = running.as_ref() {
        return Ok(handle.addr.port());
    }
    let locale = locale_of(locale);
    let config = HubConfig {
        data_dir: Some(data_dir),
        bind: SocketAddr::from(([127, 0, 0, 1], 0)),
        name: name.to_owned(),
        advertise: false,
    };
    let handle = runtime().block_on(Hub::start(config, runtime_config(locale, secrets_json)))?;
    if let Some(bridge) = BRIDGE.get() {
        runtime().spawn(notices::forward(handle.link(), bridge.clone(), Localizer::new(locale)));
        runtime().spawn(keeper::watch(handle.link(), bridge.clone(), Localizer::new(locale)));
    }
    let port = handle.addr.port();
    *running = Some(handle);
    Ok(port)
}

pub fn deliver(answer: &str) -> String {
    let link = RUNNING.lock().unwrap().as_ref().map(HubHandle::link);
    let Some(link) = link else {
        return serde_json::json!({ "error": "the phone hub is not running" }).to_string();
    };
    runtime().block_on(notices::deliver(&link, answer)).to_string()
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
    use std::sync::Arc;

    use jni::JNIEnv;
    use jni::objects::{JClass, JObject, JString, JValue};
    use jni::sys::{jint, jstring};

    use crate::operator::Bridge;

    #[link(name = "log")]
    unsafe extern "C" {
        fn __android_log_write(
            priority: std::ffi::c_int,
            tag: *const std::ffi::c_char,
            text: *const std::ffi::c_char,
        ) -> std::ffi::c_int;
    }

    const WARN: std::ffi::c_int = 5;

    pub fn log(text: &str) {
        let Ok(text) = std::ffi::CString::new(text.replace('\0', " ")) else {
            return;
        };
        unsafe {
            __android_log_write(WARN, c"XiaobanHub".as_ptr(), text.as_ptr());
        }
    }

    fn bridge(env: &JNIEnv<'_>, class: &JClass<'_>) -> Option<Bridge> {
        let vm = env.get_java_vm().ok()?;
        let class = env.new_global_ref(class).ok()?;
        Some(Arc::new(move |request: String| {
            let mut env = vm.attach_current_thread().map_err(|error| error.to_string())?;
            let input = env.new_string(request).map_err(|error| error.to_string())?;
            let target: &JClass<'_> = class.as_obj().into();
            let reply = env
                .call_static_method(
                    target,
                    "call",
                    "(Ljava/lang/String;)Ljava/lang/String;",
                    &[JValue::Object(&input)],
                )
                .and_then(|value| value.l());
            let reply = match reply {
                Ok(reply) => JString::from(reply),
                Err(error) => {
                    let _ = env.exception_describe();
                    let _ = env.exception_clear();
                    log(&format!("bridge call failed: {error}"));
                    return Err(error.to_string());
                }
            };
            env.get_string(&reply)
                .map(Into::into)
                .map_err(|error| error.to_string())
        }))
    }

    fn text(env: &mut JNIEnv<'_>, value: &JString<'_>) -> String {
        env.get_string(value).map(Into::into).unwrap_or_default()
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn Java_app_xiaoban_hub_XiaobanHubNative_start<'local>(
        mut env: JNIEnv<'local>,
        class: JClass<'local>,
        data_dir: JString<'local>,
        locale: JString<'local>,
        secrets: JString<'local>,
        name: JString<'local>,
    ) -> jint {
        let data_dir = text(&mut env, &data_dir);
        let locale = text(&mut env, &locale);
        let secrets = text(&mut env, &secrets);
        let name = text(&mut env, &name);
        if super::BRIDGE.get().is_none() {
            match bridge(&env, &class) {
                Some(bridge) => {
                    let _ = super::BRIDGE.set(bridge);
                }
                None => log("could not set up the bridge to the operator"),
            }
        }
        match super::start(data_dir.into(), &locale, &secrets, &name) {
            Ok(port) => jint::from(port),
            Err(error) => {
                log(&format!("could not start the phone hub: {error}"));
                -1
            }
        }
    }

    #[unsafe(no_mangle)]
    pub extern "system" fn Java_app_xiaoban_hub_XiaobanHubNative_deliver<'local>(
        mut env: JNIEnv<'local>,
        _class: JClass<'local>,
        answer: JString<'local>,
    ) -> jstring {
        let answer = text(&mut env, &answer);
        let reply = super::deliver(&answer);
        match env.new_string(reply) {
            Ok(value) => JObject::from(value).into_raw(),
            Err(error) => {
                log(&format!("could not hand back the answer: {error}"));
                std::ptr::null_mut()
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
    use std::net::SocketAddr;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use serde_json::Value;
    use xiaoban_hub::{Hub, HubConfig};
    use xiaoban_i18n::{Locale, Localizer};
    use xiaoban_protocol::{NotifySettings, Request};

    use crate::notices;
    use crate::operator::Bridge;

    #[tokio::test(flavor = "multi_thread")]
    async fn posts_reminders_and_hands_answers_to_the_hub() {
        let config = HubConfig {
            data_dir: None,
            bind: SocketAddr::from(([127, 0, 0, 1], 0)),
            name: "phone".to_owned(),
            advertise: false,
        };
        let handle = Hub::start(config, super::runtime_config(Locale::ZhCn, "{}"))
            .await
            .unwrap();
        let link = handle.link();
        link.request(Request::SetNotifySettings {
            settings: NotifySettings { quiet: false, ..NotifySettings::default() },
        })
        .await
        .unwrap();
        let seen: Arc<Mutex<Vec<Value>>> = Arc::default();
        let sink = Arc::clone(&seen);
        let bridge: Bridge = Arc::new(move |request: String| {
            sink.lock().unwrap().push(serde_json::from_str(&request).unwrap());
            Ok("{}".to_owned())
        });
        tokio::spawn(notices::forward(link.clone(), bridge, Localizer::new(Locale::ZhCn)));
        link.request(Request::StartTimer {
            step: None,
            label: "Rice".to_owned(),
            after: String::new(),
            seconds: 1,
        })
        .await
        .unwrap();
        let mut posted = None;
        for _ in 0..60 {
            tokio::time::sleep(Duration::from_millis(100)).await;
            posted = seen.lock().unwrap().iter().find(|op| op["op"] == "notify").cloned();
            if posted.is_some() {
                break;
            }
        }
        let posted = posted.expect("the timer should post a notification");
        assert_eq!(posted["notice"]["category"], "remind");
        assert_eq!(posted["route"], "local");
        assert!(posted["notice"]["title"].as_str().unwrap().contains("Rice"));
        assert_ne!(posted["texts"]["channelUrgent"].as_str().unwrap(), "");
        let reply = notices::deliver(&link, r#"{"kind":"confirm","confirmId":"gone","choice":"yes"}"#).await;
        assert!(reply.get("error").is_some());
        let reply = notices::deliver(&link, "nonsense").await;
        assert!(reply.get("error").is_some());
        let added = link
            .request(Request::AddTodo {
                draft: xiaoban_protocol::TodoDraft {
                    title: "Pay rent".to_owned(),
                    ..Default::default()
                },
                propose: false,
            })
            .await
            .unwrap();
        let xiaoban_protocol::Response::Todo { todo } = added else {
            panic!("expected a to-do");
        };
        let answer = serde_json::json!({ "kind": "todo", "todoId": todo.id, "action": "done" });
        let reply = notices::deliver(&link, &answer.to_string()).await;
        assert!(reply.get("ok").is_some());
        let xiaoban_protocol::Response::Todos { todos } = link.request(Request::ListTodos).await.unwrap() else {
            panic!("expected to-dos");
        };
        assert_eq!(todos[0].state, xiaoban_protocol::TodoState::Done);
        handle.shutdown().await;
    }

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
