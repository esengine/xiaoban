use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::Memory;

const MIN_HITS: usize = 2;

fn terms(text: &str) -> Vec<String> {
    let lower = text.to_lowercase();
    let mut terms: Vec<String> = lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| word.is_ascii() && word.chars().count() >= 3)
        .map(str::to_owned)
        .collect();
    let wide: Vec<char> = lower
        .chars()
        .filter(|c| !c.is_ascii() && c.is_alphanumeric())
        .collect();
    terms.extend(wide.windows(2).map(|pair| pair.iter().collect()));
    terms.sort();
    terms.dedup();
    terms
}

pub fn used_by(answer: &str, memories: &[Memory]) -> Vec<String> {
    let answer = answer.to_lowercase();
    memories
        .iter()
        .filter(|memory| {
            let wanted = terms(&memory.value);
            let hits = wanted
                .iter()
                .filter(|term| answer.contains(term.as_str()))
                .count();
            !wanted.is_empty() && (hits >= MIN_HITS.min(wanted.len()))
        })
        .map(|memory| memory.id.clone())
        .collect()
}

pub fn snapshot(localizer: &Localizer, memories: &[Memory]) -> Option<String> {
    let lines: Vec<String> = memories
        .iter()
        .map(|memory| format!("- {}: {}", memory.subject.trim(), memory.value.trim()))
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

    #[test]
    fn snapshot_keeps_the_given_order() {
        let localizer = Localizer::new(Locale::En);
        let memory = |subject: &str, value: &str| Memory {
            id: subject.into(),
            subject: subject.into(),
            value: value.into(),
            updated_at: 0,
            category: xiaoban_protocol::MemoryCategory::Other,
            uses: 0,
            last_used_at: None,
        };
        let snapshot = snapshot(
            &localizer,
            &[memory("name", "Zhe"), memory("kids", "one son")],
        )
        .unwrap();
        assert!(snapshot.ends_with("- name: Zhe\n- kids: one son"));
        assert_eq!(super::snapshot(&localizer, &[]), None);
    }

    #[test]
    fn answers_that_mention_a_memory_count_as_using_it() {
        let memory = |id: &str, value: &str| Memory {
            id: id.into(),
            subject: id.into(),
            value: value.into(),
            updated_at: 0,
            category: xiaoban_protocol::MemoryCategory::Other,
            uses: 0,
            last_used_at: None,
        };
        let memories = [memory("a", "儿子对花生过敏"), memory("b", "住在上海浦东")];
        let used = used_by("这家店有花生酱，你儿子过敏的话别点。", &memories);
        assert_eq!(used, ["a"]);
    }
}
