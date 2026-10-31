use rusqlite::{Row, params};
use xiaoban_protocol::{Memory, MemoryCategory};

use crate::{Result, Store, new_id, now_ms};

const COLUMNS: &str = "id, subject, value, updated_at, category, uses, last_used_at";

fn from_row(row: &Row<'_>) -> rusqlite::Result<Memory> {
    Ok(Memory {
        id: row.get(0)?,
        subject: row.get(1)?,
        value: row.get(2)?,
        updated_at: row.get(3)?,
        category: MemoryCategory::parse(&row.get::<_, String>(4)?),
        uses: row.get(5)?,
        last_used_at: row.get(6)?,
    })
}

impl Store {
    pub async fn remember(
        &self,
        subject: String,
        value: String,
        category: MemoryCategory,
    ) -> Result<Memory> {
        self.with(move |conn| {
            conn.execute(
                "INSERT INTO memories (id, subject, value, updated_at, category) VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(subject) DO UPDATE SET value = ?3, updated_at = ?4, category = ?5",
                params![new_id(), subject, value, now_ms(), category.as_str()],
            )?;
            Ok(conn.query_row(
                &format!("SELECT {COLUMNS} FROM memories WHERE subject = ?1"),
                [&subject],
                from_row,
            )?)
        })
        .await
    }

    pub async fn list_memories(&self) -> Result<Vec<Memory>> {
        self.with(|conn| {
            let mut stmt =
                conn.prepare(&format!("SELECT {COLUMNS} FROM memories ORDER BY rowid"))?;
            let rows = stmt.query_map([], from_row)?;
            Ok(rows.collect::<rusqlite::Result<_>>()?)
        })
        .await
    }

    pub async fn mark_memories_used(&self, ids: Vec<String>) -> Result<Vec<Memory>> {
        self.with(move |conn| {
            let tx = conn.transaction()?;
            let now = now_ms();
            let mut used = Vec::new();
            for id in &ids {
                tx.execute(
                    "UPDATE memories SET uses = uses + 1, last_used_at = ?2 WHERE id = ?1",
                    params![id, now],
                )?;
                used.push(tx.query_row(
                    &format!("SELECT {COLUMNS} FROM memories WHERE id = ?1"),
                    [id],
                    from_row,
                )?);
            }
            tx.commit()?;
            Ok(used)
        })
        .await
    }
}
