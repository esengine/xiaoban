use std::cell::RefCell;
use std::ptr::NonNull;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::Bool;
use objc2::{AllocAnyThread, MainThreadMarker};
use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
use objc2_avf_audio::{AVAudioEngine, AVAudioPCMBuffer, AVAudioTime};
use objc2_foundation::{NSError, NSLocale, NSString};
use objc2_speech::{
    SFSpeechAudioBufferRecognitionRequest, SFSpeechRecognitionResult, SFSpeechRecognitionTask,
    SFSpeechRecognizer, SFSpeechRecognizerAuthorizationStatus,
};
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;

use super::{ENDED_EVENT, EndReason, LEVEL_EVENT, StartOutcome, TRANSCRIPT_EVENT, Transcript};

const BUS: usize = 0;
const BUFFER_FRAMES: u32 = 1024;
const SILENCE_DB: f32 = -50.0;

struct Session {
    engine: Retained<AVAudioEngine>,
    request: Retained<SFSpeechAudioBufferRecognitionRequest>,
    task: Retained<SFSpeechRecognitionTask>,
    _recognizer: Retained<SFSpeechRecognizer>,
}

thread_local! {
    static SESSION: RefCell<Option<Session>> = const { RefCell::new(None) };
}

enum Permission {
    Known(bool),
    Asking(oneshot::Receiver<bool>),
}

impl Permission {
    async fn granted(self) -> bool {
        match self {
            Self::Known(granted) => granted,
            Self::Asking(answer) => answer.await.unwrap_or(false),
        }
    }
}

fn answer_once() -> (impl Fn(bool) + 'static, oneshot::Receiver<bool>) {
    let (reply, answer) = oneshot::channel();
    let reply = RefCell::new(Some(reply));
    let send = move |granted: bool| {
        if let Some(reply) = reply.borrow_mut().take() {
            let _ = reply.send(granted);
        }
    };
    (send, answer)
}

fn speech_permission() -> Permission {
    let status = unsafe { SFSpeechRecognizer::authorizationStatus() };
    if status != SFSpeechRecognizerAuthorizationStatus::NotDetermined {
        return Permission::Known(status == SFSpeechRecognizerAuthorizationStatus::Authorized);
    }
    let (send, answer) = answer_once();
    let handler = RcBlock::new(move |status: SFSpeechRecognizerAuthorizationStatus| {
        send(status == SFSpeechRecognizerAuthorizationStatus::Authorized);
    });
    unsafe { SFSpeechRecognizer::requestAuthorization(&handler) };
    Permission::Asking(answer)
}

fn microphone_permission() -> Permission {
    let Some(audio) = (unsafe { AVMediaTypeAudio }) else {
        return Permission::Known(false);
    };
    let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(audio) };
    if status != AVAuthorizationStatus::NotDetermined {
        return Permission::Known(status == AVAuthorizationStatus::Authorized);
    }
    let (send, answer) = answer_once();
    let handler = RcBlock::new(move |granted: Bool| send(granted.as_bool()));
    unsafe { AVCaptureDevice::requestAccessForMediaType_completionHandler(audio, &handler) };
    Permission::Asking(answer)
}

#[allow(clippy::cast_precision_loss)]
fn level(buffer: &AVAudioPCMBuffer) -> f32 {
    let frames = unsafe { buffer.frameLength() } as usize;
    let channels = unsafe { buffer.floatChannelData() };
    if frames == 0 || channels.is_null() {
        return 0.0;
    }
    let first = unsafe { *channels };
    let samples = unsafe { std::slice::from_raw_parts(first.as_ptr(), frames) };
    let power = samples.iter().map(|sample| sample * sample).sum::<f32>() / frames as f32;
    let db = 10.0 * power.max(1e-10).log10();
    ((db - SILENCE_DB) / -SILENCE_DB).clamp(0.0, 1.0)
}

const DICTATION_DOMAIN: &str = "kLSRErrorDomain";
const DICTATION_OFF: isize = 201;

fn is_dictation_off(error: &NSError) -> bool {
    error.code() == DICTATION_OFF && error.domain().to_string() == DICTATION_DOMAIN
}

fn teardown() -> Option<Session> {
    let session = SESSION.with_borrow_mut(Option::take)?;
    unsafe {
        session.engine.stop();
        session.engine.inputNode().removeTapOnBus(BUS);
    }
    Some(session)
}

fn begin(app: &AppHandle, language: &str, on_device: bool) -> StartOutcome {
    if SESSION.with_borrow(Option::is_some) {
        return StartOutcome::Listening;
    }
    let locale = NSLocale::localeWithLocaleIdentifier(&NSString::from_str(language));
    let Some(recognizer) =
        (unsafe { SFSpeechRecognizer::initWithLocale(SFSpeechRecognizer::alloc(), &locale) })
    else {
        return StartOutcome::Unavailable;
    };
    if !unsafe { recognizer.isAvailable() } {
        tracing::warn!(language, "speech recognizer is not available");
        return StartOutcome::Unavailable;
    }

    let request = unsafe { SFSpeechAudioBufferRecognitionRequest::new() };
    unsafe {
        request.setShouldReportPartialResults(true);
        if on_device && recognizer.supportsOnDeviceRecognition() {
            request.setRequiresOnDeviceRecognition(true);
        }
    }

    let engine = unsafe { AVAudioEngine::new() };
    let input = unsafe { engine.inputNode() };
    let format = unsafe { input.outputFormatForBus(BUS) };
    let tap = {
        let request = request.clone();
        let app = app.clone();
        RcBlock::new(
            move |buffer: NonNull<AVAudioPCMBuffer>, _: NonNull<AVAudioTime>| {
                let buffer = unsafe { buffer.as_ref() };
                unsafe { request.appendAudioPCMBuffer(buffer) };
                let _ = app.emit(LEVEL_EVENT, level(buffer));
            },
        )
    };
    unsafe {
        input.installTapOnBus_bufferSize_format_block(
            BUS,
            BUFFER_FRAMES,
            Some(&format),
            RcBlock::as_ptr(&tap),
        );
        engine.prepare();
    }
    if let Err(error) = unsafe { engine.startAndReturnError() } {
        tracing::warn!(code = error.code(), "audio engine failed to start");
        unsafe { input.removeTapOnBus(BUS) };
        return StartOutcome::Unavailable;
    }

    let handler = {
        let app = app.clone();
        let language = language.to_owned();
        RcBlock::new(
            move |result: *mut SFSpeechRecognitionResult, error: *mut NSError| {
                let result = unsafe { result.as_ref() };
                let done =
                    result.is_none_or(|result| unsafe { result.isFinal() }) || !error.is_null();
                if let Some(error) = unsafe { error.as_ref() } {
                    tracing::warn!(code = error.code(), domain = %error.domain(), on_device, "voice recognition ended with an error");
                    if result.is_none() && is_dictation_off(error) {
                        let app = app.clone();
                        let language = language.clone();
                        let _ = app.clone().run_on_main_thread(move || {
                            if teardown().is_none() {
                                return;
                            }
                            let retried = on_device
                                && begin(&app, &language, false) == StartOutcome::Listening;
                            if !retried {
                                let _ = app.emit(ENDED_EVENT, Some(EndReason::DictationOff));
                            }
                        });
                        return;
                    }
                }
                if let Some(result) = result {
                    let text = unsafe { result.bestTranscription().formattedString() }.to_string();
                    let _ = app.emit(TRANSCRIPT_EVENT, Transcript { text, done });
                }
                if done {
                    let app = app.clone();
                    let _ = app.clone().run_on_main_thread(move || {
                        if teardown().is_some() {
                            let _ = app.emit(ENDED_EVENT, None::<EndReason>);
                        }
                    });
                }
            },
        )
    };
    let task = unsafe { recognizer.recognitionTaskWithRequest_resultHandler(&request, &handler) };

    SESSION.with_borrow_mut(|session| {
        *session = Some(Session {
            engine,
            request,
            task,
            _recognizer: recognizer,
        });
    });
    StartOutcome::Listening
}

pub async fn start(app: AppHandle, language: String) -> StartOutcome {
    if !microphone_permission().granted().await {
        return StartOutcome::MicrophoneDenied;
    }
    if !speech_permission().granted().await {
        return StartOutcome::SpeechDenied;
    }
    let (reply, outcome) = oneshot::channel();
    let handle = app.clone();
    let scheduled = app.run_on_main_thread(move || {
        if MainThreadMarker::new().is_some() {
            let _ = reply.send(begin(&handle, &language, true));
        }
    });
    if scheduled.is_err() {
        return StartOutcome::Unavailable;
    }
    let outcome = outcome.await.unwrap_or(StartOutcome::Unavailable);
    tracing::info!(?outcome, "voice start");
    outcome
}

pub fn stop(app: &AppHandle) {
    let _ = app.run_on_main_thread(|| {
        tracing::info!(
            active = SESSION.with_borrow(Option::is_some),
            "voice finishing"
        );
        SESSION.with_borrow(|session| {
            if let Some(session) = session {
                unsafe {
                    session.engine.stop();
                    session.engine.inputNode().removeTapOnBus(BUS);
                    session.request.endAudio();
                }
            }
        });
    });
}

pub fn cancel(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let session = teardown();
        tracing::info!(active = session.is_some(), "voice cancelled");
        if let Some(session) = session {
            unsafe { session.task.cancel() };
        }
        let _ = handle.emit(ENDED_EVENT, None::<EndReason>);
    });
}
