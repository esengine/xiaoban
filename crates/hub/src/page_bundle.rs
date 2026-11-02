//! A page in a workspace points at its own style sheets, scripts and pictures by relative path. A
//! phone's web view cannot reach those files, so the page is rewritten with them inlined, and then
//! needs nothing else to be shown.

use std::path::{Path, PathBuf};

use base64::Engine;

const MAX_TEXT: u64 = 300_000;
const MAX_IMAGE: u64 = 1_000_000;
const MAX_TOTAL: usize = 2_000_000;

/// The index of every opening `<name ...>` tag: where it starts and where its `>` is.
fn opening_tags(html: &str, name: &str) -> Vec<(usize, usize)> {
    let lower = html.to_ascii_lowercase();
    let needle = format!("<{name}");
    let bytes = lower.as_bytes();
    let mut found = Vec::new();
    let mut from = 0;
    while let Some(at) = lower[from..].find(&needle) {
        let start = from + at;
        let after = start + needle.len();
        from = after;
        if !matches!(
            bytes.get(after),
            Some(b' ' | b'\t' | b'\n' | b'\r' | b'/' | b'>')
        ) {
            continue;
        }
        let mut quote = None;
        let mut end = None;
        for (offset, byte) in bytes[after..].iter().enumerate() {
            match (*byte, quote) {
                (b'"' | b'\'', None) => quote = Some(*byte),
                (b, Some(open)) if b == open => quote = None,
                (b'>', None) => {
                    end = Some(after + offset);
                    break;
                }
                _ => {}
            }
        }
        if let Some(end) = end {
            found.push((start, end));
            from = end;
        }
    }
    found
}

/// The value of an attribute inside one tag, quoted or not.
fn attribute(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0;
    while let Some(at) = lower[from..].find(name) {
        let start = from + at;
        let before = lower[..start].chars().next_back();
        let rest = &tag[start + name.len()..];
        from = start + name.len();
        if before.is_some_and(|c| !c.is_whitespace()) {
            continue;
        }
        let rest = rest.trim_start();
        let Some(rest) = rest.strip_prefix('=') else {
            continue;
        };
        let rest = rest.trim_start();
        return Some(match rest.chars().next() {
            Some(open @ ('"' | '\'')) => {
                rest[1..].split(open).next().unwrap_or_default().to_owned()
            }
            _ => rest
                .split(|c: char| c.is_whitespace() || c == '>')
                .next()
                .unwrap_or_default()
                .to_owned(),
        });
    }
    None
}

/// The tag without one attribute, so a script can lose its `src` once its text is inside.
fn without_attribute(tag: &str, name: &str) -> String {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0;
    while let Some(at) = lower[from..].find(name) {
        let start = from + at;
        from = start + name.len();
        if lower[..start]
            .chars()
            .next_back()
            .is_some_and(|c| !c.is_whitespace())
        {
            continue;
        }
        let rest = &tag[start + name.len()..];
        let trimmed = rest.trim_start();
        let Some(value) = trimmed.strip_prefix('=') else {
            continue;
        };
        let value = value.trim_start();
        let length = match value.chars().next() {
            Some(open @ ('"' | '\'')) => value[1..].find(open).map_or(value.len(), |end| end + 2),
            _ => value
                .find(|c: char| c.is_whitespace() || c == '>')
                .unwrap_or(value.len()),
        };
        let consumed =
            (rest.len() - trimmed.len()) + 1 + (trimmed.len() - 1 - value.len()) + length;
        let mut cleaned = String::with_capacity(tag.len());
        cleaned.push_str(tag[..start].trim_end());
        cleaned.push_str(&rest[consumed.min(rest.len())..]);
        return cleaned;
    }
    tag.to_owned()
}

fn local_target(base: &Path, root: &Path, reference: &str) -> Option<PathBuf> {
    let reference = reference.trim();
    let lower = reference.to_ascii_lowercase();
    if reference.is_empty()
        || reference.starts_with('#')
        || reference.starts_with("//")
        || lower.starts_with("http:")
        || lower.starts_with("https:")
        || lower.starts_with("data:")
        || lower.starts_with("blob:")
        || lower.starts_with("file:")
    {
        return None;
    }
    let clean = reference.split(['?', '#']).next().unwrap_or_default();
    let target = crate::workspace::real(&base.join(clean));
    target
        .starts_with(crate::workspace::real(root))
        .then_some(target)
}

fn text_of(path: &Path) -> Option<String> {
    let size = std::fs::metadata(path).ok()?.len();
    (size <= MAX_TEXT)
        .then(|| std::fs::read_to_string(path).ok())
        .flatten()
}

fn image_url(path: &Path) -> Option<String> {
    let mime = match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => return None,
    };
    if std::fs::metadata(path).ok()?.len() > MAX_IMAGE {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    Some(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

/// The page with the workspace files it uses written into it. What cannot be inlined (a web
/// address, a file outside the workspace, something too big) is left as it was.
pub fn bundle(html: &str, page: &Path, root: &Path) -> String {
    let base = page.parent().unwrap_or(root);
    let mut edits: Vec<(usize, usize, String)> = Vec::new();
    let mut used = 0_usize;

    for (start, end) in opening_tags(html, "link") {
        let tag = &html[start..=end];
        let stylesheet = attribute(tag, "rel")
            .is_some_and(|rel| rel.to_ascii_lowercase().contains("stylesheet"));
        let Some(href) = attribute(tag, "href").filter(|_| stylesheet) else {
            continue;
        };
        let Some(css) = local_target(base, root, &href).and_then(|target| text_of(&target)) else {
            continue;
        };
        if used + css.len() > MAX_TOTAL {
            continue;
        }
        used += css.len();
        edits.push((
            start,
            end + 1,
            format!("<style>{}</style>", css.replace("</style", "<\\/style")),
        ));
    }

    let lower = html.to_ascii_lowercase();
    for (start, end) in opening_tags(html, "script") {
        let tag = &html[start..=end];
        let Some(src) = attribute(tag, "src") else {
            continue;
        };
        let Some(code) = local_target(base, root, &src).and_then(|target| text_of(&target)) else {
            continue;
        };
        let Some(close) = lower[end..].find("</script") else {
            continue;
        };
        let close_end = lower[end + close..]
            .find('>')
            .map(|offset| end + close + offset + 1);
        let Some(close_end) = close_end else { continue };
        if used + code.len() > MAX_TOTAL {
            continue;
        }
        used += code.len();
        let opening = without_attribute(tag, "src");
        edits.push((
            start,
            close_end,
            format!(
                "{opening}{}</script>",
                code.replace("</script", "<\\/script")
            ),
        ));
    }

    for (start, end) in opening_tags(html, "img") {
        let tag = &html[start..=end];
        let Some(src) = attribute(tag, "src") else {
            continue;
        };
        let Some(url) = local_target(base, root, &src).and_then(|target| image_url(&target)) else {
            continue;
        };
        if used + url.len() > MAX_TOTAL {
            continue;
        }
        used += url.len();
        let opening = without_attribute(tag, "src");
        let opening = opening.trim_end_matches(['/', ' ']).to_owned();
        edits.push((start, end + 1, format!("{opening} src=\"{url}\">")));
    }

    edits.sort_by_key(|(start, _, _)| *start);
    // A script tag can hold text that looks like another tag; keep the edits that do not overlap.
    let mut kept: Vec<(usize, usize, String)> = Vec::new();
    for edit in edits {
        if kept.last().is_none_or(|last| edit.0 >= last.1) {
            kept.push(edit);
        }
    }
    let mut out = String::with_capacity(html.len() + used);
    let mut at = 0;
    for (start, end, replacement) in kept {
        out.push_str(&html[at..start]);
        out.push_str(&replacement);
        at = end;
    }
    out.push_str(&html[at..]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn site() -> (PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!("xiaoban-bundle-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(root.join("js")).unwrap();
        std::fs::write(root.join("style.css"), "body { color: red }").unwrap();
        std::fs::write(
            root.join("js/app.js"),
            "document.title = 'x'; // </script> in a string",
        )
        .unwrap();
        std::fs::write(root.join("dot.png"), [0x89, 0x50, 0x4e, 0x47]).unwrap();
        std::fs::write(root.join("secret.txt"), "outside").unwrap();
        let page = root.join("index.html");
        (root, page)
    }

    #[test]
    fn local_styles_scripts_and_pictures_move_into_the_page() {
        let (root, page) = site();
        let html = r#"<!doctype html><html><head><link rel="stylesheet" href="style.css"><script src="js/app.js" defer></script></head><body><img src="dot.png" alt="d"></body></html>"#;
        let out = bundle(html, &page, &root);
        assert!(out.contains("<style>body { color: red }</style>"), "{out}");
        assert!(!out.contains("href=\"style.css\""));
        assert!(out.contains("<script defer>document.title = 'x';"), "{out}");
        assert!(
            out.contains("<\\/script> in a string"),
            "a closing tag inside the code is escaped: {out}"
        );
        assert!(!out.contains("src=\"js/app.js\""));
        assert!(out.contains("src=\"data:image/png;base64,"), "{out}");
        assert!(out.contains("alt=\"d\""));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn web_addresses_missing_files_and_other_folders_are_left_alone() {
        let (root, page) = site();
        let html = r#"<link rel="stylesheet" href="https://cdn.example.com/a.css"><link rel="stylesheet" href="missing.css"><script src="../secret.txt"></script><img src="data:image/png;base64,AAAA"><link rel="icon" href="style.css">"#;
        assert_eq!(bundle(html, &page, &root), html);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn a_page_in_a_folder_finds_its_files_beside_it() {
        let (root, _) = site();
        std::fs::create_dir_all(root.join("sub")).unwrap();
        std::fs::write(root.join("sub/own.css"), "p{}").unwrap();
        let out = bundle(
            r"<link rel='stylesheet' href='own.css?v=2'><link rel=stylesheet href=../style.css>",
            &root.join("sub/page.html"),
            &root,
        );
        assert!(out.contains("<style>p{}</style>"), "{out}");
        assert!(out.contains("<style>body { color: red }</style>"), "{out}");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn tags_and_attributes_are_read_with_quotes_and_case() {
        let html = "<LINK REL=\"StyleSheet\" HREF='a b.css' data-x=\"1>2\"><linked>";
        let tags = opening_tags(html, "link");
        assert_eq!(tags.len(), 1, "{tags:?}");
        let tag = &html[tags[0].0..=tags[0].1];
        assert_eq!(attribute(tag, "href").as_deref(), Some("a b.css"));
        assert_eq!(attribute(tag, "data-x").as_deref(), Some("1>2"));
        assert_eq!(attribute(tag, "missing"), None);
        assert_eq!(
            without_attribute("<script src=\"a.js\" defer>", "src"),
            "<script defer>"
        );
    }
}
