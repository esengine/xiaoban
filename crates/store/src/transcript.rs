use rusqlite::{OptionalExtension, Transaction, params};

use crate::{Result, Store, StoreError, new_id, now_ms};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryRole {
    User,
    Assistant,
}

impl EntryRole {
    fn as_str(self) -> &'static str {
        match self {
            Self::User => "user",
            Self::Assistant => "assistant",
        }
    }

    fn parse(value: &str) -> Result<Self> {
        match value {
            "user" => Ok(Self::User),
            "assistant" => Ok(Self::Assistant),
            _ => Err(StoreError::Corrupt("transcript_entries.role")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TranscriptEntry {
    pub role: EntryRole,
    pub content: String,
}

impl TranscriptEntry {
    pub fn new(role: EntryRole, content: impl Into<String>) -> Self {
        Self {
            role,
            content: content.into(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EpochReason {
    Started,
    PrefixChanged,
    Compacted,
}

impl EpochReason {
    fn as_str(self) -> &'static str {
        match self {
            Self::Started => "started",
            Self::PrefixChanged => "prefix_changed",
            Self::Compacted => "compacted",
        }
    }

    fn parse(value: &str) -> Result<Self> {
        match value {
            "started" => Ok(Self::Started),
            "prefix_changed" => Ok(Self::PrefixChanged),
            "compacted" => Ok(Self::Compacted),
            _ => Err(StoreError::Corrupt("transcript_epochs.reason")),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Epoch {
    pub id: String,
    pub thread_id: String,
    pub prefix_fingerprint: String,
    pub reason: EpochReason,
    pub started_at: i64,
}

fn append(tx: &Transaction<'_>, epoch_id: &str, entries: &[TranscriptEntry]) -> Result<()> {
    let next: i64 = tx.query_row(
        "SELECT COALESCE(MAX(seq) + 1, 0) FROM transcript_entries WHERE epoch_id = ?1",
        [epoch_id],
        |row| row.get(0),
    )?;
    let mut stmt = tx.prepare_cached(
        "INSERT INTO transcript_entries (epoch_id, seq, role, content) VALUES (?1, ?2, ?3, ?4)",
    )?;
    for (seq, entry) in (next..).zip(entries) {
        stmt.execute(params![epoch_id, seq, entry.role.as_str(), entry.content])?;
    }
    Ok(())
}

impl Store {
    pub async fn latest_epoch(
        &self,
        thread_id: String,
    ) -> Result<Option<(Epoch, Vec<TranscriptEntry>)>> {
        self.with(move |conn| {
            let raw = conn
                .query_row(
                    "SELECT id, thread_id, prefix_fingerprint, reason, started_at
                     FROM transcript_epochs WHERE thread_id = ?1
                     ORDER BY started_at DESC, rowid DESC LIMIT 1",
                    [&thread_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, String>(3)?,
                            row.get::<_, i64>(4)?,
                        ))
                    },
                )
                .optional()?;
            let Some((id, thread_id, prefix_fingerprint, reason, started_at)) = raw else {
                return Ok(None);
            };
            let epoch = Epoch {
                id,
                thread_id,
                prefix_fingerprint,
                reason: EpochReason::parse(&reason)?,
                started_at,
            };
            let mut stmt = conn.prepare(
                "SELECT role, content FROM transcript_entries WHERE epoch_id = ?1 ORDER BY seq",
            )?;
            let entries = stmt
                .query_map([&epoch.id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?
                .map(|row| {
                    let (role, content) = row?;
                    Ok(TranscriptEntry {
                        role: EntryRole::parse(&role)?,
                        content,
                    })
                })
                .collect::<Result<Vec<_>>>()?;
            Ok(Some((epoch, entries)))
        })
        .await
    }

    pub async fn start_epoch(
        &self,
        thread_id: String,
        prefix_fingerprint: String,
        reason: EpochReason,
        carried: Vec<TranscriptEntry>,
    ) -> Result<Epoch> {
        self.with(move |conn| {
            let epoch = Epoch {
                id: new_id(),
                thread_id,
                prefix_fingerprint,
                reason,
                started_at: now_ms(),
            };
            let tx = conn.transaction()?;
            tx.execute(
                "INSERT INTO transcript_epochs (id, thread_id, prefix_fingerprint, reason, started_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    epoch.id,
                    epoch.thread_id,
                    epoch.prefix_fingerprint,
                    epoch.reason.as_str(),
                    epoch.started_at
                ],
            )?;
            append(&tx, &epoch.id, &carried)?;
            tx.commit()?;
            Ok(epoch)
        })
        .await
    }

    pub async fn append_transcript(
        &self,
        epoch_id: String,
        entries: Vec<TranscriptEntry>,
    ) -> Result<()> {
        self.with(move |conn| {
            let tx = conn.transaction()?;
            append(&tx, &epoch_id, &entries)?;
            tx.commit()?;
            Ok(())
        })
        .await
    }
}
