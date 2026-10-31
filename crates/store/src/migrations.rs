use rusqlite::Connection;

use crate::Result;

const MIGRATIONS: &[&str] = &[
    r"
CREATE TABLE threads (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX messages_by_thread ON messages(thread_id, created_at);

CREATE TABLE devices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    platform TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    paired_at INTEGER NOT NULL,
    last_seen_at INTEGER,
    revoked_at INTEGER
);

CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
",
    r"
CREATE TABLE transcript_epochs (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    prefix_fingerprint TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('started', 'prefix_changed', 'compacted')),
    started_at INTEGER NOT NULL
);
CREATE INDEX epochs_by_thread ON transcript_epochs(thread_id, started_at);

CREATE TABLE transcript_entries (
    epoch_id TEXT NOT NULL REFERENCES transcript_epochs(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    PRIMARY KEY (epoch_id, seq)
) WITHOUT ROWID;

CREATE TABLE turn_usage (
    turn_id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    epoch_id TEXT NOT NULL REFERENCES transcript_epochs(id) ON DELETE CASCADE,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cached_tokens INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
",
    r"
CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    topic TEXT NOT NULL UNIQUE,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
",
    r"
ALTER TABLE transcript_epochs ADD COLUMN memory_snapshot TEXT;
",
];

pub fn apply(conn: &mut Connection) -> Result<()> {
    let current: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    let tx = conn.transaction()?;
    for (version, sql) in (1_i64..).zip(MIGRATIONS) {
        if version <= current {
            continue;
        }
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", version)?;
    }
    tx.commit()?;
    Ok(())
}
