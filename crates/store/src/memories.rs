use rusqlite::{Connection, OptionalExtension, Row, params};
use xiaoban_protocol::{Memory, MemoryCategory, MemoryGalaxy, MemoryKind, Usage};

use crate::{Result, Store, new_id, now_ms};

const COLUMNS: &str = "m.id, m.subject, m.value, m.updated_at, m.category, m.uses, m.last_used_at,
     g.name, m.kind, m.importance, m.pinned, m.aliases, m.expires_at";
const FROM: &str = "FROM memories m LEFT JOIN memory_galaxies g ON g.id = m.galaxy_id";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewMemory {
    pub subject: String,
    pub value: String,
    pub category: MemoryCategory,
    pub galaxy: Option<String>,
    pub kind: MemoryKind,
    pub importance: u8,
    pub pinned: bool,
    pub aliases: Vec<String>,
    pub expires_at: Option<i64>,
    pub replaces: Option<String>,
}

impl NewMemory {
    pub fn simple(
        subject: impl Into<String>,
        value: impl Into<String>,
        category: MemoryCategory,
    ) -> Self {
        Self {
            subject: subject.into(),
            value: value.into(),
            category,
            galaxy: None,
            kind: MemoryKind::Fact,
            importance: 2,
            pinned: false,
            aliases: Vec::new(),
            expires_at: None,
            replaces: None,
        }
    }
}

fn list(raw: &str) -> Vec<String> {
    serde_json::from_str(raw).unwrap_or_default()
}

fn from_row(row: &Row<'_>) -> rusqlite::Result<Memory> {
    Ok(Memory {
        id: row.get(0)?,
        subject: row.get(1)?,
        value: row.get(2)?,
        updated_at: row.get(3)?,
        category: MemoryCategory::parse(&row.get::<_, String>(4)?),
        uses: row.get(5)?,
        last_used_at: row.get(6)?,
        galaxy: row.get(7)?,
        kind: MemoryKind::parse(&row.get::<_, String>(8)?),
        importance: row.get(9)?,
        pinned: row.get(10)?,
        aliases: list(&row.get::<_, String>(11)?),
        expires_at: row.get(12)?,
    })
}

fn galaxy_row(row: &Row<'_>) -> rusqlite::Result<MemoryGalaxy> {
    Ok(MemoryGalaxy {
        id: row.get(0)?,
        cluster: MemoryCategory::parse(&row.get::<_, String>(1)?),
        name: row.get(2)?,
        aliases: list(&row.get::<_, String>(3)?),
        summary: row.get(4)?,
    })
}

fn galaxy_id(conn: &Connection, name: &str, cluster: MemoryCategory) -> rusqlite::Result<String> {
    let found: Option<String> = conn
        .query_row(
            "SELECT id FROM memory_galaxies WHERE lower(name) = lower(?1)
             OR EXISTS (SELECT 1 FROM json_each(aliases) WHERE lower(value) = lower(?1))
             LIMIT 1",
            [name],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(id) = found {
        conn.execute("UPDATE memory_galaxies SET dirty = 1 WHERE id = ?1", [&id])?;
        return Ok(id);
    }
    let id = new_id();
    conn.execute(
        "INSERT INTO memory_galaxies (id, cluster, name, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, cluster.as_str(), name, now_ms()],
    )?;
    Ok(id)
}

fn one(conn: &Connection, id: &str) -> rusqlite::Result<Memory> {
    conn.query_row(
        &format!("SELECT {COLUMNS} {FROM} WHERE m.id = ?1"),
        [id],
        from_row,
    )
}

impl Store {
    pub async fn remember(&self, memory: NewMemory) -> Result<Memory> {
        self.with(move |conn| {
            let tx = conn.transaction()?;
            let galaxy = memory
                .galaxy
                .as_deref()
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(|name| galaxy_id(&tx, name, memory.category))
                .transpose()?;
            let aliases = serde_json::to_string(&memory.aliases).unwrap_or_else(|_| "[]".into());
            tx.execute(
                "INSERT INTO memories (id, subject, value, updated_at, category, galaxy_id, kind,
                     importance, pinned, aliases, expires_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                 ON CONFLICT(subject) DO UPDATE SET value = ?3, updated_at = ?4, category = ?5,
                     galaxy_id = COALESCE(?6, galaxy_id), kind = ?7, importance = ?8,
                     pinned = MAX(pinned, ?9), aliases = ?10, expires_at = ?11, superseded_by = NULL",
                params![
                    new_id(),
                    memory.subject,
                    memory.value,
                    now_ms(),
                    memory.category.as_str(),
                    galaxy,
                    memory.kind.as_str(),
                    memory.importance.clamp(1, 3),
                    memory.pinned,
                    aliases,
                    memory.expires_at
                ],
            )?;
            let id: String =
                tx.query_row("SELECT id FROM memories WHERE subject = ?1", [&memory.subject], |row| row.get(0))?;
            if let Some(old) = memory.replaces.as_deref().filter(|old| *old != memory.subject) {
                tx.execute(
                    "UPDATE memories SET superseded_by = ?2 WHERE subject = ?1 AND id != ?2",
                    params![old, id],
                )?;
            }
            let saved = one(&tx, &id)?;
            tx.commit()?;
            Ok(saved)
        })
        .await
    }

    pub async fn list_memories(&self) -> Result<Vec<Memory>> {
        self.with(|conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {COLUMNS} {FROM} WHERE m.superseded_by IS NULL ORDER BY m.rowid"
            ))?;
            let rows = stmt.query_map([], from_row)?;
            Ok(rows.collect::<rusqlite::Result<_>>()?)
        })
        .await
    }

    pub async fn list_galaxies(&self) -> Result<Vec<MemoryGalaxy>> {
        self.with(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, cluster, name, aliases, summary FROM memory_galaxies ORDER BY rowid",
            )?;
            let rows = stmt.query_map([], galaxy_row)?;
            Ok(rows.collect::<rusqlite::Result<_>>()?)
        })
        .await
    }

    pub async fn dirty_galaxies(&self) -> Result<Vec<MemoryGalaxy>> {
        self.with(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, cluster, name, aliases, summary FROM memory_galaxies WHERE dirty = 1",
            )?;
            let rows = stmt.query_map([], galaxy_row)?;
            Ok(rows.collect::<rusqlite::Result<_>>()?)
        })
        .await
    }

    pub async fn galaxy_memories(&self, galaxy_id: String) -> Result<Vec<Memory>> {
        self.with(move |conn| {
            let mut stmt = conn.prepare(&format!(
                "SELECT {COLUMNS} {FROM} WHERE m.galaxy_id = ?1 AND m.superseded_by IS NULL ORDER BY m.rowid"
            ))?;
            let rows = stmt.query_map([galaxy_id], from_row)?;
            Ok(rows.collect::<rusqlite::Result<_>>()?)
        })
        .await
    }

    pub async fn tidy_galaxy(
        &self,
        galaxy_id: String,
        summary: String,
        aliases: Vec<String>,
    ) -> Result<()> {
        self.with(move |conn| {
            conn.execute(
                "UPDATE memory_galaxies SET summary = ?2, aliases = ?3, dirty = 0, updated_at = ?4 WHERE id = ?1",
                params![
                    galaxy_id,
                    summary,
                    serde_json::to_string(&aliases).unwrap_or_else(|_| "[]".into()),
                    now_ms()
                ],
            )?;
            Ok(())
        })
        .await
    }

    pub async fn supersede_memory(&self, old: String, new: String) -> Result<()> {
        self.with(move |conn| {
            conn.execute(
                "UPDATE memories SET superseded_by = ?2 WHERE id = ?1 AND id != ?2",
                params![old, new],
            )?;
            Ok(())
        })
        .await
    }

    pub async fn set_memory_aliases(&self, id: String, aliases: Vec<String>) -> Result<()> {
        self.with(move |conn| {
            conn.execute(
                "UPDATE memories SET aliases = ?2 WHERE id = ?1",
                params![
                    id,
                    serde_json::to_string(&aliases).unwrap_or_else(|_| "[]".into())
                ],
            )?;
            Ok(())
        })
        .await
    }

    pub async fn place_memory(
        &self,
        id: String,
        galaxy: String,
        cluster: MemoryCategory,
    ) -> Result<()> {
        self.with(move |conn| {
            let tx = conn.transaction()?;
            let galaxy = galaxy_id(&tx, &galaxy, cluster)?;
            tx.execute(
                "UPDATE memories SET galaxy_id = ?2, category = ?3 WHERE id = ?1",
                params![id, galaxy, cluster.as_str()],
            )?;
            tx.commit()?;
            Ok(())
        })
        .await
    }

    pub async fn set_memory_pinned(&self, id: String, pinned: bool) -> Result<Option<Memory>> {
        self.with(move |conn| {
            conn.execute(
                "UPDATE memories SET pinned = ?2 WHERE id = ?1",
                params![id, pinned],
            )?;
            Ok(one(conn, &id).optional()?)
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
                used.push(one(&tx, id)?);
            }
            for (index, a) in ids.iter().enumerate() {
                for b in &ids[index + 1..] {
                    let (a, b) = if a < b { (a, b) } else { (b, a) };
                    tx.execute(
                        "INSERT INTO memory_links (a, b, weight) VALUES (?1, ?2, 1)
                         ON CONFLICT(a, b) DO UPDATE SET weight = weight + 1",
                        params![a, b],
                    )?;
                }
            }
            tx.commit()?;
            Ok(used)
        })
        .await
    }

    pub async fn memory_links(&self) -> Result<Vec<(String, String, f64)>> {
        self.with(|conn| {
            let mut stmt = conn.prepare("SELECT a, b, weight FROM memory_links")?;
            let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?;
            Ok(rows.collect::<rusqlite::Result<_>>()?)
        })
        .await
    }

    pub async fn record_memory_usage(&self, usage: Usage) -> Result<()> {
        self.with(move |conn| {
            conn.execute(
                "INSERT INTO memory_usage (created_at, input_tokens, output_tokens, cached_tokens)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    now_ms(),
                    usage.input_tokens,
                    usage.output_tokens,
                    usage.cached_tokens
                ],
            )?;
            Ok(())
        })
        .await
    }

    pub async fn memory_usage_total(&self) -> Result<Usage> {
        self.with(|conn| {
            Ok(conn.query_row(
                "SELECT COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0),
                        COALESCE(SUM(cached_tokens), 0) FROM memory_usage",
                [],
                |row| {
                    let total = |index| {
                        row.get::<_, i64>(index)
                            .map(|value| u32::try_from(value).unwrap_or(u32::MAX))
                    };
                    Ok(Usage {
                        input_tokens: total(0)?,
                        output_tokens: total(1)?,
                        cached_tokens: total(2)?,
                    })
                },
            )?)
        })
        .await
    }
}
