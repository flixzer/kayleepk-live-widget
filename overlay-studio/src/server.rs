use crate::config::Config;
use crate::state::Shared;
use crate::{easydonate, youtube};
use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode, Uri};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures_util::stream::{self, Stream, StreamExt};
use rust_embed::RustEmbed;
use serde::Deserialize;
use serde_json::{json, Value};
use std::convert::Infallible;
use tokio_stream::wrappers::BroadcastStream;

#[derive(RustEmbed)]
#[folder = "web/"]
struct Assets;

pub const SCENES: &[&str] = &["starting", "chatting", "gameplay", "ending"];

pub fn router(state: Shared) -> Router {
    Router::new()
        .route("/", get(|| async { Redirect::temporary("/studio/") }))
        .route("/studio", get(|| async { Redirect::temporary("/studio/") }))
        .route("/studio/", get(|| async { asset("studio/index.html") }))
        .route("/scene/{name}", get(scene))
        .route("/widget/{name}", get(scene))
        .route("/api/events", get(events))
        .route("/api/state", get(api_state))
        .route("/api/config", get(get_config).put(put_config))
        .route("/api/yt/streams", get(yt_streams))
        .route("/api/yt/select", post(yt_select))
        .route("/api/yt/reconnect", post(yt_reconnect))
        .route("/api/ed/test", post(ed_test))
        .route("/api/ed/raw", get(ed_raw))
        .route("/api/ed/refresh", post(ed_refresh))
        .route("/api/test/donation", post(test_donation))
        .route("/api/test/chat", post(test_chat))
        .route("/api/chat/clear", post(chat_clear))
        .route("/api/open-folder", post(open_folder))
        .route("/api/countdown", post(countdown))
        .fallback(static_file)
        .with_state(state)
}

fn asset(path: &str) -> Response {
    match Assets::get(path) {
        Some(f) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            ([(header::CONTENT_TYPE, mime.as_ref().to_string()), (header::CACHE_CONTROL, "no-cache".into())], f.data.into_owned())
                .into_response()
        }
        None => (StatusCode::NOT_FOUND, "not found").into_response(),
    }
}

async fn static_file(uri: Uri) -> Response {
    let p = uri.path().trim_start_matches('/');
    let p = p.strip_prefix("assets/").unwrap_or(p);
    asset(p)
}

async fn scene(Path(name): Path<String>) -> Response {
    if SCENES.contains(&name.as_str()) || name == "chat" || name == "alerts" {
        asset("scene.html")
    } else {
        (StatusCode::NOT_FOUND, "unknown scene").into_response()
    }
}

async fn events(State(st): State<Shared>) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = st.tx.subscribe();
    let hello = stream::once(async move { Ok(Event::default().event("hello").data(st.snapshot().to_string())) });
    let updates = BroadcastStream::new(rx).filter_map(|m| async move {
        match m {
            Ok(ev) => Some(Ok(Event::default().event(ev.name).data(ev.data.as_str()))),
            Err(_) => None, // lagged; client keeps going
        }
    });
    Sse::new(hello.chain(updates)).keep_alive(KeepAlive::default())
}

async fn api_state(State(st): State<Shared>) -> Json<Value> {
    Json(st.snapshot())
}

async fn get_config(State(st): State<Shared>) -> Json<Config> {
    Json(st.config())
}

async fn put_config(State(st): State<Shared>, Json(cfg): Json<Config>) -> Response {
    match st.set_config(cfg) {
        Ok(()) => Json(json!({"ok": true})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "message": e.to_string()}))).into_response(),
    }
}

#[derive(Deserialize)]
struct Q {
    q: String,
}

async fn yt_streams(Query(q): Query<Q>) -> Response {
    match youtube::list_streams(&q.q).await {
        Ok(v) => Json(v).into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, Json(json!({"message": e}))).into_response(),
    }
}

#[derive(Deserialize)]
struct Select {
    channel: Option<String>,
    mode: String,
    video_id: Option<String>,
    title: Option<String>,
}

async fn yt_select(State(st): State<Shared>, Json(s): Json<Select>) -> Response {
    let mut cfg = st.config();
    if let Some(c) = s.channel {
        cfg.youtube.channel = c;
    }
    cfg.youtube.mode = if s.mode == "manual" { "manual".into() } else { "auto".into() };
    cfg.youtube.video_id = s.video_id.unwrap_or_default();
    cfg.youtube.video_title = s.title.unwrap_or_default();
    match st.set_config(cfg) {
        Ok(()) => Json(json!({"ok": true})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"message": e.to_string()}))).into_response(),
    }
}

async fn yt_reconnect(State(st): State<Shared>) -> Json<Value> {
    st.yt_restart.notify_waiters();
    Json(json!({"ok": true}))
}

#[derive(Deserialize)]
struct KeyBody {
    api_key: String,
}

async fn ed_test(State(st): State<Shared>, Json(b): Json<KeyBody>) -> Json<Value> {
    Json(easydonate::test_key(&st, &b.api_key).await)
}

async fn ed_raw(State(st): State<Shared>) -> Json<Value> {
    Json(Value::Object(st.ed_raw.lock().unwrap().clone()))
}

async fn ed_refresh(State(st): State<Shared>) -> Json<Value> {
    st.ed_restart.notify_waiters();
    Json(json!({"ok": true}))
}

#[derive(Deserialize)]
struct TestDonation {
    name: Option<String>,
    amount: Option<f64>,
    message: Option<String>,
}

async fn test_donation(State(st): State<Shared>, Json(b): Json<TestDonation>) -> Json<Value> {
    let now = chrono::Local::now().timestamp_millis();
    let d = json!({
        "id": format!("test-{now}"),
        "name": b.name.filter(|s| !s.is_empty()).unwrap_or_else(|| "ผู้สนับสนุนใจดี".into()),
        "amount": b.amount.unwrap_or(100.0),
        "message": b.message.unwrap_or_else(|| "ทดสอบโดเนท ขอให้ไลฟ์สนุกนะครับ 💜".into()),
        "created_at": now,
    });
    easydonate::announce(&st, d, true);
    Json(json!({"ok": true}))
}

#[derive(Deserialize)]
struct TestChat {
    name: Option<String>,
    message: Option<String>,
    kind: Option<String>,
}

async fn test_chat(State(st): State<Shared>, Json(b): Json<TestChat>) -> Json<Value> {
    let now = chrono::Local::now().timestamp_millis();
    let kind = b.kind.unwrap_or_else(|| "text".into());
    let mut m = json!({
        "id": format!("test-{now}"),
        "kind": kind,
        "source": "youtube",
        "ts": now,
        "name": b.name.unwrap_or_else(|| "@viewer".into()),
        "avatar": "",
        "badges": {"owner": false, "moderator": false, "member": false, "verified": false},
        "runs": [{"t": "text", "v": b.message.unwrap_or_else(|| "สวัสดีครับ 👋".into())}],
        "test": true,
    });
    if kind == "superchat" {
        m["amount"] = json!("฿100.00");
        m["color"] = json!("rgba(255,202,40,1)");
    }
    st.push_chat(vec![m]);
    Json(json!({"ok": true}))
}

async fn chat_clear(State(st): State<Shared>) -> Json<Value> {
    st.clear_chat();
    Json(json!({"ok": true}))
}

async fn open_folder(State(st): State<Shared>) -> Json<Value> {
    let dir = st.cfg_path.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let _ = std::fs::create_dir_all(&dir);
    #[cfg(windows)]
    let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(&dir).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    Json(json!({"ok": true, "path": dir}))
}

#[derive(Deserialize)]
struct CountdownCmd {
    /// start | pause | resume | reset | add
    action: String,
    ms: Option<i64>,
}

/// One countdown shared by every open Starting scene, controlled from the studio.
async fn countdown(State(st): State<Shared>, Json(c): Json<CountdownCmd>) -> Json<Value> {
    let now = chrono::Local::now().timestamp_millis();
    let v = {
        let mut cd = st.countdown.lock().unwrap();
        let running = cd["running"].as_bool().unwrap_or(false);
        let left = if running { cd["end_at"].as_i64().unwrap_or(now) - now } else { cd["remaining_ms"].as_i64().unwrap_or(0) };
        let left = left.max(0);
        let ms = c.ms.unwrap_or(0).max(0);
        *cd = match c.action.as_str() {
            "start" => json!({"running": true, "end_at": now + ms, "remaining_ms": ms}),
            "pause" if running => json!({"running": false, "end_at": null, "remaining_ms": left}),
            "resume" if !running => json!({"running": true, "end_at": now + left, "remaining_ms": left}),
            "reset" => json!({"running": false, "end_at": null, "remaining_ms": ms}),
            "add" => {
                let delta = c.ms.unwrap_or(0);
                let next = (left + delta).max(0);
                if running { json!({"running": true, "end_at": now + next, "remaining_ms": next}) } else { json!({"running": false, "end_at": null, "remaining_ms": next}) }
            }
            _ => cd.clone(),
        };
        cd.clone()
    };
    st.emit("countdown", &v);
    Json(v)
}
