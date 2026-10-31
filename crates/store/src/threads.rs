use rusqlite::{Connection, OptionalExtension, Row, params};
use xiaoban_protocol::Thread;

use crate::{Result, Store, StoreError, new_id, now_ms};

const SELECT: &str = "SELECT id, title, created_at, updated_at,
    (SELECT text FROM messages WHERE messages.thread_id = threads.id
     ORDER BY created_at DESC, rowid DESC LIMIT 1)
    FROM threads";

fn from_row(row: &Row<'_>) -> rusqlite::Result<Thread> {
    Ok(Thread {
        id: row.get(0)?,
        title: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
        last_message: row.get(4)?,
    })
}

fn by_id(conn: &Connection, id: &str) -> Result<Thread> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], from_row)
        .optional()?
        .ok_or(StoreError::NotFound("thread"))
}

impl Store {
    pub async fn create_thread(&self, title: Option<String>) -> Result<Thread> {
        self.with(move |conn| {
            let now = now_ms();
            let thread = Thread {
                id: new_id(),
                title,
                last_message: None,
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
            let mut stmt = conn.prepare(&format!("{SELECT} ORDER BY updated_at DESC"))?;
            let rows = stmt.query_map([], from_row)?;
            Ok(rows.collect::<rusqlite::Result<_>>()?)
        })
        .await
    }

    pub async fn thread(&self, id: String) -> Result<Thread> {
        self.with(move |conn| by_id(conn, &id)).await
    }

    pub async fn rename_thread(&self, id: String, title: String) -> Result<Thread> {
        self.with(move |conn| {
            conn.execute(
                "UPDATE threads SET title = ?2 WHERE id = ?1",
                params![id, title],
            )?;
            by_id(conn, &id)
        })
        .await
    }

    pub async fn delete_thread(&self, id: String) -> Result<()> {
        self.with(move |conn| {
            let removed = conn.execute("DELETE FROM threads WHERE id = ?1", [&id])?;
            if removed == 0 {
                return Err(StoreError::NotFound("thread"));
            }
            Ok(())
        })
        .await
    }

    pub async fn touch_thread(&self, id: String) -> Result<Thread> {
        self.with(move |conn| {
            conn.execute(
                "UPDATE threads SET updated_at = ?2 WHERE id = ?1",
                params![id, now_ms()],
            )?;
            by_id(conn, &id)
        })
        .await
    }
}
