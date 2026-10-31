use rusqlite::{OptionalExtension, Row, params};
use xiaoban_protocol::{Device, Platform};

use crate::{Result, Store, StoreError, now_ms};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredDevice {
    pub device: Device,
    pub token_hash: String,
}

fn platform_to_str(platform: Platform) -> &'static str {
    match platform {
        Platform::Desktop => "desktop",
        Platform::Ios => "ios",
        Platform::Android => "android",
        Platform::Cli => "cli",
    }
}

fn platform_from_str(value: &str) -> Result<Platform> {
    Ok(match value {
        "desktop" => Platform::Desktop,
        "ios" => Platform::Ios,
        "android" => Platform::Android,
        "cli" => Platform::Cli,
        _ => return Err(StoreError::Corrupt("devices.platform")),
    })
}

type RawDevice = (String, String, String, i64, Option<i64>);

fn from_row(row: &Row<'_>) -> rusqlite::Result<RawDevice> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
    ))
}

fn into_device((id, name, platform, paired_at, last_seen_at): RawDevice) -> Result<Device> {
    Ok(Device {
        id,
        name,
        platform: platform_from_str(&platform)?,
        paired_at,
        last_seen_at,
    })
}

impl Store {
    pub async fn pair_device(
        &self,
        id: String,
        name: String,
        platform: Platform,
        token_hash: String,
    ) -> Result<Device> {
        self.with(move |conn| {
            let paired_at = now_ms();
            conn.execute(
                "INSERT INTO devices (id, name, platform, token_hash, paired_at, last_seen_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5)
                 ON CONFLICT(id) DO UPDATE SET name = ?2, platform = ?3, token_hash = ?4,
                     paired_at = ?5, last_seen_at = ?5, revoked_at = NULL",
                params![id, name, platform_to_str(platform), token_hash, paired_at],
            )?;
            Ok(Device {
                id,
                name,
                platform,
                paired_at,
                last_seen_at: Some(paired_at),
            })
        })
        .await
    }

    pub async fn device_by_token_hash(&self, token_hash: String) -> Result<Option<StoredDevice>> {
        self.with(move |conn| {
            let raw = conn
                .query_row(
                    "SELECT id, name, platform, paired_at, last_seen_at FROM devices
                     WHERE token_hash = ?1 AND revoked_at IS NULL",
                    [&token_hash],
                    from_row,
                )
                .optional()?;
            raw.map(|raw| {
                Ok(StoredDevice {
                    device: into_device(raw)?,
                    token_hash: token_hash.clone(),
                })
            })
            .transpose()
        })
        .await
    }

    pub async fn mark_device_seen(&self, id: String) -> Result<()> {
        self.with(move |conn| {
            conn.execute(
                "UPDATE devices SET last_seen_at = ?2 WHERE id = ?1",
                params![id, now_ms()],
            )?;
            Ok(())
        })
        .await
    }

    pub async fn list_devices(&self) -> Result<Vec<Device>> {
        self.with(|conn| {
            let mut stmt = conn.prepare(
                "SELECT id, name, platform, paired_at, last_seen_at FROM devices
                 WHERE revoked_at IS NULL ORDER BY paired_at",
            )?;
            let rows = stmt.query_map([], from_row)?;
            rows.map(|row| into_device(row?)).collect()
        })
        .await
    }

    pub async fn revoke_device(&self, id: String) -> Result<()> {
        self.with(move |conn| {
            let changed = conn.execute(
                "UPDATE devices SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL",
                params![id, now_ms()],
            )?;
            if changed == 0 {
                return Err(StoreError::NotFound("device"));
            }
            Ok(())
        })
        .await
    }
}
