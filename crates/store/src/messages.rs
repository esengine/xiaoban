use rusqlite::{Row, params};
use xiaoban_protocol::{Attachment, FileInfo, Message, Quote, Role, Thinking};

use crate::{Result, Store, StoreError, new_id, now_ms};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewMessage {
    pub role: Role,
    pub text: String,
    pub quote: Option<Quote>,
    pub files: Vec<FileInfo>,
    pub replaces: Option<String>,
    pub attachment: Option<Attachment>,
    pub thinking: Option<Thinking>,
}

fn read_quote(raw: Option<String>) -> Option<Quote> {
    let raw = raw?;
    Some(serde_json::from_str(&raw).unwrap_or_else(|_| Quote::plain(raw)))
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
            files: Vec::new(),
            replaces: None,
            attachment: None,
            thinking: None,
        }
    }

    #[must_use]
    pub fn thinking(mut self, thinking: Option<Thinking>) -> Self {
        self.thinking = thinking;
        self
    }

    #[must_use]
    pub fn quoting(mut self, quote: Option<Quote>) -> Self {
        self.quote = quote;
        self
    }

    #[must_use]
    pub fn with_files(mut self, files: Vec<FileInfo>) -> Self {
        self.files = files;
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
            quote: read_quote(row.get(5)?),
            files: row
                .get::<_, Option<String>>(8)?
                .and_then(|json| serde_json::from_str(&json).ok())
                .unwrap_or_default(),
            replaces: row.get(6)?,
            attachment: row
                .get::<_, Option<String>>(7)?
                .and_then(|json| serde_json::from_str(&json).ok()),
            thinking: row
                .get::<_, Option<String>>(9)?
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
                files: new.files,
                replaces: new.replaces,
                attachment: new.attachment,
                thinking: new.thinking,
                created_at: now_ms(),
            };
            let thinking = message
                .thinking
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(|_| StoreError::Corrupt("messages.thinking"))?;
            let quote = message
                .quote
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(|_| StoreError::Corrupt("messages.quote"))?;
            let files = (!message.files.is_empty())
                .then(|| serde_json::to_string(&message.files))
                .transpose()
                .map_err(|_| StoreError::Corrupt("messages.files"))?;
            let attachment = message
                .attachment
                .as_ref()
                .map(serde_json::to_string)
                .transpose()
                .map_err(|_| StoreError::Corrupt("messages.attachment"))?;
            conn.execute(
                "INSERT INTO messages (id, thread_id, role, text, created_at, quote, replaces, attachment, files, thinking)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    message.id,
                    message.thread_id,
                    role_to_str(message.role),
                    message.text,
                    message.created_at,
                    quote,
                    message.replaces,
                    attachment,
                    files,
                    thinking
                ],
            )?;
            Ok(message)
        })
        .await
    }

    pub async fn page_messages(
        &self,
        thread_id: String,
        before: Option<i64>,
        limit: u32,
    ) -> Result<(Vec<Message>, bool)> {
        self.with(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT id, thread_id, role, text, created_at, quote, replaces, attachment, files, thinking
                 FROM messages WHERE thread_id = ?1 AND created_at < ?2
                 ORDER BY created_at DESC, rowid DESC LIMIT ?3",
            )?;
            let rows = stmt.query_map(
                params![thread_id, before.unwrap_or(i64::MAX), i64::from(limit) + 1],
                from_row,
            )?;
            let mut page: Vec<Message> = rows.map(|row| with_role(row?)).collect::<Result<_>>()?;
            let more = page.len() > limit as usize;
            page.truncate(limit as usize);
            page.reverse();
            Ok((page, more))
        })
        .await
    }

    pub async fn count_messages_before(&self, thread_id: String, before: i64) -> Result<u32> {
        self.with(move |conn| {
            let count: i64 = conn.query_row(
                "SELECT COUNT(*) FROM messages WHERE thread_id = ?1 AND created_at < ?2",
                params![thread_id, before],
                |row| row.get(0),
            )?;
            Ok(u32::try_from(count).unwrap_or(u32::MAX))
        })
        .await
    }

    pub async fn thread_openers(&self) -> Result<Vec<(String, String, u32)>> {
        self.with(|conn| {
            let mut stmt = conn.prepare(
                "SELECT m.thread_id, m.text,
                        (SELECT COUNT(*) FROM messages c WHERE c.thread_id = m.thread_id)
                 FROM messages m
                 WHERE m.role = 'user' AND m.rowid = (
                     SELECT f.rowid FROM messages f
                     WHERE f.thread_id = m.thread_id AND f.role = 'user'
                     ORDER BY f.created_at, f.rowid LIMIT 1
                 )",
            )?;
            let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?;
            Ok(rows.collect::<rusqlite::Result<_>>()?)
        })
        .await
    }

    pub async fn list_messages(&self, thread_id: String) -> Result<Vec<Message>> {
        self.with(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT id, thread_id, role, text, created_at, quote, replaces, attachment, files, thinking
                 FROM messages WHERE thread_id = ?1 ORDER BY created_at, rowid",
            )?;
            let rows = stmt.query_map([thread_id], from_row)?;
            rows.map(|row| with_role(row?)).collect()
        })
        .await
    }
}
