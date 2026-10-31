use ts_rs::{Config, TS};
use xiaoban_protocol::{ClientFrame, RelayFrame, RelayRole, ServerFrame};

#[test]
fn export_typescript_bindings() {
    let Some(dir) = std::env::var_os("XIAOBAN_TS_OUT") else {
        return;
    };
    let config = Config::new()
        .with_out_dir(dir)
        .with_import_extension(Some("ts"));
    ClientFrame::export_all(&config).unwrap();
    ServerFrame::export_all(&config).unwrap();
    RelayFrame::export_all(&config).unwrap();
    RelayRole::export_all(&config).unwrap();
}
