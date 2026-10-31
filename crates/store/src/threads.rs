use rusqlite::{Connection, OptionalExtension, Row, params};
use xiaoban_protocol::{Thread, ThreadKind};

use crate::{Result, Store, StoreError, new_id, now_ms};

const SELECT: &str = "SELECT id, kind, title, created_at, updated_at FROM threads";

fn from_row(row: &Row<'_>) -> rusqlite::Result<Thread> {
    let kind: String = row.get(1)?;
    Ok(Thread {
        id: row.get(0)?,
        kind: ThreadKind::parse(&kind).unwrap_or_default(),
        title: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn by_id(conn: &Connection, id: &str) -> Result<Thread> {
    conn.query_row(&format!("{SELECT} WHERE id = ?1"), [id], from_row)
        .optional()?
        .ok_or(StoreError::NotFound("thread"))
}

impl Store {
    pub async fn create_thread(&self, kind: ThreadKind, title: Option<String>) -> Result<Thread> {
        self.with(move |conn| {
            let now = now_ms();
            let thread = Thread {
                id: new_id(),
                kind,
                title,
                created_at: now,
                updated_at: now,
            };
            conn.execute(
                "INSERT INTO threads (id, kind, title, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    thread.id,
                    thread.kind.as_str(),
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
            let mut stmt = conn.prepare(&format!(
                "{SELECT} WHERE kind = 'chat' ORDER BY updated_at DESC"
            ))?;
            let rows = stmt.query_map([], from_row)?;
            Ok(rows.collect::<rusqlite::Result<_>>()?)
        })
        .await
    }

    pub async fn thread_of_kind(&self, kind: ThreadKind) -> Result<Option<Thread>> {
        self.with(move |conn| {
            Ok(conn
                .query_row(
                    &format!("{SELECT} WHERE kind = ?1 ORDER BY created_at LIMIT 1"),
                    [kind.as_str()],
                    from_row,
                )
                .optional()?)
        })
        .await
    }

    pub async fn thread(&self, id: String) -> Result<Thread> {
        self.with(move |conn| by_id(conn, &id)).await
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
