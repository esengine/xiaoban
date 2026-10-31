use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{Memory, MemoryTopic};

const ORDER: [(MemoryTopic, Key); 3] = [
    (
        MemoryTopic::PreferredName,
        keys::MEMORY_TOPIC_PREFERRED_NAME,
    ),
    (MemoryTopic::HomeAndWork, keys::MEMORY_TOPIC_HOME_AND_WORK),
    (MemoryTopic::Household, keys::MEMORY_TOPIC_HOUSEHOLD),
];

pub fn snapshot(localizer: &Localizer, memories: &[Memory]) -> Option<String> {
    let lines: Vec<String> = ORDER
        .iter()
        .filter_map(|(topic, label)| {
            memories
                .iter()
                .find(|memory| memory.topic == *topic)
                .map(|memory| format!("- {}: {}", localizer.text(*label), memory.value.trim()))
        })
        .collect();
    (!lines.is_empty()).then(|| {
        format!(
            "{}\n{}",
            localizer.text(keys::PROMPT_MEMORY_HEADING),
            lines.join("\n")
        )
    })
}

#[cfg(test)]
mod tests {
    use xiaoban_i18n::Locale;

    use super::*;

    fn memory(topic: MemoryTopic, value: &str, updated_at: i64) -> Memory {
        Memory {
            id: value.into(),
            topic,
            value: value.into(),
            updated_at,
        }
    }

    #[test]
    fn snapshot_is_ordered_by_topic_not_by_update_time() {
        let localizer = Localizer::new(Locale::En);
        let newer_first = [
            memory(MemoryTopic::Household, "wife and son", 3),
            memory(MemoryTopic::PreferredName, "Zhe", 1),
        ];
        let older_first = [newer_first[1].clone(), newer_first[0].clone()];
        let snapshot = snapshot(&localizer, &newer_first).unwrap();
        assert_eq!(
            Some(snapshot.clone()),
            super::snapshot(&localizer, &older_first)
        );
        assert!(snapshot.find("Zhe").unwrap() < snapshot.find("wife and son").unwrap());
        assert_eq!(super::snapshot(&localizer, &[]), None);
    }
}
