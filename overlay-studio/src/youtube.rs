//! YouTube live chat via the innertube web API (no API key / quota needed).

use crate::state::Shared;
use regex::Regex;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT_LANGUAGE, COOKIE};
use serde_json::{json, Value};
use std::sync::OnceLock;
use std::time::Duration;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FALLBACK_CLIENT_VERSION: &str = "2.20261030.02.00";
const CHAT_POLL_MS: u64 = 1500;
const VIEWERS_EVERY: Duration = Duration::from_secs(20);
const AUTO_RECHECK: Duration = Duration::from_secs(20);

type Res<T> = Result<T, String>;

pub fn http() -> reqwest::Client {
    let mut h = HeaderMap::new();
    h.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));
    h.insert(COOKIE, HeaderValue::from_static("SOCS=CAI; CONSENT=YES+1"));
    reqwest::Client::builder()
        .user_agent(UA)
        .default_headers(h)
        .gzip(true)
        .timeout(Duration::from_secs(20))
        .build()
        .expect("http client")
}

fn client() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(http)
}

// ---------------------------------------------------------------- input parsing

#[derive(Debug, Clone, PartialEq)]
pub enum Target {
    Handle(String),
    ChannelId(String),
    Video(String),
}

fn re(p: &str) -> Regex {
    Regex::new(p).unwrap()
}

pub fn parse_input(input: &str) -> Option<Target> {
    let s = input.trim();
    if s.is_empty() {
        return None;
    }
    static RES: OnceLock<[Regex; 6]> = OnceLock::new();
    let r = RES.get_or_init(|| {
        [
            re(r"[?&]v=([\w-]{11})"),
            re(r"youtu\.be/([\w-]{11})"),
            re(r"/(?:live|shorts|embed)/([\w-]{11})"),
            re(r"/(@[\w.\-\p{L}\p{M}]+)"),
            re(r"/channel/(UC[\w-]{22})"),
            re(r"^(UC[\w-]{22})$"),
        ]
    });
    if let Some(c) = r[0].captures(s).or_else(|| r[1].captures(s)).or_else(|| r[2].captures(s)) {
        return Some(Target::Video(c[1].to_string()));
    }
    if let Some(c) = r[3].captures(s) {
        return Some(Target::Handle(urlencoding::decode(&c[1]).map(|x| x.into_owned()).unwrap_or(c[1].to_string())));
    }
    if let Some(c) = r[4].captures(s).or_else(|| r[5].captures(s)) {
        return Some(Target::ChannelId(c[1].to_string()));
    }
    if s.starts_with('@') {
        return Some(Target::Handle(s.to_string()));
    }
    if s.len() == 11 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') && !s.contains("youtube") {
        // Ambiguous: could be a handle without @, but 11-char ids are far more likely to be pasted ids
        return Some(Target::Video(s.to_string()));
    }
    Some(Target::Handle(format!("@{}", s.trim_start_matches('@'))))
}

fn channel_base(t: &Target) -> Option<String> {
    match t {
        Target::Handle(h) => Some(format!("https://www.youtube.com/{}", urlencoding::encode(h).replace("%40", "@"))),
        Target::ChannelId(id) => Some(format!("https://www.youtube.com/channel/{id}")),
        Target::Video(_) => None,
    }
}

// ---------------------------------------------------------------- html helpers

async fn get_html(url: &str) -> Res<String> {
    let r = client().get(url).send().await.map_err(|e| format!("เชื่อมต่อ YouTube ไม่ได้: {e}"))?;
    let status = r.status();
    if status.as_u16() == 404 {
        return Err("ไม่พบช่องหรือวิดีโอนี้ (404)".into());
    }
    if !status.is_success() {
        return Err(format!("YouTube ตอบกลับ {status}"));
    }
    r.text().await.map_err(|e| e.to_string())
}

fn parse_json_at(s: &str) -> Option<Value> {
    serde_json::Deserializer::from_str(s).into_iter::<Value>().next()?.ok()
}

pub fn extract_initial_data(html: &str) -> Option<Value> {
    if let Some(i) = html.find("<script id=\"yt-initial-data\"") {
        let rest = &html[i..];
        let gt = rest.find('>')?;
        if let Some(v) = parse_json_at(rest[gt + 1..].trim_start()) {
            return Some(v);
        }
    }
    for marker in ["var ytInitialData = ", "window[\"ytInitialData\"] = ", "ytInitialData = "] {
        if let Some(i) = html.find(marker) {
            if let Some(v) = parse_json_at(&html[i + marker.len()..]) {
                return Some(v);
            }
        }
    }
    None
}

fn ytcfg(html: &str, key: &str) -> Option<String> {
    let r = Regex::new(&format!(r#""{key}":"([^"]+)""#)).ok()?;
    r.captures(html).map(|c| c[1].to_string())
}

fn html_unescape(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
}

fn walk<'a>(v: &'a Value, key: &str, out: &mut Vec<&'a Value>) {
    match v {
        Value::Object(m) => {
            if let Some(x) = m.get(key) {
                out.push(x);
                return;
            }
            for x in m.values() {
                walk(x, key, out);
            }
        }
        Value::Array(a) => a.iter().for_each(|x| walk(x, key, out)),
        _ => {}
    }
}

pub fn text_of(v: &Value) -> String {
    if let Some(s) = v["simpleText"].as_str() {
        return s.to_string();
    }
    if let Some(s) = v["content"].as_str() {
        return s.to_string();
    }
    v["runs"]
        .as_array()
        .map(|runs| runs.iter().filter_map(|r| r["text"].as_str()).collect::<String>())
        .unwrap_or_default()
}

fn last_thumb(v: &Value) -> String {
    v["thumbnails"]
        .as_array()
        .or_else(|| v["sources"].as_array())
        .and_then(|a| a.last())
        .and_then(|t| t["url"].as_str())
        .map(|u| if u.starts_with("//") { format!("https:{u}") } else { u.to_string() })
        .unwrap_or_default()
}

// ---------------------------------------------------------------- channel streams

pub async fn list_streams(input: &str) -> Res<Value> {
    let target = parse_input(input).ok_or("กรุณากรอกชื่อช่อง YouTube")?;
    if let Target::Video(id) = &target {
        let info = video_info(id).await?;
        return Ok(json!({ "channel": info["channel"], "avatar": "", "streams": [info] }));
    }
    let base = channel_base(&target).unwrap();
    let html = get_html(&format!("{base}/streams")).await?;
    let data = extract_initial_data(&html).ok_or("อ่านข้อมูลช่องไม่ได้ (รูปแบบหน้าเว็บเปลี่ยน)")?;
    let meta = &data["metadata"]["channelMetadataRenderer"];
    let mut streams = vec![];

    let mut lockups = vec![];
    walk(&data, "lockupViewModel", &mut lockups);
    for l in lockups {
        let Some(id) = l["contentId"].as_str() else { continue };
        let md = &l["metadata"]["lockupMetadataViewModel"];
        let mut badges = vec![];
        walk_all(&l["contentImage"], "thumbnailBadgeViewModel", &mut badges);
        let mut status = "past";
        for b in &badges {
            let style = b["badgeStyle"].as_str().unwrap_or("").to_uppercase();
            let text = b["text"].as_str().unwrap_or("").to_uppercase();
            if style.contains("LIVE") || text == "LIVE" {
                status = "live";
            } else if style.contains("UPCOMING") || text.contains("UPCOMING") {
                status = "upcoming";
            }
        }
        let mut info_parts = vec![];
        if let Some(rows) = md["metadata"]["contentMetadataViewModel"]["metadataRows"].as_array() {
            for row in rows {
                for p in row["metadataParts"].as_array().into_iter().flatten() {
                    let t = text_of(&p["text"]);
                    if !t.is_empty() {
                        info_parts.push(t);
                    }
                }
            }
        }
        if status == "past" && info_parts.iter().any(|t| t.to_lowercase().contains("watching")) {
            status = "live";
        }
        if status == "past" && info_parts.iter().any(|t| t.to_lowercase().contains("scheduled") || t.to_lowercase().contains("premieres")) {
            status = "upcoming";
        }
        streams.push(json!({
            "video_id": id,
            "title": text_of(&md["title"]),
            "thumbnail": last_thumb(&l["contentImage"]["thumbnailViewModel"]["image"]),
            "status": status,
            "info": info_parts.join(" • "),
        }));
    }

    // Older layout fallback
    if streams.is_empty() {
        let mut vrs = vec![];
        walk_all(&data, "videoRenderer", &mut vrs);
        for v in vrs {
            let Some(id) = v["videoId"].as_str() else { continue };
            let overlays = v["thumbnailOverlays"].to_string().to_uppercase();
            let status = if overlays.contains("\"LIVE\"") || v["badges"].to_string().contains("LIVE_NOW") {
                "live"
            } else if v.get("upcomingEventData").is_some() {
                "upcoming"
            } else {
                "past"
            };
            streams.push(json!({
                "video_id": id,
                "title": text_of(&v["title"]),
                "thumbnail": last_thumb(&v["thumbnail"]),
                "status": status,
                "info": text_of(&v["viewCountText"]),
            }));
        }
    }

    let mut seen = std::collections::HashSet::new();
    streams.retain(|s| seen.insert(s["video_id"].as_str().unwrap_or("").to_string()));
    // live first, then upcoming, then the most recent few past streams
    let mut out: Vec<Value> = streams.iter().filter(|s| s["status"] == "live").cloned().collect();
    out.extend(streams.iter().filter(|s| s["status"] == "upcoming").cloned());
    out.extend(streams.iter().filter(|s| s["status"] == "past").take(3).cloned());

    Ok(json!({
        "channel": meta["title"].as_str().unwrap_or(""),
        "channel_id": meta["externalId"].as_str().unwrap_or(""),
        "avatar": last_thumb(&meta["avatar"]),
        "streams": out,
    }))
}

fn walk_all<'a>(v: &'a Value, key: &str, out: &mut Vec<&'a Value>) {
    match v {
        Value::Object(m) => {
            for (k, x) in m {
                if k == key {
                    out.push(x);
                } else {
                    walk_all(x, key, out);
                }
            }
        }
        Value::Array(a) => a.iter().for_each(|x| walk_all(x, key, out)),
        _ => {}
    }
}

pub async fn video_info(id: &str) -> Res<Value> {
    let html = get_html(&format!("https://www.youtube.com/watch?v={id}")).await?;
    let title = Regex::new(r#"<meta name="title" content="([^"]*)""#)
        .unwrap()
        .captures(&html)
        .map(|c| html_unescape(&c[1]))
        .unwrap_or_default();
    let channel = Regex::new(r#""ownerChannelName":"([^"]*)""#)
        .unwrap()
        .captures(&html)
        .map(|c| c[1].to_string())
        .unwrap_or_default();
    let status = if html.contains("\"isLiveNow\":true") {
        "live"
    } else if html.contains("\"isUpcoming\":true") {
        "upcoming"
    } else {
        "past"
    };
    Ok(json!({
        "video_id": id,
        "title": title,
        "channel": channel,
        "thumbnail": format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg"),
        "status": status,
        "info": "",
    }))
}

/// Find the stream a channel is currently live on.
pub async fn detect_live(input: &str) -> Res<Option<Value>> {
    let target = parse_input(input).ok_or("ยังไม่ได้ตั้งค่าช่อง YouTube")?;
    if let Target::Video(id) = &target {
        let info = video_info(id).await?;
        return Ok((info["status"] == "live").then_some(info));
    }
    let base = channel_base(&target).unwrap();
    if let Ok(html) = get_html(&format!("{base}/live")).await {
        let canon = Regex::new(r#"<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([\w-]{11})""#)
            .unwrap()
            .captures(&html)
            .map(|c| c[1].to_string());
        if let Some(id) = canon {
            if html.contains("\"isLiveNow\":true") {
                let title = Regex::new(r#"<meta name="title" content="([^"]*)""#)
                    .unwrap()
                    .captures(&html)
                    .map(|c| html_unescape(&c[1]))
                    .unwrap_or_default();
                return Ok(Some(json!({
                    "video_id": id,
                    "title": title,
                    "thumbnail": format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg"),
                    "status": "live",
                })));
            }
        }
    }
    let list = list_streams(input).await?;
    Ok(list["streams"].as_array().and_then(|a| a.iter().find(|s| s["status"] == "live").cloned()))
}

// ---------------------------------------------------------------- chat message parsing

fn runs_of(msg: &Value) -> Vec<Value> {
    let mut out = vec![];
    if let Some(s) = msg["simpleText"].as_str() {
        out.push(json!({"t": "text", "v": s}));
        return out;
    }
    for r in msg["runs"].as_array().into_iter().flatten() {
        if let Some(t) = r["text"].as_str() {
            out.push(json!({"t": "text", "v": t}));
        } else if r.get("emoji").is_some() {
            let e = &r["emoji"];
            let custom = e["isCustomEmoji"].as_bool().unwrap_or(false);
            let id = e["emojiId"].as_str().unwrap_or("");
            if !custom && !id.is_empty() && !id.contains('/') {
                out.push(json!({"t": "text", "v": id}));
            } else {
                let alt = e["shortcuts"][0].as_str().unwrap_or(id);
                out.push(json!({"t": "emoji", "url": last_thumb(&e["image"]), "alt": alt}));
            }
        }
    }
    out
}

fn argb_to_css(v: &Value) -> Option<String> {
    let n = v.as_u64()?;
    let a = ((n >> 24) & 0xff) as f64 / 255.0;
    Some(format!("rgba({},{},{},{:.2})", (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, a))
}

fn author_of(r: &Value) -> Value {
    let mut badges = json!({"owner": false, "moderator": false, "member": false, "verified": false, "member_icon": ""});
    for b in r["authorBadges"].as_array().into_iter().flatten() {
        let b = &b["liveChatAuthorBadgeRenderer"];
        match b["icon"]["iconType"].as_str().unwrap_or("") {
            "OWNER" => badges["owner"] = json!(true),
            "MODERATOR" => badges["moderator"] = json!(true),
            "VERIFIED" => badges["verified"] = json!(true),
            _ => {
                if b.get("customThumbnail").is_some() {
                    badges["member"] = json!(true);
                    badges["member_icon"] = json!(last_thumb(&b["customThumbnail"]));
                }
            }
        }
    }
    let mut avatar = last_thumb(&r["authorPhoto"]);
    if avatar.contains("=s64") {
        avatar = avatar.replace("=s64", "=s88");
    }
    json!({
        "name": text_of(&r["authorName"]),
        "channel_id": r["authorExternalChannelId"].as_str().unwrap_or(""),
        "avatar": avatar,
        "badges": badges,
    })
}

fn ts_of(r: &Value) -> i64 {
    r["timestampUsec"].as_str().and_then(|s| s.parse::<i64>().ok()).map(|u| u / 1000).unwrap_or_else(|| chrono::Utc::now().timestamp_millis())
}

pub fn parse_item(item: &Value) -> Option<Value> {
    let (kind, r) = item.as_object()?.iter().next()?;
    let base = |k: &str, r: &Value| -> Value {
        let mut m = json!({
            "id": r["id"].as_str().unwrap_or(""),
            "kind": k,
            "source": "youtube",
            "ts": ts_of(r),
            "runs": runs_of(&r["message"]),
        });
        let a = author_of(r);
        for (key, v) in a.as_object().unwrap() {
            m[key] = v.clone();
        }
        m
    };
    match kind.as_str() {
        "liveChatTextMessageRenderer" => Some(base("text", r)),
        "liveChatPaidMessageRenderer" => {
            let mut m = base("superchat", r);
            m["amount"] = json!(text_of(&r["purchaseAmountText"]));
            m["color"] = json!(argb_to_css(&r["bodyBackgroundColor"]));
            m["header_color"] = json!(argb_to_css(&r["headerBackgroundColor"]));
            Some(m)
        }
        "liveChatPaidStickerRenderer" => {
            let mut m = base("sticker", r);
            m["amount"] = json!(text_of(&r["purchaseAmountText"]));
            m["sticker"] = json!(last_thumb(&r["sticker"]));
            m["color"] = json!(argb_to_css(&r["backgroundColor"]));
            Some(m)
        }
        "liveChatMembershipItemRenderer" => {
            let mut m = base("member", r);
            let header = text_of(&r["headerPrimaryText"]);
            let sub = text_of(&r["headerSubtext"]);
            m["headline"] = json!(if header.is_empty() { sub.clone() } else { header });
            m["subtext"] = json!(sub);
            Some(m)
        }
        "liveChatSponsorshipsGiftPurchaseAnnouncementRenderer" => {
            let h = &r["header"]["liveChatSponsorshipsHeaderRenderer"];
            let mut m = base("gift", h);
            m["id"] = json!(r["id"].as_str().unwrap_or(""));
            m["headline"] = json!(text_of(&h["primaryText"]));
            Some(m)
        }
        "liveChatSponsorshipsGiftRedemptionAnnouncementRenderer" => {
            let mut m = base("text", r);
            m["kind"] = json!("gift_redeem");
            Some(m)
        }
        _ => None,
    }
}

fn handle_actions(state: &Shared, actions: &[Value], history: bool) {
    let mut items = vec![];
    for a in actions {
        if let Some(item) = a.get("addChatItemAction").map(|x| &x["item"]) {
            if let Some(mut m) = parse_item(item) {
                if history {
                    m["history"] = json!(true);
                }
                items.push(m);
            }
        } else if let Some(x) = a.get("removeChatItemAction").or_else(|| a.get("markChatItemAsDeletedAction")) {
            if let Some(id) = x["targetItemId"].as_str() {
                if !items.is_empty() {
                    items.retain(|m: &Value| m["id"].as_str() != Some(id));
                }
                state.remove_chat(id);
            }
        } else if let Some(x) = a.get("removeChatItemByAuthorAction") {
            if let Some(cid) = x["externalChannelId"].as_str() {
                let ids: Vec<String> = state
                    .chat
                    .lock()
                    .unwrap()
                    .iter()
                    .filter(|m| m["channel_id"].as_str() == Some(cid))
                    .filter_map(|m| m["id"].as_str().map(String::from))
                    .collect();
                for id in ids {
                    state.remove_chat(&id);
                }
            }
        }
    }
    state.push_chat(items);
}

// ---------------------------------------------------------------- chat session

struct ChatSession {
    api_key: Option<String>,
    client_version: String,
    continuation: String,
}

fn continuation_of(v: &Value) -> Option<(String, u64)> {
    for c in v.as_array()? {
        for k in ["invalidationContinuationData", "timedContinuationData", "reloadContinuationData"] {
            if let Some(cont) = c[k]["continuation"].as_str() {
                return Some((cont.to_string(), c[k]["timeoutMs"].as_u64().unwrap_or(CHAT_POLL_MS)));
            }
        }
    }
    None
}

fn innertube_ctx(version: &str) -> Value {
    json!({"client": {"clientName": "WEB", "clientVersion": version, "hl": "en", "gl": "TH"}})
}

async fn open_chat(state: &Shared, video_id: &str) -> Res<ChatSession> {
    let html = get_html(&format!("https://www.youtube.com/live_chat?is_popout=1&v={video_id}")).await?;
    let data = extract_initial_data(&html).ok_or("ไลฟ์นี้ไม่มีแชท หรือแชทถูกปิด")?;
    let lcr = &data["contents"]["liveChatRenderer"];
    if lcr.is_null() {
        let msg = text_of(&data["contents"]["messageRenderer"]["text"]);
        return Err(if msg.is_empty() { "ไลฟ์นี้ไม่มีแชท หรือแชทถูกปิด".into() } else { msg });
    }
    let (continuation, _) = continuation_of(&lcr["continuations"]).ok_or("ไม่พบ continuation ของแชท")?;
    if let Some(actions) = lcr["actions"].as_array() {
        handle_actions(state, actions, true);
    }
    Ok(ChatSession {
        api_key: ytcfg(&html, "INNERTUBE_API_KEY"),
        client_version: ytcfg(&html, "INNERTUBE_CONTEXT_CLIENT_VERSION")
            .or_else(|| ytcfg(&html, "INNERTUBE_CLIENT_VERSION"))
            .unwrap_or_else(|| FALLBACK_CLIENT_VERSION.into()),
        continuation,
    })
}

async fn innertube_post(endpoint: &str, s: &ChatSession, body: Value) -> Res<Value> {
    let mut url = format!("https://www.youtube.com/youtubei/v1/{endpoint}?prettyPrint=false");
    if let Some(k) = &s.api_key {
        url.push_str("&key=");
        url.push_str(k);
    }
    let r = client().post(url).json(&body).send().await.map_err(|e| e.to_string())?;
    if !r.status().is_success() {
        return Err(format!("innertube {endpoint}: {}", r.status()));
    }
    r.json().await.map_err(|e| e.to_string())
}

async fn fetch_viewers(state: &Shared, s: &ChatSession, video_id: &str) {
    let body = json!({"context": innertube_ctx(&s.client_version), "videoId": video_id});
    let Ok(j) = innertube_post("updated_metadata", s, body).await else { return };
    let mut patch = json!({});
    for a in j["actions"].as_array().into_iter().flatten() {
        if let Some(vc) = a.get("updateViewershipAction") {
            let r = &vc["viewCount"]["videoViewCountRenderer"];
            if let Some(n) = r["originalViewCount"].as_str().and_then(|x| x.parse::<u64>().ok()) {
                patch["viewers"] = json!(n);
            }
            if r["isLive"] == json!(false) {
                patch["ended_hint"] = json!(true);
            }
        }
        if let Some(t) = a.get("updateTitleAction") {
            let title = text_of(&t["title"]);
            if !title.is_empty() {
                patch["title"] = json!(title);
            }
        }
    }
    if patch.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
        state.patch_live(patch);
    }
}

/// Runs until the chat ends or errors. Ok(()) = stream ended normally.
async fn run_chat(state: &Shared, video_id: &str) -> Res<()> {
    let mut s = open_chat(state, video_id).await?;
    state.patch_live(json!({"state": "live", "message": ""}));
    fetch_viewers(state, &s, video_id).await;
    let mut last_viewers = tokio::time::Instant::now();
    let mut failures = 0u32;
    loop {
        let body = json!({"context": innertube_ctx(&s.client_version), "continuation": s.continuation});
        match innertube_post("live_chat/get_live_chat", &s, body).await {
            Ok(j) => {
                failures = 0;
                let lc = &j["continuationContents"]["liveChatContinuation"];
                if lc.is_null() {
                    return Ok(());
                }
                if let Some(actions) = lc["actions"].as_array() {
                    handle_actions(state, actions, false);
                }
                match continuation_of(&lc["continuations"]) {
                    Some((c, _timeout)) => s.continuation = c,
                    None => return Ok(()),
                }
            }
            Err(e) => {
                failures += 1;
                if failures >= 6 {
                    return Err(e);
                }
                state.patch_live(json!({"message": format!("กำลังเชื่อมต่อใหม่… ({e})")}));
                tokio::time::sleep(Duration::from_millis(1500 * failures as u64)).await;
                continue;
            }
        }
        if last_viewers.elapsed() >= VIEWERS_EVERY {
            last_viewers = tokio::time::Instant::now();
            fetch_viewers(state, &s, video_id).await;
        }
        tokio::time::sleep(Duration::from_millis(CHAT_POLL_MS)).await;
    }
}

/// Long-running task: keeps the chat connected according to config.
pub async fn supervisor(state: Shared) {
    loop {
        let restart = state.yt_restart.notified();
        tokio::pin!(restart);
        restart.as_mut().enable();
        tokio::select! {
            _ = &mut restart => {}
            _ = cycle(&state) => {}
        }
    }
}

async fn cycle(state: &Shared) {
    let cfg = state.config().youtube;
    let channel = cfg.channel.trim().to_string();

    let video = if cfg.mode == "manual" && !cfg.video_id.is_empty() {
        json!({"video_id": cfg.video_id, "title": cfg.video_title, "thumbnail": format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", cfg.video_id)})
    } else if channel.is_empty() {
        state.set_live(json!({"state": "idle", "message": "ยังไม่ได้ตั้งค่าช่อง YouTube"}));
        std::future::pending::<()>().await;
        return;
    } else {
        state.set_live(json!({"state": "searching", "channel": channel, "message": "กำลังหาไลฟ์ที่ออนอยู่…"}));
        match detect_live(&channel).await {
            Ok(Some(v)) => v,
            Ok(None) => {
                state.set_live(json!({"state": "waiting", "channel": channel, "message": "ช่องนี้ยังไม่ได้ไลฟ์ — จะตรวจซ้ำทุก 20 วินาที"}));
                tokio::time::sleep(AUTO_RECHECK).await;
                return;
            }
            Err(e) => {
                state.set_live(json!({"state": "error", "channel": channel, "message": e}));
                tokio::time::sleep(AUTO_RECHECK).await;
                return;
            }
        }
    };

    let vid = video["video_id"].as_str().unwrap_or("").to_string();
    state.clear_chat();
    state.set_live(json!({
        "state": "connecting",
        "mode": cfg.mode,
        "channel": channel,
        "video_id": vid,
        "title": video["title"],
        "thumbnail": video["thumbnail"],
        "viewers": null,
        "message": "กำลังเชื่อมต่อแชท…",
    }));
    match run_chat(state, &vid).await {
        Ok(()) => state.patch_live(json!({"state": "ended", "message": "ไลฟ์จบแล้ว"})),
        Err(e) => state.patch_live(json!({"state": "error", "message": e})),
    }
    tokio::time::sleep(Duration::from_secs(if cfg.mode == "manual" { 15 } else { 10 })).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_inputs() {
        assert_eq!(parse_input("@LofiGirl"), Some(Target::Handle("@LofiGirl".into())));
        assert_eq!(parse_input("https://www.youtube.com/@flixzer/live"), Some(Target::Handle("@flixzer".into())));
        assert_eq!(parse_input("https://youtube.com/watch?v=rFZHOHl-L8A&t=1"), Some(Target::Video("rFZHOHl-L8A".into())));
        assert_eq!(parse_input("https://youtu.be/rFZHOHl-L8A"), Some(Target::Video("rFZHOHl-L8A".into())));
        assert_eq!(parse_input("https://www.youtube.com/live/rFZHOHl-L8A"), Some(Target::Video("rFZHOHl-L8A".into())));
        assert_eq!(
            parse_input("https://www.youtube.com/channel/UCSJ4gkVC6NrvII8umztf0Ow"),
            Some(Target::ChannelId("UCSJ4gkVC6NrvII8umztf0Ow".into()))
        );
        assert_eq!(parse_input("LofiGirl"), Some(Target::Handle("@LofiGirl".into())));
    }
}
