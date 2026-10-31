use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::path::{Path, PathBuf};

use fluent_syntax::ast::{Entry, Expression, InlineExpression, Pattern, PatternElement};
use fluent_syntax::parser::parse;

const LOCALES: [&str; 2] = ["zh-CN", "en"];

type Catalog = BTreeMap<String, BTreeSet<String>>;

fn collect_vars(pattern: &Pattern<&str>, vars: &mut BTreeSet<String>) {
    for element in &pattern.elements {
        if let PatternElement::Placeable { expression } = element {
            collect_expression(expression, vars);
        }
    }
}

fn collect_expression(expression: &Expression<&str>, vars: &mut BTreeSet<String>) {
    match expression {
        Expression::Inline(inline) => collect_inline(inline, vars),
        Expression::Select { selector, variants } => {
            collect_inline(selector, vars);
            for variant in variants {
                collect_vars(&variant.value, vars);
            }
        }
    }
}

fn collect_inline(inline: &InlineExpression<&str>, vars: &mut BTreeSet<String>) {
    match inline {
        InlineExpression::VariableReference { id } => {
            vars.insert(id.name.to_owned());
        }
        InlineExpression::Placeable { expression } => collect_expression(expression, vars),
        _ => {}
    }
}

fn load(root: &Path, locale: &str) -> Catalog {
    let path = root.join(locale).join("main.ftl");
    println!("cargo:rerun-if-changed={}", path.display());
    let source = std::fs::read_to_string(&path)
        .unwrap_or_else(|err| panic!("cannot read {}: {err}", path.display()));
    let resource = parse(source.as_str())
        .unwrap_or_else(|(_, errors)| panic!("{locale}: invalid Fluent syntax: {errors:?}"));
    let mut catalog = Catalog::new();
    for entry in resource.body {
        if let Entry::Message(message) = entry {
            let mut vars = BTreeSet::new();
            if let Some(value) = &message.value {
                collect_vars(value, &mut vars);
            }
            catalog.insert(message.id.name.to_owned(), vars);
        }
    }
    catalog
}

fn main() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let root = manifest.join("../../locales");
    let catalogs: Vec<(&str, Catalog)> = LOCALES.iter().map(|l| (*l, load(&root, l))).collect();

    let (base_locale, base) = &catalogs[0];
    for (locale, catalog) in &catalogs[1..] {
        assert!(
            catalog == base,
            "locale {locale} does not match {base_locale}: keys or variables differ"
        );
    }

    let mut out = String::new();
    for (key, vars) in base {
        let ident = key.replace('-', "_").to_uppercase();
        let args = vars
            .iter()
            .map(|v| format!("{v:?}"))
            .collect::<Vec<_>>()
            .join(", ");
        writeln!(
            out,
            "pub const {ident}: Key = Key::new({key:?}, &[{args}]);"
        )
        .unwrap();
    }
    let all = base
        .keys()
        .map(|key| key.replace('-', "_").to_uppercase())
        .collect::<Vec<_>>()
        .join(", ");
    writeln!(out, "pub const ALL: &[Key] = &[{all}];").unwrap();

    let dest = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("keys.rs");
    std::fs::write(dest, out).unwrap();
}
