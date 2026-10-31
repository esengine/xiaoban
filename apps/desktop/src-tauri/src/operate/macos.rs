use std::collections::HashMap;
use std::ptr::NonNull;
use std::sync::mpsc;
use std::time::{Duration, Instant};

use futures_util::future::BoxFuture;
use objc2_app_kit::NSRunningApplication;
use objc2_application_services::{AXError, AXIsProcessTrusted, AXUIElement};
use objc2_core_foundation::{CFArray, CFBoolean, CFRetained, CFString, CFType};
use objc2_core_graphics::{CGEvent, CGEventFlags, CGPreflightScreenCaptureAccess};
use objc2_foundation::NSString;
use tokio::sync::oneshot;
use xiaoban_hub::{MAX_ELEMENTS, Operator, Snapshot, UiAction, UiElement};
use xiaoban_protocol::OperatePermissions;

const MAX_DEPTH: usize = 40;
const MAX_TEXT: usize = 80;
const LAUNCH_WAIT: Duration = Duration::from_secs(8);
const KEY_GAP: Duration = Duration::from_millis(30);

type Job = Box<dyn FnOnce(&mut Worker) + Send>;

#[derive(Debug, Clone)]
pub struct MacOperator {
    jobs: mpsc::Sender<Job>,
}

#[derive(Default)]
struct Worker {
    elements: HashMap<String, Vec<CFRetained<AXUIElement>>>,
}

impl MacOperator {
    pub fn start() -> Self {
        let (jobs, inbox) = mpsc::channel::<Job>();
        std::thread::Builder::new()
            .name("operate".into())
            .spawn(move || {
                let mut worker = Worker::default();
                while let Ok(job) = inbox.recv() {
                    job(&mut worker);
                }
            })
            .expect("could not start the operate thread");
        Self { jobs }
    }

    fn run<T: Send + 'static>(
        &self,
        job: impl FnOnce(&mut Worker) -> Result<T, String> + Send + 'static,
    ) -> BoxFuture<'static, Result<T, String>> {
        let (reply, answer) = oneshot::channel();
        let sent = self.jobs.send(Box::new(move |worker| {
            let _ = reply.send(job(worker));
        }));
        Box::pin(async move {
            sent.map_err(|_| "the operate thread stopped".to_owned())?;
            answer
                .await
                .unwrap_or_else(|_| Err("the operate thread stopped".to_owned()))
        })
    }
}

fn attribute(element: &AXUIElement, name: &str) -> Option<CFRetained<CFType>> {
    let mut value: *const CFType = std::ptr::null();
    let error = unsafe {
        element.copy_attribute_value(&CFString::from_str(name), NonNull::from(&mut value))
    };
    if error != AXError::Success {
        return None;
    }
    NonNull::new(value.cast_mut()).map(|value| unsafe { CFRetained::from_raw(value) })
}

fn text(element: &AXUIElement, name: &str) -> Option<String> {
    let value = attribute(element, name)?.downcast::<CFString>().ok()?;
    let value = value.to_string();
    let value = value.trim();
    (!value.is_empty()).then(|| value.chars().take(MAX_TEXT).collect())
}

fn flag(element: &AXUIElement, name: &str) -> Option<bool> {
    attribute(element, name)?
        .downcast::<CFBoolean>()
        .ok()
        .map(|value| value.value())
}

fn element_attribute(element: &AXUIElement, name: &str) -> Option<CFRetained<AXUIElement>> {
    attribute(element, name)?.downcast::<AXUIElement>().ok()
}

fn children(element: &AXUIElement) -> Vec<CFRetained<AXUIElement>> {
    let Some(array) =
        attribute(element, "AXChildren").and_then(|value| value.downcast::<CFArray>().ok())
    else {
        return Vec::new();
    };
    let array: CFRetained<CFArray<CFType>> = unsafe { CFRetained::cast_unchecked(array) };
    array
        .into_iter()
        .filter_map(|child| child.downcast::<AXUIElement>().ok())
        .collect()
}

fn kind(role: &str) -> Option<&'static str> {
    Some(match role {
        "AXButton" | "AXDisclosureTriangle" | "AXIncrementor" => "button",
        "AXMenuButton" | "AXPopUpButton" => "popup",
        "AXCheckBox" => "checkbox",
        "AXRadioButton" => "option",
        "AXLink" => "link",
        "AXMenuItem" => "menuitem",
        "AXMenuBarItem" => "menu",
        "AXTextField" | "AXTextArea" | "AXComboBox" | "AXSearchField" => "field",
        "AXStaticText" => "text",
        "AXSlider" => "slider",
        _ => return None,
    })
}

struct Walk {
    found: Vec<(UiElement, CFRetained<AXUIElement>)>,
    truncated: bool,
}

impl Walk {
    fn push(&mut self, element: CFRetained<AXUIElement>, role: &str, kind: &'static str) {
        if self.found.len() >= MAX_ELEMENTS {
            self.truncated = true;
            return;
        }
        let label = ["AXTitle", "AXDescription", "AXPlaceholderValue", "AXHelp"]
            .iter()
            .find_map(|name| text(&element, name));
        let value = match kind {
            "field" | "text" => text(&element, "AXValue"),
            "checkbox" | "option" => attribute(&element, "AXValue")
                .and_then(|value| value.downcast::<objc2_core_foundation::CFNumber>().ok())
                .and_then(|value| value.as_i64())
                .map(|value| if value == 0 { "off" } else { "on" }.to_owned()),
            _ => None,
        };
        let (label, value) = match (kind, label, value) {
            ("text", None, Some(value)) => (value, None),
            (_, Some(label), value) => (label, value),
            (_, None, value) => (String::new(), value),
        };
        if label.is_empty() && value.is_none() && role != "AXTextField" && role != "AXTextArea" {
            return;
        }
        let index = u32::try_from(self.found.len()).unwrap_or(u32::MAX);
        let disabled = flag(&element, "AXEnabled") == Some(false);
        self.found.push((
            UiElement {
                index,
                role: kind.to_owned(),
                label,
                value,
                disabled,
            },
            element,
        ));
    }

    fn visit(&mut self, element: &AXUIElement, depth: usize) {
        if depth > MAX_DEPTH || self.found.len() >= MAX_ELEMENTS {
            self.truncated |= self.found.len() >= MAX_ELEMENTS;
            return;
        }
        for child in children(element) {
            let role = text(&child, "AXRole").unwrap_or_default();
            if role == "AXSecureTextField" || flag(&child, "AXHidden") == Some(true) {
                continue;
            }
            let descend = role != "AXMenuBarItem" || flag(&child, "AXSelected") == Some(true);
            if let Some(kind) = kind(&role) {
                self.push(child.clone(), &role, kind);
            }
            if descend {
                self.visit(&child, depth + 1);
            }
        }
    }
}

fn running(bundle: &str) -> Option<objc2::rc::Retained<NSRunningApplication>> {
    NSRunningApplication::runningApplicationsWithBundleIdentifier(&NSString::from_str(bundle))
        .iter()
        .find(|app| app.isFinishedLaunching())
}

fn launch(bundle: &str) -> Result<objc2::rc::Retained<NSRunningApplication>, String> {
    if let Some(app) = running(bundle) {
        return Ok(app);
    }
    std::process::Command::new("/usr/bin/open")
        .arg("-b")
        .arg(bundle)
        .status()
        .map_err(|error| error.to_string())?;
    let started = Instant::now();
    while started.elapsed() < LAUNCH_WAIT {
        if let Some(app) = running(bundle) {
            std::thread::sleep(Duration::from_millis(400));
            return Ok(app);
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    Err("the app did not start in time".to_owned())
}

fn snapshot(worker: &mut Worker, bundle: &str) -> Result<Snapshot, String> {
    let app = launch(bundle)?;
    let root = unsafe { AXUIElement::new_application(app.processIdentifier()) };
    let mut walk = Walk {
        found: Vec::new(),
        truncated: false,
    };
    if let Some(bar) = element_attribute(&root, "AXMenuBar") {
        walk.visit(&bar, 0);
    }
    let window = element_attribute(&root, "AXFocusedWindow")
        .or_else(|| element_attribute(&root, "AXMainWindow"));
    if let Some(window) = &window {
        walk.visit(window, 0);
    }
    let elements = walk
        .found
        .iter()
        .map(|(element, _)| element.clone())
        .collect();
    worker.elements.insert(
        bundle.to_owned(),
        walk.found.into_iter().map(|(_, handle)| handle).collect(),
    );
    Ok(Snapshot {
        app: app
            .localizedName()
            .map_or_else(|| bundle.to_owned(), |name| name.to_string()),
        window: window.and_then(|window| text(&window, "AXTitle")),
        elements,
        truncated: walk.truncated,
    })
}

fn act(worker: &Worker, bundle: &str, index: u32, action: &UiAction) -> Result<(), String> {
    let element = worker
        .elements
        .get(bundle)
        .and_then(|elements| elements.get(index as usize))
        .ok_or("no element with that number; call look_at_app again")?;
    let error = match action {
        UiAction::Press => unsafe { element.perform_action(&CFString::from_static_str("AXPress")) },
        UiAction::SetText(value) => unsafe {
            let _ = element.set_attribute_value(
                &CFString::from_static_str("AXFocused"),
                CFBoolean::new(true),
            );
            element.set_attribute_value(
                &CFString::from_static_str("AXValue"),
                &CFString::from_str(value),
            )
        },
    };
    if error == AXError::Success {
        Ok(())
    } else {
        Err(format!(
            "the app refused the action (accessibility error {})",
            error.0
        ))
    }
}

fn key_code(name: &str) -> Option<u16> {
    const LETTERS: &str = "asdfhgzxcv_bqweryt123465=97-80]ou[ip_lj'k;\\,/nm.";
    let name = name.to_lowercase();
    Some(match name.as_str() {
        "return" | "enter" => 36,
        "tab" => 48,
        "space" => 49,
        "delete" | "backspace" => 51,
        "esc" | "escape" => 53,
        "left" => 123,
        "right" => 124,
        "down" => 125,
        "up" => 126,
        "home" => 115,
        "end" => 119,
        "pageup" => 116,
        "pagedown" => 121,
        single if single.chars().count() == 1 => {
            let position = LETTERS.find(single)?;
            u16::try_from(position).ok()?
        }
        _ => return None,
    })
}

fn press(bundle: &str, combo: &str) -> Result<(), String> {
    let mut flags = CGEventFlags::empty();
    let mut key = None;
    for part in combo
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty())
    {
        match part.to_lowercase().as_str() {
            "cmd" | "command" => flags |= CGEventFlags::MaskCommand,
            "shift" => flags |= CGEventFlags::MaskShift,
            "alt" | "option" | "opt" => flags |= CGEventFlags::MaskAlternate,
            "ctrl" | "control" => flags |= CGEventFlags::MaskControl,
            other => key = Some(key_code(other).ok_or_else(|| format!("unknown key {other}"))?),
        }
    }
    let key = key.ok_or("no key in the combination")?;
    let pid = launch(bundle)?.processIdentifier();
    for down in [true, false] {
        let event =
            CGEvent::new_keyboard_event(None, key, down).ok_or("could not create a key event")?;
        CGEvent::set_flags(Some(&event), flags);
        CGEvent::post_to_pid(pid, Some(&event));
        std::thread::sleep(KEY_GAP);
    }
    Ok(())
}

impl Operator for MacOperator {
    fn permissions(&self) -> OperatePermissions {
        OperatePermissions {
            control: unsafe { AXIsProcessTrusted() },
            capture: CGPreflightScreenCaptureAccess(),
        }
    }

    fn snapshot(&self, app_id: String) -> BoxFuture<'static, Result<Snapshot, String>> {
        self.run(move |worker| snapshot(worker, &app_id))
    }

    fn act(
        &self,
        app_id: String,
        index: u32,
        action: UiAction,
    ) -> BoxFuture<'static, Result<(), String>> {
        self.run(move |worker| act(worker, &app_id, index, &action))
    }

    fn keys(&self, app_id: String, combo: String) -> BoxFuture<'static, Result<(), String>> {
        self.run(move |_| press(&app_id, &combo))
    }
}

#[cfg(test)]
mod tests {
    use super::key_code;

    #[test]
    fn letters_map_to_mac_key_codes() {
        assert_eq!(key_code("a"), Some(0));
        assert_eq!(key_code("s"), Some(1));
        assert_eq!(key_code("e"), Some(14));
        assert_eq!(key_code("p"), Some(35));
        assert_eq!(key_code("Return"), Some(36));
        assert_eq!(key_code("nope"), None);
    }
}
