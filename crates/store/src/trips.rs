use rusqlite::{OptionalExtension, params};
use xiaoban_protocol::{ServiceId, Trip};

use crate::{Result, Store, StoreError, new_id, now_ms};

fn decode(json: &str) -> Result<Trip> {
    serde_json::from_str(json).map_err(|_| StoreError::Corrupt("trips.data"))
}

impl Store {
    pub async fn save_trip(&self, id: Option<String>, mut trip: Trip) -> Result<Trip> {
        self.with(move |conn| {
            let tx = conn.transaction()?;
            let id = id.unwrap_or_else(new_id);
            let previous: Option<u32> = tx.query_row(
                "SELECT MAX(version) FROM trips WHERE id = ?1 AND thread_id = ?2",
                params![id, trip.thread_id],
                |row| row.get(0),
            )?;
            trip.id = id;
            trip.version = previous.map_or(1, |version| version + 1);
            trip.created_at = now_ms();
            let data = serde_json::to_string(&trip).map_err(|_| StoreError::Corrupt("trips.data"))?;
            tx.execute(
                "INSERT INTO trips (id, version, thread_id, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![trip.id, trip.version, trip.thread_id, data, trip.created_at],
            )?;
            tx.commit()?;
            Ok(trip)
        })
        .await
    }

    pub async fn trip(&self, id: String, version: Option<u32>) -> Result<Option<(Trip, u32)>> {
        self.with(move |conn| {
            let latest: Option<u32> = conn.query_row(
                "SELECT MAX(version) FROM trips WHERE id = ?1",
                [&id],
                |row| row.get(0),
            )?;
            let Some(latest) = latest else {
                return Ok(None);
            };
            let data: Option<String> = conn
                .query_row(
                    "SELECT data FROM trips WHERE id = ?1 AND version = ?2",
                    params![id, version.unwrap_or(latest)],
                    |row| row.get(0),
                )
                .optional()?;
            data.map(|data| Ok((decode(&data)?, latest))).transpose()
        })
        .await
    }

    pub async fn latest_trip_in_thread(&self, thread_id: String) -> Result<Option<Trip>> {
        self.with(move |conn| {
            let data: Option<String> = conn
                .query_row(
                    "SELECT data FROM trips WHERE thread_id = ?1 ORDER BY created_at DESC, version DESC LIMIT 1",
                    [thread_id],
                    |row| row.get(0),
                )
                .optional()?;
            data.as_deref().map(decode).transpose()
        })
        .await
    }

    pub async fn recent_trips(&self, limit: u32) -> Result<Vec<Trip>> {
        self.with(move |conn| {
            let mut statement = conn.prepare(
                "SELECT t.data FROM trips t WHERE t.version = (SELECT MAX(version) FROM trips WHERE id = t.id) ORDER BY t.created_at DESC LIMIT ?1",
            )?;
            let rows = statement.query_map([limit], |row| row.get::<_, String>(0))?;
            let mut trips = Vec::new();
            for data in rows {
                trips.push(decode(&data?)?);
            }
            Ok(trips)
        })
        .await
    }

    pub async fn decline_service(&self, thread_id: String, service: ServiceId) -> Result<()> {
        self.with(move |conn| {
            conn.execute(
                "INSERT OR IGNORE INTO declined_services (thread_id, service) VALUES (?1, ?2)",
                params![thread_id, service.as_str()],
            )?;
            Ok(())
        })
        .await
    }

    pub async fn service_declined(&self, thread_id: String, service: ServiceId) -> Result<bool> {
        self.with(move |conn| {
            Ok(conn
                .query_row(
                    "SELECT 1 FROM declined_services WHERE thread_id = ?1 AND service = ?2",
                    params![thread_id, service.as_str()],
                    |_| Ok(()),
                )
                .optional()?
                .is_some())
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn trip(thread_id: &str) -> Trip {
        Trip {
            id: String::new(),
            thread_id: thread_id.into(),
            version: 0,
            title: "杭州 · 3 天".into(),
            city: "杭州".into(),
            timezone: None,
            party: "2 大 1 小".into(),
            needs: None,
            reminder: None,
            cost: None,
            verified: true,
            days: Vec::new(),
            created_at: 0,
        }
    }

    #[tokio::test]
    async fn saving_again_creates_a_new_version() {
        let store = Store::open_in_memory().unwrap();
        let thread = store.create_thread(None).await.unwrap();
        let first = store.save_trip(None, trip(&thread.id)).await.unwrap();
        assert_eq!(first.version, 1);
        let second = store
            .save_trip(Some(first.id.clone()), trip(&thread.id))
            .await
            .unwrap();
        assert_eq!((second.id.as_str(), second.version), (first.id.as_str(), 2));
        let (old, latest) = store
            .trip(first.id.clone(), Some(1))
            .await
            .unwrap()
            .unwrap();
        assert_eq!((old.version, latest), (1, 2));
        let newest = store
            .latest_trip_in_thread(thread.id.clone())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(newest.version, 2);
    }

    #[tokio::test]
    async fn declined_services_are_per_thread() {
        let store = Store::open_in_memory().unwrap();
        let first = store.create_thread(None).await.unwrap();
        let second = store.create_thread(None).await.unwrap();
        store
            .decline_service(first.id.clone(), ServiceId::WebSearch)
            .await
            .unwrap();
        assert!(
            store
                .service_declined(first.id, ServiceId::WebSearch)
                .await
                .unwrap()
        );
        assert!(
            !store
                .service_declined(second.id, ServiceId::WebSearch)
                .await
                .unwrap()
        );
    }
}
