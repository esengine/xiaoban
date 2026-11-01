const MAX_DEPTH: usize = 64;

pub fn col_name(mut col: u32) -> String {
    let mut name = String::new();
    loop {
        name.insert(0, char::from(b'A' + u8::try_from(col % 26).unwrap_or(0)));
        if col < 26 {
            break;
        }
        col = col / 26 - 1;
    }
    name
}

pub fn parse_ref(text: &str) -> Option<(u32, u32)> {
    let text = text.trim().trim_start_matches('$');
    let letters: String = text.chars().take_while(char::is_ascii_alphabetic).collect();
    let digits = text[letters.len()..].trim_start_matches('$');
    if letters.is_empty() || digits.is_empty() || !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let mut col: u32 = 0;
    for c in letters.to_ascii_uppercase().bytes() {
        col = col.checked_mul(26)?.checked_add(u32::from(c - b'A') + 1)?;
    }
    let row: u32 = digits.parse().ok()?;
    (row >= 1 && col >= 1).then(|| (row - 1, col - 1))
}

pub fn parse_range(text: &str) -> Option<((u32, u32), (u32, u32))> {
    let (a, b) = text.split_once(':').unwrap_or((text, text));
    let (r1, c1) = parse_ref(a)?;
    let (r2, c2) = parse_ref(b)?;
    Some(((r1.min(r2), c1.min(c2)), (r1.max(r2), c1.max(c2))))
}

pub fn number(text: &str) -> Option<f64> {
    let cleaned: String = text.trim().chars().filter(|c| !matches!(c, ',' | '¥' | '$' | ' ')).collect();
    let (body, percent) = cleaned.strip_suffix('%').map_or((cleaned.as_str(), false), |body| (body, true));
    let value: f64 = body.parse().ok()?;
    value.is_finite().then_some(if percent { value / 100.0 } else { value })
}

#[allow(clippy::cast_possible_truncation)]
pub fn show(value: f64) -> String {
    if !value.is_finite() {
        return "#NUM!".to_owned();
    }
    if (value - value.round()).abs() < 1e-9 && value.abs() < 1e15 {
        return format!("{}", value.round() as i64);
    }
    let text = format!("{value:.6}");
    text.trim_end_matches('0').trim_end_matches('.').to_owned()
}

#[derive(Debug, Clone, PartialEq)]
enum Token {
    Num(f64),
    Ref(String),
    Name(String),
    Op(char),
    Open,
    Close,
    Comma,
    Colon,
}

fn tokens(text: &str) -> Option<Vec<Token>> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if c.is_whitespace() {
            i += 1;
        } else if c.is_ascii_digit() || c == '.' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                i += 1;
            }
            out.push(Token::Num(chars[start..i].iter().collect::<String>().parse().ok()?));
        } else if c.is_ascii_alphabetic() || c == '$' {
            let start = i;
            while i < chars.len() && (chars[i].is_ascii_alphanumeric() || chars[i] == '$') {
                i += 1;
            }
            let word: String = chars[start..i].iter().collect();
            if parse_ref(&word).is_some() {
                out.push(Token::Ref(word));
            } else {
                out.push(Token::Name(word.to_ascii_uppercase()));
            }
        } else {
            out.push(match c {
                '+' | '-' | '*' | '/' => Token::Op(c),
                '(' => Token::Open,
                ')' => Token::Close,
                ',' | '\u{ff0c}' | ';' => Token::Comma,
                ':' => Token::Colon,
                _ => return None,
            });
            i += 1;
        }
    }
    Some(out)
}

pub struct Grid<'a> {
    pub cells: &'a [Vec<String>],
}

impl Grid<'_> {
    fn raw(&self, row: u32, col: u32) -> &str {
        self.cells
            .get(row as usize)
            .and_then(|line| line.get(col as usize))
            .map_or("", String::as_str)
    }

    pub fn value(&self, row: u32, col: u32, depth: usize) -> Result<Option<f64>, &'static str> {
        let raw = self.raw(row, col);
        if let Some(formula) = raw.strip_prefix('=') {
            if depth > MAX_DEPTH {
                return Err("#REF!");
            }
            return self.eval(formula, depth + 1).map(Some);
        }
        Ok(number(raw))
    }

    pub fn eval(&self, formula: &str, depth: usize) -> Result<f64, &'static str> {
        let list = tokens(formula).ok_or("#NAME?")?;
        let mut parser = Parser { list, at: 0, grid: self, depth };
        let value = parser.sum()?;
        if parser.at != parser.list.len() {
            return Err("#NAME?");
        }
        Ok(value)
    }

    pub fn display(&self, row: u32, col: u32) -> String {
        let raw = self.raw(row, col);
        match raw.strip_prefix('=') {
            Some(formula) => match self.eval(formula, 1) {
                Ok(value) => show(value),
                Err(code) => code.to_owned(),
            },
            None => raw.to_owned(),
        }
    }
}

struct Parser<'a, 'g> {
    list: Vec<Token>,
    at: usize,
    grid: &'a Grid<'g>,
    depth: usize,
}

impl Parser<'_, '_> {
    fn peek(&self) -> Option<&Token> {
        self.list.get(self.at)
    }

    fn next(&mut self) -> Option<Token> {
        let token = self.list.get(self.at).cloned();
        self.at += 1;
        token
    }

    fn sum(&mut self) -> Result<f64, &'static str> {
        let mut value = self.product()?;
        while let Some(Token::Op(op @ ('+' | '-'))) = self.peek().cloned() {
            self.at += 1;
            let right = self.product()?;
            value = if op == '+' { value + right } else { value - right };
        }
        Ok(value)
    }

    fn product(&mut self) -> Result<f64, &'static str> {
        let mut value = self.unary()?;
        while let Some(Token::Op(op @ ('*' | '/'))) = self.peek().cloned() {
            self.at += 1;
            let right = self.unary()?;
            if op == '/' && right == 0.0 {
                return Err("#DIV/0!");
            }
            value = if op == '*' { value * right } else { value / right };
        }
        Ok(value)
    }

    fn unary(&mut self) -> Result<f64, &'static str> {
        if let Some(Token::Op('-')) = self.peek() {
            self.at += 1;
            return Ok(-self.unary()?);
        }
        if let Some(Token::Op('+')) = self.peek() {
            self.at += 1;
        }
        self.atom()
    }

    fn atom(&mut self) -> Result<f64, &'static str> {
        match self.next() {
            Some(Token::Num(value)) => Ok(value),
            Some(Token::Ref(text)) => {
                let (row, col) = parse_ref(&text).ok_or("#REF!")?;
                Ok(self.grid.value(row, col, self.depth)?.unwrap_or(0.0))
            }
            Some(Token::Open) => {
                let value = self.sum()?;
                match self.next() {
                    Some(Token::Close) => Ok(value),
                    _ => Err("#NAME?"),
                }
            }
            Some(Token::Name(name)) => self.call(&name),
            _ => Err("#NAME?"),
        }
    }

    fn args(&mut self) -> Result<Vec<f64>, &'static str> {
        if self.next() != Some(Token::Open) {
            return Err("#NAME?");
        }
        let mut values = Vec::new();
        if self.peek() == Some(&Token::Close) {
            self.at += 1;
            return Ok(values);
        }
        loop {
            let is_range = matches!(self.peek(), Some(Token::Ref(_))) && self.list.get(self.at + 1) == Some(&Token::Colon);
            if is_range {
                let Some(Token::Ref(a)) = self.next() else { return Err("#REF!") };
                self.at += 1;
                let Some(Token::Ref(b)) = self.next() else { return Err("#REF!") };
                let ((r1, c1), (r2, c2)) = parse_range(&format!("{a}:{b}")).ok_or("#REF!")?;
                if (r2 - r1 + 1) * (c2 - c1 + 1) > 100_000 {
                    return Err("#REF!");
                }
                for row in r1..=r2 {
                    for col in c1..=c2 {
                        if let Some(value) = self.grid.value(row, col, self.depth)? {
                            values.push(value);
                        }
                    }
                }
            } else {
                values.push(self.sum()?);
            }
            match self.next() {
                Some(Token::Comma) => {}
                Some(Token::Close) => return Ok(values),
                _ => return Err("#NAME?"),
            }
        }
    }

    #[allow(clippy::cast_precision_loss)]
    fn call(&mut self, name: &str) -> Result<f64, &'static str> {
        let values = self.args()?;
        match name {
            "SUM" => Ok(values.iter().sum()),
            "AVERAGE" | "AVG" => {
                if values.is_empty() {
                    Err("#DIV/0!")
                } else {
                    Ok(values.iter().sum::<f64>() / values.len() as f64)
                }
            }
            "MIN" => Ok(values.iter().copied().fold(f64::INFINITY, f64::min)).map(|v| if v.is_finite() { v } else { 0.0 }),
            "MAX" => Ok(values.iter().copied().fold(f64::NEG_INFINITY, f64::max)).map(|v| if v.is_finite() { v } else { 0.0 }),
            "COUNT" => Ok(values.len() as f64),
            "ROUND" => {
                let value = values.first().copied().unwrap_or(0.0);
                let places = values.get(1).copied().unwrap_or(0.0).clamp(0.0, 10.0);
                let factor = 10f64.powf(places.round());
                Ok((value * factor).round() / factor)
            }
            _ => Err("#NAME?"),
        }
    }
}

pub fn values(cells: &[Vec<String>]) -> Vec<Vec<String>> {
    let grid = Grid { cells };
    cells
        .iter()
        .enumerate()
        .map(|(row, line)| {
            (0..line.len())
                .map(|col| grid.display(u32::try_from(row).unwrap_or(0), u32::try_from(col).unwrap_or(0)))
                .collect()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn grid(rows: &[&[&str]]) -> Vec<Vec<String>> {
        rows.iter().map(|row| row.iter().map(|cell| (*cell).to_owned()).collect()).collect()
    }

    #[test]
    fn references_and_names_round_trip() {
        assert_eq!(parse_ref("A1"), Some((0, 0)));
        assert_eq!(parse_ref("$H$2"), Some((1, 7)));
        assert_eq!(parse_ref("AA10"), Some((9, 26)));
        assert_eq!(col_name(0), "A");
        assert_eq!(col_name(25), "Z");
        assert_eq!(col_name(26), "AA");
        assert_eq!(parse_ref("1A"), None);
    }

    #[test]
    fn formulas_compute() {
        let cells = grid(&[
            &["price", "total"],
            &["1,280", "=A2*3"],
            &["990", "=A3*3"],
            &["=MIN(A2:A3)", "=SUM(B2:B3)"],
            &["=AVERAGE(A2:A3)", "=ROUND(10/3, 2)"],
        ]);
        let out = values(&cells);
        assert_eq!(out[1][1], "3840");
        assert_eq!(out[3][0], "990");
        assert_eq!(out[3][1], "6810");
        assert_eq!(out[4][0], "1135");
        assert_eq!(out[4][1], "3.33");
    }

    #[test]
    fn errors_are_reported() {
        let cells = grid(&[&["=A1"], &["=1/0"], &["=FOO(1)"], &["=(1+2"]]);
        let out = values(&cells);
        assert_eq!(out[0][0], "#REF!");
        assert_eq!(out[1][0], "#DIV/0!");
        assert_eq!(out[2][0], "#NAME?");
        assert_eq!(out[3][0], "#NAME?");
    }
}
