use xiaoban_protocol::{ClientFrame, Credential, DeviceHello, Platform, Request, ServerFrame};

#[test]
fn client_frames_use_tagged_camel_case_json() {
    let frame = ClientFrame::Request {
        id: 7,
        body: Request::SendMessage {
            thread_id: "t1".into(),
            text: "你好".into(),
            context: Vec::new(),
            quote: None,
            files: Vec::new(),
        },
    };
    let json = serde_json::to_value(&frame).unwrap();
    assert_eq!(
        json,
        serde_json::json!({
            "type": "request",
            "id": 7,
            "body": { "type": "send_message", "threadId": "t1", "text": "你好", "context": [], "quote": null, "files": [] }
        })
    );
}

#[test]
fn hello_round_trips() {
    let frame = ClientFrame::Hello {
        protocol: 1,
        device: DeviceHello {
            device_id: "d1".into(),
            name: "阿哲的手机".into(),
            platform: Platform::Ios,
            credential: Credential::PairingCode {
                code: "482917".into(),
            },
        },
    };
    let text = serde_json::to_string(&frame).unwrap();
    assert_eq!(serde_json::from_str::<ClientFrame>(&text).unwrap(), frame);
}

#[test]
fn server_error_without_request_id_serializes_null() {
    let frame = ServerFrame::Error {
        id: None,
        error: xiaoban_protocol::ProtocolError::new(
            xiaoban_protocol::ErrorCode::Unauthorized,
            "no",
        ),
    };
    let json = serde_json::to_value(&frame).unwrap();
    assert_eq!(json["id"], serde_json::Value::Null);
    assert_eq!(json["error"]["code"], "unauthorized");
}

#[test]
fn send_message_context_defaults_to_empty() {
    let frame: ClientFrame = serde_json::from_value(serde_json::json!({
        "type": "request",
        "id": 1,
        "body": { "type": "send_message", "threadId": "t1", "text": "hi" }
    }))
    .unwrap();
    let ClientFrame::Request {
        body: Request::SendMessage { context, .. },
        ..
    } = frame
    else {
        panic!("unexpected frame");
    };
    assert_eq!(context, Vec::new());
}

#[test]
fn provider_ids_round_trip_through_strings_and_json() {
    for id in xiaoban_protocol::ProviderId::ALL {
        assert_eq!(xiaoban_protocol::ProviderId::parse(id.as_str()), Some(id));
        assert_eq!(serde_json::to_value(id).unwrap(), id.as_str());
    }
}
