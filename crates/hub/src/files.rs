use std::fmt::Write as _;
use std::io::Read;
use std::path::{Path, PathBuf};

use base64::Engine;
use xiaoban_protocol::{FileInfo, FileMode};

pub const MAX_FILES: usize = 9;
pub const MAX_BYTES: u64 = 20 * 1024 * 1024;
pub const FULL_CHARS: usize = 10_000;
const CHUNK_CHARS: usize = 1_500;
const PREVIEW_CHARS: usize = 1_500;
const OUTLINE_LINES: usize = 30;
const OUTLINE_LINE_CHARS: usize = 60;
pub const READ_CHARS: usize = 8_000;
const SNIPPET_CHARS: usize = 300;
const NAMED: &str = "named";
const MAX_HITS: usize = 5;

const IMAGES: &[(&str, &str)] = &[
    ("png", "image/png"),
    ("jpg", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("gif", "image/gif"),
    ("webp", "image/webp"),
];
const TEXTS: &[&str] = &[
    "txt", "md", "markdown", "csv", "tsv", "json", "log", "xml", "html", "htm", "yaml", "yml",
    "toml", "ini", "rtf", "srt",
];

#[derive(Debug, Clone)]
pub struct Files {
    dir: PathBuf,
}

fn extension(name: &str) -> String {
    Path::new(name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_lowercase()
}

fn chunk(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    chars
        .chunks(CHUNK_CHARS)
        .map(|part| part.iter().collect::<String>())
        .filter(|part| !part.trim().is_empty())
        .collect()
}

fn docx_text(path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| error.to_string())?;
    let mut xml = String::new();
    archive
        .by_name("word/document.xml")
        .map_err(|error| error.to_string())?
        .read_to_string(&mut xml)
        .map_err(|error| error.to_string())?;
    let mut text = String::new();
    let mut rest = xml.as_str();
    while let Some(start) = rest.find('<') {
        text.push_str(&unescape(&rest[..start]));
        let Some(end) = rest[start..].find('>') else {
            break;
        };
        let tag = &rest[start + 1..start + end];
        if tag.starts_with("/w:p") || tag.starts_with("w:br") || tag.starts_with("w:cr") {
            text.push('\n');
        } else if tag.starts_with("w:tab") {
            text.push('\t');
        }
        rest = &rest[start + end + 1..];
    }
    Ok(text)
}

fn unescape(text: &str) -> String {
    text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

fn sheet_pages(path: &Path) -> Result<Vec<String>, String> {
    use calamine::{Data, Reader, open_workbook_auto};
    let mut book = open_workbook_auto(path).map_err(|error| error.to_string())?;
    let mut pages = Vec::new();
    for name in book.sheet_names() {
        let Ok(range) = book.worksheet_range(&name) else {
            continue;
        };
        let rows: Vec<String> = range
            .rows()
            .map(|row| {
                row.iter()
                    .map(|cell| match cell {
                        Data::Empty => String::new(),
                        other => other.to_string(),
                    })
                    .collect::<Vec<_>>()
                    .join("\t")
            })
            .collect();
        for part in chunk(&rows.join("\n")) {
            pages.push(format!("[{name}]\n{part}"));
        }
    }
    Ok(pages)
}

fn extract(path: &Path, ext: &str) -> Result<Vec<String>, String> {
    match ext {
        "pdf" => pdf_extract::extract_text_by_pages(path).map_err(|error| error.to_string()),
        "docx" => docx_text(path).map(|text| chunk(&text)),
        "xlsx" | "xlsm" | "xls" | "ods" => sheet_pages(path),
        text if TEXTS.contains(&text) => std::fs::read(path)
            .map(|bytes| chunk(&String::from_utf8_lossy(&bytes)))
            .map_err(|error| error.to_string()),
        _ => Err("unsupported".to_owned()),
    }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

fn bigrams(text: &str) -> Vec<String> {
    let lower = text.to_lowercase();
    let mut terms: Vec<String> = lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty() && word.is_ascii())
        .map(str::to_owned)
        .collect();
    let han: Vec<char> = lower.chars().filter(|c| !c.is_ascii()).collect();
    if han.len() == 1 {
        terms.push(han[0].to_string());
    }
    terms.extend(han.windows(2).map(|pair| pair.iter().collect()));
    terms
}

fn snippet(page: &str, terms: &[String]) -> String {
    let lower = page.to_lowercase();
    let at = terms
        .iter()
        .filter_map(|term| lower.find(term.as_str()))
        .min()
        .unwrap_or(0);
    let start = lower[..at]
        .chars()
        .count()
        .saturating_sub(SNIPPET_CHARS / 3);
    page.chars().skip(start).take(SNIPPET_CHARS).collect()
}

impl Files {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    fn pages_path(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.pages.json"))
    }

    fn original_path(&self, id: &str, name: &str) -> PathBuf {
        self.dir.join(format!("{id}.{}", extension(name)))
    }

    fn uploads(&self) -> PathBuf {
        self.dir.with_file_name("uploads")
    }

    pub fn upload(&self, name: &str, bytes: &[u8]) -> Result<PathBuf, String> {
        if bytes.len() as u64 > MAX_BYTES {
            return Err(format!("{name} is larger than 20MB"));
        }
        let safe = Path::new(name)
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty() && !name.starts_with('.'))
            .unwrap_or("file");
        let dir = self.uploads().join(uuid::Uuid::now_v7().to_string());
        std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
        let path = dir.join(safe);
        std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
        Ok(path)
    }

    pub fn is_upload(&self, path: &str) -> bool {
        let (Ok(path), Ok(root)) = (
            std::fs::canonicalize(path),
            std::fs::canonicalize(self.uploads()),
        ) else {
            return false;
        };
        path.starts_with(root)
    }

    pub fn ingest(&self, source: &Path) -> Result<FileInfo, String> {
        let name = source
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or("the file has no name")?
            .to_owned();
        let size = std::fs::metadata(source)
            .map_err(|error| error.to_string())?
            .len();
        if size > MAX_BYTES {
            return Err(format!("{name} is larger than 20MB"));
        }
        std::fs::create_dir_all(&self.dir).map_err(|error| error.to_string())?;
        let id = uuid::Uuid::now_v7().to_string();
        let ext = extension(&name);
        let stored = self.original_path(&id, &name);
        std::fs::copy(source, &stored).map_err(|error| error.to_string())?;
        if let Some((_, mime)) = IMAGES.iter().find(|(known, _)| *known == ext) {
            return Ok(FileInfo {
                id,
                name,
                mime: (*mime).to_owned(),
                size,
                pages: None,
                mode: FileMode::Image,
            });
        }
        let pages = extract(&stored, &ext).unwrap_or_default();
        let chars: usize = pages.iter().map(|page| page.chars().count()).sum();
        let mode = if pages.iter().all(|page| page.trim().is_empty()) {
            FileMode::Unreadable
        } else if chars <= FULL_CHARS {
            FileMode::Full
        } else {
            FileMode::OnDemand
        };
        if mode != FileMode::Unreadable {
            let json = serde_json::to_vec(&pages).map_err(|error| error.to_string())?;
            std::fs::write(self.pages_path(&id), json).map_err(|error| error.to_string())?;
        }
        Ok(FileInfo {
            id,
            name,
            mime: "application/octet-stream".to_owned(),
            size,
            pages: u32::try_from(pages.len()).ok(),
            mode,
        })
    }

    pub fn pages(&self, id: &str) -> Option<Vec<String>> {
        if !valid_id(id) {
            return None;
        }
        let bytes = std::fs::read(self.pages_path(id)).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    pub fn bytes(&self, info: &FileInfo) -> Option<Vec<u8>> {
        valid_id(&info.id)
            .then(|| std::fs::read(self.original_path(&info.id, &info.name)).ok())
            .flatten()
    }

    fn stored(&self, id: &str) -> Option<PathBuf> {
        if !valid_id(id) {
            return None;
        }
        let prefix = format!("{id}.");
        std::fs::read_dir(&self.dir)
            .ok()?
            .flatten()
            .find(|entry| {
                let name = entry.file_name().to_string_lossy().into_owned();
                name.starts_with(&prefix) && !name.ends_with(".pages.json")
            })
            .map(|entry| entry.path())
    }

    pub fn named(&self, id: &str, name: &str) -> Option<PathBuf> {
        let stored = self.stored(id)?;
        let plain = Path::new(name)
            .file_name()
            .map(|name| name.to_string_lossy().replace(['/', '\\', ':'], "_"))
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| {
                stored
                    .file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_default()
            });
        let folder = self.dir.join(NAMED).join(id);
        let path = folder.join(plain);
        if !path.exists() {
            std::fs::create_dir_all(&folder).ok()?;
            if std::fs::hard_link(&stored, &path).is_err() {
                std::fs::copy(&stored, &path).ok()?;
            }
        }
        Some(path)
    }

    pub fn data_url_by_id(&self, id: &str) -> Option<String> {
        if !valid_id(id) {
            return None;
        }
        let prefix = format!("{id}.");
        let entry = std::fs::read_dir(&self.dir).ok()?.flatten().find(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            name.starts_with(&prefix) && !name.ends_with(".pages.json")
        })?;
        let name = entry.file_name().to_string_lossy().into_owned();
        let ext = extension(&name);
        let (_, mime) = IMAGES.iter().find(|(known, _)| *known == ext)?;
        let bytes = std::fs::read(entry.path()).ok()?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        Some(format!("data:{mime};base64,{encoded}"))
    }

    pub fn data_url(&self, info: &FileInfo) -> Option<String> {
        let bytes = self.bytes(info)?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        Some(format!("data:{};base64,{encoded}", info.mime))
    }

    pub fn search(&self, id: &str, query: &str) -> Option<Vec<(usize, String)>> {
        let pages = self.pages(id)?;
        let terms = bigrams(query);
        let mut scored: Vec<(usize, usize)> = pages
            .iter()
            .enumerate()
            .map(|(index, page)| {
                let lower = page.to_lowercase();
                let score = terms
                    .iter()
                    .map(|term| lower.matches(term.as_str()).count())
                    .sum();
                (index, score)
            })
            .filter(|(_, score)| *score > 0)
            .collect();
        scored.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        Some(
            scored
                .into_iter()
                .take(MAX_HITS)
                .map(|(index, _)| (index + 1, snippet(&pages[index], &terms)))
                .collect(),
        )
    }

    pub fn read(&self, id: &str, from: usize, to: usize) -> Option<(String, usize, bool)> {
        let pages = self.pages(id)?;
        let from = from.max(1);
        let to = to.min(pages.len()).max(from);
        let mut text = String::new();
        let mut last = from - 1;
        for (index, page) in pages.iter().enumerate().take(to).skip(from - 1) {
            if text.chars().count() + page.chars().count() > READ_CHARS && !text.is_empty() {
                return Some((text, last, true));
            }
            let _ = writeln!(text, "--- {} ---\n{page}", index + 1);
            last = index + 1;
        }
        Some((text, last, last < to))
    }
}

pub fn outline(pages: &[String]) -> String {
    let lines: Vec<String> = pages
        .iter()
        .enumerate()
        .flat_map(|(index, page)| {
            page.lines()
                .map(str::trim)
                .filter(|line| {
                    let count = line.chars().count();
                    (2..=OUTLINE_LINE_CHARS).contains(&count)
                        && !line.ends_with(['\u{3002}', '\u{ff0c}', '.', ',', '\u{ff1b}', ';'])
                })
                .take(2)
                .map(move |line| format!("p{} {line}", index + 1))
                .collect::<Vec<_>>()
        })
        .take(OUTLINE_LINES)
        .collect();
    lines.join("\n")
}

pub fn preview(pages: &[String]) -> String {
    pages.concat().chars().take(PREVIEW_CHARS).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("xiaoban-files-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn only_uploaded_files_pass_the_upload_check() {
        let dir = temp();
        let files = Files::new(dir.join("store"));
        let photo = files.upload("../../photo.jpg", b"jpeg").unwrap();
        assert_eq!(photo.file_name().unwrap(), "photo.jpg");
        assert!(files.is_upload(photo.to_str().unwrap()));
        let elsewhere = dir.join("secret.txt");
        std::fs::write(&elsewhere, "x").unwrap();
        assert!(!files.is_upload(elsewhere.to_str().unwrap()));
        let escape = photo.parent().unwrap().join("..").join("..").join("..").join("secret.txt");
        assert!(!files.is_upload(escape.to_str().unwrap()));
        assert!(files.upload("big.bin", &vec![0; usize::try_from(MAX_BYTES).unwrap() + 1]).is_err());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn small_text_is_sent_whole_and_large_text_on_demand() {
        let dir = temp();
        let files = Files::new(dir.join("store"));
        let small = dir.join("通知.txt");
        std::fs::write(&small, "周五下午三点开家长会").unwrap();
        let ingested = files.ingest(&small).unwrap();
        assert_eq!(ingested.mode, FileMode::Full);

        let large = dir.join("预算.md");
        let mut text = "客厅预算两万。".repeat(1_000);
        text.push_str("厨房橱柜预算一万八。");
        text.push_str(&"卧室预算一万。".repeat(1_000));
        std::fs::write(&large, text).unwrap();
        let ingested = files.ingest(&large).unwrap();
        assert_eq!(ingested.mode, FileMode::OnDemand);
        let hits = files.search(&ingested.id, "橱柜多少钱").unwrap();
        assert!(hits[0].1.contains("橱柜"));
        let (read, last, more) = files.read(&ingested.id, 1, 100).unwrap();
        assert!(read.starts_with("--- 1 ---"));
        assert!(more);
        assert!(last >= 1);
        assert!(files.pages("../etc/passwd").is_none());
    }

    #[test]
    fn images_keep_their_bytes() {
        let dir = temp();
        let files = Files::new(dir.join("store"));
        let image = dir.join("瓷砖.png");
        std::fs::write(&image, [137, 80, 78, 71]).unwrap();
        let ingested = files.ingest(&image).unwrap();
        assert_eq!(ingested.mode, FileMode::Image);
        assert!(
            files
                .data_url(&ingested)
                .unwrap()
                .starts_with("data:image/png;base64,")
        );
        let named = files.named(&ingested.id, "../瓷砖.png").unwrap();
        assert!(named.ends_with(format!("named/{}/瓷砖.png", ingested.id)));
        assert_eq!(std::fs::read(&named).unwrap(), [137, 80, 78, 71]);
        assert_eq!(files.named(&ingested.id, "瓷砖.png").unwrap(), named);
        assert!(files.named("../etc", "passwd").is_none());
        assert!(files.data_url_by_id(&ingested.id).is_some());
    }
}
