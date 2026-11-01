use std::collections::BTreeSet;
use std::path::Path;

use serde_json::json;
use xiaoban_protocol::{Expense, ExpenseSource, ImportPreview, ImportRow, ImportStatus};

const MAX_ROWS: usize = 3000;
const MAX_KEYS: usize = 400;
const SAME_WINDOW_MS: i64 = 15 * 60 * 1000;

fn words(key: &str) -> &'static [String] {
    static WORDS: std::sync::OnceLock<std::collections::HashMap<String, Vec<String>>> = std::sync::OnceLock::new();
    WORDS
        .get_or_init(|| {
            include_str!("bill_words.txt")
                .lines()
                .filter_map(|line| line.split_once('='))
                .map(|(name, list)| (name.trim().to_owned(), list.split(',').map(|word| word.trim().to_owned()).collect()))
                .collect()
        })
        .get(key)
        .map_or(&[], Vec::as_slice)
}

fn has(text: &str, key: &str) -> bool {
    let lower = text.to_lowercase();
    words(key).iter().any(|word| lower.contains(word.as_str()))
}

pub fn is_bill(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| ["csv", "xlsx", "xls"].contains(&ext.to_ascii_lowercase().as_str()))
}

pub fn key_of(row: &ImportRow) -> String {
    let item = row.item.trim();
    if item.is_empty() || item == "/" {
        row.payee.trim().to_owned()
    } else {
        format!("{} | {}", row.payee.trim(), item)
    }
}

pub(crate) fn decode(bytes: &[u8]) -> String {
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_owned(),
        Err(_) => encoding_rs::GB18030.decode(bytes).0.into_owned(),
    }
}

pub(crate) fn split_csv(text: &str) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut row = Vec::new();
    let mut cell = String::new();
    let mut quoted = false;
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '"' if quoted && chars.peek() == Some(&'"') => {
                cell.push('"');
                chars.next();
            }
            '"' => quoted = !quoted,
            ',' if !quoted => row.push(std::mem::take(&mut cell)),
            '\r' if !quoted => {}
            '\n' if !quoted => {
                row.push(std::mem::take(&mut cell));
                rows.push(std::mem::take(&mut row));
            }
            other => cell.push(other),
        }
    }
    if !cell.is_empty() || !row.is_empty() {
        row.push(cell);
        rows.push(row);
    }
    rows
}

#[allow(clippy::cast_possible_truncation)]
fn excel_serial(value: f64) -> Option<String> {
    let days = value.floor();
    let seconds = ((value - days) * 86_400.0).round() as i64;
    let base = jiff::civil::date(1899, 12, 30);
    let date = base.checked_add(jiff::Span::new().days(days as i64)).ok()?;
    let time = jiff::civil::Time::midnight().checked_add(jiff::Span::new().seconds(seconds)).ok()?;
    Some(date.to_datetime(time).to_string())
}

fn sheet(path: &Path) -> Result<Vec<Vec<String>>, String> {
    use calamine::{Data, Reader, open_workbook_auto};
    let mut book = open_workbook_auto(path).map_err(|error| error.to_string())?;
    let name = book.sheet_names().first().cloned().ok_or("empty workbook")?;
    let range = book.worksheet_range(&name).map_err(|error| error.to_string())?;
    Ok(range
        .rows()
        .map(|row| {
            row.iter()
                .map(|cell| match cell {
                    Data::Empty => String::new(),
                    Data::DateTime(value) => excel_serial(value.as_f64()).unwrap_or_default(),
                    other => other.to_string(),
                })
                .collect()
        })
        .collect())
}

struct Columns {
    time: usize,
    payee: Option<usize>,
    item: Option<usize>,
    direction: Option<usize>,
    amount: usize,
    status: Option<usize>,
    kind: Option<usize>,
}

fn find(header: &[String], key: &str) -> Option<usize> {
    words(key)
        .iter()
        .find_map(|word| header.iter().position(|cell| cell.contains(word.as_str())))
}

fn columns(header: &[String]) -> Option<Columns> {
    Some(Columns {
        time: find(header, "time")?,
        payee: find(header, "payee"),
        item: find(header, "item"),
        direction: find(header, "direction"),
        amount: find(header, "amount")?,
        status: find(header, "status"),
        kind: find(header, "kind"),
    })
}

#[allow(clippy::cast_possible_truncation)]
fn amount(text: &str) -> i64 {
    let cleaned: String = text.chars().filter(|c| c.is_ascii_digit() || *c == '.').collect();
    cleaned.parse::<f64>().map_or(0, |value| (value * 100.0).round() as i64)
}

fn app_of(name: &str, rows: &[Vec<String>]) -> String {
    let head: String = rows.iter().take(25).flatten().cloned().collect::<Vec<_>>().join(" ");
    let all = format!("{name} {head}");
    if has(&all, "alipay") {
        "alipay".to_owned()
    } else if has(&all, "wechat") {
        "wechat".to_owned()
    } else {
        String::new()
    }
}

fn status_of(direction: &str, status: &str, kind: &str, payee: &str, item: &str) -> ImportStatus {
    let joined = format!("{status} {kind} {item}");
    if has(&joined, "refund") {
        return ImportStatus::Refund;
    }
    if has(direction, "income") {
        return ImportStatus::Income;
    }
    if has(&joined, "transfer") || has(payee, "transfer") || has(direction, "transfer") {
        return ImportStatus::Transfer;
    }
    if !direction.is_empty() && !has(direction, "spend") && direction.trim() != "/" {
        return ImportStatus::Transfer;
    }
    if has(status, "failed") {
        return ImportStatus::Transfer;
    }
    ImportStatus::New
}

fn same_day(a: i64, b: i64) -> bool {
    let day = |at: i64| jiff::Timestamp::from_millisecond(at).ok().map(|stamp| stamp.to_zoned(jiff::tz::TimeZone::system()).date());
    day(a).is_some() && day(a) == day(b)
}

fn duplicate(row: &ImportRow, known: &[Expense]) -> bool {
    known.iter().any(|entry| {
        entry.cents == row.cents
            && ((entry.at - row.at).abs() <= SAME_WINDOW_MS
                || (entry.source != ExpenseSource::Import && same_day(entry.at, row.at)))
    })
}

pub fn read(path: &Path, known: &[Expense]) -> Result<ImportPreview, String> {
    let name = path.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
    let csv = path.extension().and_then(|ext| ext.to_str()).is_some_and(|ext| ext.eq_ignore_ascii_case("csv"));
    let rows = if csv {
        split_csv(&decode(&std::fs::read(path).map_err(|error| error.to_string())?))
    } else {
        sheet(path)?
    };
    let rows: Vec<Vec<String>> = rows
        .into_iter()
        .map(|row| row.into_iter().map(|cell| cell.trim().trim_matches('\t').trim().to_owned()).collect())
        .collect();
    let start = rows
        .iter()
        .position(|row| row.iter().any(|cell| has(cell, "amount")) && row.iter().any(|cell| has(cell, "time")))
        .ok_or("no header row")?;
    let columns = columns(&rows[start]).ok_or("missing columns")?;
    let app = app_of(&name, &rows[..start]);
    let cell = |row: &Vec<String>, index: Option<usize>| index.and_then(|index| row.get(index)).cloned().unwrap_or_default();
    let mut out = Vec::new();
    for row in rows.iter().skip(start + 1) {
        let Some(at) = row.get(columns.time).and_then(|text| crate::ledger::parse_time(text)) else {
            continue;
        };
        let cents = amount(&cell(row, Some(columns.amount)));
        if cents <= 0 {
            continue;
        }
        let payee = cell(row, columns.payee);
        let item = cell(row, columns.item);
        let status = status_of(&cell(row, columns.direction), &cell(row, columns.status), &cell(row, columns.kind), &payee, &item);
        let mut parsed = ImportRow {
            id: uuid::Uuid::now_v7().to_string(),
            at,
            payee,
            item,
            category: String::new(),
            cents,
            status,
            checked: false,
        };
        if parsed.status == ImportStatus::New && duplicate(&parsed, known) {
            parsed.status = ImportStatus::Duplicate;
        }
        parsed.checked = parsed.status == ImportStatus::New;
        out.push(parsed);
        if out.len() >= MAX_ROWS {
            break;
        }
    }
    if out.is_empty() {
        return Err("no rows".to_owned());
    }
    out.sort_by_key(|row| std::cmp::Reverse(row.at));
    Ok(ImportPreview {
        id: uuid::Uuid::now_v7().to_string(),
        file: name,
        app,
        from: out.iter().map(|row| row.at).min().unwrap_or(0),
        to: out.iter().map(|row| row.at).max().unwrap_or(0),
        rows: out,
        sorted: false,
    })
}

pub fn summary(preview: &ImportPreview) -> String {
    let count = |status: ImportStatus| preview.rows.iter().filter(|row| row.status == status).count();
    let keys: BTreeSet<String> = preview
        .rows
        .iter()
        .filter(|row| matches!(row.status, ImportStatus::New | ImportStatus::Duplicate | ImportStatus::Transfer))
        .map(key_of)
        .take(MAX_KEYS)
        .collect();
    json!({
        "file": preview.file,
        "app": preview.app,
        "rows": preview.rows.len(),
        "new": count(ImportStatus::New),
        "already_recorded": count(ImportStatus::Duplicate),
        "transfers": count(ImportStatus::Transfer),
        "refunds": count(ImportStatus::Refund),
        "income": count(ImportStatus::Income),
        "keys_to_categorize": keys,
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALIPAY: &str = "支付宝交易记录明细查询\n账号:[x]\n------------------------交易记录明细列表------------------------\n交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注,\n2026-10-31 09:20:11,餐饮美食,星巴克,/,咖啡,支出,22.00,花呗,交易成功,1\t,2\t,,\n2026-10-28 15:02:00,转账红包,张三,/,转账,不计收支,500.00,余额,交易成功,3\t,,,\n2026-10-27 10:00:00,退款,盒马,/,退款-超市,收入,12.50,余额,退款成功,4\t,,,\n";

    const WECHAT: &str = "\u{feff}微信支付账单明细\n----------------------微信支付账单明细列表--------------------\n交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注\n2026-10-30 20:05:00,商户消费,美团外卖,\"晚饭, 外卖\",支出,¥62.00,零钱,支付成功,1\t,2\t,/\n2026-10-29 08:00:00,微信红包,李四,/,收入,¥8.88,/,已存入零钱,3\t,/,/\n";

    fn write(name: &str, body: &[u8]) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("ledger-test-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(name);
        std::fs::write(&path, body).unwrap();
        path
    }

    #[test]
    fn alipay_gbk_csv_is_read() {
        let (bytes, _, _) = encoding_rs::GB18030.encode(ALIPAY);
        let preview = read(&write("alipay.csv", &bytes), &[]).unwrap();
        assert_eq!(preview.app, "alipay");
        assert_eq!(preview.rows.len(), 3);
        let coffee = preview.rows.iter().find(|row| row.payee == "星巴克").unwrap();
        assert_eq!(coffee.cents, 2200);
        assert_eq!(coffee.status, ImportStatus::New);
        assert!(coffee.checked);
        assert_eq!(preview.rows.iter().find(|row| row.payee == "张三").unwrap().status, ImportStatus::Transfer);
        assert_eq!(preview.rows.iter().find(|row| row.payee == "盒马").unwrap().status, ImportStatus::Refund);
    }

    #[test]
    fn wechat_csv_is_read_and_deduplicated() {
        let known = vec![Expense {
            cents: 6200,
            at: crate::ledger::parse_time("2026-10-30 20:10").unwrap(),
            ..Expense::default()
        }];
        let preview = read(&write("wechat.csv", WECHAT.as_bytes()), &known).unwrap();
        assert_eq!(preview.app, "wechat");
        let dinner = preview.rows.iter().find(|row| row.payee == "美团外卖").unwrap();
        assert_eq!(dinner.item, "晚饭, 外卖");
        assert_eq!(dinner.status, ImportStatus::Duplicate);
        assert!(!dinner.checked);
        assert_eq!(preview.rows.iter().find(|row| row.payee == "李四").unwrap().status, ImportStatus::Income);
    }
}
