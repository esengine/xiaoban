use rusqlite::{OptionalExtension, Row, params};
use xiaoban_protocol::{CommandRun, Workspace};

use crate::{Result, Store, StoreError, new_id, now_ms};

const OUTPUT_CHARS: usize = 20_000;
const COMMANDS_KEPT: u32 = 200;

fn workspace(row: &Row<'_>) -> rusqlite::Result<Workspace> {
    Ok(Workspace {
        id: row.get(0)?,
        name: row.get(1)?,
        path: row.get(2)?,
        created_at: row.get(3)?,
        active_at: row.get(4)?,
    })
}

fn command(row: &Row<'_>) -> rusqlite::Result<CommandRun> {
    Ok(CommandRun {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        thread_id: row.get(2)?,
        command: row.get(3)?,
        by_user: row.get(4)?,
        exit_code: row.get(5)?,
        output: row.get(6)?,
        started_at: row.get(7)?,
        duration_ms: row.get(8)?,
    })
}

const WORKSPACE: &str = "SELECT id, name, path, created_at, active_at FROM workspaces";
const COMMAND: &str = "SELECT id, workspace_id, thread_id, command, by_user, exit_code, output, started_at, duration_ms FROM commands";

pub struct Baseline {
    pub path: String,
    pub content: Option<Vec<u8>>,
}

fn clip(output: &str) -> String {
    let count = output.chars().count();
    if count <= OUTPUT_CHARS {
        return output.to_owned();
    }
    output.chars().skip(count - OUTPUT_CHARS).collect()
}

impl Store {
    pub async fn list_workspaces(&self) -> Result<Vec<Workspace>> {
        self.with(|conn| {
            let mut stmt = conn.prepare(&format!("{WORKSPACE} ORDER BY active_at DESC"))?;
            let rows = stmt.query_map([], workspace)?;
            Ok(rows.collect::<rusqlite::Result<_>>()?)
        })
        .await
    }

    pub async fn workspace(&self, id: String) -> Result<Workspace> {
        self.with(move |conn| {
            conn.query_row(&format!("{WORKSPACE} WHERE id = ?1"), [&id], workspace)
                .optional()?
                .ok_or(StoreError::NotFound("workspace"))
        })
        .await
    }

    pub async fn add_workspace(&self, name: String, path: String) -> Result<Workspace> {
        self.with(move |conn| {
            if let Some(found) = conn
                .query_row(&format!("{WORKSPACE} WHERE path = ?1"), [&path], workspace)
                .optional()?
            {
                return Ok(found);
            }
            let now = now_ms();
            let created = Workspace {
                id: new_id(),
                name,
                path,
                created_at: now,
                active_at: now,
            };
            conn.execute(
                "INSERT INTO workspaces (id, name, path, created_at, active_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![created.id, created.name, created.path, created.created_at, created.active_at],
            )?;
            Ok(created)
        })
        .await
    }

    pub async fn rename_workspace(&self, id: String, name: String) -> Result<Workspace> {
        self.with(move |conn| {
            conn.execute("UPDATE workspaces SET name = ?2 WHERE id = ?1", params![id, name])?;
            conn.query_row(&format!("{WORKSPACE} WHERE id = ?1"), [&id], workspace)
                .optional()?
                .ok_or(StoreError::NotFound("workspace"))
        })
        .await
    }

    pub async fn touch_workspace(&self, id: String) -> Result<Workspace> {
        self.with(move |conn| {
            conn.execute(
                "UPDATE workspaces SET active_at = ?2 WHERE id = ?1",
                params![id, now_ms()],
            )?;
            conn.query_row(&format!("{WORKSPACE} WHERE id = ?1"), [&id], workspace)
                .optional()?
                .ok_or(StoreError::NotFound("workspace"))
        })
        .await
    }

    pub async fn remove_workspace(&self, id: String) -> Result<()> {
        self.with(move |conn| {
            conn.execute("DELETE FROM workspaces WHERE id = ?1", [&id])?;
            Ok(())
        })
        .await
    }

    pub async fn keep_baseline(
        &self,
        thread_id: String,
        workspace_id: String,
        path: String,
        content: Option<Vec<u8>>,
    ) -> Result<()> {
        self.with(move |conn| {
            conn.execute(
                "INSERT OR IGNORE INTO file_baselines (thread_id, path, workspace_id, content, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![thread_id, path, workspace_id, content, now_ms()],
            )?;
            Ok(())
        })
        .await
    }

    pub async fn baselines(&self, thread_id: String) -> Result<Vec<Baseline>> {
        self.with(move |conn| {
            let mut stmt = conn.prepare(
                "SELECT path, content FROM file_baselines WHERE thread_id = ?1 ORDER BY created_at, path",
            )?;
            let rows = stmt.query_map([&thread_id], |row| {
                Ok(Baseline {
                    path: row.get(0)?,
                    content: row.get(1)?,
                })
            })?;
            Ok(rows.collect::<rusqlite::Result<_>>()?)
        })
        .await
    }

    pub async fn drop_baseline(&self, thread_id: String, path: String) -> Result<()> {
        self.with(move |conn| {
            conn.execute(
                "DELETE FROM file_baselines WHERE thread_id = ?1 AND path = ?2",
                params![thread_id, path],
            )?;
            Ok(())
        })
        .await
    }

    pub async fn start_command(
        &self,
        workspace_id: String,
        thread_id: Option<String>,
        command_text: String,
        by_user: bool,
    ) -> Result<CommandRun> {
        self.with(move |conn| {
            let run = CommandRun {
                id: new_id(),
                workspace_id,
                thread_id,
                command: command_text,
                by_user,
                exit_code: None,
                output: String::new(),
                started_at: now_ms(),
                duration_ms: None,
            };
            conn.execute(
                "INSERT INTO commands (id, workspace_id, thread_id, command, by_user, exit_code, output, started_at, duration_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, NULL, '', ?6, NULL)",
                params![run.id, run.workspace_id, run.thread_id, run.command, run.by_user, run.started_at],
            )?;
            conn.execute(
                "DELETE FROM commands WHERE workspace_id = ?1 AND id NOT IN
                 (SELECT id FROM commands WHERE workspace_id = ?1 ORDER BY started_at DESC LIMIT ?2)",
                params![run.workspace_id, COMMANDS_KEPT],
            )?;
            Ok(run)
        })
        .await
    }

    pub async fn finish_command(
        &self,
        id: String,
        exit_code: Option<i32>,
        output: String,
    ) -> Result<CommandRun> {
        self.with(move |conn| {
            let output = clip(&output);
            conn.execute(
                "UPDATE commands SET exit_code = ?2, output = ?3, duration_ms = ?4 - started_at WHERE id = ?1",
                params![id, exit_code, output, now_ms()],
            )?;
            conn.query_row(&format!("{COMMAND} WHERE id = ?1"), [&id], command)
                .optional()?
                .ok_or(StoreError::NotFound("command"))
        })
        .await
    }

    pub async fn list_commands(&self, workspace_id: String) -> Result<Vec<CommandRun>> {
        self.with(move |conn| {
            let mut stmt = conn.prepare(&format!(
                "{COMMAND} WHERE workspace_id = ?1 ORDER BY started_at DESC LIMIT 100"
            ))?;
            let rows = stmt.query_map([&workspace_id], command)?;
            let mut runs: Vec<CommandRun> = rows.collect::<rusqlite::Result<_>>()?;
            runs.reverse();
            Ok(runs)
        })
        .await
    }
}
