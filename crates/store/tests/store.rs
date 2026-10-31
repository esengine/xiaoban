use xiaoban_protocol::{MemoryCategory, Platform, Quote, Role, Usage};
use xiaoban_store::{EpochReason, NewMemory, NewMessage, Store};

#[tokio::test]
async fn threads_and_messages_round_trip() {
    let store = Store::open_in_memory().unwrap();
    let thread = store.create_thread(Some("新家装修".into())).await.unwrap();
    store
        .append_message(thread.id.clone(), NewMessage::user("木工几号进场"))
        .await
        .unwrap();
    store
        .append_message(thread.id.clone(), NewMessage::assistant("11 月 6 日"))
        .await
        .unwrap();

    let messages = store.list_messages(thread.id.clone()).await.unwrap();
    assert_eq!(messages.len(), 2);
    assert_eq!(messages[0].role, Role::User);
    assert_eq!(messages[1].text, "11 月 6 日");
    let listed = store.list_threads().await.unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, thread.id);
    assert_eq!(listed[0].last_message.as_deref(), Some("11 月 6 日"));
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
                r#"{"role":"user","content":"明天几点出门"}"#.to_owned(),
                r#"{"role":"assistant","content":"7:40"}"#.to_owned(),
            ],
        )
        .await
        .unwrap();
    store
        .append_transcript(
            first.id.clone(),
            vec![r#"{"role":"user","content":"带伞吗"}"#.to_owned()],
        )
        .await
        .unwrap();

    let (epoch, entries) = store
        .latest_epoch(thread.id.clone())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(epoch, first);
    assert_eq!(entries.len(), 3);
    assert!(entries[2].contains("带伞吗"));

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
        .remember(NewMemory::simple("称呼", "阿哲", MemoryCategory::Other))
        .await
        .unwrap();
    store
        .remember(NewMemory::simple(
            "家里",
            "老婆和儿子",
            MemoryCategory::Family,
        ))
        .await
        .unwrap();
    let updated = store
        .remember(NewMemory::simple("称呼", "哲哥", MemoryCategory::Other))
        .await
        .unwrap();
    assert_eq!(updated.id, first.id);
    let memories = store.list_memories().await.unwrap();
    assert_eq!(memories.len(), 2);
    assert_eq!(memories[0].subject, "称呼");
    assert_eq!(memories[0].value, "哲哥");
    assert_eq!(memories[1].category, MemoryCategory::Family);
    let used = store
        .mark_memories_used(vec![memories[1].id.clone()])
        .await
        .unwrap();
    assert_eq!(used[0].uses, 1);
    assert!(used[0].last_used_at.is_some());
}

#[tokio::test]
async fn quotes_and_versions_round_trip() {
    let store = Store::open_in_memory().unwrap();
    let thread = store.create_thread(None).await.unwrap();
    store
        .append_message(
            thread.id.clone(),
            NewMessage::user("那 8 点半出门来得及吗").quoting(Some(Quote::plain("9 点前到"))),
        )
        .await
        .unwrap();
    let first = store
        .append_message(thread.id.clone(), NewMessage::assistant("来得及"))
        .await
        .unwrap();
    store
        .append_message(
            thread.id.clone(),
            NewMessage::assistant("稍微赶").replacing(Some(first.id.clone())),
        )
        .await
        .unwrap();
    let messages = store.list_messages(thread.id).await.unwrap();
    assert_eq!(
        messages[0].quote.as_ref().map(|quote| quote.text.as_str()),
        Some("9 点前到")
    );
    assert_eq!(messages[2].replaces.as_deref(), Some(first.id.as_str()));
    assert_eq!(messages[0].role, Role::User);
}
