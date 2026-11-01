#[cfg(target_os = "android")]
pub fn http_builder() -> reqwest::ClientBuilder {
    let roots = webpki_root_certs::TLS_SERVER_ROOT_CERTS
        .iter()
        .filter_map(|cert| reqwest::Certificate::from_der(cert.as_ref()).ok());
    reqwest::Client::builder().tls_certs_only(roots)
}

#[cfg(not(target_os = "android"))]
pub fn http_builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
}

pub fn http_client() -> reqwest::Client {
    http_builder().build().unwrap_or_default()
}
