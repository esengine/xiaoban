//! Sizes of everything a conversation sends before the user says anything.
//! Run with `cargo test -p xiaoban-hub prefix_report -- --nocapture --ignored`.

use std::collections::BTreeMap;

use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Locale, Localizer, keys};

use crate::prompts::Prompts;

/// No tokenizer ships with the hub, so this is a stand-in: CJK characters run a bit under one
/// token each, everything else (mostly JSON and English) about one token per three characters.
fn estimate(text: &str) -> usize {
    let cjk = text
        .chars()
        .filter(|c| ('\u{2E80}'..='\u{9FFF}').contains(c) || ('\u{FF00}'..='\u{FFEF}').contains(c))
        .count();
    let rest = text.chars().count() - cjk;
    (cjk * 4).div_ceil(5) + rest.div_ceil(3)
}

fn tools_for(localizer: &Localizer) -> BTreeMap<&'static str, Vec<ToolSpec>> {
    let base = crate::slides::with_write_specs(
        crate::sheet::with_create_spec(
            crate::doc::with_write_specs(crate::tools::specs(localizer), localizer),
            localizer,
        ),
        localizer,
    );
    let mut scenes = BTreeMap::new();
    scenes.insert("chat", {
        let mut tools = base.clone();
        tools.push(crate::life::spec(localizer));
        tools
    });
    scenes.insert("core", {
        let mut tools = base.clone();
        tools.push(crate::life::spec(localizer));
        let mut core = crate::packs::filter(&tools, &crate::packs::PackSet::new());
        core.push(crate::packs::spec(localizer));
        core
    });
    scenes.insert("code", {
        let mut tools: Vec<_> = base
            .iter()
            .filter(|tool| crate::code_tools::keeps_in_code(&tool.name))
            .cloned()
            .collect();
        tools.extend(crate::code_tools::specs(localizer));
        tools.push(crate::vcs_tools::git_spec(localizer));
        tools.push(crate::vcs_tools::gh_spec(localizer));
        tools
    });
    scenes.insert("kitchen", {
        let mut tools = base.clone();
        tools.extend(crate::kitchen::specs(localizer));
        tools
    });
    scenes.insert("doc", {
        let mut tools: Vec<_> = base
            .iter()
            .filter(|tool| crate::code_tools::keeps_in_code(&tool.name))
            .cloned()
            .collect();
        tools.extend(crate::doc::edit_specs(localizer));
        tools
    });
    scenes
}

fn size(tool: &ToolSpec) -> usize {
    estimate(&tool.wire().to_string())
}

#[test]
#[ignore = "prints a report"]
fn prefix_report() {
    for locale in Locale::ALL {
        let localizer = Localizer::new(locale);
        let prompts = Prompts::for_locale(locale);
        println!("\n=== {} ===", locale.tag());
        let parts = [
            ("system", localizer.text(keys::PROMPT_SYSTEM)),
            ("memory policy", localizer.text(keys::PROMPT_MEMORY_POLICY)),
            ("tool policy", localizer.text(keys::PROMPT_TOOL_POLICY)),
            (
                "capability policy",
                localizer.text(keys::PROMPT_CAPABILITY_POLICY),
            ),
            (
                "workspace",
                localizer.format(
                    keys::PROMPT_WORKSPACE,
                    &[("name", "demo"), ("path", "D:/demo")],
                ),
            ),
        ];
        for (name, text) in &parts {
            println!("  prompt {name:<18} ~{:>5} tokens", estimate(text));
        }
        println!(
            "  prompt total (chat)       ~{:>5} tokens",
            estimate(&prompts.chat)
        );
        let scenes = tools_for(&localizer);
        for (scene, tools) in &scenes {
            let total: usize = tools.iter().map(size).sum();
            println!(
                "  scene {scene:<8} {:>3} tools ~{:>5} tokens  + prompt = ~{:>5}",
                tools.len(),
                total,
                total + estimate(&prompts.chat)
            );
        }
        let all_tools = &scenes["chat"];
        for pack in crate::packs::Pack::ALL {
            let tokens: usize = all_tools
                .iter()
                .filter(|tool| crate::packs::pack_of(&tool.name) == Some(pack))
                .map(size)
                .sum();
            println!("  pack {:<9} ~{tokens:>5} tokens", pack.id());
        }
        let names: Vec<String> = scenes["chat"]
            .iter()
            .map(|tool| format!("{}:{}", tool.name, size(tool)))
            .collect();
        println!("  chat tools: {}", names.join(" "));
        let mut all: Vec<(&str, usize)> = scenes["code"]
            .iter()
            .map(|tool| (tool.name.as_str(), size(tool)))
            .collect();
        all.sort_by_key(|(_, tokens)| std::cmp::Reverse(*tokens));
        println!("  heaviest tools in the code scene:");
        for (name, tokens) in all.iter().take(25) {
            println!("    {name:<28} ~{tokens:>4}");
        }
    }
}

/// Guards for the fixed prefix: it is paid for in every request of every conversation, so a new
/// tool or a longer description has to be a deliberate choice. Raise a budget on purpose, not by
/// accident.
#[test]
fn the_fixed_prefix_stays_within_budget() {
    // (scene, budget in estimated tokens for tools plus the shared system prompt)
    let budgets = [
        ("chat", 28_000),
        ("core", 7_000),
        ("code", 9_500),
        ("doc", 11_000),
    ];
    for locale in Locale::ALL {
        let localizer = Localizer::new(locale);
        let prompt = estimate(&Prompts::for_locale(locale).chat);
        let scenes = tools_for(&localizer);
        for (scene, budget) in budgets {
            let catalog = if scene == "core" {
                crate::packs::catalog(&localizer, &crate::packs::PackSet::new(), true)
                    .map_or(0, |text| estimate(&text))
            } else {
                0
            };
            let total: usize = scenes[scene].iter().map(size).sum::<usize>() + prompt + catalog;
            assert!(
                total <= budget,
                "{scene} prefix is ~{total} tokens in {}, over its budget of {budget}",
                locale.tag()
            );
        }
    }
}

#[test]
fn the_coding_toolset_only_names_tools_that_exist() {
    let localizer = Localizer::new(Locale::ZhCn);
    let base = crate::tools::specs(&localizer);
    let names: Vec<&str> = base.iter().map(|tool| tool.name.as_str()).collect();
    for kept in [
        crate::tools::REMEMBER,
        crate::tools::WEB_SEARCH,
        crate::asks::ASK_USER,
        crate::plan::PLAN,
        crate::agents::SPAWN_AGENTS,
        crate::capability::FIND,
    ] {
        assert!(names.contains(&kept), "{kept} is not a tool any more");
        assert!(crate::code_tools::keeps_in_code(kept));
    }
    for dropped in [
        crate::tools::SAVE_TRIP,
        crate::tools::WEATHER,
        crate::mail::SEARCH,
    ] {
        assert!(!crate::code_tools::keeps_in_code(dropped));
    }
}

/// `XIAOBAN_TOOL=save_trip cargo test -p xiaoban-hub dump_tool -- --ignored --nocapture`
#[test]
#[ignore = "prints one tool definition"]
fn dump_tool() {
    let Ok(name) = std::env::var("XIAOBAN_TOOL") else {
        return;
    };
    let localizer = Localizer::new(Locale::ZhCn);
    for tool in tools_for(&localizer)["chat"]
        .iter()
        .filter(|tool| tool.name == name)
    {
        println!("{}", serde_json::to_string_pretty(&tool.wire()).unwrap());
    }
}
