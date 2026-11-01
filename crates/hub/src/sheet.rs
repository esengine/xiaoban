use std::fmt::Write as _;

use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{
    Attachment, CellEdit, CellMark, ChartKind, ContextNote, DocVersionInfo, ErrorCode, Event, ProtocolError, Request,
    Response, SheetChart, SheetFormat, SheetOp, SheetTab, Workbook, WorkbookSummary,
};
use xiaoban_store::now_ms;

use crate::sheet_formula::{col_name, parse_range, parse_ref};
use crate::state::SharedState;
use crate::tools::HubTools;

pub const CREATE: &str = "sheet_create";
pub const EDIT: &str = "sheet_edit";
const MAX_ROWS: usize = 2000;
const MAX_COLS: usize = 60;
const MAX_TABS: usize = 12;
const NOTE_ROWS: usize = 200;

pub fn is_tool(name: &str) -> bool {
    matches!(name, CREATE | EDIT)
}

fn key(id: &str) -> String {
    format!("sheet.{id}")
}

fn version_key(id: &str, version: u32) -> String {
    format!("sheet.{id}.v{version}")
}

fn thread_key(thread_id: &str) -> String {
    format!("sheet.thread.{thread_id}")
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

pub async fn load(state: &SharedState, id: &str) -> Option<Workbook> {
    read(state, key(id)).await
}

fn tidy(tab: &mut SheetTab) {
    tab.cells.truncate(MAX_ROWS);
    for row in &mut tab.cells {
        row.truncate(MAX_COLS);
        while row.last().is_some_and(String::is_empty) {
            row.pop();
        }
    }
    while tab.cells.last().is_some_and(Vec::is_empty) {
        tab.cells.pop();
    }
    tab.values = crate::sheet_formula::values(&tab.cells);
}

pub fn summary(book: &Workbook) -> WorkbookSummary {
    let first = book.tabs.first();
    let count = |value: usize| u32::try_from(value).unwrap_or(u32::MAX);
    WorkbookSummary {
        id: book.id.clone(),
        source_thread_id: book.source_thread_id.clone(),
        title: book.title.clone(),
        tabs: count(book.tabs.len()),
        rows: count(first.map_or(0, |tab| tab.cells.len())),
        cols: count(first.map_or(0, |tab| tab.cells.iter().map(Vec::len).max().unwrap_or(0))),
        preview: first
            .map(|tab| tab.values.iter().take(4).map(|row| row.iter().take(4).cloned().collect()).collect())
            .unwrap_or_default(),
        updated_at: book.updated_at,
    }
}

async fn save(state: &SharedState, book: &mut Workbook) {
    for tab in &mut book.tabs {
        tidy(tab);
    }
    book.updated_at = now_ms();
    write(state, key(&book.id), book).await;
    state.publish(Event::SheetUpdated { summary: summary(book) });
}

async fn snapshot(state: &SharedState, book: &mut Workbook, note: String, by_user: bool) {
    book.version += 1;
    write(state, version_key(&book.id, book.version), &book.tabs).await;
    book.versions.push(DocVersionInfo {
        version: book.version,
        note,
        by_user,
        at: now_ms(),
    });
}

pub async fn for_thread(state: &SharedState, thread_id: &str) -> Option<Workbook> {
    let id: String = state.store.setting_owned(thread_key(thread_id)).await.ok().flatten().filter(|id| !id.is_empty())?;
    load(state, &id).await
}

pub async fn is_sheet_thread(state: &SharedState, thread_id: &str) -> bool {
    state.store.setting_owned(thread_key(thread_id)).await.ok().flatten().is_some_and(|id| !id.is_empty())
}

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

fn rows_schema(l: &Localizer) -> Value {
    json!({ "type": "array", "items": { "type": "array", "items": { "type": "string" } }, "description": l.text(keys::TOOL_SHEET_ROWS) })
}

pub fn with_create_spec(mut tools: Vec<ToolSpec>, l: &Localizer) -> Vec<ToolSpec> {
    tools.push(ToolSpec {
        name: CREATE.to_owned(),
        description: l.text(keys::TOOL_SHEET_CREATE_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "title": text(l, keys::TOOL_SHEET_TITLE),
                "tabs": { "type": "array", "items": {
                    "type": "object",
                    "properties": { "name": text(l, keys::TOOL_SHEET_TAB), "rows": rows_schema(l) },
                    "required": ["name", "rows"],
                    "additionalProperties": false,
                } },
            },
            "required": ["title", "tabs"],
            "additionalProperties": false,
        }),
    });
    tools
}

pub fn edit_specs(l: &Localizer) -> Vec<ToolSpec> {
    let change = json!({
        "type": "object",
        "properties": {
            "op": { "type": "string", "enum": ["set", "insert_rows", "delete_rows", "insert_cols", "delete_cols", "sort", "add_tab", "rename_tab", "chart"], "description": l.text(keys::TOOL_SHEET_OP) },
            "tab": text(l, keys::TOOL_SHEET_TAB),
            "cell": text(l, keys::TOOL_SHEET_CELL),
            "rows": rows_schema(l),
            "count": { "type": "integer", "minimum": 1, "maximum": 500 },
            "range": text(l, keys::TOOL_SHEET_RANGE),
            "desc": { "type": "boolean" },
            "name": text(l, keys::TOOL_SHEET_TAB),
            "kind": { "type": "string", "enum": ["bar", "line", "pie"] },
            "title": text(l, keys::TOOL_SHEET_TITLE),
            "labels": text(l, keys::TOOL_SHEET_RANGE),
            "values": text(l, keys::TOOL_SHEET_RANGE),
        },
        "required": ["op"],
        "additionalProperties": false,
    });
    vec![ToolSpec {
        name: EDIT.to_owned(),
        description: l.text(keys::TOOL_SHEET_EDIT_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "note": text(l, keys::TOOL_DOC_NOTE),
                "changes": { "type": "array", "items": change },
            },
            "required": ["note", "changes"],
            "additionalProperties": false,
        }),
    }]
}

#[derive(Deserialize)]
struct TabArg {
    name: String,
    #[serde(default)]
    rows: Vec<Vec<Value>>,
}

#[derive(Deserialize)]
struct CreateArgs {
    title: String,
    tabs: Vec<TabArg>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Change {
    op: String,
    tab: String,
    cell: String,
    rows: Vec<Vec<Value>>,
    count: u32,
    range: String,
    desc: bool,
    name: String,
    kind: String,
    title: String,
    labels: String,
    values: String,
}

#[derive(Deserialize)]
struct EditArgs {
    note: String,
    changes: Vec<Change>,
}

fn cell_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn rows_from(rows: Vec<Vec<Value>>) -> Vec<Vec<String>> {
    rows.into_iter().take(MAX_ROWS).map(|row| row.iter().take(MAX_COLS).map(cell_text).collect()).collect()
}

fn new_tab(name: &str, cells: Vec<Vec<String>>) -> SheetTab {
    let mut tab = SheetTab { id: new_id(), name: name.trim().chars().take(30).collect(), cells, ..SheetTab::default() };
    tidy(&mut tab);
    tab
}

fn set_cell(tab: &mut SheetTab, row: u32, col: u32, value: String) {
    let (row, col) = (row as usize, col as usize);
    if row >= MAX_ROWS || col >= MAX_COLS {
        return;
    }
    if tab.cells.len() <= row {
        tab.cells.resize(row + 1, Vec::new());
    }
    let line = &mut tab.cells[row];
    if line.len() <= col {
        line.resize(col + 1, String::new());
    }
    line[col] = value;
}

fn shift_refs(formula: &str, axis_row: bool, at: u32, delta: i64) -> String {
    let mut out = String::new();
    let chars: Vec<char> = formula.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i].is_ascii_alphabetic() || chars[i] == '$' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '$') {
                i += 1;
            }
            let word: String = chars[start..i].iter().collect();
            match parse_ref(&word) {
                Some((row, col)) => {
                    let (mut row, mut col) = (i64::from(row), i64::from(col));
                    if axis_row && row >= i64::from(at) {
                        row = (row + delta).max(0);
                    }
                    if !axis_row && col >= i64::from(at) {
                        col = (col + delta).max(0);
                    }
                    let _ = write!(out, "{}{}", col_name(u32::try_from(col).unwrap_or(0)), row + 1);
                }
                None => out.push_str(&word),
            }
        } else {
            out.push(chars[i]);
            i += 1;
        }
    }
    out
}

fn shift_all(tab: &mut SheetTab, axis_row: bool, at: u32, delta: i64) {
    for row in &mut tab.cells {
        for cell in row.iter_mut() {
            if let Some(formula) = cell.strip_prefix('=') {
                *cell = format!("={}", shift_refs(formula, axis_row, at, delta));
            }
        }
    }
}

fn apply_op(tab: &mut SheetTab, op: &SheetOp) {
    match op {
        SheetOp::InsertRows { at, count } => {
            let at_index = (*at as usize).min(tab.cells.len());
            for _ in 0..(*count).min(500) {
                tab.cells.insert(at_index, Vec::new());
            }
            shift_all(tab, true, *at, i64::from(*count));
        }
        SheetOp::DeleteRows { from, to } => {
            let (from, to) = (*from.min(to) as usize, *from.max(to) as usize);
            if from < tab.cells.len() {
                tab.cells.drain(from..=to.min(tab.cells.len() - 1));
            }
            shift_all(tab, true, u32::try_from(to + 1).unwrap_or(0), -i64::try_from(to - from + 1).unwrap_or(0));
        }
        SheetOp::InsertCols { at, count } => {
            for row in &mut tab.cells {
                let index = (*at as usize).min(row.len());
                for _ in 0..(*count).min(50) {
                    row.insert(index, String::new());
                }
            }
            shift_all(tab, false, *at, i64::from(*count));
        }
        SheetOp::DeleteCols { from, to } => {
            let (from, to) = (*from.min(to) as usize, *from.max(to) as usize);
            for row in &mut tab.cells {
                if from < row.len() {
                    row.drain(from..=to.min(row.len() - 1));
                }
            }
            shift_all(tab, false, u32::try_from(to + 1).unwrap_or(0), -i64::try_from(to - from + 1).unwrap_or(0));
        }
        SheetOp::Sort { col, desc } => {
            if tab.cells.len() > 2 {
                let values = crate::sheet_formula::values(&tab.cells);
                let mut body: Vec<(Vec<String>, String)> =
                    tab.cells.drain(1..).zip(values.into_iter().skip(1)).map(|(row, value)| (row, value.get(*col as usize).cloned().unwrap_or_default())).collect();
                body.sort_by(|(_, a), (_, b)| {
                    let order = match (crate::sheet_formula::number(a), crate::sheet_formula::number(b)) {
                        (Some(x), Some(y)) => x.partial_cmp(&y).unwrap_or(std::cmp::Ordering::Equal),
                        (Some(_), None) => std::cmp::Ordering::Less,
                        (None, Some(_)) => std::cmp::Ordering::Greater,
                        _ => a.cmp(b),
                    };
                    if *desc { order.reverse() } else { order }
                });
                tab.cells.extend(body.into_iter().map(|(row, _)| row));
            }
        }
        SheetOp::RenameTab { name } => tab.name = name.trim().chars().take(30).collect(),
        SheetOp::AddChart { kind, title, labels, values } => {
            if parse_range(values).is_some() {
                tab.charts.push(SheetChart { id: new_id(), kind: *kind, title: title.clone(), labels: labels.clone(), values: values.clone() });
            }
        }
        SheetOp::RemoveChart { id } => tab.charts.retain(|chart| chart.id != *id),
        SheetOp::AddTab { .. } | SheetOp::DeleteTab => {}
    }
}

fn find_tab<'a>(book: &'a mut Workbook, name: &str) -> Option<&'a mut SheetTab> {
    let index = book
        .tabs
        .iter()
        .position(|tab| tab.name == name || tab.id == name)
        .or_else(|| (name.is_empty() || book.tabs.len() == 1).then_some(0))?;
    book.tabs.get_mut(index)
}

fn chart_kind(name: &str) -> ChartKind {
    match name {
        "line" => ChartKind::Line,
        "pie" => ChartKind::Pie,
        _ => ChartKind::Bar,
    }
}

fn apply_change(book: &mut Workbook, change: Change) -> bool {
    if change.op == "add_tab" {
        if book.tabs.len() >= MAX_TABS {
            return false;
        }
        let tab = new_tab(&change.name, rows_from(change.rows));
        for (row, line) in tab.cells.iter().enumerate() {
            for col in 0..line.len() {
                book.marks.push(CellMark { tab_id: tab.id.clone(), row: u32::try_from(row).unwrap_or(0), col: u32::try_from(col).unwrap_or(0) });
            }
        }
        book.tabs.push(tab);
        return true;
    }
    let Some(tab) = find_tab(book, &change.tab) else {
        return false;
    };
    let tab_id = tab.id.clone();
    let mut marks = Vec::new();
    let range = parse_range(&change.range);
    let op = match change.op.as_str() {
        "set" => {
            let Some((row, col)) = parse_ref(&change.cell).or_else(|| range.map(|(start, _)| start)) else {
                return false;
            };
            for (dr, line) in rows_from(change.rows).into_iter().enumerate() {
                for (dc, value) in line.into_iter().enumerate() {
                    let (r, c) = (row + u32::try_from(dr).unwrap_or(0), col + u32::try_from(dc).unwrap_or(0));
                    set_cell(tab, r, c, value);
                    marks.push((r, c));
                }
            }
            None
        }
        "insert_rows" => parse_ref(&format!("A{}", change.cell.trim_start_matches(|c: char| c.is_ascii_alphabetic()))).map(|(at, _)| SheetOp::InsertRows { at, count: change.count.max(1) }),
        "delete_rows" => range.map(|((r1, _), (r2, _))| SheetOp::DeleteRows { from: r1, to: r2 }),
        "insert_cols" => parse_ref(&format!("{}1", change.cell.trim_end_matches(|c: char| c.is_ascii_digit()))).map(|(_, at)| SheetOp::InsertCols { at, count: change.count.max(1) }),
        "delete_cols" => range.map(|((_, c1), (_, c2))| SheetOp::DeleteCols { from: c1, to: c2 }),
        "sort" => parse_ref(&format!("{}1", change.cell.trim_end_matches(|c: char| c.is_ascii_digit()))).map(|(_, col)| SheetOp::Sort { col, desc: change.desc }),
        "rename_tab" => Some(SheetOp::RenameTab { name: change.name }),
        "chart" => Some(SheetOp::AddChart { kind: chart_kind(&change.kind), title: change.title, labels: change.labels, values: change.values }),
        _ => return false,
    };
    if let Some(op) = op {
        apply_op(tab, &op);
    }
    for (row, col) in marks {
        if !book.marks.iter().any(|mark| mark.tab_id == tab_id && mark.row == row && mark.col == col) {
            book.marks.push(CellMark { tab_id: tab_id.clone(), row, col });
        }
    }
    true
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

impl HubTools<'_> {
    pub(crate) async fn sheet_tool(&self, name: &str, arguments: &str) -> String {
        let state = self.state;
        if name == CREATE {
            let Ok(args) = serde_json::from_str::<CreateArgs>(arguments) else {
                return error("arguments must be {title, tabs: [{name, rows: [[...]]}]}");
            };
            let mut book = Workbook {
                id: new_id(),
                source_thread_id: self.thread_id.to_owned(),
                title: args.title.trim().to_owned(),
                tabs: args.tabs.into_iter().take(MAX_TABS).map(|tab| new_tab(&tab.name, rows_from(tab.rows))).collect(),
                ..Workbook::default()
            };
            if book.tabs.is_empty() {
                return error("give at least one tab");
            }
            snapshot(state, &mut book, state.localizer.text(keys::SHEET_VERSION_FIRST), false).await;
            save(state, &mut book).await;
            self.attach(Attachment::Sheet { sheet_id: book.id.clone() });
            return json!({ "sheet_id": book.id, "hint": "the table is shown as a card; reply in one or two sentences without repeating the data" }).to_string();
        }
        let Some(mut book) = for_thread(state, self.thread_id).await else {
            return error("this conversation has no table");
        };
        let Ok(args) = serde_json::from_str::<EditArgs>(arguments) else {
            return error("arguments must be {note, changes: [...]}");
        };
        let saved: Option<Vec<SheetTab>> = read(state, version_key(&book.id, book.version)).await;
        if saved.is_some_and(|tabs| tabs.iter().map(|tab| &tab.cells).ne(book.tabs.iter().map(|tab| &tab.cells))) {
            snapshot(state, &mut book, state.localizer.text(keys::DOC_VERSION_USER), true).await;
        }
        let results: Vec<bool> = args.changes.into_iter().map(|change| apply_change(&mut book, change)).collect();
        let applied = results.iter().filter(|ok| **ok).count();
        let skipped: Vec<usize> = results.iter().enumerate().filter(|(_, ok)| !**ok).map(|(index, _)| index).collect();
        for tab in &mut book.tabs {
            tidy(tab);
        }
        snapshot(state, &mut book, args.note, false).await;
        save(state, &mut book).await;
        if skipped.is_empty() {
            json!({ "applied": applied, "version": book.version, "hint": "changed cells are shown in green; reply in one short sentence" }).to_string()
        } else {
            json!({ "applied": applied, "skipped": skipped, "version": book.version, "hint": "the changes at these indexes were not applied (check op, tab and cell); fix them in another sheet_edit call before replying" }).to_string()
        }
    }
}

pub async fn note(state: &SharedState, thread_id: &str) -> Option<ContextNote> {
    let book = for_thread(state, thread_id).await?;
    let mut body = String::new();
    for tab in &book.tabs {
        let _ = writeln!(body, "## {}", tab.name);
        for (row, line) in tab.cells.iter().enumerate().take(NOTE_ROWS) {
            let shown: Vec<String> = line
                .iter()
                .enumerate()
                .map(|(col, raw)| {
                    let value = tab.values.get(row).and_then(|line| line.get(col)).cloned().unwrap_or_default();
                    if raw.starts_with('=') { format!("{value} [{raw}]") } else { value }
                })
                .collect();
            let _ = writeln!(body, "{} | {}", row + 1, shown.join(" | "));
        }
        if tab.cells.len() > NOTE_ROWS {
            let _ = writeln!(body, "... {} rows in total", tab.cells.len());
        }
        for chart in &tab.charts {
            let _ = writeln!(body, "chart: {} {} {}", chart.title, chart.labels, chart.values);
        }
    }
    Some(ContextNote {
        label: state.localizer.format(keys::SHEET_CONTEXT_LABEL, &[("title", book.title.as_str())]),
        body,
    })
}

async fn open(state: &SharedState, id: &str) -> Result<Workbook, ProtocolError> {
    static OPENING: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    let _guard = OPENING.lock().await;
    let mut book = load(state, id).await.ok_or_else(|| ProtocolError::new(ErrorCode::NotFound, "table not found"))?;
    let parent = state.store.thread(book.source_thread_id.clone()).await.ok().map(|thread| thread.parent_id.unwrap_or(thread.id));
    if let Some(thread) = &book.thread_id
        && state.store.thread(thread.clone()).await.is_ok()
    {
        return Ok(book);
    }
    let created = state
        .store
        .create_child_thread(Some(book.title.clone()), parent)
        .await
        .map_err(|failure| ProtocolError::new(ErrorCode::Internal, failure.to_string()))?;
    let _ = state.store.set_setting_owned(thread_key(&created.id), book.id.clone()).await;
    state.publish(Event::ThreadUpdated { thread: created.clone() });
    book.thread_id = Some(created.id);
    save(state, &mut book).await;
    Ok(book)
}

fn csv(tab: &SheetTab) -> String {
    tab.values
        .iter()
        .map(|row| {
            row.iter()
                .map(|cell| if cell.contains([',', '"', '\n']) { format!("\"{}\"", cell.replace('"', "\"\"")) } else { cell.clone() })
                .collect::<Vec<_>>()
                .join(",")
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn xlsx(book: &Workbook, path: &std::path::Path) -> Result<(), String> {
    use rust_xlsxwriter::{Chart, ChartType, Format, Workbook as Xlsx};
    let mut file = Xlsx::new();
    let bold = Format::new().set_bold();
    for tab in &book.tabs {
        let sheet = file.add_worksheet();
        let name: String = tab.name.chars().filter(|c| !"[]:*?/\\".contains(*c)).take(31).collect();
        if !name.is_empty() {
            sheet.set_name(&name).map_err(|error| error.to_string())?;
        }
        for (row, line) in tab.cells.iter().enumerate() {
            let r = u32::try_from(row).unwrap_or(0);
            for (col, raw) in line.iter().enumerate() {
                let c = u16::try_from(col).unwrap_or(0);
                if raw.is_empty() {
                    continue;
                }
                let result = if raw.starts_with('=') {
                    sheet.write_formula(r, c, rust_xlsxwriter::Formula::new(raw.as_str()))
                } else if let Some(value) = crate::sheet_formula::number(raw).filter(|_| !raw.trim_start().starts_with('0') || raw.trim() == "0" || raw.contains('.')) {
                    sheet.write_number(r, c, value)
                } else if row == 0 {
                    sheet.write_string_with_format(r, c, raw, &bold)
                } else {
                    sheet.write_string(r, c, raw)
                };
                result.map_err(|error| error.to_string())?;
            }
        }
        let rows = u32::try_from(tab.cells.len()).unwrap_or(0);
        for (index, chart) in tab.charts.iter().enumerate() {
            let Some(((r1, c1), (r2, c2))) = parse_range(&chart.values) else { continue };
            let mut made = Chart::new(match chart.kind {
                ChartKind::Bar => ChartType::Column,
                ChartKind::Line => ChartType::Line,
                ChartKind::Pie => ChartType::Pie,
            });
            let series = made.add_series();
            series.set_values((name.as_str(), r1, u16::try_from(c1).unwrap_or(0), r2, u16::try_from(c2).unwrap_or(0)));
            if let Some(((l1, lc1), (l2, lc2))) = parse_range(&chart.labels) {
                series.set_categories((name.as_str(), l1, u16::try_from(lc1).unwrap_or(0), l2, u16::try_from(lc2).unwrap_or(0)));
            }
            made.title().set_name(&chart.title);
            made.legend().set_hidden();
            let at = rows + 2 + u32::try_from(index).unwrap_or(0) * 18;
            sheet.insert_chart(at, 0, &made).map_err(|error| error.to_string())?;
        }
    }
    file.save(path).map_err(|error| error.to_string())
}

type Tabs = Vec<(String, Vec<Vec<String>>)>;

fn read_file(path: &std::path::Path) -> Result<Tabs, String> {
    use calamine::{Data, Reader, open_workbook_auto};
    let is_csv = path.extension().and_then(|ext| ext.to_str()).is_some_and(|ext| ext.eq_ignore_ascii_case("csv"));
    if is_csv {
        let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
        let name = path.file_stem().map(|stem| stem.to_string_lossy().into_owned()).unwrap_or_default();
        return Ok(vec![(name, crate::ledger_import::split_csv(&crate::ledger_import::decode(&bytes)))]);
    }
    let mut book = open_workbook_auto(path).map_err(|error| error.to_string())?;
    let mut out = Vec::new();
    for name in book.sheet_names().into_iter().take(MAX_TABS) {
        let Ok(range) = book.worksheet_range(&name) else { continue };
        let rows = range
            .rows()
            .take(MAX_ROWS)
            .map(|row| row.iter().take(MAX_COLS).map(|cell| if matches!(cell, Data::Empty) { String::new() } else { cell.to_string() }).collect())
            .collect();
        out.push((name, rows));
    }
    Ok(out)
}

async fn import(state: &SharedState, thread_id: &str, file_id: &str, name: &str) -> Result<Response, ProtocolError> {
    let path = state.files.named(file_id, name).ok_or_else(|| ProtocolError::new(ErrorCode::NotFound, "file not found"))?;
    let tabs = tokio::task::spawn_blocking(move || read_file(&path))
        .await
        .map_err(|_| ProtocolError::new(ErrorCode::Internal, "reading stopped"))?
        .map_err(|failure| ProtocolError::new(ErrorCode::BadRequest, failure))?;
    let title = std::path::Path::new(name).file_stem().map(|stem| stem.to_string_lossy().into_owned()).unwrap_or_default();
    let mut book = Workbook {
        id: new_id(),
        source_thread_id: thread_id.to_owned(),
        title,
        tabs: tabs.into_iter().map(|(name, rows)| new_tab(&name, rows)).collect(),
        ..Workbook::default()
    };
    snapshot(state, &mut book, state.localizer.text(keys::SHEET_VERSION_IMPORTED), true).await;
    save(state, &mut book).await;
    Ok(Response::Workbook { workbook: open(state, &book.id).await? })
}

async fn export(state: &SharedState, id: &str, format: SheetFormat, tab_id: &str, path: &str) -> Result<Response, ProtocolError> {
    let book = load(state, id).await.ok_or_else(|| ProtocolError::new(ErrorCode::NotFound, "table not found"))?;
    let target = crate::doc::unique(std::path::Path::new(path));
    let result = match format {
        SheetFormat::Xlsx => {
            let target = target.clone();
            tokio::task::spawn_blocking(move || xlsx(&book, &target)).await.unwrap_or_else(|_| Err("stopped".to_owned()))
        }
        SheetFormat::Csv => {
            let tab = book.tabs.iter().find(|tab| tab.id == tab_id).or(book.tabs.first()).cloned().unwrap_or_default();
            std::fs::write(&target, format!("\u{feff}{}", csv(&tab))).map_err(|error| error.to_string())
        }
    };
    result.map_err(|failure| ProtocolError::new(ErrorCode::Internal, failure))?;
    Ok(Response::Exported { path: target.to_string_lossy().into_owned() })
}

pub async fn handle(state: &SharedState, local: bool, request: Request) -> Result<Response, ProtocolError> {
    let missing = || ProtocolError::new(ErrorCode::NotFound, "table not found");
    let id = match &request {
        Request::ImportSheet { thread_id, file_id, name } => {
            return import(state, thread_id, file_id, name).await;
        }
        Request::Sheet { id }
        | Request::SheetSummary { id }
        | Request::OpenSheet { id }
        | Request::SetCells { id, .. }
        | Request::SheetChange { id, .. }
        | Request::ResolveSheetMarks { id, .. }
        | Request::RestoreSheetVersion { id, .. }
        | Request::SheetVersionTabs { id, .. }
        | Request::ExportSheet { id, .. } => id.clone(),
        _ => return Err(ProtocolError::new(ErrorCode::BadRequest, "not a table request")),
    };
    match request {
        Request::SheetSummary { .. } => {
            let book = load(state, &id).await.ok_or_else(missing)?;
            return Ok(Response::WorkbookSummary { summary: summary(&book) });
        }
        Request::OpenSheet { .. } => return Ok(Response::Workbook { workbook: open(state, &id).await? }),
        Request::SheetVersionTabs { version, .. } => {
            let tabs: Vec<SheetTab> = read(state, version_key(&id, version)).await.unwrap_or_default();
            return Ok(Response::SheetTabs { tabs });
        }
        Request::ExportSheet { format, tab_id, path, .. } => {
            if !local {
                return Err(ProtocolError::new(ErrorCode::Unauthorized, "only the hub's own machine can export"));
            }
            return export(state, &id, format, &tab_id, &path).await;
        }
        _ => {}
    }
    let mut book = load(state, &id).await.ok_or_else(missing)?;
    match request {
        Request::SetCells { tab_id, edits, .. } => {
            if let Some(tab) = book.tabs.iter_mut().find(|tab| tab.id == tab_id) {
                for CellEdit { row, col, value } in edits.into_iter().take(10_000) {
                    set_cell(tab, row, col, value);
                    book.marks.retain(|mark| !(mark.tab_id == tab_id && mark.row == row && mark.col == col));
                }
            }
            save(state, &mut book).await;
        }
        Request::SheetChange { tab_id, change, .. } => {
            match &change {
                SheetOp::AddTab { name } if book.tabs.len() < MAX_TABS => book.tabs.push(new_tab(name, Vec::new())),
                SheetOp::DeleteTab if book.tabs.len() > 1 => {
                    book.tabs.retain(|tab| tab.id != tab_id);
                    book.marks.retain(|mark| mark.tab_id != tab_id);
                }
                _ => {
                    if let Some(tab) = book.tabs.iter_mut().find(|tab| tab.id == tab_id) {
                        apply_op(tab, &change);
                        if !matches!(change, SheetOp::RenameTab { .. } | SheetOp::AddChart { .. } | SheetOp::RemoveChart { .. }) {
                            book.marks.retain(|mark| mark.tab_id != tab_id);
                        }
                    }
                }
            }
            save(state, &mut book).await;
        }
        Request::ResolveSheetMarks { keep, .. } => {
            if !keep && let Some(tabs) = read::<Vec<SheetTab>>(state, version_key(&id, book.version.saturating_sub(1))).await {
                book.tabs = tabs;
            }
            book.marks.clear();
            save(state, &mut book).await;
        }
        Request::RestoreSheetVersion { version, .. } => {
            if let Some(tabs) = read::<Vec<SheetTab>>(state, version_key(&id, version)).await {
                book.tabs = tabs;
                book.marks.clear();
                let note = state.localizer.format(keys::DOC_VERSION_RESTORED, &[("version", &version.to_string())]);
                snapshot(state, &mut book, note, true).await;
                save(state, &mut book).await;
            }
        }
        _ => {}
    }
    Ok(Response::Workbook { workbook: book })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tab(rows: &[&[&str]]) -> SheetTab {
        new_tab("t", rows.iter().map(|row| row.iter().map(|cell| (*cell).to_owned()).collect()).collect())
    }

    #[test]
    fn inserting_rows_shifts_formulas() {
        let mut sheet = tab(&[&["a", "1"], &["b", "2"], &["sum", "=SUM(B1:B2)"]]);
        apply_op(&mut sheet, &SheetOp::InsertRows { at: 1, count: 1 });
        assert_eq!(sheet.cells[3][1], "=SUM(B1:B3)");
        set_cell(&mut sheet, 1, 1, "5".into());
        tidy(&mut sheet);
        assert_eq!(sheet.values[3][1], "8");
    }

    #[test]
    fn sorting_keeps_the_header_and_orders_numbers() {
        let mut sheet = tab(&[&["name", "price"], &["x", "1,280"], &["y", "680"], &["z", "990"]]);
        apply_op(&mut sheet, &SheetOp::Sort { col: 1, desc: false });
        let names: Vec<&str> = sheet.cells.iter().map(|row| row[0].as_str()).collect();
        assert_eq!(names, ["name", "y", "z", "x"]);
    }

    #[test]
    fn set_accepts_a_range_as_the_start() {
        let mut book = Workbook { tabs: vec![tab(&[&["price"], &["10"]])], ..Workbook::default() };
        let ok = apply_change(&mut book, Change { op: "set".into(), range: "B1:B2".into(), rows: vec![vec![json!("x")], vec![json!("=A2*2")]], ..Change::default() });
        assert!(ok);
        tidy(&mut book.tabs[0]);
        assert_eq!(book.tabs[0].values[1][1], "20");
    }

    #[test]
    fn set_writes_a_block_and_marks_it() {
        let mut book = Workbook { tabs: vec![tab(&[&["price"], &["10"], &["20"]])], ..Workbook::default() };
        let ok = apply_change(
            &mut book,
            Change { op: "set".into(), cell: "B1".into(), rows: vec![vec![json!("x3")], vec![json!("=A2*3")], vec![json!("=A3*3")]], ..Change::default() },
        );
        assert!(ok);
        tidy(&mut book.tabs[0]);
        assert_eq!(book.tabs[0].values[2][1], "60");
        assert_eq!(book.marks.len(), 3);
    }

    #[test]
    fn xlsx_file_is_written() {
        let mut book = Workbook { tabs: vec![tab(&[&["name", "price"], &["x", "10"], &["y", "=B2*2"]])], ..Workbook::default() };
        book.tabs[0].charts.push(SheetChart { id: "c".into(), kind: ChartKind::Bar, title: "p".into(), labels: "A2:A3".into(), values: "B2:B3".into() });
        let path = std::env::temp_dir().join(format!("sheet-test-{}.xlsx", new_id()));
        xlsx(&book, &path).unwrap();
        assert!(std::fs::metadata(&path).unwrap().len() > 3000);
        let back = read_file(&path).unwrap();
        assert_eq!(back[0].1[1][0], "x");
    }
}
