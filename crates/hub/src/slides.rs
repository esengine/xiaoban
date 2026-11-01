use std::sync::OnceLock;
use std::time::Duration;

use base64::Engine as _;
use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{
    Attachment, ChartKind, ContextNote, Deck, DeckSummary, DocVersionInfo, ErrorCode, Event, FoundImage, ProtocolError,
    Request, Response, Slide, SlideChange, SlideChart, SlideColumn, SlideImage, SlideItem, SlideLayout, Transition,
};
use xiaoban_store::now_ms;

use crate::state::SharedState;
use crate::tools::HubTools;

pub const START: &str = "slides_start";
pub const PAGE: &str = "slides_page";
pub const EDIT: &str = "slides_edit";
const MAX_SLIDES: usize = 60;
const THEMES: [&str; 4] = ["blue", "green", "orange", "night"];
pub const ICONS: [&str; 54] = [
    "rocket", "chart-line", "chart-bar", "users", "user", "shield-check", "clock", "sparkles", "target", "lightbulb",
    "circle-check", "triangle-alert", "trending-up", "trending-down", "dollar-sign", "calendar", "map-pin", "house",
    "heart", "star", "zap", "settings", "search", "mail", "phone", "message-circle", "book-open", "graduation-cap",
    "briefcase", "building", "globe", "lock", "cloud", "database", "cpu", "smartphone", "monitor", "wifi", "truck",
    "shopping-cart", "gift", "coffee", "utensils", "plane", "car", "leaf", "sun", "flag", "award", "puzzle", "layers",
    "refresh-cw", "thumbs-up", "smile",
];
const IMAGE_API: &str = "https://commons.wikimedia.org/w/api.php";

pub fn is_tool(name: &str) -> bool {
    matches!(name, START | PAGE | EDIT)
}

fn key(id: &str) -> String {
    format!("deck.{id}")
}

fn version_key(id: &str, version: u32) -> String {
    format!("deck.{id}.v{version}")
}

fn thread_key(thread_id: &str) -> String {
    format!("deck.thread.{thread_id}")
}

fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}

async fn read<T: serde::de::DeserializeOwned>(state: &SharedState, key: String) -> Option<T> {
    state
        .store
        .setting_owned(key)
        .await
        .ok()
        .flatten()
        .filter(|text| !text.is_empty())
        .and_then(|text| serde_json::from_str(&text).ok())
}

async fn write<T: serde::Serialize>(state: &SharedState, key: String, value: &T) {
    let _ = state
        .store
        .set_setting_owned(key, serde_json::to_string(value).unwrap_or_default())
        .await;
}

pub async fn load(state: &SharedState, id: &str) -> Option<Deck> {
    read(state, key(id)).await
}

pub fn summary(deck: &Deck) -> DeckSummary {
    let count = |value: usize| u32::try_from(value).unwrap_or(u32::MAX);
    DeckSummary {
        id: deck.id.clone(),
        source_thread_id: deck.source_thread_id.clone(),
        title: deck.title.clone(),
        theme: deck.theme.clone(),
        pages: count(deck.slides.len()),
        total: count(deck.outline.len().max(deck.slides.len())),
        writing: deck.writing,
        preview: deck.slides.iter().take(3).cloned().collect(),
        updated_at: deck.updated_at,
    }
}

async fn save(state: &SharedState, deck: &mut Deck) {
    deck.slides.truncate(MAX_SLIDES);
    deck.updated_at = now_ms();
    write(state, key(&deck.id), deck).await;
    state.publish(Event::DeckUpdated { summary: summary(deck) });
}

async fn snapshot(state: &SharedState, deck: &mut Deck, note: String, by_user: bool) {
    deck.version += 1;
    write(state, version_key(&deck.id, deck.version), &deck.slides).await;
    deck.versions.push(DocVersionInfo { version: deck.version, note, by_user, at: now_ms() });
}

pub async fn for_thread(state: &SharedState, thread_id: &str) -> Option<Deck> {
    let id: String = state.store.setting_owned(thread_key(thread_id)).await.ok().flatten().filter(|id| !id.is_empty())?;
    load(state, &id).await
}

pub async fn is_deck_thread(state: &SharedState, thread_id: &str) -> bool {
    state.store.setting_owned(thread_key(thread_id)).await.ok().flatten().is_some_and(|id| !id.is_empty())
}

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

fn page_schema(l: &Localizer) -> Value {
    let strings = json!({ "type": "array", "items": { "type": "string" } });
    json!({
        "type": "object",
        "properties": {
            "layout": { "type": "string", "enum": ["title", "bullets", "number", "chart", "two", "section", "flow", "timeline", "compare", "funnel", "icons", "quote"], "description": l.text(keys::TOOL_SLIDES_LAYOUT) },
            "title": text(l, keys::TOOL_SLIDES_PAGE_TITLE),
            "subtitle": text(l, keys::TOOL_SLIDES_SUBTITLE),
            "items": { "type": "array", "description": l.text(keys::TOOL_SLIDES_ITEMS), "items": {
                "type": "object",
                "properties": {
                    "text": { "type": "string" },
                    "note": { "type": "string" },
                    "value": { "type": "string" },
                    "icon": { "type": "string", "enum": ICONS.as_slice() },
                },
                "required": ["text"],
                "additionalProperties": false,
            } },
            "columns": { "type": "array", "maxItems": 2, "description": l.text(keys::TOOL_SLIDES_COLUMNS), "items": {
                "type": "object",
                "properties": { "title": { "type": "string" }, "items": strings },
                "required": ["title", "items"],
                "additionalProperties": false,
            } },
            "chart": {
                "type": "object",
                "description": l.text(keys::TOOL_SLIDES_CHART),
                "properties": {
                    "kind": { "type": "string", "enum": ["bar", "line", "pie"] },
                    "labels": strings,
                    "values": { "type": "array", "items": { "type": "number" } },
                    "highlight": { "type": "integer", "minimum": 0 },
                },
                "required": ["kind", "labels", "values"],
                "additionalProperties": false,
            },
            "image_query": text(l, keys::TOOL_SLIDES_IMAGE),
            "notes": text(l, keys::TOOL_SLIDES_NOTES),
        },
        "required": ["layout", "title"],
        "additionalProperties": false,
    })
}

pub fn with_write_specs(mut tools: Vec<ToolSpec>, l: &Localizer) -> Vec<ToolSpec> {
    tools.push(ToolSpec {
        name: START.to_owned(),
        description: l.text(keys::TOOL_SLIDES_START_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "title": text(l, keys::TOOL_SLIDES_TITLE),
                "theme": { "type": "string", "enum": THEMES, "description": l.text(keys::TOOL_SLIDES_THEME) },
                "pages": { "type": "array", "items": { "type": "string" }, "maxItems": MAX_SLIDES, "description": l.text(keys::TOOL_SLIDES_PAGES) },
            },
            "required": ["title", "pages"],
            "additionalProperties": false,
        }),
    });
    tools.push(ToolSpec {
        name: PAGE.to_owned(),
        description: l.text(keys::TOOL_SLIDES_PAGE_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": { "deck_id": text(l, keys::TOOL_SLIDES_DECK_ID), "page": page_schema(l) },
            "required": ["deck_id", "page"],
            "additionalProperties": false,
        }),
    });
    tools
}

pub fn edit_specs(l: &Localizer) -> Vec<ToolSpec> {
    vec![ToolSpec {
        name: EDIT.to_owned(),
        description: l.text(keys::TOOL_SLIDES_EDIT_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "note": text(l, keys::TOOL_DOC_NOTE),
                "theme": { "type": "string", "enum": THEMES },
                "transition": { "type": "string", "enum": ["fade", "push", "zoom", "none"] },
                "changes": { "type": "array", "items": {
                    "type": "object",
                    "properties": {
                        "op": { "type": "string", "enum": ["replace", "insert_after", "delete", "move_after"], "description": l.text(keys::TOOL_SLIDES_OP) },
                        "page": { "type": "integer", "minimum": 0, "description": l.text(keys::TOOL_SLIDES_PAGE_NUMBER) },
                        "to": { "type": "integer", "minimum": 0 },
                        "slide": page_schema(l),
                    },
                    "required": ["op", "page"],
                    "additionalProperties": false,
                } },
            },
            "required": ["note", "changes"],
            "additionalProperties": false,
        }),
    }]
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct ChartArg {
    kind: String,
    labels: Vec<String>,
    values: Vec<Value>,
    highlight: Option<u32>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct PageArg {
    layout: String,
    title: String,
    subtitle: String,
    items: Vec<SlideItem>,
    columns: Vec<SlideColumn>,
    chart: Option<ChartArg>,
    image_query: String,
    notes: String,
}

fn layout_of(name: &str) -> SlideLayout {
    match name {
        "title" => SlideLayout::Title,
        "number" => SlideLayout::Number,
        "chart" => SlideLayout::Chart,
        "two" => SlideLayout::Two,
        "section" => SlideLayout::Section,
        "flow" => SlideLayout::Flow,
        "timeline" => SlideLayout::Timeline,
        "compare" => SlideLayout::Compare,
        "funnel" => SlideLayout::Funnel,
        "icons" => SlideLayout::Icons,
        "quote" => SlideLayout::Quote,
        _ => SlideLayout::Bullets,
    }
}

fn slide_from(arg: PageArg) -> (Slide, String) {
    let chart = arg.chart.map(|chart| SlideChart {
        kind: match chart.kind.as_str() {
            "line" => ChartKind::Line,
            "pie" => ChartKind::Pie,
            _ => ChartKind::Bar,
        },
        labels: chart.labels,
        values: chart.values.iter().map(|value| value.as_f64().map_or_else(|| value.as_str().unwrap_or_default().to_owned(), crate::sheet_formula::show)).collect(),
        highlight: chart.highlight,
    });
    let items = arg
        .items
        .into_iter()
        .take(12)
        .map(|mut item| {
            if !ICONS.contains(&item.icon.as_str()) {
                item.icon.clear();
            }
            item
        })
        .collect();
    (
        Slide {
            id: new_id(),
            layout: layout_of(&arg.layout),
            title: arg.title.trim().to_owned(),
            subtitle: arg.subtitle.trim().to_owned(),
            items,
            columns: arg.columns.into_iter().take(2).collect(),
            chart,
            image: None,
            notes: arg.notes,
            still: false,
        },
        arg.image_query,
    )
}

#[derive(Deserialize)]
struct StartArgs {
    title: String,
    #[serde(default)]
    theme: String,
    pages: Vec<String>,
}

#[derive(Deserialize)]
struct PageArgs {
    deck_id: String,
    page: PageArg,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Change {
    op: String,
    page: u32,
    to: u32,
    slide: Option<PageArg>,
}

#[derive(Deserialize)]
struct EditArgs {
    note: String,
    #[serde(default)]
    theme: Option<String>,
    #[serde(default)]
    transition: Option<String>,
    changes: Vec<Change>,
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        xiaoban_agent::http_builder()
            .timeout(Duration::from_secs(10))
            .user_agent(concat!("Xiaoban/", env!("CARGO_PKG_VERSION"), " (local desktop app)"))
            .build()
            .unwrap_or_default()
    })
}

pub async fn search_images(query: &str, limit: u32) -> Vec<FoundImage> {
    let term = format!("{} filetype:bitmap", query.trim());
    let limit = limit.clamp(1, 12).to_string();
    let Ok(response) = client()
        .get(IMAGE_API)
        .query(&[
            ("action", "query"),
            ("generator", "search"),
            ("gsrsearch", term.as_str()),
            ("gsrnamespace", "6"),
            ("gsrlimit", limit.as_str()),
            ("prop", "imageinfo"),
            ("iiprop", "url|extmetadata"),
            ("iiurlwidth", "1280"),
            ("format", "json"),
        ])
        .send()
        .await
    else {
        return Vec::new();
    };
    let Ok(value) = response.json::<Value>().await else {
        return Vec::new();
    };
    let Some(pages) = value["query"]["pages"].as_object() else {
        return Vec::new();
    };
    let clean = |text: &str| {
        let mut out = String::new();
        let mut inside = false;
        for c in text.chars() {
            match c {
                '<' => inside = true,
                '>' => inside = false,
                _ if !inside => out.push(c),
                _ => {}
            }
        }
        out.trim().to_owned()
    };
    pages
        .values()
        .filter_map(|page| {
            let info = &page["imageinfo"][0];
            let url = info["thumburl"].as_str().filter(|url| url.starts_with("https://"))?.to_owned();
            let meta = &info["extmetadata"];
            let artist = clean(meta["Artist"]["value"].as_str().unwrap_or_default());
            let license = meta["LicenseShortName"]["value"].as_str().unwrap_or_default().to_owned();
            Some(FoundImage {
                thumb: url.replace("/1280px-", "/320px-"),
                url,
                credit: [artist, license, "Wikimedia Commons".to_owned()].into_iter().filter(|part| !part.is_empty()).collect::<Vec<_>>().join(" · "),
            })
        })
        .collect()
}

fn find_images(state: &SharedState, deck_id: String, wanted: Vec<(String, String)>) {
    if wanted.is_empty() {
        return;
    }
    let state = std::sync::Arc::clone(state);
    tokio::spawn(async move {
        let mut found = Vec::new();
        for (slide_id, query) in wanted {
            if let Some(image) = search_images(&query, 1).await.into_iter().next() {
                found.push((slide_id, image));
            }
        }
        if found.is_empty() {
            return;
        }
        let Some(mut deck) = load(&state, &deck_id).await else { return };
        for (slide_id, image) in found {
            if let Some(slide) = deck.slides.iter_mut().find(|slide| slide.id == slide_id) {
                slide.image = Some(SlideImage { url: image.url, credit: image.credit });
            }
        }
        save(&state, &mut deck).await;
    });
}

fn transition_of(name: &str) -> Transition {
    match name {
        "push" => Transition::Push,
        "zoom" => Transition::Zoom,
        "none" => Transition::None,
        _ => Transition::Fade,
    }
}

impl HubTools<'_> {
    pub(crate) async fn slides_tool(&self, name: &str, arguments: &str) -> String {
        let state = self.state;
        match name {
            START => {
                let Ok(args) = serde_json::from_str::<StartArgs>(arguments) else {
                    return error("arguments must be {title, theme?, pages: [...]}");
                };
                let mut deck = Deck {
                    id: new_id(),
                    source_thread_id: self.thread_id.to_owned(),
                    title: args.title.trim().to_owned(),
                    theme: if THEMES.contains(&args.theme.as_str()) { args.theme } else { THEMES[0].to_owned() },
                    outline: args.pages.into_iter().take(MAX_SLIDES).collect(),
                    writing: true,
                    ..Deck::default()
                };
                save(state, &mut deck).await;
                self.attach(Attachment::Deck { deck_id: deck.id.clone() });
                json!({ "deck_id": deck.id, "hint": "now call slides_page once per page, in order" }).to_string()
            }
            PAGE => {
                let Ok(args) = serde_json::from_str::<PageArgs>(arguments) else {
                    return error("arguments must be {deck_id, page: {layout, title, ...}}");
                };
                let Some(mut deck) = load(state, &args.deck_id).await else {
                    return error("no deck with that id");
                };
                let (slide, query) = slide_from(args.page);
                let slide_id = slide.id.clone();
                deck.slides.push(slide);
                let left = deck.outline.len().saturating_sub(deck.slides.len());
                if left == 0 && deck.writing {
                    deck.writing = false;
                    snapshot(state, &mut deck, state.localizer.text(keys::SLIDES_VERSION_FIRST), false).await;
                }
                save(state, &mut deck).await;
                if !query.trim().is_empty() {
                    find_images(state, deck.id.clone(), vec![(slide_id, query)]);
                }
                self.attach(Attachment::Deck { deck_id: deck.id.clone() });
                if left == 0 {
                    json!({ "done": true, "hint": "the deck is ready; reply in one or two sentences, do not repeat the content" }).to_string()
                } else {
                    json!({ "written": deck.slides.len(), "left": left }).to_string()
                }
            }
            _ => {
                let Some(mut deck) = for_thread(state, self.thread_id).await else {
                    return error("this conversation has no deck");
                };
                let Ok(args) = serde_json::from_str::<EditArgs>(arguments) else {
                    return error("arguments must be {note, theme?, transition?, changes: [...]}");
                };
                if let Some(theme) = args.theme.filter(|theme| THEMES.contains(&theme.as_str())) {
                    deck.theme = theme;
                }
                if let Some(transition) = args.transition {
                    deck.transition = transition_of(&transition);
                }
                let mut images = Vec::new();
                let mut skipped = Vec::new();
                for (index, change) in args.changes.into_iter().enumerate() {
                    if !apply(&mut deck, change, &mut images) {
                        skipped.push(index);
                    }
                }
                snapshot(state, &mut deck, args.note, false).await;
                save(state, &mut deck).await;
                find_images(state, deck.id.clone(), images);
                if skipped.is_empty() {
                    json!({ "version": deck.version, "hint": "the changed pages show a before/after card; reply in one short sentence" }).to_string()
                } else {
                    json!({ "skipped": skipped, "hint": "these changes were not applied (check op and page number); fix them before replying" }).to_string()
                }
            }
        }
    }
}

fn apply(deck: &mut Deck, change: Change, images: &mut Vec<(String, String)>) -> bool {
    let index = change.page as usize;
    let count = deck.slides.len();
    let remember = |deck: &mut Deck, slide_id: &str, before: Option<Slide>| {
        if !deck.changes.iter().any(|item| item.slide_id == slide_id) {
            deck.changes.push(SlideChange { slide_id: slide_id.to_owned(), before });
        }
    };
    match change.op.as_str() {
        "delete" if index >= 1 && index <= count => {
            deck.slides.remove(index - 1);
            true
        }
        "move_after" if index >= 1 && index <= count && (change.to as usize) <= count => {
            let slide = deck.slides.remove(index - 1);
            let to = (change.to as usize).min(deck.slides.len());
            deck.slides.insert(to, slide);
            true
        }
        "insert_after" if index <= count => {
            let Some(arg) = change.slide else { return false };
            let (slide, query) = slide_from(arg);
            if !query.trim().is_empty() {
                images.push((slide.id.clone(), query));
            }
            remember(deck, &slide.id.clone(), None);
            deck.slides.insert(index, slide);
            true
        }
        "replace" if index >= 1 && index <= count => {
            let Some(arg) = change.slide else { return false };
            let (mut slide, query) = slide_from(arg);
            let old = deck.slides[index - 1].clone();
            slide.id.clone_from(&old.id);
            if query.trim().is_empty() {
                slide.image.clone_from(&old.image);
            } else {
                images.push((slide.id.clone(), query));
            }
            let old_id = old.id.clone();
            remember(deck, &old_id, Some(old));
            deck.slides[index - 1] = slide;
            true
        }
        _ => false,
    }
}

pub async fn note(state: &SharedState, thread_id: &str) -> Option<ContextNote> {
    let deck = for_thread(state, thread_id).await?;
    let pages: Vec<Value> = deck
        .slides
        .iter()
        .enumerate()
        .map(|(index, slide)| {
            let mut page = serde_json::to_value(slide).unwrap_or_default();
            if let Some(object) = page.as_object_mut() {
                object.remove("id");
                object.remove("image");
                object.insert("page".to_owned(), json!(index + 1));
            }
            page
        })
        .collect();
    Some(ContextNote {
        label: state.localizer.format(keys::SLIDES_CONTEXT_LABEL, &[("title", deck.title.as_str())]),
        body: json!({ "theme": deck.theme, "transition": deck.transition, "pages": pages }).to_string(),
    })
}

async fn open(state: &SharedState, id: &str) -> Result<Deck, ProtocolError> {
    static OPENING: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    let _guard = OPENING.lock().await;
    let mut deck = load(state, id).await.ok_or_else(|| ProtocolError::new(ErrorCode::NotFound, "deck not found"))?;
    let parent = state.store.thread(deck.source_thread_id.clone()).await.ok().map(|thread| thread.parent_id.unwrap_or(thread.id));
    if let Some(thread) = &deck.thread_id
        && state.store.thread(thread.clone()).await.is_ok()
    {
        return Ok(deck);
    }
    let created = state
        .store
        .create_child_thread(Some(deck.title.clone()), parent)
        .await
        .map_err(|failure| ProtocolError::new(ErrorCode::Internal, failure.to_string()))?;
    let _ = state.store.set_setting_owned(thread_key(&created.id), deck.id.clone()).await;
    state.publish(Event::ThreadUpdated { thread: created.clone() });
    deck.thread_id = Some(created.id);
    save(state, &mut deck).await;
    Ok(deck)
}

fn save_export(path: &str, data: &str) -> Result<String, String> {
    let target = std::path::Path::new(path);
    let ok_ext = target
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ["pptx", "pdf", "png", "zip"].contains(&ext.to_ascii_lowercase().as_str()));
    if !ok_ext || !target.is_absolute() || target.parent().is_none_or(|dir| !dir.is_dir()) {
        return Err("path must be an absolute .pptx/.pdf/.png/.zip file in an existing folder".to_owned());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data.trim()).map_err(|error| error.to_string())?;
    let target = crate::doc::unique(target);
    std::fs::write(&target, bytes).map_err(|error| error.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

pub async fn handle(state: &SharedState, local: bool, request: Request) -> Result<Response, ProtocolError> {
    let missing = || ProtocolError::new(ErrorCode::NotFound, "deck not found");
    match request {
        Request::SearchImages { query } => Ok(Response::Images { images: search_images(&query, 8).await }),
        Request::SaveExport { path, data } => {
            if !local {
                return Err(ProtocolError::new(ErrorCode::Unauthorized, "only the hub's own machine can save files"));
            }
            let saved = tokio::task::spawn_blocking(move || save_export(&path, &data))
                .await
                .map_err(|_| ProtocolError::new(ErrorCode::Internal, "saving stopped"))?
                .map_err(|failure| ProtocolError::new(ErrorCode::BadRequest, failure))?;
            Ok(Response::Exported { path: saved })
        }
        Request::DeckSummary { id } => Ok(Response::DeckSummary { summary: summary(&load(state, &id).await.ok_or_else(missing)?) }),
        Request::OpenDeck { id } => Ok(Response::Deck { deck: open(state, &id).await? }),
        Request::Deck { id } => Ok(Response::Deck { deck: load(state, &id).await.ok_or_else(missing)? }),
        Request::SetSlides { id, slides, theme, transition } => {
            let mut deck = load(state, &id).await.ok_or_else(missing)?;
            for slide in &slides {
                let before = deck.slides.iter().find(|known| known.id == slide.id);
                if before.is_none_or(|known| known != slide) {
                    deck.changes.retain(|change| change.slide_id != slide.id);
                }
            }
            deck.slides = slides.into_iter().take(MAX_SLIDES).collect();
            if let Some(theme) = theme.filter(|theme| THEMES.contains(&theme.as_str())) {
                deck.theme = theme;
            }
            if let Some(transition) = transition {
                deck.transition = transition;
            }
            save(state, &mut deck).await;
            Ok(Response::Deck { deck })
        }
        Request::ResolveSlideChange { id, slide_id, keep } => {
            let mut deck = load(state, &id).await.ok_or_else(missing)?;
            if let Some(index) = deck.changes.iter().position(|change| change.slide_id == slide_id) {
                let change = deck.changes.remove(index);
                if !keep {
                    match change.before {
                        Some(before) => {
                            if let Some(slide) = deck.slides.iter_mut().find(|slide| slide.id == slide_id) {
                                *slide = before;
                            }
                        }
                        None => deck.slides.retain(|slide| slide.id != slide_id),
                    }
                }
            }
            save(state, &mut deck).await;
            Ok(Response::Deck { deck })
        }
        Request::RestoreDeckVersion { id, version } => {
            let mut deck = load(state, &id).await.ok_or_else(missing)?;
            if let Some(slides) = read::<Vec<Slide>>(state, version_key(&id, version)).await {
                deck.slides = slides;
                deck.changes.clear();
                let note = state.localizer.format(keys::DOC_VERSION_RESTORED, &[("version", &version.to_string())]);
                snapshot(state, &mut deck, note, true).await;
                save(state, &mut deck).await;
            }
            Ok(Response::Deck { deck })
        }
        _ => Err(ProtocolError::new(ErrorCode::BadRequest, "not a deck request")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page(title: &str) -> PageArg {
        PageArg { layout: "bullets".into(), title: title.into(), ..PageArg::default() }
    }

    #[test]
    fn edits_replace_insert_delete_and_remember_before() {
        let mut deck = Deck::default();
        for title in ["a", "b", "c"] {
            deck.slides.push(slide_from(page(title)).0);
        }
        let first_id = deck.slides[0].id.clone();
        let mut images = Vec::new();
        assert!(apply(&mut deck, Change { op: "replace".into(), page: 1, slide: Some(page("A")), ..Change::default() }, &mut images));
        assert!(apply(&mut deck, Change { op: "insert_after".into(), page: 1, slide: Some(page("new")), ..Change::default() }, &mut images));
        assert!(apply(&mut deck, Change { op: "delete".into(), page: 4, ..Change::default() }, &mut images));
        assert!(!apply(&mut deck, Change { op: "replace".into(), page: 9, slide: Some(page("x")), ..Change::default() }, &mut images));
        let titles: Vec<&str> = deck.slides.iter().map(|slide| slide.title.as_str()).collect();
        assert_eq!(titles, ["A", "new", "b"]);
        assert_eq!(deck.slides[0].id, first_id);
        assert_eq!(deck.changes[0].before.as_ref().map(|slide| slide.title.as_str()), Some("a"));
    }

    #[test]
    fn unknown_icons_are_dropped_and_numbers_become_text() {
        let arg = PageArg {
            layout: "chart".into(),
            items: vec![SlideItem { text: "x".into(), icon: "nope".into(), ..SlideItem::default() }],
            chart: Some(ChartArg { kind: "line".into(), labels: vec!["a".into()], values: vec![json!(7120.0)], highlight: None }),
            ..PageArg::default()
        };
        let (slide, _) = slide_from(arg);
        assert_eq!(slide.items[0].icon, "");
        assert_eq!(slide.chart.unwrap().values[0], "7120");
        assert_eq!(slide.layout, SlideLayout::Chart);
    }

    #[test]
    fn exports_only_go_to_safe_files() {
        let dir = std::env::temp_dir();
        assert!(save_export(&dir.join("x.exe").to_string_lossy(), "AAAA").is_err());
        assert!(save_export("relative.pptx", "AAAA").is_err());
        let ok = save_export(&dir.join(format!("deck-{}.pptx", new_id())).to_string_lossy(), "UEsDBA==").unwrap();
        assert!(std::path::Path::new(&ok).exists());
    }
}
