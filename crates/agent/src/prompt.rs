use std::fmt::Write as _;
use std::sync::Arc;

use sha2::{Digest, Sha256};
use xiaoban_protocol::ContextNote;

use crate::{ChatMessage, ChatRequest, ChatRole};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StablePrefix {
    messages: Arc<[ChatMessage]>,
    fingerprint: String,
}

impl StablePrefix {
    pub fn new(system: impl Into<String>) -> Self {
        let messages: Arc<[ChatMessage]> = Arc::from([ChatMessage::new(ChatRole::System, system)]);
        let canonical = serde_json::to_vec(&*messages).unwrap_or_default();
        let fingerprint = hex::encode(&Sha256::digest(&canonical)[..8]);
        Self {
            messages,
            fingerprint,
        }
    }

    pub fn messages(&self) -> &[ChatMessage] {
        &self.messages
    }

    pub fn fingerprint(&self) -> &str {
        &self.fingerprint
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Transcript {
    entries: Vec<ChatMessage>,
}

impl Transcript {
    pub fn entries(&self) -> &[ChatMessage] {
        &self.entries
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn push(&mut self, message: ChatMessage) {
        self.entries.push(message);
    }
}

impl FromIterator<ChatMessage> for Transcript {
    fn from_iter<I: IntoIterator<Item = ChatMessage>>(iter: I) -> Self {
        Self {
            entries: iter.into_iter().collect(),
        }
    }
}

pub fn user_wire(text: &str, context: &[ContextNote]) -> String {
    if context.is_empty() {
        return text.to_owned();
    }
    let mut wire = String::with_capacity(text.len() + 64);
    wire.push_str(text);
    wire.push_str("\n\n<context>");
    for note in context {
        let _ = write!(wire, "\n{}: {}", note.label.trim(), note.body.trim());
    }
    wire.push_str("\n</context>");
    wire
}

pub fn assemble(prefix: &StablePrefix, transcript: &Transcript, user_wire: &str) -> ChatRequest {
    let messages = prefix
        .messages()
        .iter()
        .chain(transcript.entries())
        .cloned()
        .chain(std::iter::once(ChatMessage::new(ChatRole::User, user_wire)))
        .collect();
    ChatRequest { messages }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PrefixReuse {
    pub reused: usize,
    pub previous: usize,
}

impl PrefixReuse {
    pub fn is_intact(self) -> bool {
        self.reused == self.previous
    }
}

pub fn prefix_reuse(previous: &ChatRequest, next: &ChatRequest) -> PrefixReuse {
    let reused = previous
        .messages
        .iter()
        .zip(&next.messages)
        .take_while(|(a, b)| a == b)
        .count();
    PrefixReuse {
        reused,
        previous: previous.messages.len(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_is_deterministic_and_sensitive() {
        assert_eq!(
            StablePrefix::new("a").fingerprint(),
            StablePrefix::new("a").fingerprint()
        );
        assert_ne!(
            StablePrefix::new("a").fingerprint(),
            StablePrefix::new("b").fingerprint()
        );
        assert_eq!(StablePrefix::new("a").fingerprint().len(), 16);
    }

    #[test]
    fn context_is_frozen_into_the_user_message_in_order() {
        let context = [
            ContextNote {
                label: "页面".into(),
                body: "杭州行程".into(),
            },
            ContextNote {
                label: "选中".into(),
                body: "第 1 天".into(),
            },
        ];
        assert_eq!(
            user_wire("加个亲子乐园", &context),
            "加个亲子乐园\n\n<context>\n页面: 杭州行程\n选中: 第 1 天\n</context>"
        );
        assert_eq!(user_wire("你好", &[]), "你好");
    }

    #[test]
    fn appending_keeps_the_previous_request_as_an_exact_prefix() {
        let prefix = StablePrefix::new("system");
        let mut transcript = Transcript::default();
        let first = assemble(&prefix, &transcript, "明天几点出门");
        transcript.push(ChatMessage::new(ChatRole::User, "明天几点出门"));
        transcript.push(ChatMessage::new(ChatRole::Assistant, "7:40"));
        let second = assemble(&prefix, &transcript, "要带伞吗");
        assert!(prefix_reuse(&first, &second).is_intact());

        let changed = assemble(&StablePrefix::new("换了提示词"), &transcript, "要带伞吗");
        assert_eq!(prefix_reuse(&second, &changed).reused, 0);
    }
}
