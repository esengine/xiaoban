use rusqlite::{OptionalExtension, Row, params};
use xiaoban_protocol::Thread;

use crate::{Result, Store, StoreError, new_id, now_ms};

fn from_row(row: &Row<'_>) -> rusqlite::Result<Thread> {
    Ok(Thread {
        id: row.get(0)?,
        title: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
    })
}

impl Store {
    pub async fn create_thread(&self, title: Option<String>) -> Result<Thread> {
        self.with(move |conn| {
            let now = now_ms();
            let thread = Thread {
                id: new_id(),
                title,
                created_at: now,
                updated_at: now,
            };
            conn.execute(
                "INSERT INTO threads (id, title, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
                params![
                    thread.id,
                    thread.title,
                    thread.created_at,
                    thread.updated_at
                ],
            )?;
            Ok(thread)
        })
        .await
    }

    pub async fn list_threads(&self) -> Result<Vec<Thread>> {
        self.with(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, title, created_at, updated_at FROM threads ORDER BY updated_at DESC",
            )?;
            let rows = stmt.query_map([], from_row)?;
            Ok(rows.collect::<rusqlite::Result<_>>()?)
        })
        .await
    }

    pub async fn thread(&self, id: String) -> Result<Thread> {
        self.with(move |conn| {
            conn.query_row(
                "SELECT id, title, created_at, updated_at FROM threads WHERE id = ?1",
                [id],
                from_row,
            )
            .optional()?
            .ok_or(StoreError::NotFound("thread"))
        })
        .await
    }

    pub async fn touch_thread(&self, id: String) -> Result<Thread> {
        self.with(move |conn| {
            conn.execute(
                "UPDATE threads SET updated_at = ?2 WHERE id = ?1",
                params![id, now_ms()],
            )?;
            conn.query_row(
                "SELECT id, title, created_at, updated_at FROM threads WHERE id = ?1",
                [id],
                from_row,
            )
            .optional()?
            .ok_or(StoreError::NotFound("thread"))
        })
        .await
    }
}
