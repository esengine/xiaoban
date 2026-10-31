use rusqlite::{Row, params};
use xiaoban_protocol::{Memory, MemoryTopic};

use crate::{Result, Store, StoreError, new_id, now_ms};

fn from_row(row: &Row<'_>) -> rusqlite::Result<(String, String, String, i64)> {
    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
}

fn into_memory((id, topic, value, updated_at): (String, String, String, i64)) -> Result<Memory> {
    Ok(Memory {
        id,
        topic: MemoryTopic::parse(&topic).ok_or(StoreError::Corrupt("memories.topic"))?,
        value,
        updated_at,
    })
}

impl Store {
    pub async fn remember(&self, topic: MemoryTopic, value: String) -> Result<Memory> {
        self.with(move |conn| {
            let updated_at = now_ms();
            conn.execute(
                "INSERT INTO memories (id, topic, value, updated_at) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(topic) DO UPDATE SET value = ?3, updated_at = ?4",
                params![new_id(), topic.as_str(), value, updated_at],
            )?;
            let raw = conn.query_row(
                "SELECT id, topic, value, updated_at FROM memories WHERE topic = ?1",
                [topic.as_str()],
                from_row,
            )?;
            into_memory(raw)
        })
        .await
    }

    pub async fn list_memories(&self) -> Result<Vec<Memory>> {
        self.with(|conn| {
            let mut stmt = conn
                .prepare("SELECT id, topic, value, updated_at FROM memories ORDER BY updated_at")?;
            let rows = stmt.query_map([], from_row)?;
            rows.map(|row| into_memory(row?)).collect()
        })
        .await
    }
}
