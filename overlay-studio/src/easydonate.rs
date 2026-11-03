//! EasyDonate public API (https://docs.easydonate.app/developer) — polled, since the
//! API has no realtime channel. Budget: 60 req/min per key.

use crate::config::{EdCfg, RangeCfg};
use crate::state::Shared;
use chrono::{Datelike, Local, NaiveDateTime, TimeZone};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::time::Duration;

const BASE: &str = "https://api.easydonate.app/api/v1";
/// Donations older than this are never alerted (protects against list reshuffles).
const ALERT_WINDOW_MS: i64 = 15 * 60 * 1000;

pub struct Api {
    http: reqwest::Client,
    key: String,
}

#[derive(Debug)]
pub struct ApiErr {
    pub status: u16,
    pub message: String,
}

impl std::fmt::Display for ApiErr {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl Api {
    pub fn new(key: &str) -> Self {
        Self {
            http: reqwest::Client::builder()
                .user_agent("OverlayStudio/0.1 (+obs overlay)")
                .timeout(Duration::from_secs(15))
                .build()
                .unwrap(),
            key: key.trim().to_string(),
        }
    }

    pub async fn get(&self, state: &Shared, path: &str, query: &[(&str, String)]) -> Result<Value, ApiErr> {
        let r = self
            .http
            .get(format!("{BASE}{path}"))
            .bearer_auth(&self.key)
            .query(query)
            .send()
            .await
            .map_err(|e| ApiErr { status: 0, message: format!("เชื่อมต่อ EasyDonate ไม่ได้: {e}") })?;
        let status = r.status().as_u16();
        let body: Value = r.json().await.unwrap_or(Value::Null);
        let raw_key = if query.is_empty() {
            path.to_string()
        } else {
            format!("{path}?{}", query.iter().map(|(k, _)| *k).collect::<Vec<_>>().join("&"))
        };
        state.ed_raw.lock().unwrap().insert(
            raw_key,
            json!({"status": status, "at": Local::now().to_rfc3339(), "query": query.iter().map(|(k, v)| format!("{k}={v}")).collect::<Vec<_>>(), "body": body}),
        );
        if !(200..300).contains(&status) {
            let detail = body["message"].as_str().map(String::from).or_else(|| body["data"]["message"].as_str().map(String::from)).unwrap_or_default();
            let message = match status {
                401 => "API key ไม่ถูกต้องหรือหมดอายุ (401)".to_string(),
                403 => format!("API key ไม่มีสิทธิ์ใช้ {path} — เพิ่ม scope {} (403)", scope_for(path)),
                429 => "เรียก API ถี่เกินไป (429) — กำลังรอ".to_string(),
                _ => format!("EasyDonate ตอบกลับ {status} {detail}"),
            };
            return Err(ApiErr { status, message });
        }
        Ok(body.get("data").cloned().unwrap_or(body))
    }
}

fn scope_for(path: &str) -> &'static str {
    if path.starts_with("/donations") {
        "read:donations"
    } else if path.starts_with("/widgets") {
        "read:widgets"
    } else if path.starts_with("/me") {
        "read:profile"
    } else {
        "ที่เกี่ยวข้อง"
    }
}

// ---------------------------------------------------------------- tolerant JSON helpers

fn as_num(v: &Value) -> Option<f64> {
    v.as_f64().or_else(|| v.as_str()?.replace(',', "").trim().parse().ok())
}

fn pick_num(v: &Value, keys: &[&str]) -> Option<f64> {
    keys.iter().find_map(|k| v.get(*k).and_then(as_num))
}

fn pick_str(v: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|k| v.get(*k).and_then(|x| x.as_str()).filter(|s| !s.is_empty()).map(String::from))
}

/// Breadth-first search for the first key whose value is numeric.
fn deep_num(v: &Value, keys: &[&str], depth: u8) -> Option<f64> {
    if let Some(n) = pick_num(v, keys) {
        return Some(n);
    }
    if depth == 0 {
        return None;
    }
    v.as_object()?.values().filter(|x| x.is_object()).find_map(|x| deep_num(x, keys, depth - 1))
}

fn deep_str(v: &Value, keys: &[&str], depth: u8) -> Option<String> {
    if let Some(s) = pick_str(v, keys) {
        return Some(s);
    }
    if depth == 0 {
        return None;
    }
    v.as_object()?.values().filter(|x| x.is_object()).find_map(|x| deep_str(x, keys, depth - 1))
}

const LIST_KEYS: &[&str] = &[
    "items", "data", "docs", "results", "rows", "donations", "donators", "topDonators", "list", "records", "content", "leaderboard",
];

pub fn extract_list(v: &Value) -> Vec<Value> {
    fn inner(v: &Value, depth: u8) -> Option<Vec<Value>> {
        if let Some(a) = v.as_array() {
            return Some(a.clone());
        }
        let o = v.as_object()?;
        for k in LIST_KEYS {
            if let Some(a) = o.get(*k).and_then(Value::as_array) {
                return Some(a.clone());
            }
        }
        for x in o.values() {
            if let Some(a) = x.as_array() {
                if a.first().map(Value::is_object).unwrap_or(false) {
                    return Some(a.clone());
                }
            }
        }
        if depth == 0 {
            return None;
        }
        o.values().filter(|x| x.is_object()).find_map(|x| inner(x, depth - 1))
    }
    inner(v, 2).unwrap_or_default()
}

pub fn parse_time_ms(v: &Value) -> Option<i64> {
    if let Some(n) = as_num(v) {
        let n = n as i64;
        return Some(if n < 100_000_000_000 { n * 1000 } else { n });
    }
    let s = v.as_str()?;
    chrono::DateTime::parse_from_rfc3339(s).map(|d| d.timestamp_millis()).ok().or_else(|| {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S")
            .ok()
            .and_then(|n| Local.from_local_datetime(&n).single())
            .map(|d| d.timestamp_millis())
    })
}

const NAME_KEYS: &[&str] = &["donatorName", "donator_name", "donorName", "displayName", "name", "username", "nickname", "donator"];
const MSG_KEYS: &[&str] = &["donateMessage", "message", "comment", "text", "note"];
const TIME_KEYS: &[&str] = &["createdAt", "created_at", "donatedAt", "date", "timestamp", "time", "updatedAt"];

fn name_of(v: &Value) -> String {
    for k in NAME_KEYS {
        match v.get(*k) {
            Some(Value::String(s)) if !s.is_empty() => return s.clone(),
            Some(o @ Value::Object(_)) => {
                if let Some(s) = pick_str(o, &["name", "displayName", "donatorName", "username"]) {
                    return s;
                }
            }
            _ => {}
        }
    }
    "ไม่ระบุชื่อ".into()
}

pub fn parse_donation(v: &Value) -> Value {
    let created = TIME_KEYS.iter().find_map(|k| v.get(*k).and_then(parse_time_ms));
    let amount = pick_num(v, &["amount", "netAmount", "totalAmount", "total", "value", "sum"]).unwrap_or(0.0);
    let id = pick_str(v, &["id", "_id", "referenceNo", "transactionId", "uuid"])
        .or_else(|| v.get("id").and_then(as_num).map(|n| n.to_string()))
        .unwrap_or_else(|| format!("{}|{}|{}", name_of(v), amount, created.unwrap_or(0)));
    json!({
        "id": id,
        "name": name_of(v),
        "amount": amount,
        "message": pick_str(v, MSG_KEYS).unwrap_or_default(),
        "created_at": created,
        "channel": pick_str(v, &["channelName", "channel", "paymentChannel"]).unwrap_or_default(),
    })
}

fn parse_top(list: &[Value]) -> Vec<Value> {
    let mut out: Vec<Value> = list
        .iter()
        .map(|v| {
            json!({
                "name": name_of(v),
                "amount": pick_num(v, &["totalAmount", "total_amount", "total", "sum", "amount", "value"]).unwrap_or(0.0),
                "count": pick_num(v, &["count", "donateCount", "totalCount", "times", "donations"]).unwrap_or(0.0),
            })
        })
        .collect();
    out.sort_by(|a, b| b["amount"].as_f64().partial_cmp(&a["amount"].as_f64()).unwrap_or(std::cmp::Ordering::Equal));
    for (i, x) in out.iter_mut().enumerate() {
        x["rank"] = json!(i + 1);
    }
    out
}

fn parse_goal(v: &Value) -> Option<Value> {
    let target = deep_num(v, &["targetAmount", "target", "goalAmount", "amountGoal", "goal", "maxAmount", "max", "endAmount"], 3)?;
    let current = deep_num(v, &["currentAmount", "current", "raised", "collected", "progress", "totalAmount", "amount", "sum", "value"], 3).unwrap_or(0.0);
    let title = deep_str(v, &["title", "goalTitle", "name", "label", "text", "description"], 3).unwrap_or_default();
    Some(json!({"title": title, "current": current, "target": target}))
}

// ---------------------------------------------------------------- date ranges

fn local_ms(s: &str) -> Option<i64> {
    let s = s.trim();
    let n = NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M")
        .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S"))
        .or_else(|_| NaiveDateTime::parse_from_str(&format!("{s}T00:00"), "%Y-%m-%dT%H:%M"))
        .ok()?;
    Local.from_local_datetime(&n).earliest().map(|d| d.timestamp_millis())
}

pub fn range_ms(r: &RangeCfg, session_start: i64) -> (Option<i64>, Option<i64>) {
    let now = Local::now();
    let midnight = |d: chrono::NaiveDate| Local.from_local_datetime(&d.and_hms_opt(0, 0, 0).unwrap()).earliest().map(|x| x.timestamp_millis());
    match r.preset.as_str() {
        "today" => (midnight(now.date_naive()), None),
        "week" => (Some(now.timestamp_millis() - 7 * 86_400_000), None),
        "month" => (midnight(now.date_naive().with_day(1).unwrap()), None),
        "session" => (Some(session_start), None),
        "custom" => (local_ms(&r.start), local_ms(&r.end)),
        _ => (None, None),
    }
}

/// The API validates startDate/endDate as ISO datetimes with seconds, e.g. 2026-01-03T00:00:00.000Z.
fn iso(ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(ms)
        .unwrap_or_default()
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn range_query(r: &RangeCfg, session_start: i64) -> Vec<(&'static str, String)> {
    let (s, e) = range_ms(r, session_start);
    let mut q = vec![];
    if let Some(s) = s {
        q.push(("startDate", iso(s)));
    }
    if let Some(e) = e {
        q.push(("endDate", iso(e)));
    }
    q
}

// ---------------------------------------------------------------- polling

pub async fn supervisor(state: Shared) {
    loop {
        let restart = state.ed_restart.notified();
        tokio::pin!(restart);
        restart.as_mut().enable();
        tokio::select! {
            _ = &mut restart => {}
            _ = run(&state) => {}
        }
    }
}

fn status(state: &Shared, st: &str, message: impl Into<String>, extra: Value) {
    let mut v = json!({"state": st, "message": message.into(), "at": Local::now().to_rfc3339()});
    if let (Some(o), Some(e)) = (v.as_object_mut(), extra.as_object()) {
        for (k, x) in e {
            o.insert(k.clone(), x.clone());
        }
    }
    state.set_ed_status(v);
}

async fn run(state: &Shared) {
    let cfg = state.config().easydonate;
    if cfg.api_key.trim().is_empty() {
        status(state, "off", "ยังไม่ได้ใส่ API key", json!({}));
        std::future::pending::<()>().await;
    }
    let api = Api::new(&cfg.api_key);
    status(state, "connecting", "กำลังเชื่อมต่อ EasyDonate…", json!({}));

    let mut account = Value::Null;
    match api.get(state, "/me", &[]).await {
        Ok(me) => account = json!(deep_str(&me, &["displayName", "username", "name", "slug"], 2).unwrap_or_default()),
        Err(e) if e.status == 401 => {
            status(state, "error", e.message, json!({}));
            tokio::time::sleep(Duration::from_secs(60)).await;
            return;
        }
        Err(_) => {} // missing read:profile is fine
    }

    let session_start = state.started_at.timestamp_millis();
    let mut seen: HashSet<String> = HashSet::new();
    let mut primed = false;
    let mut tick: u64 = 0;
    let mut warnings = serde_json::Map::new();
    let mut goal_meta: Option<(Value, std::time::Instant)> = None;
    loop {
        let mut fresh = false;
        match api.get(state, "/donations", &[("size", "20".into()), ("page", "1".into())]).await {
            Ok(data) => {
                let mut list: Vec<Value> = extract_list(&data).iter().map(parse_donation).collect();
                list.sort_by_key(|d| d["created_at"].as_i64().unwrap_or(0));
                let now = Local::now().timestamp_millis();
                for d in list {
                    let id = d["id"].as_str().unwrap_or("").to_string();
                    if seen.insert(id) && primed {
                        let recent = d["created_at"].as_i64().map(|t| now - t < ALERT_WINDOW_MS).unwrap_or(true);
                        if recent {
                            fresh = true;
                            announce(state, d, false);
                        }
                    }
                }
                primed = true;
                warnings.remove("/donations");
            }
            Err(e) => {
                warnings.insert("/donations".into(), json!(e.message));
                if e.status == 429 {
                    tokio::time::sleep(Duration::from_secs(20)).await;
                }
            }
        }

        if tick % 3 == 0 || fresh {
            refresh_aux(state, &api, &cfg, session_start, &mut warnings, &mut goal_meta).await;
        }
        let st = if warnings.contains_key("/donations") { "error" } else if warnings.is_empty() { "ok" } else { "warn" };
        let msg = if st == "ok" { "เชื่อมต่อแล้ว".to_string() } else { warnings.values().filter_map(|v| v.as_str()).collect::<Vec<_>>().join(" · ") };
        status(state, st, msg, json!({"account": account, "warnings": warnings.clone()}));

        tick += 1;
        tokio::time::sleep(Duration::from_secs(cfg.poll_secs.clamp(3, 60))).await;
    }
}

/// Push a donation to overlays: as a chat card and as an alert event.
pub fn announce(state: &Shared, d: Value, test: bool) {
    let ts = d["created_at"].as_i64().unwrap_or_else(|| Local::now().timestamp_millis());
    let mut ev = d.clone();
    ev["test"] = json!(test);
    state.emit("donation", &ev);
    state.push_chat(vec![json!({
        "id": format!("ed-{}", d["id"].as_str().unwrap_or("")),
        "kind": "donate",
        "source": "easydonate",
        "ts": ts,
        "name": d["name"],
        "avatar": "",
        "badges": {},
        "amount": d["amount"],
        "runs": [{"t": "text", "v": d["message"].as_str().unwrap_or("")}],
        "test": test,
    })]);
}

async fn refresh_aux(
    state: &Shared,
    api: &Api,
    cfg: &EdCfg,
    session_start: i64,
    warnings: &mut serde_json::Map<String, Value>,
    goal_meta: &mut Option<(Value, std::time::Instant)>,
) {
    let mut note = |path: &str, r: Result<(), ApiErr>| match r {
        Ok(()) => {
            warnings.remove(path);
        }
        Err(e) => {
            warnings.insert(path.to_string(), json!(e.message));
        }
    };

    // Top donators
    let mut q = range_query(&cfg.top, session_start);
    q.push(("size", cfg.top.count.clamp(1, 100).to_string()));
    q.push(("page", "1".into()));
    let r = api.get(state, "/donations/top-donators", &q).await.map(|data| {
        state.set_donate("top", json!(parse_top(&extract_list(&data))));
    });
    note("/donations/top-donators", r);

    // Latest donations within the configured range
    let mut q = range_query(&cfg.latest, session_start);
    q.push(("size", cfg.latest.count.clamp(1, 50).to_string()));
    q.push(("page", "1".into()));
    let r = api.get(state, "/donations", &q).await.map(|data| {
        let mut list: Vec<Value> = extract_list(&data).iter().map(parse_donation).collect();
        list.sort_by_key(|d| std::cmp::Reverse(d["created_at"].as_i64().unwrap_or(0)));
        state.set_donate("latest", json!(list));
    });
    note("/donations (latest)", r);

    // Goal
    match cfg.goal.source.as_str() {
        "easydonate" => {
            // /widgets/goal only returns {totalAmount}; the name and target live in the
            // GOAL widget's settings from /widgets, which change rarely, so cache them.
            let stale = goal_meta.as_ref().map(|(_, t)| t.elapsed() > Duration::from_secs(60)).unwrap_or(true);
            if stale {
                let r = api.get(state, "/widgets", &[]).await.map(|data| {
                    let list = if data.is_array() { data.as_array().cloned().unwrap_or_default() } else { extract_list(&data) };
                    let meta = list.iter().find(|w| w["type"] == "GOAL").map(|w| w["metadata"].clone()).unwrap_or(Value::Null);
                    *goal_meta = Some((meta, std::time::Instant::now()));
                });
                note("/widgets", r);
            }
            let meta = goal_meta.as_ref().map(|(m, _)| m.clone()).unwrap_or(Value::Null);
            let r = api.get(state, "/widgets/goal", &[]).await.map(|data| {
                let current = deep_num(&data, &["totalAmount", "currentAmount", "current", "amount"], 2).unwrap_or(0.0);
                let target = as_num(&meta["goal"]["amount"]).or_else(|| parse_goal(&data).map(|g| g["target"].as_f64().unwrap_or(0.0)));
                let goal = target.filter(|t| *t > 0.0).map(|target| {
                    let end_at = (meta["isUseEndAt"] == json!(true)).then(|| as_num(&meta["endAt"])).flatten();
                    json!({
                        "title": meta["goal"]["name"].as_str().unwrap_or("เป้าหมายโดเนท"),
                        "current": current,
                        "target": target,
                        "end_at": end_at,
                        "source": "easydonate",
                    })
                });
                state.set_donate("goal", goal.unwrap_or(Value::Null));
            });
            note("/widgets/goal", r);
        }
        "custom" => {
            let mut total = 0.0;
            let mut res = Ok(());
            for page in 1..=5 {
                let mut q = range_query(&cfg.goal.range, session_start);
                q.push(("size", "1000".into()));
                q.push(("page", page.to_string()));
                match api.get(state, "/donations", &q).await {
                    Ok(data) => {
                        let list = extract_list(&data);
                        total += list.iter().map(|d| parse_donation(d)["amount"].as_f64().unwrap_or(0.0)).sum::<f64>();
                        if list.len() < 1000 {
                            break;
                        }
                    }
                    Err(e) => {
                        res = Err(e);
                        break;
                    }
                }
            }
            if res.is_ok() {
                state.set_donate("goal", json!({"title": cfg.goal.title, "current": total, "target": cfg.goal.target, "source": "custom"}));
            }
            note("goal (custom)", res);
        }
        _ => state.set_donate("goal", Value::Null),
    }

}

pub async fn test_key(state: &Shared, key: &str) -> Value {
    let api = Api::new(key);
    let me = api.get(state, "/me", &[]).await;
    let don = api.get(state, "/donations", &[("size", "1".into())]).await;
    let wid = api.get(state, "/widgets/goal", &[]).await;
    let fmt = |r: &Result<Value, ApiErr>| match r {
        Ok(_) => json!({"ok": true}),
        Err(e) => json!({"ok": false, "message": e.message}),
    };
    let account = me.as_ref().ok().and_then(|m| deep_str(m, &["displayName", "username", "name", "slug"], 2));
    json!({
        "account": account,
        "profile": fmt(&me),
        "donations": fmt(&don),
        "widgets": fmt(&wid),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_documented_donation_shape() {
        let v = json!({"id": "01J", "referenceNo": "AB12CD", "donatorName": "น้องใจดี", "donateMessage": "สู้ ๆ นะครับ", "amount": 100, "createdAt": "2026-07-11T12:00:00.000Z"});
        let d = parse_donation(&v);
        assert_eq!(d["id"], "01J");
        assert_eq!(d["name"], "น้องใจดี");
        assert_eq!(d["message"], "สู้ ๆ นะครับ");
        assert_eq!(d["amount"], 100.0);
        assert_eq!(d["created_at"], 1783771200000i64);
    }

    #[test]
    fn finds_lists_in_common_envelopes() {
        assert_eq!(extract_list(&json!({"items": [{"a": 1}], "total": 1})).len(), 1);
        assert_eq!(extract_list(&json!({"meta": {}, "rows": [{"a": 1}, {"a": 2}]})).len(), 2);
        assert_eq!(extract_list(&json!([{"a": 1}])).len(), 1);
        assert_eq!(extract_list(&json!({"result": {"docs": [{"a": 1}]}})).len(), 1);
    }

    #[test]
    fn real_api_shapes() {
        assert_eq!(iso(1767373200000), "2026-01-02T17:00:00.000Z");
        let top = parse_top(&extract_list(&json!({"donators": [{"donatorName": "NOMBOOD", "rank": 1, "totalAmount": 6000}], "size": 10})));
        assert_eq!(top[0]["name"], "NOMBOOD");
        assert_eq!(top[0]["amount"], 6000.0);
        let list = extract_list(&json!({"histories": [{"id": "a", "donatorName": "x", "amount": 10.1}], "total": 1}));
        assert_eq!(parse_donation(&list[0])["amount"], 10.1);
    }

    #[test]
    fn parses_goal() {
        let g = parse_goal(&json!({"settings": {"title": "ค่าคอนโด", "targetAmount": 15000}, "currentAmount": "1,250.5"})).unwrap();
        assert_eq!(g["target"], 15000.0);
        assert_eq!(g["current"], 1250.5);
        assert_eq!(g["title"], "ค่าคอนโด");
    }
}
