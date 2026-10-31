mod clock;
mod devices;
mod error;
mod memories;
mod messages;
mod migrations;
mod settings;
mod threads;
mod transcript;
mod usage;

use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

pub use clock::now_ms;
pub use devices::StoredDevice;
pub use error::StoreError;
pub use messages::NewMessage;
pub use transcript::{Epoch, EpochReason};
pub use usage::UsageTotals;

pub type Result<T> = std::result::Result<T, StoreError>;

#[derive(Clone, Debug)]
pub struct Store {
    conn: Arc<Mutex<Connection>>,
}

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        Self::init(Connection::open(path)?)
    }

    pub fn open_in_memory() -> Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(mut conn: Connection) -> Result<Self> {
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrations::apply(&mut conn)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    async fn with<T, F>(&self, f: F) -> Result<T>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> Result<T> + Send + 'static,
    {
        let conn = Arc::clone(&self.conn);
        tokio::task::spawn_blocking(move || {
            let mut guard = conn.lock().map_err(|_| StoreError::Poisoned)?;
            f(&mut guard)
        })
        .await?
    }
}

pub(crate) fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}
