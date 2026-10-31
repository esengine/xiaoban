use rusqlite::{Row, params};
use xiaoban_protocol::{Attachment, Message, Role};

use crate::{Result, Store, StoreError, new_id, now_ms};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewMessage {
    pub role: Role,
    pub text: String,
    pub quote: Option<String>,
    pub replaces: Option<String>,
    pub attachment: Option<Attachment>,
}

impl NewMessage {
    pub fn user(text: impl Into<String>) -> Self {
        Self::new(Role::User, text)
    }

    pub fn assistant(text: impl Into<String>) -> Self {
        Self::new(Role::Assistant, text)
    }

    fn new(role: Role, text: impl Into<String>) -> Self {
        Self {
            role,
            text: text.into(),
            quote: None,
            replaces: None,
            attachment: None,
        }
    }

    #[must_use]
    pub fn quoting(mut self, quote: Option<String>) -> Self {
        self.quote = quote;
        self
    }

    #[must_use]
    pub fn attaching(mut self, attachment: Option<Attachment>) -> Self {
        self.attachment = attachment;
        self
    }

    #[must_use]
    pub fn replacing(mut self, replaces: Option<String>) -> Self {
        self.replaces = replaces;
        self
    }
}

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
            quote: row.get(5)?,
            replaces: row.get(6)?,
            attachment: row
                .get::<_, Option<String>>(7)?
                .and_then(|json| serde_json::from_str(&json).ok()),
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
    pub async fn append_message(&self, thread_id: String, new: NewMessage) -> Result<Message> {
        self.with(move |conn| {
            let message = Message {
                id: new_id(),
                thread_id,
                role: new.role,
                text: new.text,
                quote: new.quote,
                replaces: new.replaces,
                attachment: new.attachment,
                created_at: now_ms(),
            };
            let attachment = message
                .attachment
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(|_| StoreError::Corrupt("messages.attachment"))?;
            conn.execute(
                "INSERT INTO messages (id, thread_id, role, text, created_at, quote, replaces, attachment)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    message.id,
                    message.thread_id,
                    role_to_str(message.role),
                    message.text,
                    message.created_at,
                    message.quote,
                    message.replaces,
                    attachment
                ],
            )?;
            Ok(message)
        })
        .await
    }

    pub async fn list_messages(&self, thread_id: String) -> Result<Vec<Message>> {
        self.with(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT id, thread_id, role, text, created_at, quote, replaces, attachment
                 FROM messages WHERE thread_id = ?1 ORDER BY created_at, rowid",
            )?;
            let rows = stmt.query_map([thread_id], from_row)?;
            rows.map(|row| with_role(row?)).collect()
        })
        .await
    }
}
