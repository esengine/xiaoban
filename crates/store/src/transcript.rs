use rusqlite::{OptionalExtension, Transaction, params};

use crate::{Result, Store, StoreError, new_id, now_ms};

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
    pub memory_snapshot: Option<String>,
}

fn append(tx: &Transaction<'_>, epoch_id: &str, messages: &[String]) -> Result<()> {
    let next: i64 = tx.query_row(
        "SELECT COALESCE(MAX(seq) + 1, 0) FROM transcript_messages WHERE epoch_id = ?1",
        [epoch_id],
        |row| row.get(0),
    )?;
    let mut stmt = tx.prepare_cached(
        "INSERT INTO transcript_messages (epoch_id, seq, message) VALUES (?1, ?2, ?3)",
    )?;
    for (seq, message) in (next..).zip(messages) {
        stmt.execute(params![epoch_id, seq, message])?;
    }
    Ok(())
}

type RawEpoch = (String, String, String, String, i64, Option<String>);

impl Store {
    pub async fn latest_epoch(&self, thread_id: String) -> Result<Option<(Epoch, Vec<String>)>> {
        self.with(move |conn| {
            let raw: Option<RawEpoch> = conn
                .query_row(
                    "SELECT id, thread_id, prefix_fingerprint, reason, started_at, memory_snapshot
                     FROM transcript_epochs WHERE thread_id = ?1
                     ORDER BY started_at DESC, rowid DESC LIMIT 1",
                    [&thread_id],
                    |row| {
                        Ok((
                            row.get(0)?,
                            row.get(1)?,
                            row.get(2)?,
                            row.get(3)?,
                            row.get(4)?,
                            row.get(5)?,
                        ))
                    },
                )
                .optional()?;
            let Some((id, thread_id, prefix_fingerprint, reason, started_at, memory_snapshot)) =
                raw
            else {
                return Ok(None);
            };
            let epoch = Epoch {
                id,
                thread_id,
                prefix_fingerprint,
                reason: EpochReason::parse(&reason)?,
                started_at,
                memory_snapshot,
            };
            let mut stmt = conn.prepare(
                "SELECT message FROM transcript_messages WHERE epoch_id = ?1 ORDER BY seq",
            )?;
            let messages = stmt
                .query_map([&epoch.id], |row| row.get(0))?
                .collect::<rusqlite::Result<Vec<String>>>()?;
            Ok(Some((epoch, messages)))
        })
        .await
    }

    pub async fn start_epoch(
        &self,
        thread_id: String,
        prefix_fingerprint: String,
        reason: EpochReason,
        memory_snapshot: Option<String>,
        carried: Vec<String>,
    ) -> Result<Epoch> {
        self.with(move |conn| {
            let epoch = Epoch {
                id: new_id(),
                thread_id,
                prefix_fingerprint,
                reason,
                started_at: now_ms(),
                memory_snapshot,
            };
            let tx = conn.transaction()?;
            tx.execute(
                "INSERT INTO transcript_epochs
                 (id, thread_id, prefix_fingerprint, reason, started_at, memory_snapshot)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    epoch.id,
                    epoch.thread_id,
                    epoch.prefix_fingerprint,
                    epoch.reason.as_str(),
                    epoch.started_at,
                    epoch.memory_snapshot
                ],
            )?;
            append(&tx, &epoch.id, &carried)?;
            tx.commit()?;
            Ok(epoch)
        })
        .await
    }

    pub async fn set_memory_snapshot(
        &self,
        epoch_id: String,
        snapshot: Option<String>,
    ) -> Result<()> {
        self.with(move |conn| {
            conn.execute(
                "UPDATE transcript_epochs SET memory_snapshot = ?2 WHERE id = ?1",
                params![epoch_id, snapshot],
            )?;
            Ok(())
        })
        .await
    }

    pub async fn append_transcript(&self, epoch_id: String, messages: Vec<String>) -> Result<()> {
        self.with(move |conn| {
            let tx = conn.transaction()?;
            append(&tx, &epoch_id, &messages)?;
            tx.commit()?;
            Ok(())
        })
        .await
    }
}
