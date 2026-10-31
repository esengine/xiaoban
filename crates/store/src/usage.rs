use rusqlite::params;
use xiaoban_protocol::Usage;

use crate::{Result, Store, now_ms};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct UsageTotals {
    pub usage: Usage,
    pub turns: u32,
}

impl Store {
    pub async fn record_turn_usage(
        &self,
        turn_id: String,
        thread_id: String,
        epoch_id: String,
        usage: Usage,
    ) -> Result<()> {
        self.with(move |conn| {
            conn.execute(
                "INSERT INTO turn_usage
                 (turn_id, thread_id, epoch_id, input_tokens, output_tokens, cached_tokens, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    turn_id,
                    thread_id,
                    epoch_id,
                    usage.input_tokens,
                    usage.output_tokens,
                    usage.cached_tokens,
                    now_ms()
                ],
            )?;
            Ok(())
        })
        .await
    }

    pub async fn usage_totals(&self) -> Result<UsageTotals> {
        self.with(|conn| {
            Ok(conn.query_row(
                "SELECT COALESCE(SUM(input_tokens), 0), COALESCE(SUM(output_tokens), 0),
                        COALESCE(SUM(cached_tokens), 0), COUNT(*) FROM turn_usage",
                [],
                |row| {
                    let total = |index| {
                        row.get::<_, i64>(index)
                            .map(|value| u32::try_from(value).unwrap_or(u32::MAX))
                    };
                    Ok(UsageTotals {
                        usage: Usage {
                            input_tokens: total(0)?,
                            output_tokens: total(1)?,
                            cached_tokens: total(2)?,
                        },
                        turns: total(3)?,
                    })
                },
            )?)
        })
        .await
    }
}
