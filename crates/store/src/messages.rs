use rusqlite::{Row, params};
use xiaoban_protocol::{Message, Role};

use crate::{Result, Store, StoreError, new_id, now_ms};

fn role_to_str(role: Role) -> &'static str {
    match role {
        Role::User => "user",
        Role::Assistant => "assistant",
    }
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<(Message, String)> {
    Ok((
        Message {
            id: row.get(0)?,
            thread_id: row.get(1)?,
            role: Role::User,
            text: row.get(3)?,
            created_at: row.get(4)?,
        },
        row.get(2)?,
    ))
}

fn with_role((mut message, role): (Message, String)) -> Result<Message> {
    message.role = match role.as_str() {
        "user" => Role::User,
        "assistant" => Role::Assistant,
        _ => return Err(StoreError::Corrupt("messages.role")),
    };
    Ok(message)
}

impl Store {
    pub async fn append_message(
        &self,
        thread_id: String,
        role: Role,
        text: String,
    ) -> Result<Message> {
        self.with(move |conn| {
            let message = Message {
                id: new_id(),
                thread_id,
                role,
                text,
                created_at: now_ms(),
            };
            conn.execute(
                "INSERT INTO messages (id, thread_id, role, text, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    message.id,
                    message.thread_id,
                    role_to_str(message.role),
                    message.text,
                    message.created_at
                ],
            )?;
            Ok(message)
        })
        .await
    }

    pub async fn list_messages(&self, thread_id: String) -> Result<Vec<Message>> {
        self.with(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT id, thread_id, role, text, created_at FROM messages WHERE thread_id = ?1 ORDER BY created_at, id",
            )?;
            let rows = stmt.query_map([thread_id], from_row)?;
            rows.map(|row| with_role(row?)).collect()
        })
        .await
    }
}
