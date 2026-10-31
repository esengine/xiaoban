use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::Memory;

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
        };
        let snapshot = snapshot(&localizer, &[memory("name", "Zhe"), memory("kids", "one son")]).unwrap();
        assert!(snapshot.ends_with("- name: Zhe\n- kids: one son"));
        assert_eq!(super::snapshot(&localizer, &[]), None);
    }
}
