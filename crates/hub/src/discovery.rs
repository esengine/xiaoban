use std::collections::HashMap;

use mdns_sd::{ServiceDaemon, ServiceInfo};
use xiaoban_protocol::HubInfo;

pub const SERVICE_TYPE: &str = "_xiaoban._tcp.local.";

pub fn advertise(info: &HubInfo, port: u16) -> Option<ServiceDaemon> {
    let daemon = ServiceDaemon::new()
        .inspect_err(|err| tracing::warn!(error = %err, "mdns unavailable"))
        .ok()?;
    let properties = HashMap::from([
        ("hub".to_owned(), info.id.clone()),
        ("version".to_owned(), info.version.clone()),
    ]);
    let host = format!("xiaoban-{}.local.", &info.id[..8]);
    let service = ServiceInfo::new(SERVICE_TYPE, &info.name, &host, "", port, properties)
        .inspect_err(|err| tracing::warn!(error = %err, "invalid mdns service"))
        .ok()?
        .enable_addr_auto();
    daemon
        .register(service)
        .inspect_err(|err| tracing::warn!(error = %err, "mdns register failed"))
        .ok()?;
    Some(daemon)
}
