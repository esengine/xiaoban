use serde_json::Value;
use xiaoban_agent::ToolCall;
use xiaoban_protocol::StepResult;

#[cfg(test)]
use crate::tools::LOCATE;
use crate::tools::{READ_PAGE, REMEMBER, SAVE_TRIP, WEATHER, WEB_SEARCH};

const MAX_SOURCES: usize = 3;
const MAX_DETAIL: usize = 60;

fn arguments(call: &ToolCall) -> Value {
    serde_json::from_str(&call.function.arguments).unwrap_or(Value::Null)
}

fn text(value: &Value, key: &str) -> Option<String> {
    let text = value.get(key)?.as_str()?.trim();
    (!text.is_empty()).then(|| text.chars().take(MAX_DETAIL).collect())
}

pub fn site(url: &str) -> Option<String> {
    let rest = url.split_once("://").map_or(url, |(_, rest)| rest);
    let host = rest.split(['/', '?', '#']).next()?.rsplit('@').next()?;
    let host = host.split(':').next()?.trim_start_matches("www.");
    (!host.is_empty()).then(|| host.to_owned())
}

pub fn detail(call: &ToolCall) -> Option<String> {
    let args = arguments(call);
    match call.function.name.as_str() {
        WEB_SEARCH => text(&args, "query"),
        READ_PAGE => text(&args, "url").and_then(|url| site(&url)),
        WEATHER => text(&args, "place"),
        REMEMBER => text(&args, "subject"),
        SAVE_TRIP => text(&args, "title"),
        _ => None,
    }
}

pub fn result(call: &ToolCall, output: &str) -> StepResult {
    let output: Value = serde_json::from_str(output).unwrap_or(Value::Null);
    if output.get("error").is_some() {
        return StepResult::Failed;
    }
    match call.function.name.as_str() {
        WEB_SEARCH => {
            let hits = output
                .get("results")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or_default();
            let mut sources: Vec<String> = Vec::new();
            for hit in hits {
                let name =
                    text(hit, "site").or_else(|| text(hit, "url").and_then(|url| site(&url)));
                if let Some(name) = name
                    && !sources.contains(&name)
                    && sources.len() < MAX_SOURCES
                {
                    sources.push(name);
                }
            }
            StepResult::Found {
                count: u32::try_from(hits.len()).unwrap_or(u32::MAX),
                sources,
            }
        }
        READ_PAGE => StepResult::Page {
            title: text(&output, "title").unwrap_or_default(),
        },
        SAVE_TRIP => output
            .get("version")
            .and_then(Value::as_u64)
            .and_then(|version| u32::try_from(version).ok())
            .map_or(StepResult::Done, |version| StepResult::Saved { version }),
        _ => StepResult::Done,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn call(name: &str, arguments: &str) -> ToolCall {
        ToolCall::function("c1", name, arguments)
    }

    #[test]
    fn details_describe_what_the_step_is_doing() {
        assert_eq!(
            detail(&call(WEB_SEARCH, r#"{"query":"灵隐寺 门票"}"#)).as_deref(),
            Some("灵隐寺 门票")
        );
        assert_eq!(
            detail(&call(
                READ_PAGE,
                r#"{"url":"https://www.in77.com.cn/about?x=1"}"#
            ))
            .as_deref(),
            Some("in77.com.cn")
        );
        assert_eq!(detail(&call(LOCATE, "{}")), None);
        assert_eq!(detail(&call(WEB_SEARCH, "not json")), None);
    }

    #[test]
    fn results_summarise_what_came_back() {
        let found = result(
            &call(WEB_SEARCH, "{}"),
            r#"{"results":[{"site":"携程","url":"a"},{"site":"携程","url":"b"},{"site":"","url":"https://www.dianping.com/x"}]}"#,
        );
        assert_eq!(
            found,
            StepResult::Found {
                count: 3,
                sources: vec!["携程".into(), "dianping.com".into()]
            }
        );
        assert_eq!(
            result(&call(SAVE_TRIP, "{}"), r#"{"saved":true,"version":2}"#),
            StepResult::Saved { version: 2 }
        );
        assert_eq!(
            result(
                &call(READ_PAGE, "{}"),
                r#"{"error":"nothing usable was found"}"#
            ),
            StepResult::Failed
        );
    }

    #[test]
    fn sites_ignore_credentials_and_ports() {
        assert_eq!(
            site("https://user:pw@www.example.com:8080/a").as_deref(),
            Some("example.com")
        );
    }
}
