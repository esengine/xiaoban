use std::collections::{HashMap, HashSet};

use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{Memory, MemoryGalaxy, MemoryKind};

const MIN_HITS: usize = 2;
const MAX_PINNED: usize = 30;
pub const RECALL_BUDGET: usize = 1_500;
pub const SEARCH_BUDGET: usize = 4_000;
const ALIAS_WEIGHT: f64 = 0.6;
const K1: f64 = 1.2;
const B: f64 = 0.75;
const KEEP_RATIO: f64 = 0.3;
const CONSTRAINT_RATIO: f64 = 0.08;
const LINK_SEEDS: usize = 3;
const LINK_MIN: f64 = 2.0;
const RECENT_MS: i64 = 30 * 86_400_000;

const UNIGRAM_WEIGHT: f64 = 0.25;

fn stopwords() -> &'static HashSet<&'static str> {
    static WORDS: std::sync::OnceLock<HashSet<&'static str>> = std::sync::OnceLock::new();
    WORDS.get_or_init(|| {
        include_str!("memory_stopwords.txt")
            .split_whitespace()
            .collect()
    })
}

fn terms(text: &str) -> Vec<String> {
    let stop = stopwords();
    let lower = text.to_lowercase();
    let mut terms: Vec<String> = lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| word.is_ascii() && word.chars().count() >= 2)
        .map(str::to_owned)
        .collect();
    for run in lower.split(|c: char| c.is_ascii() || !c.is_alphanumeric()) {
        let chars: Vec<char> = run.chars().collect();
        terms.extend(
            chars
                .windows(2)
                .map(|pair| pair.iter().collect::<String>())
                .filter(|pair| !stop.contains(pair.as_str())),
        );
        terms.extend(
            chars
                .iter()
                .map(char::to_string)
                .filter(|single| !stop.contains(single.as_str()))
                .map(|single| format!("#{single}")),
        );
    }
    terms
}

fn weight(term: &str) -> f64 {
    if term.starts_with('#') {
        UNIGRAM_WEIGHT
    } else {
        1.0
    }
}

fn unique(terms: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    terms
        .into_iter()
        .filter(|term| seen.insert(term.clone()))
        .collect()
}

pub fn line(memory: &Memory) -> String {
    format!("- {}: {}", memory.subject.trim(), memory.value.trim())
}

fn live(memory: &Memory, now: i64) -> bool {
    memory.expires_at.is_none_or(|at| at >= now)
}

pub fn snapshot(
    localizer: &Localizer,
    memories: &[Memory],
    galaxies: &[MemoryGalaxy],
    now: i64,
) -> Option<String> {
    let mut pinned: Vec<&Memory> = memories
        .iter()
        .filter(|memory| memory.pinned && live(memory, now))
        .collect();
    pinned.sort_by(|a, b| b.importance.cmp(&a.importance).then(b.uses.cmp(&a.uses)));
    pinned.truncate(MAX_PINNED);
    let mut counts: HashMap<&str, usize> = HashMap::new();
    for memory in memories {
        if let Some(galaxy) = memory.galaxy.as_deref() {
            *counts.entry(galaxy).or_default() += 1;
        }
    }
    let directory: Vec<String> = galaxies
        .iter()
        .filter(|galaxy| counts.contains_key(galaxy.name.as_str()))
        .map(|galaxy| {
            let count = counts.get(galaxy.name.as_str()).copied().unwrap_or(0);
            let summary = galaxy.summary.trim();
            if summary.is_empty() {
                format!("- {} [{}] ({count})", galaxy.name, galaxy.cluster.as_str())
            } else {
                format!(
                    "- {} [{}] ({count}): {summary}",
                    galaxy.name,
                    galaxy.cluster.as_str()
                )
            }
        })
        .collect();
    let loose: Vec<String> = memories
        .iter()
        .filter(|memory| memory.galaxy.is_none() && !memory.pinned && live(memory, now))
        .map(line)
        .collect();
    if pinned.is_empty() && directory.is_empty() && loose.is_empty() {
        return None;
    }
    let mut parts = vec![localizer.text(keys::PROMPT_MEMORY_HEADING)];
    parts.extend(pinned.into_iter().map(line));
    if !directory.is_empty() {
        parts.push(localizer.text(keys::PROMPT_MEMORY_GALAXIES));
        parts.extend(directory);
    }
    parts.extend(loose);
    Some(parts.join("\n"))
}

struct Field {
    counts: HashMap<String, usize>,
    length: usize,
}

impl Field {
    fn new(text: &str) -> Self {
        let words = terms(text);
        let mut counts = HashMap::new();
        for word in &words {
            *counts.entry(word.clone()).or_insert(0) += 1;
        }
        Self {
            counts,
            length: words.len().max(1),
        }
    }
}

struct Doc<'a> {
    memory: &'a Memory,
    main: Field,
    alias: Field,
}

#[allow(clippy::cast_precision_loss)]
fn bm25(field: &Field, term: &str, idf: f64, average: f64) -> f64 {
    let tf = field.counts.get(term).copied().unwrap_or(0) as f64;
    if tf == 0.0 {
        return 0.0;
    }
    idf * tf * (K1 + 1.0) / (tf + K1 * (1.0 - B + B * field.length as f64 / average))
}

pub struct Recall<'a> {
    pub memories: &'a [Memory],
    pub galaxies: &'a [MemoryGalaxy],
    pub links: &'a [(String, String, f64)],
    pub now: i64,
}

impl<'a> Recall<'a> {
    fn galaxy_text(&self, name: Option<&str>) -> (String, String) {
        let Some(name) = name else {
            return (String::new(), String::new());
        };
        let aliases = self
            .galaxies
            .iter()
            .find(|galaxy| galaxy.name == name)
            .map(|galaxy| galaxy.aliases.join(" "))
            .unwrap_or_default();
        (name.to_owned(), aliases)
    }

    #[allow(clippy::cast_precision_loss)]
    fn scored(&self, query: &str, candidates: &[&'a Memory]) -> Vec<(&'a Memory, f64)> {
        let wanted = unique(terms(query));
        if wanted.is_empty() || candidates.is_empty() {
            return Vec::new();
        }
        let docs: Vec<Doc<'a>> = candidates
            .iter()
            .map(|memory| {
                let (galaxy, galaxy_aliases) = self.galaxy_text(memory.galaxy.as_deref());
                Doc {
                    memory,
                    main: Field::new(&format!("{} {} {galaxy}", memory.subject, memory.value)),
                    alias: Field::new(&format!("{} {galaxy_aliases}", memory.aliases.join(" "))),
                }
            })
            .collect();
        let total = docs.len() as f64;
        let average_main = docs.iter().map(|doc| doc.main.length as f64).sum::<f64>() / total;
        let average_alias = docs.iter().map(|doc| doc.alias.length as f64).sum::<f64>() / total;
        let idf: HashMap<&str, f64> = wanted
            .iter()
            .map(|term| {
                let found = docs
                    .iter()
                    .filter(|doc| {
                        doc.main.counts.contains_key(term) || doc.alias.counts.contains_key(term)
                    })
                    .count() as f64;
                (
                    term.as_str(),
                    ((total - found + 0.5) / (found + 0.5) + 1.0).ln(),
                )
            })
            .collect();
        let mut scored: Vec<(&Memory, f64)> = docs
            .iter()
            .map(|doc| {
                let raw: f64 = wanted
                    .iter()
                    .map(|term| {
                        let idf = idf.get(term.as_str()).copied().unwrap_or(0.0);
                        weight(term)
                            * (bm25(&doc.main, term, idf, average_main)
                                + ALIAS_WEIGHT * bm25(&doc.alias, term, idf, average_alias))
                    })
                    .sum();
                let importance = 1.0 + 0.15 * (f64::from(doc.memory.importance) - 2.0);
                let recent = doc
                    .memory
                    .last_used_at
                    .filter(|at| self.now - at < RECENT_MS)
                    .map_or(1.0, |_| 1.1);
                (doc.memory, raw * importance * recent)
            })
            .filter(|(_, score)| *score > 0.0)
            .collect();
        scored.sort_by(|a, b| b.1.total_cmp(&a.1));
        scored
    }

    fn touched_galaxies(&self, query: &str, top: &[(&Memory, f64)]) -> HashSet<String> {
        let lower = query.to_lowercase();
        let mut touched: HashSet<String> = self
            .galaxies
            .iter()
            .filter(|galaxy| {
                std::iter::once(&galaxy.name)
                    .chain(&galaxy.aliases)
                    .any(|name| !name.is_empty() && lower.contains(&name.to_lowercase()))
            })
            .map(|galaxy| galaxy.name.clone())
            .collect();
        touched.extend(
            top.iter()
                .take(LINK_SEEDS)
                .filter_map(|(memory, _)| memory.galaxy.clone()),
        );
        touched
    }

    pub fn find(&self, query: &str, budget: usize, skip_pinned: bool) -> Vec<&'a Memory> {
        let candidates: Vec<&Memory> = self
            .memories
            .iter()
            .filter(|memory| live(memory, self.now) && !(skip_pinned && memory.pinned))
            .collect();
        let scored = self.scored(query, &candidates);
        let best = scored.first().map_or(0.0, |(_, score)| *score);
        let kept: Vec<&Memory> = scored
            .iter()
            .filter(|(_, score)| *score >= best * KEEP_RATIO)
            .map(|(memory, _)| *memory)
            .collect();
        let touched = self.touched_galaxies(query, &scored);
        let mut constraints: Vec<&Memory> = candidates
            .iter()
            .copied()
            .filter(|memory| {
                memory.kind == MemoryKind::Constraint
                    && (memory
                        .galaxy
                        .as_ref()
                        .is_some_and(|galaxy| touched.contains(galaxy))
                        || scored.iter().any(|(hit, score)| {
                            hit.id == memory.id && *score >= best * CONSTRAINT_RATIO
                        }))
            })
            .collect();
        constraints.sort_by_key(|memory| std::cmp::Reverse(memory.importance));
        let seeds: HashSet<&str> = kept
            .iter()
            .take(LINK_SEEDS)
            .map(|memory| memory.id.as_str())
            .collect();
        let neighbours: Vec<&Memory> = self
            .links
            .iter()
            .filter(|(_, _, weight)| *weight >= LINK_MIN)
            .filter_map(|(a, b, _)| {
                if seeds.contains(a.as_str()) {
                    Some(b)
                } else if seeds.contains(b.as_str()) {
                    Some(a)
                } else {
                    None
                }
            })
            .filter_map(|id| candidates.iter().copied().find(|memory| &memory.id == id))
            .collect();
        let mut chosen: Vec<&Memory> = Vec::new();
        let mut used = 0;
        for memory in constraints.into_iter().chain(kept).chain(neighbours) {
            if chosen.iter().any(|known| known.id == memory.id) {
                continue;
            }
            let cost = line(memory).chars().count() + 1;
            if used + cost > budget {
                continue;
            }
            used += cost;
            chosen.push(memory);
        }
        chosen
    }

    pub fn galaxy(&self, name: &str) -> Vec<&'a Memory> {
        let lower = name.trim().to_lowercase();
        let Some(galaxy) = self.galaxies.iter().find(|galaxy| {
            galaxy.name.to_lowercase() == lower
                || galaxy
                    .aliases
                    .iter()
                    .any(|alias| alias.to_lowercase() == lower)
        }) else {
            return Vec::new();
        };
        self.memories
            .iter()
            .filter(|memory| {
                memory.galaxy.as_deref() == Some(galaxy.name.as_str()) && live(memory, self.now)
            })
            .collect()
    }
}

pub fn used_by(answer: &str, memories: &[Memory]) -> Vec<String> {
    let answer = answer.to_lowercase();
    memories
        .iter()
        .filter(|memory| {
            let wanted: Vec<String> = unique(terms(&memory.value))
                .into_iter()
                .filter(|term| !term.starts_with('#'))
                .collect();
            let hits = wanted
                .iter()
                .filter(|term| answer.contains(term.as_str()))
                .count();
            !wanted.is_empty() && hits >= MIN_HITS.min(wanted.len())
        })
        .map(|memory| memory.id.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use xiaoban_i18n::Locale;
    use xiaoban_protocol::MemoryCategory;

    use super::*;

    struct Spec {
        subject: &'static str,
        value: &'static str,
        galaxy: &'static str,
        kind: MemoryKind,
        aliases: &'static [&'static str],
        pinned: bool,
    }

    const fn spec(
        subject: &'static str,
        value: &'static str,
        galaxy: &'static str,
        kind: MemoryKind,
        aliases: &'static [&'static str],
    ) -> Spec {
        Spec {
            subject,
            value,
            galaxy,
            kind,
            aliases,
            pinned: false,
        }
    }

    fn build(specs: &[Spec]) -> (Vec<Memory>, Vec<MemoryGalaxy>) {
        let memories: Vec<Memory> = specs
            .iter()
            .map(|spec| Memory {
                id: spec.subject.into(),
                subject: spec.subject.into(),
                value: spec.value.into(),
                category: MemoryCategory::Other,
                galaxy: Some(spec.galaxy.into()),
                kind: spec.kind,
                importance: if spec.kind == Constraint { 3 } else { 2 },
                pinned: spec.pinned,
                aliases: spec
                    .aliases
                    .iter()
                    .map(|alias| (*alias).to_owned())
                    .collect(),
                expires_at: None,
                uses: 0,
                last_used_at: None,
                updated_at: 0,
            })
            .collect();
        let mut names: Vec<&str> = specs.iter().map(|spec| spec.galaxy).collect();
        names.dedup();
        let galaxies = names
            .into_iter()
            .collect::<HashSet<_>>()
            .into_iter()
            .map(|name| MemoryGalaxy {
                id: name.into(),
                cluster: MemoryCategory::Other,
                name: name.into(),
                aliases: Vec::new(),
                summary: String::new(),
            })
            .collect();
        (memories, galaxies)
    }

    use MemoryKind::{Constraint, Fact, Plan, Preference};

    const FIXTURE: &[Spec] = &[
        spec(
            "儿子过敏",
            "6 岁儿子对花生过敏",
            "儿子",
            Constraint,
            &[
                "孩子",
                "小孩",
                "娃",
                "坚果",
                "花生酱",
                "点餐",
                "外卖",
                "做饭",
                "零食",
            ],
        ),
        spec(
            "儿子学校",
            "儿子在朝阳实验小学上一年级",
            "儿子",
            Fact,
            &["孩子", "娃", "上学", "接送", "放学", "家长会", "老师"],
        ),
        spec(
            "儿子兴趣",
            "儿子喜欢恐龙和乐高",
            "儿子",
            Preference,
            &["孩子", "娃", "礼物", "玩具", "生日", "周末去哪"],
        ),
        spec(
            "儿子生日",
            "儿子生日是 3 月 12 日",
            "儿子",
            Fact,
            &["孩子", "娃", "生日", "蛋糕", "礼物"],
        ),
        spec(
            "老婆工作",
            "老婆在银行上班，周三常加班",
            "老婆",
            Fact,
            &["媳妇", "爱人", "太太", "加班", "下班", "接孩子"],
        ),
        spec(
            "老婆口味",
            "老婆不吃香菜",
            "老婆",
            Constraint,
            &["媳妇", "爱人", "太太", "点餐", "外卖", "做饭", "调料"],
        ),
        spec(
            "老婆生日",
            "老婆生日是 9 月 3 日",
            "老婆",
            Fact,
            &["媳妇", "爱人", "太太", "纪念日", "礼物", "生日"],
        ),
        spec(
            "妈妈血压",
            "妈妈有高血压，每天吃降压药",
            "妈妈",
            Constraint,
            &["母亲", "老人", "药", "体检", "饮食", "咸"],
        ),
        spec(
            "妈妈住处",
            "妈妈住在杭州西湖区",
            "妈妈",
            Fact,
            &["母亲", "老家", "回家", "看望"],
        ),
        spec(
            "饮食禁忌",
            "晚饭不吃辣",
            "饮食",
            Preference,
            &["辣", "川菜", "火锅", "点餐", "外卖", "晚餐"],
        ),
        spec(
            "咖啡",
            "每天上午一杯美式，不加糖",
            "饮食",
            Preference,
            &["咖啡", "早上", "饮料", "提神"],
        ),
        spec(
            "住址",
            "住在上海浦东张江",
            "住处",
            Fact,
            &["家", "地址", "小区", "附近", "快递"],
        ),
        spec(
            "车",
            "开一辆白色特斯拉 Model 3，车牌沪A12345",
            "出行",
            Fact,
            &["车", "开车", "停车", "充电", "车牌", "限行"],
        ),
        spec(
            "通勤",
            "每天 8:30 出门，地铁 2 号线去陆家嘴",
            "工作",
            Fact,
            &["上班", "出门", "地铁", "早高峰", "迟到"],
        ),
        spec(
            "公司",
            "在陆家嘴一家基金公司做产品经理",
            "工作",
            Fact,
            &["上班", "老板", "同事", "单位", "职位"],
        ),
        spec(
            "周会",
            "每周一上午 10 点开周会",
            "工作",
            Plan,
            &["会议", "开会", "周一", "日程"],
        ),
        spec(
            "装修预算",
            "装修总预算 35 万，硬装 22 万",
            "装修",
            Fact,
            &["钱", "花费", "报价", "超支", "多少钱"],
        ),
        spec(
            "装修甲醛",
            "家里有孩子，装修材料要选 ENF 级环保板材",
            "装修",
            Constraint,
            &["环保", "甲醛", "板材", "柜子", "家具", "孩子"],
        ),
        spec(
            "装修工期",
            "10 月底开工，计划 2027 年 1 月中旬入住",
            "装修",
            Plan,
            &["开工", "入住", "进度", "什么时候", "搬家"],
        ),
        spec(
            "橱柜",
            "橱柜选了石英石台面，预算 1.86 万",
            "装修",
            Fact,
            &["厨房", "台面", "柜子"],
        ),
        spec(
            "杭州行程",
            "11 月 14 日到 16 日带家人去杭州",
            "杭州行程",
            Plan,
            &["旅行", "出游", "周末", "杭州", "西湖", "订酒店"],
        ),
        spec(
            "酒店偏好",
            "订酒店要家庭房，带早餐",
            "出行",
            Preference,
            &["酒店", "住宿", "订房", "民宿", "旅行"],
        ),
        spec(
            "运动",
            "每周三晚上去游泳",
            "爱好",
            Plan,
            &["健身", "锻炼", "游泳馆", "周三"],
        ),
        spec(
            "看书",
            "最近在读《三体》",
            "爱好",
            Preference,
            &["书", "小说", "推荐", "阅读"],
        ),
        spec(
            "医保",
            "社保在上海交，医保卡尾号 8821",
            "证件",
            Fact,
            &["看病", "医院", "报销", "社保卡"],
        ),
        spec(
            "护照",
            "护照 2028 年 5 月过期",
            "证件",
            Plan,
            &["出国", "签证", "到期", "旅行"],
        ),
    ];

    const CASES: &[(&str, &[&str])] = &[
        ("帮我订个外卖", &["儿子过敏", "老婆口味"]),
        ("晚上点什么吃好", &["饮食禁忌"]),
        ("孩子最近在学校怎么样", &["儿子学校"]),
        ("娃生日送什么", &["儿子生日", "儿子兴趣"]),
        ("给媳妇买个礼物", &["老婆生日"]),
        ("妈妈体检要注意什么", &["妈妈血压"]),
        ("这周末回老家看看", &["妈妈住处"]),
        ("附近有什么好吃的川菜", &["饮食禁忌"]),
        ("明天早上几点出门不迟到", &["通勤"]),
        ("周一有什么会", &["周会"]),
        ("装修还剩多少钱", &["装修预算"]),
        ("柜子用什么板材", &["装修甲醛"]),
        ("什么时候能搬家", &["装修工期"]),
        ("厨房台面花了多少", &["橱柜"]),
        ("杭州那几天订什么酒店", &["杭州行程", "酒店偏好"]),
        ("车今天限行吗", &["车"]),
        ("充电桩在哪", &["车"]),
        ("推荐几本小说", &["看书"]),
        ("去医院看病能报销吗", &["医保"]),
        ("明年出国签证来得及吗", &["护照"]),
        ("周三晚上安排什么", &["运动", "老婆工作"]),
        ("做个晚饭菜谱", &["儿子过敏", "老婆口味", "饮食禁忌"]),
        ("给孩子买点零食", &["儿子过敏"]),
        ("快递寄到哪", &["住址"]),
        ("同事请喝咖啡", &["咖啡"]),
    ];

    #[test]
    fn recall_finds_the_expected_memories() {
        let (memories, galaxies) = build(FIXTURE);
        let recall = Recall {
            memories: &memories,
            galaxies: &galaxies,
            links: &[],
            now: 0,
        };
        let mut expected = 0;
        let mut found = 0;
        let mut misses = Vec::new();
        for (query, wanted) in CASES {
            let got: Vec<&str> = recall
                .find(query, RECALL_BUDGET, true)
                .iter()
                .map(|memory| memory.subject.as_str())
                .collect();
            for subject in *wanted {
                expected += 1;
                if got.contains(subject) {
                    found += 1;
                } else {
                    misses.push(format!("{query} -> {subject} (got {got:?})"));
                }
            }
        }
        let rate = f64::from(found) / f64::from(expected);
        eprintln!("recall {found}/{expected} misses {misses:#?}");
        assert!(rate >= 0.9, "recall {found}/{expected}: {misses:#?}");
    }

    #[test]
    fn constraints_come_with_their_galaxy() {
        let (memories, galaxies) = build(FIXTURE);
        let recall = Recall {
            memories: &memories,
            galaxies: &galaxies,
            links: &[],
            now: 0,
        };
        let got: Vec<&str> = recall
            .find("儿子明天春游带什么", RECALL_BUDGET, true)
            .iter()
            .map(|memory| memory.subject.as_str())
            .collect();
        assert!(got.contains(&"儿子过敏"), "{got:?}");
    }

    #[test]
    fn snapshot_keeps_pinned_and_lists_galaxies() {
        let localizer = Localizer::new(Locale::En);
        let (mut memories, galaxies) = build(&FIXTURE[..3]);
        memories[0].pinned = true;
        let snapshot = snapshot(&localizer, &memories, &galaxies, 0).unwrap();
        assert!(snapshot.contains("6 岁儿子对花生过敏"));
        assert!(!snapshot.contains("乐高"));
        assert!(snapshot.contains("儿子 [other] (3)"));
        assert_eq!(super::snapshot(&localizer, &[], &[], 0), None);
    }

    #[test]
    fn answers_that_mention_a_memory_count_as_using_it() {
        let (memories, _) = build(FIXTURE);
        let used = used_by("这家店有花生酱，你儿子过敏的话别点。", &memories);
        assert!(used.contains(&"儿子过敏".to_owned()));
        assert!(!used.contains(&"住址".to_owned()));
    }
}
