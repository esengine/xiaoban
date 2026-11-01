#[derive(Debug, Clone, Copy, Default)]
pub struct SystemPresence;

#[cfg(target_os = "macos")]
impl xiaoban_hub::Presence for SystemPresence {
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    fn idle_seconds(&self) -> Option<u64> {
        use objc2_core_graphics::{CGEventSource, CGEventSourceStateID, CGEventType};
        let seconds = CGEventSource::seconds_since_last_event_type(
            CGEventSourceStateID::CombinedSessionState,
            CGEventType(u32::MAX),
        );
        (seconds.is_finite() && seconds >= 0.0).then_some(seconds as u64)
    }
}

#[cfg(target_os = "windows")]
impl xiaoban_hub::Presence for SystemPresence {
    #[allow(unsafe_code)]
    fn idle_seconds(&self) -> Option<u64> {
        use windows_sys::Win32::System::SystemInformation::GetTickCount;
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
        let mut info = LASTINPUTINFO {
            cbSize: u32::try_from(size_of::<LASTINPUTINFO>()).ok()?,
            dwTime: 0,
        };
        if unsafe { GetLastInputInfo(&raw mut info) } == 0 {
            return None;
        }
        let now = unsafe { GetTickCount() };
        Some(u64::from(now.wrapping_sub(info.dwTime)) / 1000)
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
impl xiaoban_hub::Presence for SystemPresence {
    fn idle_seconds(&self) -> Option<u64> {
        None
    }
}
