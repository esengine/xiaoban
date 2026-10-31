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
    r"
ALTER TABLE memories RENAME COLUMN topic TO subject;

CREATE TABLE transcript_messages (
    epoch_id TEXT NOT NULL REFERENCES transcript_epochs(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    message TEXT NOT NULL,
    PRIMARY KEY (epoch_id, seq)
) WITHOUT ROWID;
INSERT INTO transcript_messages (epoch_id, seq, message)
    SELECT epoch_id, seq, json_object('role', role, 'content', content) FROM transcript_entries;
DROP TABLE transcript_entries;
",
    r"
ALTER TABLE messages ADD COLUMN quote TEXT;
ALTER TABLE messages ADD COLUMN replaces TEXT REFERENCES messages(id) ON DELETE SET NULL;
",
    r"
ALTER TABLE messages ADD COLUMN attachment TEXT;
CREATE TABLE trips (
    id TEXT NOT NULL,
    version INTEGER NOT NULL,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (id, version)
) WITHOUT ROWID;
CREATE INDEX trips_thread ON trips(thread_id);
CREATE TABLE declined_services (
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    service TEXT NOT NULL,
    PRIMARY KEY (thread_id, service)
) WITHOUT ROWID;
",
    r"
ALTER TABLE messages ADD COLUMN files TEXT;
",
];

pub fn apply(conn: &mut Connection) -> Result<()> {
    apply_up_to(conn, MIGRATIONS.len())
}

fn apply_up_to(conn: &mut Connection, target: usize) -> Result<()> {
    let current: i64 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    let tx = conn.transaction()?;
    for (version, sql) in (1_i64..).zip(&MIGRATIONS[..target]) {
        if version <= current {
            continue;
        }
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", version)?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transcript_entries_migrate_to_canonical_message_json() {
        let mut conn = Connection::open_in_memory().unwrap();
        apply_up_to(&mut conn, 4).unwrap();
        conn.execute_batch(
            "INSERT INTO threads (id, title, created_at, updated_at) VALUES ('t', NULL, 0, 0);
             INSERT INTO transcript_epochs (id, thread_id, prefix_fingerprint, reason, started_at)
                 VALUES ('e', 't', 'f', 'started', 0);
             INSERT INTO transcript_entries (epoch_id, seq, role, content)
                 VALUES ('e', 0, 'user', '明天几点出门\"'), ('e', 1, 'assistant', '7:40');",
        )
        .unwrap();
        apply(&mut conn).unwrap();

        let messages: Vec<String> = conn
            .prepare("SELECT message FROM transcript_messages ORDER BY seq")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(
            messages,
            [
                r#"{"role":"user","content":"明天几点出门\""}"#,
                r#"{"role":"assistant","content":"7:40"}"#
            ]
        );
    }
}
