use xiaoban_protocol::{MemoryTopic, Platform, Role, Usage};
use xiaoban_store::{EntryRole, EpochReason, Store, TranscriptEntry};

#[tokio::test]
async fn threads_and_messages_round_trip() {
    let store = Store::open_in_memory().unwrap();
    let thread = store.create_thread(Some("新家装修".into())).await.unwrap();
    store
        .append_message(thread.id.clone(), Role::User, "木工几号进场".into())
        .await
        .unwrap();
    store
        .append_message(thread.id.clone(), Role::Assistant, "11 月 6 日".into())
        .await
        .unwrap();

    let messages = store.list_messages(thread.id.clone()).await.unwrap();
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0].role, Role::User);
    assert_eq!(messages[1].text, "11 月 6 日");
    assert_eq!(store.list_threads().await.unwrap(), vec![thread]);
}

#[tokio::test]
async fn revoked_devices_cannot_authenticate() {
    let store = Store::open_in_memory().unwrap();
    store
        .pair_device("d1".into(), "阿哲的手机".into(), Platform::Ios, "h1".into())
        .await
        .unwrap();
    assert!(
        store
            .device_by_token_hash("h1".into())
            .await
            .unwrap()
            .is_some()
    );

    store.revoke_device("d1".into()).await.unwrap();
    assert!(
        store
            .device_by_token_hash("h1".into())
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(store.list_devices().await.unwrap(), Vec::new());
}

#[tokio::test]
async fn settings_upsert() {
    let store = Store::open_in_memory().unwrap();
    assert_eq!(store.setting("hub_id").await.unwrap(), None);
    store.set_setting("hub_id", "a".into()).await.unwrap();
    store.set_setting("hub_id", "b".into()).await.unwrap();
    assert_eq!(store.setting("hub_id").await.unwrap().as_deref(), Some("b"));
}

#[tokio::test]
async fn transcript_is_append_only_and_carried_across_epochs() {
    let store = Store::open_in_memory().unwrap();
    let thread = store.create_thread(Some("出门".into())).await.unwrap();
    assert!(
        store
            .latest_epoch(thread.id.clone())
            .await
            .unwrap()
            .is_none()
    );

    let first = store
        .start_epoch(
            thread.id.clone(),
            "aaaa".into(),
            EpochReason::Started,
            None,
            Vec::new(),
        )
        .await
        .unwrap();
    store
        .append_transcript(
            first.id.clone(),
            vec![
                TranscriptEntry::new(EntryRole::User, "明天几点出门"),
                TranscriptEntry::new(EntryRole::Assistant, "7:40"),
            ],
        )
        .await
        .unwrap();
    store
        .append_transcript(
            first.id.clone(),
            vec![TranscriptEntry::new(EntryRole::User, "带伞吗")],
        )
        .await
        .unwrap();

    let (epoch, entries) = store
        .latest_epoch(thread.id.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(epoch, first);
    assert_eq!(
        entries
            .iter()
            .map(|e| e.content.as_str())
            .collect::<Vec<_>>(),
        ["明天几点出门", "7:40", "带伞吗"]
    );

    let second = store
        .start_epoch(
            thread.id.clone(),
            "bbbb".into(),
            EpochReason::PrefixChanged,
            Some("称呼：阿哲".into()),
            entries.clone(),
        )
        .await
        .unwrap();
    let (latest, carried) = store.latest_epoch(thread.id).await.unwrap().unwrap();
    assert_eq!(latest.id, second.id);
    assert_eq!(latest.reason, EpochReason::PrefixChanged);
    assert_eq!(latest.memory_snapshot.as_deref(), Some("称呼：阿哲"));
    assert_eq!(carried, entries);
}

#[tokio::test]
async fn usage_totals_sum_every_turn() {
    let store = Store::open_in_memory().unwrap();
    let thread = store.create_thread(None).await.unwrap();
    let epoch = store
        .start_epoch(
            thread.id.clone(),
            "f".into(),
            EpochReason::Started,
            None,
            Vec::new(),
        )
        .await
        .unwrap();
    for (turn, cached) in [("u1", 0), ("u2", 90)] {
        store
            .record_turn_usage(
                turn.into(),
                thread.id.clone(),
                epoch.id.clone(),
                Usage {
                    input_tokens: 100,
                    output_tokens: 10,
                    cached_tokens: cached,
                },
            )
            .await
            .unwrap();
    }
    let totals = store.usage_totals().await.unwrap();
    assert_eq!(totals.turns, 2);
    assert_eq!(
        totals.usage,
        Usage {
            input_tokens: 200,
            output_tokens: 20,
            cached_tokens: 90
        }
    );
}

#[tokio::test]
async fn remembering_a_topic_again_replaces_the_value() {
    let store = Store::open_in_memory().unwrap();
    let first = store
        .remember(MemoryTopic::PreferredName, "阿哲".into())
        .await
        .unwrap();
    store
        .remember(MemoryTopic::Household, "老婆和儿子".into())
        .await
        .unwrap();
    let updated = store
        .remember(MemoryTopic::PreferredName, "哲哥".into())
        .await
        .unwrap();
    assert_eq!(updated.id, first.id);
    let memories = store.list_memories().await.unwrap();
    assert_eq!(memories.len(), 2);
    assert!(memories.iter().any(|m| m.value == "哲哥"));
}
