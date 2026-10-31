use rusqlite::{OptionalExtension, params};

use crate::{Result, Store};

impl Store {
    pub async fn setting(&self, key: &'static str) -> Result<Option<String>> {
        self.with(move |conn| {
            Ok(conn
                .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                    row.get(0)
                })
                .optional()?)
        })
        .await
    }

    pub async fn set_setting(&self, key: &'static str, value: String) -> Result<()> {
        self.with(move |conn| {
            conn.execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = ?2",
                params![key, value],
            )?;
            Ok(())
        })
        .await
    }
}

impl Store {
    pub async fn clear_setting(&self, key: &'static str) -> Result<()> {
        self.with(move |conn| {
            conn.execute("DELETE FROM settings WHERE key = ?1", [key])?;
            Ok(())
        })
        .await
    }
}
