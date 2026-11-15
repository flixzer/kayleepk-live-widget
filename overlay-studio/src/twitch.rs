//! Twitch chat and viewer count without an API key — the same idea as YouTube's innertube:
//! chat comes from the anonymous, read-only IRC gateway (`justinfanNNNNN` login) and the
//! channel / stream info from the public GQL endpoint that the twitch.tv web app uses.

use crate::state::Shared;
use regex::Regex;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;

const GQL: &str = "https://gql.twitch.tv/gql";
/// Public client id of the twitch.tv web app (no account or key involved).
const WEB_CLIENT_ID: &str = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const IRC_HOST: &str = "irc.chat.twitch.tv";
const IRC_PORT: u16 = 6667;
const INFO_EVERY: Duration = Duration::from_secs(20);
const RETRY: Duration = Duration::from_secs(8);
/// Twitch pings about every 5 minutes; silence beyond this means a dead socket.
const IDLE_LIMIT: Duration = Duration::from_secs(400);
const PURPLE: &str = "rgba(145,70,255,1)";
const PURPLE_DARK: &str = "rgba(100,40,200,1)";

type Res<T> = Result<T, String>;

fn client() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| reqwest::Client::builder().timeout(Duration::from_secs(15)).build().expect("http client"))
}

// ---------------------------------------------------------------- input

/// Twitch login from "name", "@name", "#name" or a twitch.tv URL.
pub fn parse_channel(input: &str) -> Option<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)^(?:https?://)?(?:www\.|m\.)?twitch\.tv/(?:popout/)?([A-Za-z0-9_]+)").unwrap());
    let s = input.trim();
    let login = match re.captures(s) {
        Some(c) => c[1].to_string(),
        None => s.trim_start_matches(['@', '#']).to_string(),
    }
    .to_ascii_lowercase();
    let valid = (2..=25).contains(&login.len()) && login.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    valid.then_some(login)
}

// ---------------------------------------------------------------- GQL (channel + stream info)

/// Channel profile and, when live, viewers / title / category.
async fn fetch_info(login: &str) -> Res<Value> {
    let body = json!({
        "query": "query($login: String!) { user(login: $login) { login displayName profileImageURL(width: 70) stream { viewersCount title game { displayName } } } }",
        "variables": { "login": login },
    });
    let r = client()
        .post(GQL)
        .header("Client-Id", WEB_CLIENT_ID)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("เชื่อมต่อ Twitch ไม่ได้: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("Twitch ตอบกลับ {}", r.status()));
    }
    let j: Value = r.json().await.map_err(|e| e.to_string())?;
    if let Some(err) = j["errors"][0]["message"].as_str() {
        return Err(format!("Twitch GQL: {err}"));
    }
    let u = &j["data"]["user"];
    if u.is_null() {
        return Err(NOT_FOUND.into());
    }
    Ok(info_patch(u))
}

const NOT_FOUND: &str = "ไม่พบช่อง Twitch นี้";

fn info_patch(u: &Value) -> Value {
    let s = &u["stream"];
    json!({
        "state": if s.is_null() { "offline" } else { "live" },
        "channel": u["login"],
        "display_name": u["displayName"],
        "avatar": u["profileImageURL"],
        "viewers": if s.is_null() { Value::Null } else { s["viewersCount"].clone() },
        "title": s["title"],
        "game": s["game"]["displayName"],
    })
}

// ---------------------------------------------------------------- IRC parsing

#[derive(Debug, Default, PartialEq)]
pub struct IrcLine {
    pub tags: HashMap<String, String>,
    pub nick: String,
    pub command: String,
    pub channel: String,
    pub text: String,
}

impl IrcLine {
    fn tag(&self, k: &str) -> &str {
        self.tags.get(k).map(String::as_str).unwrap_or("")
    }
}

/// IRCv3 tag values escape `; space \ CR LF`.
fn unescape_tag(v: &str) -> String {
    let mut out = String::with_capacity(v.len());
    let mut it = v.chars();
    while let Some(c) = it.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match it.next() {
            Some('s') => out.push(' '),
            Some(':') => out.push(';'),
            Some('\\') => out.push('\\'),
            Some('r') => out.push('\r'),
            Some('n') => out.push('\n'),
            Some(o) => out.push(o),
            None => {}
        }
    }
    out
}

pub fn parse_line(line: &str) -> Option<IrcLine> {
    let mut rest = line.trim_end_matches(['\r', '\n']);
    let mut l = IrcLine::default();
    if let Some(r) = rest.strip_prefix('@') {
        let (tags, r) = r.split_once(' ')?;
        for kv in tags.split(';') {
            let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
            l.tags.insert(k.to_string(), unescape_tag(v));
        }
        rest = r;
    }
    if let Some(r) = rest.strip_prefix(':') {
        let (prefix, r) = r.split_once(' ')?;
        l.nick = prefix.split('!').next().unwrap_or("").to_string();
        rest = r;
    }
    let (head, trailing) = match rest.split_once(" :") {
        Some((h, t)) => (h, t),
        None => (rest, ""),
    };
    let mut parts = head.split(' ');
    l.command = parts.next().filter(|c| !c.is_empty())?.to_string();
    l.channel = parts.find(|p| p.starts_with('#')).unwrap_or("").to_string();
    l.text = trailing.to_string();
    Some(l)
}

/// Message text → runs, with emote ranges (`id:0-4,6-10/id2:12-15`, in characters)
/// replaced by emote images.
pub fn runs_with_emotes(text: &str, emotes: &str) -> Vec<Value> {
    let chars: Vec<char> = text.chars().collect();
    let mut spans: Vec<(usize, usize, &str)> = vec![];
    for e in emotes.split('/').filter(|s| !s.is_empty()) {
        let Some((id, ranges)) = e.split_once(':') else { continue };
        for r in ranges.split(',') {
            let Some((a, b)) = r.split_once('-') else { continue };
            if let (Ok(a), Ok(b)) = (a.parse::<usize>(), b.parse::<usize>()) {
                if a <= b && b < chars.len() {
                    spans.push((a, b, id));
                }
            }
        }
    }
    spans.sort_by_key(|s| s.0);
    let mut runs = vec![];
    let mut pos = 0;
    for (a, b, id) in spans {
        if a < pos {
            continue; // overlapping range: keep the first
        }
        if a > pos {
            runs.push(json!({"t": "text", "v": chars[pos..a].iter().collect::<String>()}));
        }
        runs.push(json!({
            "t": "emoji",
            "url": format!("https://static-cdn.jtvnw.net/emoticons/v2/{id}/default/dark/2.0"),
            "alt": chars[a..=b].iter().collect::<String>(),
        }));
        pos = b + 1;
    }
    if pos < chars.len() {
        runs.push(json!({"t": "text", "v": chars[pos..].iter().collect::<String>()}));
    }
    runs
}

/// PRIVMSG → chat item in the same shape as YouTube messages (source "twitch").
pub fn chat_item(l: &IrcLine) -> Value {
    let mut text = l.text.as_str();
    if let Some(a) = text.strip_prefix("\u{1}ACTION ") {
        text = a.trim_end_matches('\u{1}'); // "/me" messages
    }
    let badges = l.tag("badges");
    let has = |b: &str| badges.split(',').any(|x| x.split('/').next() == Some(b));
    let name = if l.tag("display-name").is_empty() { l.nick.clone() } else { l.tag("display-name").to_string() };
    let ts = l.tag("tmi-sent-ts").parse::<i64>().unwrap_or_else(|_| chrono::Utc::now().timestamp_millis());
    let id = if l.tag("id").is_empty() { format!("tw-{ts}-{}", l.nick) } else { format!("tw-{}", l.tag("id")) };
    let mut m = json!({
        "id": id,
        "kind": "text",
        "source": "twitch",
        "ts": ts,
        "name": name,
        "avatar": "",
        "channel_id": l.tag("user-id"),
        "badges": {
            "owner": has("broadcaster"),
            "moderator": has("moderator") || has("lead_moderator"),
            "member": has("subscriber") || has("founder"),
            "vip": has("vip"),
            "verified": has("partner"),
        },
        "runs": runs_with_emotes(text, l.tag("emotes")),
    });
    if let Ok(bits) = l.tag("bits").parse::<u64>() {
        if bits > 0 {
            m["kind"] = json!("superchat");
            m["amount"] = json!(format!("{bits} bits"));
            m["color"] = json!(PURPLE);
            m["header_color"] = json!(PURPLE_DARK);
        }
    }
    m
}

/// USERNOTICE (subs, gifts, raids) → member / gift event.
pub fn notice_item(l: &IrcLine) -> Option<Value> {
    let kind = match l.tag("msg-id") {
        "sub" | "resub" | "primepaidupgrade" | "giftpaidupgrade" | "anongiftpaidupgrade" | "raid" => "member",
        "submysterygift" => "gift",
        // single gifts that are part of a mystery gift are already covered by its summary
        "subgift" if l.tags.contains_key("msg-param-community-gift-id") => return None,
        "subgift" => "gift",
        "announcement" => "text",
        _ => return None,
    };
    let mut m = chat_item(l);
    m["kind"] = json!(kind);
    let headline = l.tag("system-msg").trim();
    if !headline.is_empty() {
        m["headline"] = json!(headline);
    }
    if l.text.is_empty() {
        m["runs"] = json!([]);
    }
    Some(m)
}

// ---------------------------------------------------------------- sessions

/// Read the channel's chat until the connection drops.
async fn run_irc(state: &Shared, login: &str) -> Res<()> {
    let stream = tokio::time::timeout(Duration::from_secs(10), TcpStream::connect((IRC_HOST, IRC_PORT)))
        .await
        .map_err(|_| "เชื่อมต่อแชท Twitch ไม่ทันเวลา".to_string())?
        .map_err(|e| format!("เชื่อมต่อแชท Twitch ไม่ได้: {e}"))?;
    let (rd, mut wr) = stream.into_split();
    let nick = format!("justinfan{}", 10000 + chrono::Utc::now().timestamp_subsec_micros() % 80000);
    let hello = format!("CAP REQ :twitch.tv/tags twitch.tv/commands\r\nNICK {nick}\r\nJOIN #{login}\r\n");
    wr.write_all(hello.as_bytes()).await.map_err(|e| e.to_string())?;

    let mut lines = BufReader::new(rd).lines();
    let mut joined = false;
    loop {
        let line = match tokio::time::timeout(IDLE_LIMIT, lines.next_line()).await {
            Err(_) => return Err("แชท Twitch เงียบนานเกินไป — กำลังเชื่อมต่อใหม่".into()),
            Ok(Err(e)) => return Err(format!("แชท Twitch หลุด: {e}")),
            Ok(Ok(None)) => return Err("Twitch ตัดการเชื่อมต่อแชท".into()),
            Ok(Ok(Some(l))) => l,
        };
        let Some(l) = parse_line(&line) else { continue };
        match l.command.as_str() {
            "PING" => wr.write_all(format!("PONG :{}\r\n", l.text).as_bytes()).await.map_err(|e| e.to_string())?,
            "JOIN" | "ROOMSTATE" => {
                if !joined {
                    joined = true;
                    state.patch_twitch(json!({"chat": "connected", "message": ""}));
                }
            }
            "PRIVMSG" => state.push_chat(vec![chat_item(&l)]),
            "USERNOTICE" => {
                if let Some(m) = notice_item(&l) {
                    state.push_chat(vec![m]);
                }
            }
            // ban / timeout of one user, or "/clear" of the whole chat
            "CLEARCHAT" => match l.tags.get("target-user-id") {
                Some(uid) => state.remove_chat_by_author("twitch", uid),
                None => state.clear_chat_source("twitch"),
            },
            "CLEARMSG" => {
                let id = l.tag("target-msg-id");
                if !id.is_empty() {
                    state.remove_chat(&format!("tw-{id}"));
                }
            }
            "RECONNECT" => return Err("Twitch ขอให้เชื่อมต่อใหม่".into()),
            "NOTICE" if !l.text.is_empty() => state.patch_twitch(json!({"message": l.text})),
            _ => {}
        }
    }
}

/// Refresh viewers / title / live state while the chat runs.
async fn poll_info(state: &Shared, login: &str) {
    loop {
        tokio::time::sleep(INFO_EVERY).await;
        match fetch_info(login).await {
            Ok(v) => state.patch_twitch(v),
            Err(e) => state.patch_twitch(json!({"message": e})),
        }
    }
}

/// Long-running task: keeps the Twitch chat connected according to config.
pub async fn supervisor(state: Shared) {
    loop {
        let restart = state.tw_restart.notified();
        tokio::pin!(restart);
        restart.as_mut().enable();
        tokio::select! {
            _ = &mut restart => {}
            _ = cycle(&state) => {}
        }
    }
}

async fn cycle(state: &Shared) {
    let input = state.config().twitch.channel;
    let prev = state.twitch.lock().unwrap()["channel"].as_str().map(String::from);
    if input.trim().is_empty() {
        if prev.is_some() {
            state.clear_chat_source("twitch");
        }
        state.set_twitch(json!({"state": "idle", "message": "ยังไม่ได้ตั้งค่าช่อง Twitch"}));
        return std::future::pending().await;
    }
    let Some(login) = parse_channel(&input) else {
        state.set_twitch(json!({"state": "error", "message": "ชื่อช่อง Twitch ไม่ถูกต้อง"}));
        return std::future::pending().await;
    };
    if prev.as_deref() != Some(login.as_str()) {
        state.clear_chat_source("twitch");
    }
    state.set_twitch(json!({"state": "connecting", "channel": login, "chat": "connecting", "viewers": null, "message": "กำลังเชื่อมต่อ Twitch…"}));
    match fetch_info(&login).await {
        Ok(v) => state.patch_twitch(v),
        Err(e) if e == NOT_FOUND => {
            state.patch_twitch(json!({"state": "error", "chat": "off", "message": e}));
            tokio::time::sleep(RETRY * 8).await;
            return;
        }
        // info is optional; keep going with the chat
        Err(e) => state.patch_twitch(json!({"message": e})),
    }
    let res = tokio::select! {
        r = run_irc(state, &login) => r,
        _ = poll_info(state, &login) => Ok(()),
    };
    if let Err(e) = res {
        state.patch_twitch(json!({"chat": "error", "message": e}));
    }
    tokio::time::sleep(RETRY).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_channels() {
        assert_eq!(parse_channel("KayleePK"), Some("kayleepk".into()));
        assert_eq!(parse_channel("@kayleepk"), Some("kayleepk".into()));
        assert_eq!(parse_channel("https://www.twitch.tv/kayleepk/videos"), Some("kayleepk".into()));
        assert_eq!(parse_channel("twitch.tv/popout/kayleepk/chat"), Some("kayleepk".into()));
        assert_eq!(parse_channel("bad name!"), None);
        assert_eq!(parse_channel(""), None);
    }

    #[test]
    fn parses_privmsg_with_tags_and_emotes() {
        let raw = "@badge-info=subscriber/8;badges=moderator/1,subscriber/6;bits=100;color=#FF0000;display-name=Kaylee_Fan;emotes=25:0-4,12-16;id=abc-1;tmi-sent-ts=1700000000000;user-id=42 :kaylee_fan!kaylee_fan@kaylee_fan.tmi.twitch.tv PRIVMSG #kayleepk :Kappa hello Kappa\r\n";
        let l = parse_line(raw).unwrap();
        assert_eq!(l.command, "PRIVMSG");
        assert_eq!(l.channel, "#kayleepk");
        assert_eq!(l.nick, "kaylee_fan");
        let m = chat_item(&l);
        assert_eq!(m["id"], "tw-abc-1");
        assert_eq!(m["name"], "Kaylee_Fan");
        assert_eq!(m["source"], "twitch");
        assert_eq!(m["kind"], "superchat");
        assert_eq!(m["amount"], "100 bits");
        assert_eq!(m["badges"]["moderator"], true);
        assert_eq!(m["badges"]["member"], true);
        let runs = m["runs"].as_array().unwrap();
        assert_eq!(runs.len(), 3);
        assert_eq!(runs[0]["t"], "emoji");
        assert_eq!(runs[1]["v"], " hello ");
        assert_eq!(runs[2]["alt"], "Kappa");
    }

    #[test]
    fn handles_thai_text_actions_and_notices() {
        let l = parse_line(":a!a@a.tmi.twitch.tv PRIVMSG #c :\u{1}ACTION สวัสดี ครับ\u{1}").unwrap();
        assert_eq!(chat_item(&l)["runs"][0]["v"], "สวัสดี ครับ");
        let ping = parse_line("PING :tmi.twitch.tv").unwrap();
        assert_eq!((ping.command.as_str(), ping.text.as_str()), ("PING", "tmi.twitch.tv"));
        let sub = parse_line("@msg-id=resub;display-name=Fan;system-msg=Fan\\ssubscribed\\sfor\\s3\\smonths!;id=x :tmi.twitch.tv USERNOTICE #c :hi").unwrap();
        let m = notice_item(&sub).unwrap();
        assert_eq!(m["kind"], "member");
        assert_eq!(m["headline"], "Fan subscribed for 3 months!");
        let part = parse_line("@msg-id=subgift;msg-param-community-gift-id=9;id=y :tmi.twitch.tv USERNOTICE #c").unwrap();
        assert!(notice_item(&part).is_none());
    }

    #[test]
    fn emote_ranges_count_characters_not_bytes() {
        let runs = runs_with_emotes("ดีจ้า LUL", "425618:6-8");
        assert_eq!(runs[0]["v"], "ดีจ้า ");
        assert_eq!(runs[1]["alt"], "LUL");
    }
}
