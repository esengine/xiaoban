use xiaoban_protocol::{Platform, Role};
use xiaoban_store::Store;

#[tokio::test]
async fn threads_and_messages_round_trip() {
    let store = Store::open_in_memory().unwrap();
    let thread = store.create_thread("新家装修".into()).await.unwrap();
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
