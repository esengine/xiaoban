use std::cell::RefCell;
use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{MainThreadMarker, MainThreadOnly, define_class, msg_send};
use objc2_core_location::{
    CLAuthorizationStatus, CLError, CLGeocoder, CLLocation, CLLocationManager,
    CLLocationManagerDelegate, CLPlacemark, kCLLocationAccuracyKilometer,
};
use objc2_foundation::{NSArray, NSError, NSObject, NSObjectProtocol, NSString};
use tauri::AppHandle;
use tokio::sync::oneshot;
use xiaoban_hub::Locator;
use xiaoban_protocol::Location;

const TIMEOUT: Duration = Duration::from_secs(20);

struct Session {
    manager: Retained<CLLocationManager>,
    _delegate: Retained<Delegate>,
    geocoder: Option<Retained<CLGeocoder>>,
    requested: bool,
    replies: Vec<oneshot::Sender<Location>>,
}

thread_local! {
    static SESSION: RefCell<Option<Session>> = const { RefCell::new(None) };
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "XiaobanLocationDelegate"]
    struct Delegate;

    unsafe impl NSObjectProtocol for Delegate {}

    unsafe impl CLLocationManagerDelegate for Delegate {
        #[unsafe(method(locationManagerDidChangeAuthorization:))]
        fn did_change_authorization(&self, manager: &CLLocationManager) {
            proceed(manager);
        }

        #[unsafe(method(locationManager:didUpdateLocations:))]
        fn did_update_locations(
            &self,
            _manager: &CLLocationManager,
            locations: &NSArray<CLLocation>,
        ) {
            match locations.lastObject() {
                Some(location) => geocode(&location),
                None => finish(&Location::Unavailable),
            }
        }

        #[unsafe(method(locationManager:didFailWithError:))]
        fn did_fail(&self, _manager: &CLLocationManager, error: &NSError) {
            let denied = error.code() == CLError::Denied.0;
            finish(&if denied {
                Location::Denied
            } else {
                Location::Unavailable
            });
        }
    }
);

impl Delegate {
    fn new(mtm: MainThreadMarker) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(());
        unsafe { msg_send![super(this), init] }
    }
}

fn start(mtm: MainThreadMarker, reply: oneshot::Sender<Location>) {
    if !unsafe { CLLocationManager::locationServicesEnabled_class() } {
        let _ = reply.send(Location::Unavailable);
        return;
    }
    let joined = SESSION.with_borrow_mut(|session| {
        if let Some(session) = session {
            session.replies.push(reply);
            None
        } else {
            let manager = unsafe { CLLocationManager::new() };
            let delegate = Delegate::new(mtm);
            unsafe {
                manager.setDesiredAccuracy(kCLLocationAccuracyKilometer);
                manager.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
            }
            *session = Some(Session {
                manager: manager.clone(),
                _delegate: delegate,
                geocoder: None,
                requested: false,
                replies: vec![reply],
            });
            Some(manager)
        }
    });
    if let Some(manager) = joined {
        proceed(&manager);
    }
}

fn proceed(manager: &CLLocationManager) {
    let status = unsafe { manager.authorizationStatus() };
    tracing::debug!(status = status.0, "location authorization");
    if status == CLAuthorizationStatus::NotDetermined {
        unsafe { manager.requestWhenInUseAuthorization() };
    } else if status == CLAuthorizationStatus::AuthorizedAlways
        || status == CLAuthorizationStatus::AuthorizedWhenInUse
    {
        let first = SESSION.with_borrow_mut(|session| {
            session
                .as_mut()
                .is_some_and(|session| !std::mem::replace(&mut session.requested, true))
        });
        if first {
            unsafe { manager.requestLocation() };
        }
    } else {
        finish(&Location::Denied);
    }
}

fn text(value: Option<Retained<NSString>>) -> Option<String> {
    value
        .map(|value| value.to_string().trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn describe(placemark: &CLPlacemark, latitude: f64, longitude: f64) -> Option<Location> {
    let (locality, area, district) = unsafe {
        (
            placemark.locality(),
            placemark.administrativeArea(),
            placemark.subLocality(),
        )
    };
    let city = text(locality).or_else(|| text(area))?;
    Some(Location::Found {
        city,
        district: text(district),
        latitude: latitude.is_finite().then(|| format!("{latitude:.5}")),
        longitude: longitude.is_finite().then(|| format!("{longitude:.5}")),
    })
}

fn geocode(location: &CLLocation) {
    let geocoder = unsafe { CLGeocoder::new() };
    let coordinate = unsafe { location.coordinate() };
    let completion = RcBlock::new(move |placemarks: *mut NSArray<CLPlacemark>, _: *mut NSError| {
        let found = unsafe { placemarks.as_ref() }
            .and_then(NSArray::firstObject)
            .and_then(|placemark| describe(&placemark, coordinate.latitude, coordinate.longitude));
        finish(&found.unwrap_or(Location::Unavailable));
    });
    unsafe {
        geocoder.reverseGeocodeLocation_completionHandler(location, RcBlock::as_ptr(&completion));
    }
    SESSION.with_borrow_mut(|session| {
        if let Some(session) = session {
            session.geocoder = Some(geocoder);
        }
    });
}

fn finish(location: &Location) {
    let Some(session) = SESSION.with_borrow_mut(Option::take) else {
        return;
    };
    unsafe { session.manager.setDelegate(None) };
    for reply in session.replies {
        let _ = reply.send(location.clone());
    }
}

#[derive(Debug, Clone)]
pub struct CoreLocator {
    app: AppHandle,
}

impl CoreLocator {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl Locator for CoreLocator {
    fn locate(&self) -> Pin<Box<dyn Future<Output = Location> + Send>> {
        let app = self.app.clone();
        Box::pin(async move {
            let (reply, located) = oneshot::channel();
            let started = app.run_on_main_thread(move || {
                if let Some(mtm) = MainThreadMarker::new() {
                    start(mtm, reply);
                }
            });
            if started.is_err() {
                return Location::Unavailable;
            }
            if let Ok(Ok(location)) = tokio::time::timeout(TIMEOUT, located).await {
                location
            } else {
                let _ = app.run_on_main_thread(|| finish(&Location::Unavailable));
                Location::Unavailable
            }
        })
    }
}
