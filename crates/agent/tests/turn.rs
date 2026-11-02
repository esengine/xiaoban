use std::time::Duration;

use std::sync::Mutex;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use futures_util::future::BoxFuture;
use xiaoban_agent::{
    Agent, AgentError, ChatMessage, ChatRole, ModelChunk, NoTools, RecordingProvider,
    ScriptedProvider, StablePrefix, ToolCall, ToolRunner, ToolSpec, Transcript, TurnEvent, prefix_reuse,
    user_wire,
};
use xiaoban_protocol::ContextNote;

async fn turn(agent: &Agent, transcript: &mut Transcript, wire: &str) -> String {
    let (tx, _rx) = mpsc::channel(64);
    let outcome = agent
        .run_turn(
            &StablePrefix::new("system"),
            transcript,
            wire,
            &NoTools,
            tx,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    transcript.push(ChatMessage::new(ChatRole::User, wire));
    for message in outcome.messages {
        transcript.push(message);
    }
    outcome.text
}

#[tokio::test]
async fn streams_deltas_and_collects_text() {
    let agent = Agent::new(ScriptedProvider::new(["7:40", " 出门"]));
    let (tx, mut rx) = mpsc::channel(16);
    let outcome = agent
        .run_turn(
            &StablePrefix::new("system"),
            &Transcript::default(),
            "明天几点出门",
            &NoTools,
            tx,
            CancellationToken::new(),
        )
        .await
        .unwrap();

    assert_eq!(outcome.text, "7:40 出门");
    let mut events = Vec::new();
    while let Some(event) = rx.recv().await {
        events.push(event);
    }
    assert_eq!(
        events,
        vec![
            TurnEvent::Thinking,
            TurnEvent::TextDelta("7:40".into()),
            TurnEvent::TextDelta(" 出门".into())
        ]
    );
}

#[tokio::test]
async fn every_request_extends_the_previous_one_byte_for_byte() {
    let provider = RecordingProvider::new(ScriptedProvider::new(["好的"]));
    let agent = Agent::new(provider.clone());
    let mut transcript = Transcript::default();
    let context = [ContextNote {
        label: "页面".into(),
        body: "杭州行程 · 第 1 天".into(),
    }];

    turn(
        &agent,
        &mut transcript,
        &user_wire("下午加个亲子乐园", &context),
    )
    .await;
    turn(&agent, &mut transcript, "别太赶").await;
    turn(&agent, &mut transcript, "那晚饭呢").await;

    let requests = provider.requests();
    assert_eq!(requests.len(), 3);
    for pair in requests.windows(2) {
        let reuse = prefix_reuse(&pair[0], &pair[1]);
        assert!(reuse.is_intact(), "prefix broke: {reuse:?}");
        assert_eq!(pair[1].messages.len(), pair[0].messages.len() + 2);
    }
    assert!(requests[2].messages[1].content.contains("<context>"));
}

#[tokio::test]
async fn cancellation_stops_the_turn() {
    let provider = ScriptedProvider::new(["a", "b", "c"]).with_delay(Duration::from_millis(200));
    let agent = Agent::new(provider);
    let (tx, _rx) = mpsc::channel(16);
    let cancel = CancellationToken::new();
    let trigger = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(50)).await;
        trigger.cancel();
    });
    let result = agent
        .run_turn(
            &StablePrefix::new("system"),
            &Transcript::default(),
            "hi",
            &NoTools,
            tx,
            cancel,
        )
        .await;
    assert!(matches!(result, Err(AgentError::Cancelled)));
}

#[derive(Default)]
struct Recorder(Mutex<Vec<ToolCall>>);

impl ToolRunner for Recorder {
    fn run<'a>(&'a self, call: &'a ToolCall) -> BoxFuture<'a, String> {
        self.0.lock().unwrap().push(call.clone());
        Box::pin(async { "saved".to_owned() })
    }
}

#[tokio::test]
async fn tool_calls_run_and_the_conversation_continues_append_only() {
    let call = |arguments: &str| ModelChunk::ToolCallDelta {
        index: 0,
        id: None,
        name: None,
        arguments: arguments.into(),
    };
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![
            ModelChunk::ToolCallDelta {
                index: 0,
                id: Some("c1".into()),
                name: Some("remember".into()),
                arguments: String::new(),
            },
            call(r#"{"subject":"称呼","#),
            call(r#""value":"阿哲"}"#),
        ],
        vec![ModelChunk::Text("好，阿哲".into())],
    ]));
    let agent = Agent::new(provider.clone());
    let tools = Recorder::default();
    let (tx, mut rx) = mpsc::channel(16);
    let outcome = agent
        .run_turn(
            &StablePrefix::new("system"),
            &Transcript::default(),
            "叫我阿哲",
            &tools,
            tx,
            CancellationToken::new(),
        )
        .await
        .unwrap();

    let calls = tools.0.lock().unwrap().clone();
    assert_eq!(calls.len(), 1);
    assert_eq!(
        calls[0].function.arguments,
        r#"{"subject":"称呼","value":"阿哲"}"#
    );
    assert_eq!(outcome.text, "好，阿哲");
    assert_eq!(
        outcome.messages,
        vec![
            ChatMessage::assistant_calls("", calls.clone()),
            ChatMessage::tool_result("c1", "saved"),
            ChatMessage::new(ChatRole::Assistant, "好，阿哲"),
        ]
    );

    let mut events = Vec::new();
    while let Some(event) = rx.recv().await {
        events.push(event);
    }
    assert!(events.iter().any(
        |event| matches!(event, TurnEvent::ToolUsed(call) if call.function.name == "remember")
    ));
    assert!(events.iter().any(|event| matches!(
        event,
        TurnEvent::ToolFinished { result, .. } if result == "saved"
    )));

    let requests = provider.requests();
    assert_eq!(requests.len(), 2);
    assert!(prefix_reuse(&requests[0], &requests[1]).is_intact());
    assert_eq!(requests[1].messages.len(), requests[0].messages.len() + 2);
}

#[derive(Default)]
struct CountingTools {
    runs: Mutex<u32>,
}

impl ToolRunner for CountingTools {
    fn run<'a>(&'a self, _: &'a ToolCall) -> BoxFuture<'a, String> {
        Box::pin(async move {
            *self.runs.lock().unwrap() += 1;
            "found".to_owned()
        })
    }
}

#[tokio::test]
async fn repeated_calls_reuse_results_and_are_cut_off() {
    let same = |id: &str| ModelChunk::ToolCallDelta {
        index: 0,
        id: Some(id.into()),
        name: Some("web_search".into()),
        arguments: r#"{ "query": "灵隐寺" }"#.into(),
    };
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![same("a")],
        vec![same("b")],
        vec![same("c")],
        vec![ModelChunk::Text("好".into())],
    ]));
    let agent = Agent::new(provider.clone());
    let tools = CountingTools::default();
    let (tx, _rx) = mpsc::channel(64);
    let outcome = agent
        .run_turn(
            &StablePrefix::new("system"),
            &Transcript::default(),
            "查一下",
            &tools,
            tx,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    assert_eq!(outcome.text, "好");
    assert_eq!(*tools.runs.lock().unwrap(), 1);
    let results: Vec<_> = outcome
        .messages
        .iter()
        .filter(|message| message.role == ChatRole::Tool)
        .map(|message| message.content.as_str())
        .collect();
    assert_eq!(results[..2], ["found", "found"]);
    assert!(results[2].contains("already ran this exact call"));
}

#[derive(Default)]
struct ClickingTools {
    runs: Mutex<u32>,
}

impl ToolRunner for ClickingTools {
    fn run<'a>(&'a self, _: &'a ToolCall) -> BoxFuture<'a, String> {
        Box::pin(async move {
            *self.runs.lock().unwrap() += 1;
            "done".to_owned()
        })
    }

    fn reusable(&self, name: &str) -> bool {
        name != "click"
    }
}

#[tokio::test]
async fn actions_run_every_time() {
    let press = |id: &str| ModelChunk::ToolCallDelta {
        index: 0,
        id: Some(id.into()),
        name: Some("click".into()),
        arguments: r#"{ "element": 4 }"#.into(),
    };
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![press("a")],
        vec![press("b")],
        vec![press("c")],
        vec![ModelChunk::Text("好".into())],
    ]));
    let agent = Agent::new(provider);
    let tools = ClickingTools::default();
    let (tx, _rx) = mpsc::channel(64);
    let outcome = agent
        .run_turn(
            &StablePrefix::new("system"),
            &Transcript::default(),
            "按三次 4",
            &tools,
            tx,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    assert_eq!(outcome.text, "好");
    assert_eq!(*tools.runs.lock().unwrap(), 3);
}

#[derive(Default)]
struct NotingTools {
    notes: Mutex<Vec<String>>,
}

impl ToolRunner for NotingTools {
    fn run<'a>(&'a self, _: &'a ToolCall) -> BoxFuture<'a, String> {
        Box::pin(async move {
            self.notes
                .lock()
                .unwrap()
                .push("PDF 里把软装单独列出来".to_owned());
            "done".to_owned()
        })
    }

    fn notes(&self) -> Vec<String> {
        std::mem::take(&mut *self.notes.lock().unwrap())
    }
}

#[tokio::test]
async fn notes_from_the_user_reach_the_next_step() {
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![ModelChunk::ToolCallDelta {
            index: 0,
            id: Some("a".into()),
            name: Some("click".into()),
            arguments: "{}".into(),
        }],
        vec![ModelChunk::Text("好".into())],
    ]));
    let agent = Agent::new(provider.clone());
    let tools = NotingTools::default();
    let (tx, _rx) = mpsc::channel(64);
    let outcome = agent
        .run_turn(
            &StablePrefix::new("system"),
            &Transcript::default(),
            "导出 PDF",
            &tools,
            tx,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    assert_eq!(outcome.text, "好");
    let second = &provider.requests()[1];
    let last = second.messages.last().unwrap();
    assert_eq!(last.role, ChatRole::User);
    assert_eq!(last.content, "PDF 里把软装单独列出来");
}

struct Barrier {
    gate: tokio::sync::Barrier,
    order: Mutex<Vec<String>>,
}

impl ToolRunner for Barrier {
    fn concurrent(&self, call: &ToolCall) -> bool {
        call.function.name.starts_with("read")
    }

    fn run<'a>(&'a self, call: &'a ToolCall) -> BoxFuture<'a, String> {
        Box::pin(async move {
            self.order.lock().unwrap().push(format!("start {}", call.id));
            if call.function.name == "read" {
                // Only returns once all three reads are in flight together.
                self.gate.wait().await;
            }
            self.order.lock().unwrap().push(format!("end {}", call.id));
            format!("result {}", call.id)
        })
    }
}

#[tokio::test]
async fn read_only_calls_in_one_step_run_together_and_come_back_in_order() {
    let call = |index: usize, id: &str, name: &str| ModelChunk::ToolCallDelta {
        index,
        id: Some(id.into()),
        name: Some(name.into()),
        arguments: format!(r#"{{"n":{index}}}"#),
    };
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![
            call(0, "r1", "read"),
            call(1, "r2", "read"),
            call(2, "r3", "read"),
            call(3, "w1", "write"),
            call(4, "r4", "read_after"),
        ],
        vec![ModelChunk::Text("done".into())],
    ]));
    let agent = Agent::new(provider.clone());
    let tools = Barrier {
        gate: tokio::sync::Barrier::new(3),
        order: Mutex::default(),
    };
    let (tx, mut rx) = mpsc::channel(64);
    let outcome = tokio::time::timeout(
        Duration::from_secs(5),
        agent.run_turn(
            &StablePrefix::new("system"),
            &Transcript::default(),
            "go",
            &tools,
            tx,
            CancellationToken::new(),
        ),
    )
    .await
    .expect("reads must overlap, otherwise the barrier never opens")
    .unwrap();
    assert_eq!(outcome.text, "done");

    let order = tools.order.lock().unwrap().clone();
    let first_end = order.iter().position(|line| line.starts_with("end")).unwrap();
    assert_eq!(order[..first_end].len(), 3, "{order:?}");
    // The write waits for the reads before it, and the read after it waits for the write.
    let index = |line: &str| order.iter().position(|item| item == line).unwrap();
    assert!(index("end r3") < index("start w1"), "{order:?}");
    assert!(index("end w1") < index("start r4"), "{order:?}");

    let ids: Vec<String> = outcome
        .messages
        .iter()
        .filter(|message| message.role == ChatRole::Tool)
        .map(|message| message.content.clone())
        .collect();
    assert_eq!(
        ids,
        ["result r1", "result r2", "result r3", "result w1", "result r4"]
    );

    let mut finished = Vec::new();
    while let Ok(event) = rx.try_recv() {
        if let TurnEvent::ToolFinished { call, .. } = event {
            finished.push(call.id);
        }
    }
    assert_eq!(finished, ["r1", "r2", "r3", "w1", "r4"]);
}

struct Loader {
    swapped: Mutex<bool>,
}

impl ToolRunner for Loader {
    fn run<'a>(&'a self, call: &'a ToolCall) -> BoxFuture<'a, String> {
        Box::pin(async move {
            if call.function.name == "load" {
                *self.swapped.lock().unwrap() = true;
            }
            "ok".to_owned()
        })
    }

    fn reload(&self) -> BoxFuture<'_, Option<StablePrefix>> {
        let swapped = std::mem::take(&mut *self.swapped.lock().unwrap());
        Box::pin(async move {
            swapped.then(|| {
                StablePrefix::compose(
                    "system",
                    None,
                    vec![ToolSpec {
                        name: "extra".into(),
                        description: "added mid-turn".into(),
                        parameters: serde_json::json!({ "type": "object" }),
                    }],
                )
            })
        })
    }
}

#[tokio::test]
async fn a_runner_can_change_the_tools_between_steps_of_one_turn() {
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![ModelChunk::ToolCallDelta {
            index: 0,
            id: Some("c1".into()),
            name: Some("load".into()),
            arguments: "{}".into(),
        }],
        vec![ModelChunk::Text("done".into())],
    ]));
    let agent = Agent::new(provider.clone());
    let (tx, _rx) = mpsc::channel(64);
    let outcome = agent
        .run_turn(
            &StablePrefix::compose("system", None, Vec::new()),
            &Transcript::default(),
            "go",
            &Loader {
                swapped: Mutex::new(false),
            },
            tx,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    assert_eq!(outcome.text, "done");
    let requests = provider.requests();
    assert_eq!(requests[0].tools.len(), 0);
    assert_eq!(requests[1].tools.len(), 1);
    assert_eq!(requests[1].tools[0].name, "extra");
    // The conversation itself carries over untouched.
    assert_eq!(requests[1].messages.len(), requests[0].messages.len() + 2);
}
