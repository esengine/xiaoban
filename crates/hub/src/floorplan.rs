use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{
    Attachment, ContextNote, ErrorCode, Event, Facing, FileMode, FloorItem, FloorLayout,
    FloorMeasure, FloorOpening, FloorPlan, FloorPoint, FloorRect, FloorRoom, FloorScheme,
    FloorVersion, OpeningKind, ProtocolError, Request, Response, Role,
};
use xiaoban_store::now_ms;

use crate::state::SharedState;
use crate::tools::HubTools;

pub const SAVE: &str = "floorplan_save";
pub const EDIT: &str = "floorplan_edit";
const KEY: &str = "floorplan.";
const THREAD_KEY: &str = "floorplan.thread.";
const MAX_ROOMS: usize = 40;
const MAX_ITEMS: usize = 40;
const MAX_OPENINGS: usize = 24;
const MAX_IDEAS: usize = 5;
const MAX_MEASURES: usize = 30;
const MAX_SCHEMES: usize = 6;
const MAX_VERSIONS: usize = 30;
const MAX_METERS: f64 = 300.0;
const SCHEME_IDS: [&str; MAX_SCHEMES] = ["A", "B", "C", "D", "E", "F"];

static LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

pub fn is_tool(name: &str) -> bool {
    matches!(name, SAVE | EDIT)
}

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

fn number(l: &Localizer, key: Key) -> Value {
    json!({ "type": "number", "description": l.text(key) })
}

fn segment(l: &Localizer) -> Value {
    json!({
        "x1": number(l, keys::TOOL_FLOORPLAN_X),
        "y1": number(l, keys::TOOL_FLOORPLAN_Y),
        "x2": number(l, keys::TOOL_FLOORPLAN_X),
        "y2": number(l, keys::TOOL_FLOORPLAN_Y),
    })
}

fn room_schema(l: &Localizer, editing: bool) -> Value {
    let rect = json!({
        "type": "object",
        "description": l.text(keys::TOOL_FLOORPLAN_RECT),
        "properties": {
            "x": number(l, keys::TOOL_FLOORPLAN_X),
            "y": number(l, keys::TOOL_FLOORPLAN_Y),
            "w": number(l, keys::TOOL_FLOORPLAN_W),
            "h": number(l, keys::TOOL_FLOORPLAN_H),
        },
        "required": ["x", "y", "w", "h"],
        "additionalProperties": false,
    });
    let mut opening = segment(l);
    opening["kind"] = json!({ "type": "string", "enum": ["door", "window"] });
    let item = json!({
        "type": "object",
        "properties": {
            "name": text(l, keys::TOOL_FLOORPLAN_ITEM_NAME),
            "x": number(l, keys::TOOL_FLOORPLAN_X),
            "y": number(l, keys::TOOL_FLOORPLAN_Y),
            "w": number(l, keys::TOOL_FLOORPLAN_W),
            "h": number(l, keys::TOOL_FLOORPLAN_H),
            "rotation": { "type": "integer", "description": l.text(keys::TOOL_FLOORPLAN_ROTATION) },
        },
        "required": ["name", "x", "y", "w", "h"],
        "additionalProperties": false,
    });
    let mut properties = json!({
        "name": text(l, keys::TOOL_FLOORPLAN_ROOM_NAME),
        "rect": rect,
        "points": {
            "type": "array",
            "description": l.text(keys::TOOL_FLOORPLAN_POINTS),
            "items": { "type": "array", "items": { "type": "number" }, "minItems": 2, "maxItems": 2 },
        },
        "facing": {
            "type": "string",
            "enum": ["north", "north_east", "east", "south_east", "south", "south_west", "west", "north_west"],
            "description": l.text(keys::TOOL_FLOORPLAN_FACING),
        },
        "openings": {
            "type": "array",
            "maxItems": MAX_OPENINGS,
            "description": l.text(keys::TOOL_FLOORPLAN_OPENINGS),
            "items": {
                "type": "object",
                "properties": opening,
                "required": ["kind", "x1", "y1", "x2", "y2"],
                "additionalProperties": false,
            },
        },
        "furniture": {
            "type": "array",
            "maxItems": MAX_ITEMS,
            "description": l.text(keys::TOOL_FLOORPLAN_FURNITURE),
            "items": item,
        },
        "advice": text(l, keys::TOOL_FLOORPLAN_ADVICE),
        "ideas": {
            "type": "array",
            "maxItems": MAX_IDEAS,
            "items": { "type": "string" },
            "description": l.text(keys::TOOL_FLOORPLAN_IDEAS),
        },
    });
    if editing {
        properties["was"] = text(l, keys::TOOL_FLOORPLAN_WAS);
    }
    json!({
        "type": "object",
        "properties": properties,
        "required": ["name"],
        "additionalProperties": false,
    })
}

fn unclear_schema(l: &Localizer) -> Value {
    let mut properties = segment(l);
    properties["room"] = text(l, keys::TOOL_FLOORPLAN_UNCLEAR_ROOM);
    properties["label"] = text(l, keys::TOOL_FLOORPLAN_UNCLEAR_LABEL);
    properties["estimate"] = number(l, keys::TOOL_FLOORPLAN_UNCLEAR_ESTIMATE);
    properties["note"] = text(l, keys::TOOL_FLOORPLAN_UNCLEAR_NOTE);
    json!({
        "type": "array",
        "maxItems": MAX_MEASURES,
        "description": l.text(keys::TOOL_FLOORPLAN_UNCLEAR),
        "items": {
            "type": "object",
            "properties": properties,
            "required": ["room", "label", "x1", "y1", "x2", "y2", "estimate", "note"],
            "additionalProperties": false,
        },
    })
}

pub fn specs(l: &Localizer) -> Vec<ToolSpec> {
    let save = ToolSpec {
        name: SAVE.to_owned(),
        description: l.text(keys::TOOL_FLOORPLAN_SAVE_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "title": text(l, keys::TOOL_FLOORPLAN_TITLE),
                "kind": text(l, keys::TOOL_FLOORPLAN_KIND),
                "area": number(l, keys::TOOL_FLOORPLAN_AREA),
                "rooms": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": MAX_ROOMS,
                    "items": room_schema(l, false),
                    "description": l.text(keys::TOOL_FLOORPLAN_ROOMS),
                },
                "unclear": unclear_schema(l),
            },
            "required": ["title", "kind", "rooms"],
            "additionalProperties": false,
        }),
    };
    let edit = ToolSpec {
        name: EDIT.to_owned(),
        description: l.text(keys::TOOL_FLOORPLAN_EDIT_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "note": text(l, keys::TOOL_FLOORPLAN_NOTE),
                "new_scheme": { "type": "boolean", "description": l.text(keys::TOOL_FLOORPLAN_NEW_SCHEME) },
                "scheme": text(l, keys::TOOL_FLOORPLAN_SCHEME),
                "title": text(l, keys::TOOL_FLOORPLAN_TITLE),
                "kind": text(l, keys::TOOL_FLOORPLAN_KIND),
                "area": number(l, keys::TOOL_FLOORPLAN_AREA),
                "rooms": {
                    "type": "array",
                    "maxItems": MAX_ROOMS,
                    "items": room_schema(l, true),
                    "description": l.text(keys::TOOL_FLOORPLAN_EDIT_ROOMS),
                },
                "remove_rooms": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": l.text(keys::TOOL_FLOORPLAN_REMOVE_ROOMS),
                },
                "unclear": unclear_schema(l),
                "measured": {
                    "type": "array",
                    "description": l.text(keys::TOOL_FLOORPLAN_MEASURED),
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": text(l, keys::TOOL_FLOORPLAN_UNCLEAR_LABEL),
                            "value": number(l, keys::TOOL_FLOORPLAN_MEASURED_VALUE),
                        },
                        "required": ["label", "value"],
                        "additionalProperties": false,
                    },
                },
            },
            "required": ["note"],
            "additionalProperties": false,
        }),
    };
    vec![save, edit]
}

#[derive(Deserialize)]
struct RectArg {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

#[derive(Deserialize)]
struct OpeningArg {
    #[serde(default)]
    kind: OpeningKind,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
}

#[derive(Deserialize)]
struct ItemArg {
    name: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    #[serde(default)]
    rotation: i32,
}

#[derive(Deserialize)]
struct RoomArg {
    name: String,
    #[serde(default)]
    was: Option<String>,
    #[serde(default)]
    rect: Option<RectArg>,
    #[serde(default)]
    points: Option<Vec<Vec<f64>>>,
    #[serde(default)]
    facing: Option<Facing>,
    #[serde(default)]
    openings: Option<Vec<OpeningArg>>,
    #[serde(default)]
    furniture: Option<Vec<ItemArg>>,
    #[serde(default)]
    advice: Option<String>,
    #[serde(default)]
    ideas: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct UnclearArg {
    room: String,
    label: String,
    x1: f64,
    y1: f64,
    x2: f64,
    y2: f64,
    estimate: f64,
    #[serde(default)]
    note: String,
}

#[derive(Deserialize)]
struct MeasuredArg {
    label: String,
    value: f64,
}

#[derive(Deserialize)]
struct SaveArgs {
    title: String,
    #[serde(default)]
    kind: String,
    #[serde(default)]
    area: Option<f64>,
    rooms: Vec<RoomArg>,
    #[serde(default)]
    unclear: Vec<UnclearArg>,
}

#[derive(Deserialize)]
struct EditArgs {
    #[serde(default)]
    note: String,
    #[serde(default)]
    new_scheme: bool,
    #[serde(default)]
    scheme: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    area: Option<f64>,
    #[serde(default)]
    rooms: Vec<RoomArg>,
    #[serde(default)]
    remove_rooms: Vec<String>,
    #[serde(default)]
    unclear: Vec<UnclearArg>,
    #[serde(default)]
    measured: Vec<MeasuredArg>,
}

fn meters(value: f64) -> Option<f64> {
    (value.is_finite() && value.abs() <= MAX_METERS).then(|| (value * 1000.0).round() / 1000.0)
}

fn length(value: f64) -> Option<f64> {
    meters(value).filter(|value| *value > 0.0)
}

fn point(x: f64, y: f64) -> Option<FloorPoint> {
    Some(FloorPoint {
        x: meters(x)?,
        y: meters(y)?,
    })
}

fn rect_points(rect: &RectArg) -> Option<Vec<FloorPoint>> {
    let (w, h) = (length(rect.w)?, length(rect.h)?);
    let (x, y) = (meters(rect.x)?, meters(rect.y)?);
    Some(vec![
        point(x, y)?,
        point(x + w, y)?,
        point(x + w, y + h)?,
        point(x, y + h)?,
    ])
}

fn polygon(points: &[Vec<f64>]) -> Option<Vec<FloorPoint>> {
    let parsed: Option<Vec<FloorPoint>> = points
        .iter()
        .map(|pair| match pair.as_slice() {
            [x, y] => point(*x, *y),
            _ => None,
        })
        .collect();
    parsed.filter(|points| points.len() >= 3)
}

pub fn area(points: &[FloorPoint]) -> f64 {
    if points.len() < 3 {
        return 0.0;
    }
    let doubled: f64 = points
        .iter()
        .zip(points.iter().cycle().skip(1))
        .map(|(a, b)| a.x * b.y - b.x * a.y)
        .sum();
    (doubled.abs() / 2.0 * 100.0).round() / 100.0
}

fn clean(text: &str) -> String {
    text.replace("**", "").trim().to_owned()
}

fn item(arg: &ItemArg) -> Option<FloorItem> {
    let name = clean(&arg.name);
    if name.is_empty() {
        return None;
    }
    Some(FloorItem {
        name,
        rect: FloorRect {
            x: meters(arg.x)?,
            y: meters(arg.y)?,
            w: length(arg.w)?,
            h: length(arg.h)?,
        },
        rotation: arg.rotation.rem_euclid(360),
    })
}

fn opening(arg: &OpeningArg) -> Option<FloorOpening> {
    Some(FloorOpening {
        kind: arg.kind,
        from: point(arg.x1, arg.y1)?,
        to: point(arg.x2, arg.y2)?,
    })
}

fn next_id(prefix: &str, taken: impl Iterator<Item = String>) -> String {
    let highest = taken
        .filter_map(|id| id.strip_prefix(prefix).and_then(|rest| rest.parse::<u32>().ok()))
        .max()
        .unwrap_or(0);
    format!("{prefix}{}", highest + 1)
}

fn upsert_room(layout: &mut FloorLayout, arg: &RoomArg) -> Result<(), String> {
    let name = clean(&arg.name);
    if name.is_empty() {
        return Err("every room needs a name".to_owned());
    }
    let shape = match (&arg.points, &arg.rect) {
        (Some(points), _) if !points.is_empty() => Some(
            polygon(points).ok_or_else(|| format!("{name}: points need at least 3 [x, y] pairs in meters"))?,
        ),
        (_, Some(rect)) => Some(
            rect_points(rect).ok_or_else(|| format!("{name}: rect needs a positive w and h in meters"))?,
        ),
        _ => None,
    };
    let lookup = arg.was.as_deref().map_or_else(|| name.clone(), clean);
    let found = layout
        .rooms
        .iter()
        .position(|room| room.name == lookup)
        .or_else(|| layout.rooms.iter().position(|room| room.name == name));
    let index = if let Some(index) = found {
        index
    } else {
        if layout.rooms.len() >= MAX_ROOMS {
            return Err("too many rooms".to_owned());
        }
        if shape.is_none() {
            return Err(format!("{name} is a new room; give its rect or points"));
        }
        let id = next_id("r", layout.rooms.iter().map(|room| room.id.clone()));
        layout.rooms.push(FloorRoom {
            id,
            ..FloorRoom::default()
        });
        layout.rooms.len() - 1
    };
    let room = &mut layout.rooms[index];
    room.name = name;
    if let Some(points) = shape {
        room.area = area(&points);
        room.points = points;
    }
    if arg.facing.is_some() {
        room.facing = arg.facing;
    }
    if let Some(openings) = &arg.openings {
        room.openings = openings.iter().filter_map(opening).take(MAX_OPENINGS).collect();
    }
    if let Some(items) = &arg.furniture {
        room.items = items.iter().filter_map(item).take(MAX_ITEMS).collect();
    }
    if let Some(advice) = &arg.advice {
        room.advice = clean(advice);
    }
    if let Some(ideas) = &arg.ideas {
        room.ideas = ideas
            .iter()
            .map(|idea| clean(idea))
            .filter(|idea| !idea.is_empty())
            .take(MAX_IDEAS)
            .collect();
    }
    Ok(())
}

fn add_unclear(layout: &mut FloorLayout, arg: &UnclearArg) -> Result<(), String> {
    let label = clean(&arg.label);
    let room_id = layout
        .rooms
        .iter()
        .find(|room| room.name == arg.room.trim())
        .map(|room| room.id.clone())
        .ok_or_else(|| format!("unclear {label}: no room named {}", arg.room))?;
    let estimate = length(arg.estimate).ok_or_else(|| format!("unclear {label}: estimate must be a positive length in meters"))?;
    let (Some(from), Some(to)) = (point(arg.x1, arg.y1), point(arg.x2, arg.y2)) else {
        return Err(format!("unclear {label}: x1, y1, x2, y2 must be in meters"));
    };
    if let Some(known) = layout.measures.iter_mut().find(|known| known.label == label) {
        known.room_id = room_id;
        known.from = from;
        known.to = to;
        known.estimate = estimate;
        known.note = clean(&arg.note);
        return Ok(());
    }
    if layout.measures.len() >= MAX_MEASURES {
        return Err("too many unclear sizes".to_owned());
    }
    let id = next_id("m", layout.measures.iter().map(|measure| measure.id.clone()));
    layout.measures.push(FloorMeasure {
        id,
        room_id,
        label,
        note: clean(&arg.note),
        from,
        to,
        estimate,
        value: None,
    });
    Ok(())
}

fn stretch(value: f64, min: f64, factor: f64) -> f64 {
    ((min + (value - min) * factor) * 1000.0).round() / 1000.0
}

pub fn apply_measure(layout: &mut FloorLayout, measure_id: &str, value: f64) -> bool {
    let Some(index) = layout.measures.iter().position(|measure| measure.id == measure_id) else {
        return false;
    };
    let measure = layout.measures[index].clone();
    let base = measure.value.unwrap_or(measure.estimate);
    layout.measures[index].value = Some(value);
    let horizontal = (measure.to.x - measure.from.x).abs() >= (measure.to.y - measure.from.y).abs();
    let Some(room) = layout.rooms.iter_mut().find(|room| room.id == measure.room_id) else {
        return true;
    };
    let along = |p: &FloorPoint| if horizontal { p.x } else { p.y };
    let min = room.points.iter().map(along).fold(f64::INFINITY, f64::min);
    let max = room.points.iter().map(along).fold(f64::NEG_INFINITY, f64::max);
    let extent = max - min;
    let grown = extent + (value - base);
    if !min.is_finite() || extent <= 0.01 || grown <= 0.01 {
        return true;
    }
    let factor = grown / extent;
    let scale = |p: &mut FloorPoint| {
        if horizontal {
            p.x = stretch(p.x, min, factor);
        } else {
            p.y = stretch(p.y, min, factor);
        }
    };
    for p in &mut room.points {
        scale(p);
    }
    for opening in &mut room.openings {
        scale(&mut opening.from);
        scale(&mut opening.to);
    }
    for item in &mut room.items {
        if horizontal {
            item.rect.x = stretch(item.rect.x, min, factor);
        } else {
            item.rect.y = stretch(item.rect.y, min, factor);
        }
    }
    room.area = area(&room.points);
    let target = &mut layout.measures[index];
    if horizontal {
        target.from.x = stretch(target.from.x, min, factor);
        target.to.x = stretch(target.to.x, min, factor);
    } else {
        target.from.y = stretch(target.from.y, min, factor);
        target.to.y = stretch(target.to.y, min, factor);
    }
    true
}

pub fn scheme_mut<'a>(plan: &'a mut FloorPlan, id: &str) -> Option<&'a mut FloorScheme> {
    plan.schemes.iter_mut().find(|scheme| scheme.id == id)
}

pub fn latest(scheme: &FloorScheme) -> FloorLayout {
    scheme
        .versions
        .last()
        .map(|version| version.layout.clone())
        .unwrap_or_default()
}

pub fn active_layout(plan: &FloorPlan) -> FloorLayout {
    plan.schemes
        .iter()
        .find(|scheme| scheme.id == plan.scheme)
        .or_else(|| plan.schemes.last())
        .map(latest)
        .unwrap_or_default()
}

pub fn commit(scheme: &mut FloorScheme, layout: FloorLayout, note: String, by_user: bool) -> u32 {
    let number = scheme.versions.last().map_or(1, |version| version.number + 1);
    scheme.versions.push(FloorVersion {
        number,
        note,
        by_user,
        at: now_ms(),
        layout,
    });
    if scheme.versions.len() > MAX_VERSIONS {
        let extra = scheme.versions.len() - MAX_VERSIONS;
        scheme.versions.drain(..extra);
    }
    number
}

fn total_area(plan: &FloorPlan, layout: &FloorLayout) -> f64 {
    if plan.area > 0.0 {
        plan.area
    } else {
        (layout.rooms.iter().map(|room| room.area).sum::<f64>() * 10.0).round() / 10.0
    }
}

async fn load(state: &SharedState, id: &str) -> Option<FloorPlan> {
    let raw = state.store.setting_owned(format!("{KEY}{id}")).await.ok()??;
    serde_json::from_str(&raw).ok()
}

async fn save(state: &SharedState, plan: &mut FloorPlan) {
    plan.updated_at = now_ms();
    let _ = state
        .store
        .set_setting_owned(
            format!("{KEY}{}", plan.id),
            serde_json::to_string(plan).unwrap_or_default(),
        )
        .await;
    state.publish(Event::FloorPlanUpdated { plan: plan.clone() });
}

async fn in_thread(state: &SharedState, thread_id: &str) -> Option<FloorPlan> {
    let id = state
        .store
        .setting_owned(format!("{THREAD_KEY}{thread_id}"))
        .await
        .ok()
        .flatten()
        .filter(|id| !id.is_empty())?;
    load(state, &id).await
}

async fn source_image(state: &SharedState, thread_id: &str) -> Option<String> {
    let messages = state.store.list_messages(thread_id.to_owned()).await.ok()?;
    messages
        .iter()
        .rev()
        .filter(|message| message.role == Role::User)
        .find_map(|message| {
            message
                .files
                .iter()
                .find(|file| file.mode == FileMode::Image)
                .map(|file| file.id.clone())
        })
}

fn describe(plan: &FloorPlan) -> Value {
    let layout = active_layout(plan);
    let pair = |p: &FloorPoint| json!([p.x, p.y]);
    let version = plan
        .schemes
        .iter()
        .find(|scheme| scheme.id == plan.scheme)
        .and_then(|scheme| scheme.versions.last())
        .map_or(0, |version| version.number);
    json!({
        "title": plan.title,
        "kind": plan.kind,
        "area": total_area(plan, &layout),
        "scheme": plan.scheme,
        "version": version,
        "schemes": plan.schemes.iter().map(|scheme| &scheme.id).collect::<Vec<_>>(),
        "rooms": layout.rooms.iter().map(|room| json!({
            "name": room.name,
            "points": room.points.iter().map(pair).collect::<Vec<_>>(),
            "area": room.area,
            "facing": room.facing,
            "openings": room.openings.iter().map(|opening| json!({
                "kind": opening.kind,
                "x1": opening.from.x,
                "y1": opening.from.y,
                "x2": opening.to.x,
                "y2": opening.to.y,
            })).collect::<Vec<_>>(),
            "furniture": room.items.iter().map(|item| json!({
                "name": item.name,
                "x": item.rect.x,
                "y": item.rect.y,
                "w": item.rect.w,
                "h": item.rect.h,
                "rotation": item.rotation,
            })).collect::<Vec<_>>(),
            "advice": room.advice,
            "ideas": room.ideas,
        })).collect::<Vec<_>>(),
        "unclear": layout.measures.iter().map(|measure| json!({
            "label": measure.label,
            "room": layout.rooms.iter().find(|room| room.id == measure.room_id).map(|room| room.name.as_str()),
            "estimate": measure.estimate,
            "measured": measure.value,
        })).collect::<Vec<_>>(),
    })
}

pub async fn note(state: &SharedState, thread_id: &str) -> Option<ContextNote> {
    let plan = in_thread(state, thread_id).await?;
    Some(ContextNote {
        label: state.localizer.text(keys::FLOORPLAN_CONTEXT_LABEL),
        body: describe(&plan).to_string(),
    })
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

fn reply(plan: &FloorPlan) -> String {
    let layout = active_layout(plan);
    let pending: Vec<&str> = layout
        .measures
        .iter()
        .filter(|measure| measure.value.is_none())
        .map(|measure| measure.label.as_str())
        .collect();
    json!({
        "saved": true,
        "scheme": plan.scheme,
        "rooms": layout.rooms.len(),
        "area": total_area(plan, &layout),
        "unclear_to_measure": pending,
        "hint": "a floor plan card (thumbnail, area, rooms, sizes to check, \"Open floor plan\" and \"Check sizes first\") now shows under your reply; reply in one or two short sentences: what you recognized and which sizes the user should measure; do not list every room again",
    })
    .to_string()
}

impl HubTools<'_> {
    pub(crate) async fn floorplan_tool(&self, name: &str, arguments: &str) -> String {
        let _guard = LOCK.lock().await;
        match name {
            SAVE => self.floorplan_save(arguments).await,
            _ => self.floorplan_edit(arguments).await,
        }
    }

    async fn floorplan_save(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<SaveArgs>(arguments) else {
            return error(
                "arguments must be {title, kind, area?, rooms: [{name, rect: {x, y, w, h} | points: [[x, y], ...], facing?, openings?, furniture?, advice?, ideas?}], unclear?: [{room, label, x1, y1, x2, y2, estimate, note}]}",
            );
        };
        let title = clean(&args.title);
        if title.is_empty() || args.rooms.is_empty() {
            return error("a floor plan needs a title and at least one room");
        }
        let mut layout = FloorLayout::default();
        for room in args.rooms.iter().take(MAX_ROOMS) {
            if let Err(problem) = upsert_room(&mut layout, room) {
                return error(&problem);
            }
        }
        for unclear in &args.unclear {
            if let Err(problem) = add_unclear(&mut layout, unclear) {
                return error(&problem);
            }
        }
        let mut scheme = FloorScheme {
            id: SCHEME_IDS[0].to_owned(),
            versions: Vec::new(),
        };
        commit(
            &mut scheme,
            layout,
            self.state.localizer.text(keys::FLOORPLAN_FIRST_VERSION),
            false,
        );
        let now = now_ms();
        let mut plan = FloorPlan {
            id: uuid::Uuid::now_v7().to_string(),
            thread_id: self.thread_id.to_owned(),
            title,
            kind: clean(&args.kind),
            area: args.area.and_then(length).unwrap_or(0.0),
            source_file_id: source_image(self.state, self.thread_id).await,
            scheme: scheme.id.clone(),
            schemes: vec![scheme],
            created_at: now,
            updated_at: now,
        };
        save(self.state, &mut plan).await;
        let _ = self
            .state
            .store
            .set_setting_owned(format!("{THREAD_KEY}{}", self.thread_id), plan.id.clone())
            .await;
        self.attach(Attachment::FloorPlan {
            plan_id: plan.id.clone(),
        });
        reply(&plan)
    }

    async fn floorplan_edit(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<EditArgs>(arguments) else {
            return error(
                "arguments must be {note, new_scheme?, scheme?, rooms?: [{name, was?, rect?, points?, facing?, openings?, furniture?, advice?, ideas?}], remove_rooms?, unclear?, measured?: [{label, value}]}",
            );
        };
        let Some(mut plan) = in_thread(self.state, self.thread_id).await else {
            return error("there is no floor plan in this conversation; use floorplan_save first");
        };
        let from = args
            .scheme
            .as_deref()
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .map_or_else(|| plan.scheme.clone(), str::to_uppercase);
        let Some(source) = plan.schemes.iter().find(|scheme| scheme.id == from) else {
            return error(&format!("no scheme {from}"));
        };
        let mut layout = latest(source);
        for name in &args.remove_rooms {
            let name = name.trim();
            let removed: Vec<String> = layout
                .rooms
                .iter()
                .filter(|room| room.name == name)
                .map(|room| room.id.clone())
                .collect();
            layout.rooms.retain(|room| room.name != name);
            layout.measures.retain(|measure| !removed.contains(&measure.room_id));
        }
        for room in &args.rooms {
            if let Err(problem) = upsert_room(&mut layout, room) {
                return error(&problem);
            }
        }
        for unclear in &args.unclear {
            if let Err(problem) = add_unclear(&mut layout, unclear) {
                return error(&problem);
            }
        }
        for measured in args.measured {
            let Some(id) = layout
                .measures
                .iter()
                .find(|measure| measure.label == measured.label.trim())
                .map(|measure| measure.id.clone())
            else {
                return error(&format!("no unclear size named {}", measured.label));
            };
            let Some(value) = length(measured.value) else {
                return error("measured values must be positive lengths in meters");
            };
            apply_measure(&mut layout, &id, value);
        }
        let target = if args.new_scheme {
            let Some(id) = SCHEME_IDS
                .iter()
                .find(|id| plan.schemes.iter().all(|scheme| scheme.id != **id))
            else {
                return error("there are already six schemes");
            };
            plan.schemes.push(FloorScheme {
                id: (*id).to_owned(),
                versions: Vec::new(),
            });
            (*id).to_owned()
        } else {
            from
        };
        if let Some(title) = args.title.map(|title| clean(&title)).filter(|title| !title.is_empty()) {
            plan.title = title;
        }
        if let Some(kind) = args.kind.map(|kind| clean(&kind)).filter(|kind| !kind.is_empty()) {
            plan.kind = kind;
        }
        if let Some(area) = args.area.and_then(length) {
            plan.area = area;
        }
        let note = clean(&args.note);
        let Some(scheme) = scheme_mut(&mut plan, &target) else {
            return error("scheme vanished");
        };
        commit(scheme, layout, note, false);
        plan.scheme = target;
        save(self.state, &mut plan).await;
        self.attach(Attachment::FloorPlan {
            plan_id: plan.id.clone(),
        });
        reply(&plan)
    }
}

fn missing() -> ProtocolError {
    ProtocolError::new(ErrorCode::NotFound, "floor plan not found")
}

fn bad(detail: &str) -> ProtocolError {
    ProtocolError::new(ErrorCode::BadRequest, detail)
}

fn meters_text(value: f64) -> String {
    let text = format!("{value:.2}");
    text.trim_end_matches('0').trim_end_matches('.').to_owned()
}

pub async fn handle(state: &SharedState, request: Request) -> Result<Response, ProtocolError> {
    let _guard = LOCK.lock().await;
    match request {
        Request::FloorPlan { id } => Ok(Response::FloorPlan {
            plan: load(state, &id).await.ok_or_else(missing)?,
        }),
        Request::SetFloorScheme { id, scheme } => {
            let mut plan = load(state, &id).await.ok_or_else(missing)?;
            if scheme_mut(&mut plan, &scheme).is_none() {
                return Err(bad("no such scheme"));
            }
            plan.scheme = scheme;
            save(state, &mut plan).await;
            Ok(Response::FloorPlan { plan })
        }
        Request::RestoreFloorVersion { id, scheme, version } => {
            let mut plan = load(state, &id).await.ok_or_else(missing)?;
            let note = state
                .localizer
                .format(keys::FLOORPLAN_RESTORED_NOTE, &[("version", &version.to_string())]);
            let target = scheme_mut(&mut plan, &scheme).ok_or_else(|| bad("no such scheme"))?;
            let layout = target
                .versions
                .iter()
                .find(|known| known.number == version)
                .map(|known| known.layout.clone())
                .ok_or_else(|| bad("no such version"))?;
            commit(target, layout, note, true);
            plan.scheme = scheme;
            save(state, &mut plan).await;
            Ok(Response::FloorPlan { plan })
        }
        Request::MeasureFloor {
            id,
            measure_id,
            millimeters,
        } => {
            if !(50..=100_000).contains(&millimeters) {
                return Err(bad("measured length out of range"));
            }
            let value = f64::from(millimeters) / 1000.0;
            let mut plan = load(state, &id).await.ok_or_else(missing)?;
            let label = plan
                .schemes
                .iter()
                .filter_map(|scheme| scheme.versions.last())
                .flat_map(|version| version.layout.measures.iter())
                .find(|measure| measure.id == measure_id)
                .map(|measure| measure.label.clone())
                .ok_or_else(|| bad("no such size to check"))?;
            let note = state.localizer.format(
                keys::FLOORPLAN_MEASURED_NOTE,
                &[("label", &label), ("meters", &meters_text(value))],
            );
            for scheme in &mut plan.schemes {
                let mut layout = latest(scheme);
                if apply_measure(&mut layout, &measure_id, value) {
                    commit(scheme, layout, note.clone(), true);
                }
            }
            save(state, &mut plan).await;
            Ok(Response::FloorPlan { plan })
        }
        _ => Err(bad("not a floor plan request")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn square(id: &str, x: f64, w: f64, h: f64) -> FloorRoom {
        let points = vec![
            FloorPoint { x, y: 0.0 },
            FloorPoint { x: x + w, y: 0.0 },
            FloorPoint { x: x + w, y: h },
            FloorPoint { x, y: h },
        ];
        FloorRoom {
            id: id.to_owned(),
            name: id.to_owned(),
            area: area(&points),
            points,
            ..FloorRoom::default()
        }
    }

    #[test]
    fn shoelace_area_of_a_rectangle() {
        assert!((square("a", 0.0, 6.0, 4.5).area - 27.0).abs() < 1e-9);
    }

    #[test]
    fn measuring_a_wall_stretches_the_room() {
        let mut layout = FloorLayout {
            rooms: vec![square("r1", 2.0, 4.2, 3.7)],
            measures: vec![FloorMeasure {
                id: "m1".into(),
                room_id: "r1".into(),
                label: "east".into(),
                from: FloorPoint { x: 6.2, y: 0.0 },
                to: FloorPoint { x: 6.2, y: 3.7 },
                estimate: 3.7,
                ..FloorMeasure::default()
            }],
        };
        assert!(apply_measure(&mut layout, "m1", 3.75));
        let room = &layout.rooms[0];
        let max_y = room.points.iter().map(|p| p.y).fold(0.0, f64::max);
        assert!((max_y - 3.75).abs() < 1e-9);
        assert!((room.area - 15.75).abs() < 1e-9);
        assert!(layout.measures[0].value.is_some_and(|value| (value - 3.75).abs() < 1e-9));
    }
}
