use rusqlite::{Row, params};
use xiaoban_protocol::Memory;

use crate::{Result, Store, new_id, now_ms};

fn from_row(row: &Row<'_>) -> rusqlite::Result<Memory> {
    Ok(Memory {
        id: row.get(0)?,
        subject: row.get(1)?,
        value: row.get(2)?,
        updated_at: row.get(3)?,
    })
}

impl Store {
    pub async fn remember(&self, subject: String, value: String) -> Result<Memory> {
        self.with(move |conn| {
            conn.execute(
                "INSERT INTO memories (id, subject, value, updated_at) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(subject) DO UPDATE SET value = ?3, updated_at = ?4",
                params![new_id(), subject, value, now_ms()],
            )?;
            Ok(conn.query_row(
                "SELECT id, subject, value, updated_at FROM memories WHERE subject = ?1",
                [&subject],
                from_row,
            )?)
        })
        .await
    }

    pub async fn list_memories(&self) -> Result<Vec<Memory>> {
        self.with(|conn| {
            let mut stmt =
                conn.prepare("SELECT id, subject, value, updated_at FROM memories ORDER BY rowid")?;
            let rows = stmt.query_map([], from_row)?;
            Ok(rows.collect::<rusqlite::Result<_>>()?)
        })
        .await
    }
}
