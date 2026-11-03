use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default)]
pub struct Config {
    pub port: u16,
    /// Check GitHub Releases on startup and install newer builds.
    pub auto_update: bool,
    pub youtube: YtCfg,
    pub easydonate: EdCfg,
    /// Display settings owned by the web UI (profile, scenes, chat look, alerts).
    pub ui: Value,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            port: 3939,
            auto_update: true,
            youtube: YtCfg::default(),
            easydonate: EdCfg::default(),
            ui: Value::Object(Default::default()),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct YtCfg {
    /// @handle, channel URL, channel id or video URL
    pub channel: String,
    /// "auto" = follow whatever the channel is streaming, "manual" = fixed video_id
    pub mode: String,
    pub video_id: String,
    pub video_title: String,
}

impl Default for YtCfg {
    fn default() -> Self {
        Self { channel: String::new(), mode: "auto".into(), video_id: String::new(), video_title: String::new() }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct EdCfg {
    pub api_key: String,
    pub poll_secs: u64,
    pub goal: GoalCfg,
    pub top: RangeCfg,
    pub latest: RangeCfg,
    pub timer: bool,
}

impl Default for EdCfg {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            poll_secs: 5,
            goal: GoalCfg::default(),
            top: RangeCfg { preset: "month".into(), count: 10, ..Default::default() },
            latest: RangeCfg { preset: "today".into(), count: 5, ..Default::default() },
            timer: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(default)]
pub struct GoalCfg {
    /// "easydonate" (use the goal widget configured on EasyDonate), "custom", or "off"
    pub source: String,
    pub title: String,
    pub target: f64,
    pub range: RangeCfg,
}

impl Default for GoalCfg {
    fn default() -> Self {
        Self {
            source: "easydonate".into(),
            title: "เป้าหมายโดเนท".into(),
            target: 10000.0,
            range: RangeCfg { preset: "month".into(), ..Default::default() },
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(default)]
pub struct RangeCfg {
    /// "all" | "today" | "week" | "month" | "session" | "custom"
    pub preset: String,
    /// datetime-local strings: "2026-11-03T18:00"
    pub start: String,
    pub end: String,
    pub count: u32,
}

pub fn config_dir() -> PathBuf {
    let base = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("OverlayStudio")
}

pub fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

pub fn load(path: &Path) -> Config {
    match std::fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|e| {
            eprintln!("config parse error ({e}), using defaults");
            Config::default()
        }),
        Err(_) => Config::default(),
    }
}

pub fn save(path: &Path, cfg: &Config) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(cfg).unwrap())?;
    std::fs::rename(tmp, path)
}
