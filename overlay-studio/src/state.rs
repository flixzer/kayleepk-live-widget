use crate::config::{self, Config};
use serde_json::{json, Map, Value};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use tokio::sync::{broadcast, Notify};

const CHAT_BUFFER: usize = 120;

#[derive(Clone, Debug)]
pub struct Ev {
    pub name: &'static str,
    pub data: Arc<String>,
}

pub struct AppState {
    pub cfg: RwLock<Config>,
    pub cfg_path: PathBuf,
    pub port: u16,
    pub port_fallback: bool,
    pub started_at: chrono::DateTime<chrono::Local>,
    pub tx: broadcast::Sender<Ev>,
    pub chat: Mutex<VecDeque<Value>>,
    /// {state, video_id, title, channel, viewers, thumbnail, message}
    pub live: Mutex<Value>,
    /// {top, latest, goal, timer}
    pub donate: Mutex<Value>,
    /// {state, message, account}
    pub ed_status: Mutex<Value>,
    /// last raw responses per endpoint, for the debug viewer
    pub ed_raw: Mutex<Map<String, Value>>,
    /// {state, version, latest?, message?} from the updater
    pub update: Mutex<Value>,
    /// Starting-scene countdown driven by the studio buttons: {running, end_at, remaining_ms}
    pub countdown: Mutex<Value>,
    pub yt_restart: Notify,
    pub ed_restart: Notify,
}

pub type Shared = Arc<AppState>;

impl AppState {
    pub fn new(cfg: Config, cfg_path: PathBuf, port: u16, port_fallback: bool) -> Shared {
        let (tx, _) = broadcast::channel(512);
        Arc::new(Self {
            cfg: RwLock::new(cfg),
            cfg_path,
            port,
            port_fallback,
            started_at: chrono::Local::now(),
            tx,
            chat: Mutex::new(VecDeque::new()),
            live: Mutex::new(json!({"state": "idle"})),
            donate: Mutex::new(json!({"top": [], "latest": [], "goal": null, "timer": null})),
            ed_status: Mutex::new(json!({"state": "off"})),
            ed_raw: Mutex::new(Map::new()),
            update: Mutex::new(json!({"state": "off", "version": crate::updater::VERSION})),
            countdown: Mutex::new(json!({"running": false, "end_at": null, "remaining_ms": null})),
            yt_restart: Notify::new(),
            ed_restart: Notify::new(),
        })
    }

    pub fn emit(&self, name: &'static str, data: &Value) {
        let _ = self.tx.send(Ev { name, data: Arc::new(data.to_string()) });
    }

    pub fn config(&self) -> Config {
        self.cfg.read().unwrap().clone()
    }

    /// Config as seen by overlays: identical but without secrets.
    pub fn public_config(&self) -> Value {
        let mut c = serde_json::to_value(self.config()).unwrap();
        if let Some(ed) = c.get_mut("easydonate") {
            let has_key = ed["api_key"].as_str().map(|s| !s.is_empty()).unwrap_or(false);
            ed["api_key"] = Value::Null;
            ed["connected"] = Value::Bool(has_key);
        }
        c
    }

    pub fn set_config(&self, new_cfg: Config) -> std::io::Result<()> {
        let old = self.config();
        config::save(&self.cfg_path, &new_cfg)?;
        *self.cfg.write().unwrap() = new_cfg.clone();
        if old.youtube != new_cfg.youtube {
            self.yt_restart.notify_waiters();
        }
        if old.easydonate != new_cfg.easydonate {
            self.ed_restart.notify_waiters();
        }
        self.emit("config", &self.public_config());
        Ok(())
    }

    /// Merge `patch` into the live-status object and broadcast it.
    pub fn patch_live(&self, patch: Value) {
        let snapshot = {
            let mut live = self.live.lock().unwrap();
            if let (Some(l), Some(p)) = (live.as_object_mut(), patch.as_object()) {
                for (k, v) in p {
                    l.insert(k.clone(), v.clone());
                }
            }
            live.clone()
        };
        self.emit("live", &snapshot);
    }

    pub fn set_live(&self, v: Value) {
        *self.live.lock().unwrap() = v.clone();
        self.emit("live", &v);
    }

    pub fn push_chat(&self, items: Vec<Value>) {
        if items.is_empty() {
            return;
        }
        {
            let mut buf = self.chat.lock().unwrap();
            for it in &items {
                buf.push_back(it.clone());
            }
            while buf.len() > CHAT_BUFFER {
                buf.pop_front();
            }
        }
        self.emit("chat", &json!({ "items": items }));
    }

    pub fn remove_chat(&self, id: &str) {
        self.chat.lock().unwrap().retain(|m| m["id"].as_str() != Some(id));
        self.emit("chat_remove", &json!({ "id": id }));
    }

    pub fn clear_chat(&self) {
        self.chat.lock().unwrap().clear();
        self.emit("chat_clear", &json!({}));
    }

    pub fn set_donate(&self, key: &str, value: Value) {
        let snapshot = {
            let mut d = self.donate.lock().unwrap();
            d[key] = value;
            d.clone()
        };
        self.emit("donate_state", &snapshot);
    }

    pub fn set_ed_status(&self, v: Value) {
        *self.ed_status.lock().unwrap() = v.clone();
        self.emit("ed_status", &v);
    }

    pub fn snapshot(&self) -> Value {
        json!({
            "config": self.public_config(),
            "live": self.live.lock().unwrap().clone(),
            "donate": self.donate.lock().unwrap().clone(),
            "ed_status": self.ed_status.lock().unwrap().clone(),
            "chat": self.chat.lock().unwrap().iter().cloned().collect::<Vec<_>>(),
            "update": self.update.lock().unwrap().clone(),
            "countdown": self.countdown.lock().unwrap().clone(),
            "port": self.port,
            "port_fallback": self.port_fallback,
        })
    }
}
