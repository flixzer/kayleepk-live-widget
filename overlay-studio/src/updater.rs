//! Startup self-update from GitHub Releases.
//!
//! Each release (tag `vX.Y.Z`) carries an Inno Setup installer named `OverlayStudio-Setup.exe`.
//! When the latest tag is newer than this build, the installer is downloaded and run silently;
//! it replaces the files, then relaunches the app (see installer/overlay-studio.iss).

use crate::state::Shared;
use serde_json::{json, Value};
use std::time::Duration;

pub const REPO: &str = "flixzer/kayleepk-live-widget";
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
const ASSET: &str = "OverlayStudio-Setup.exe";

fn parse_ver(s: &str) -> Vec<u64> {
    s.trim().trim_start_matches(['v', 'V']).split(['.', '-', '+']).take(3).map(|p| p.parse().unwrap_or(0)).collect()
}

pub fn is_newer(remote: &str, local: &str) -> bool {
    let (mut r, mut l) = (parse_ver(remote), parse_ver(local));
    r.resize(3, 0);
    l.resize(3, 0);
    r > l
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(format!("OverlayStudio/{VERSION}"))
        .timeout(Duration::from_secs(120))
        .build()
        .expect("http client")
}

/// Latest release info: Ok(None) when there is nothing newer.
async fn latest() -> Result<Option<(String, String)>, String> {
    let r = client()
        .get(format!("https://api.github.com/repos/{REPO}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("เชื่อมต่อ GitHub ไม่ได้: {e}"))?;
    match r.status().as_u16() {
        200 => {}
        404 => return Err("ไม่พบ release บน GitHub (repo อาจเป็น private หรือยังไม่มี release)".into()),
        s => return Err(format!("GitHub ตอบกลับ {s}")),
    }
    let j: Value = r.json().await.map_err(|e| e.to_string())?;
    let tag = j["tag_name"].as_str().unwrap_or("").to_string();
    if !is_newer(&tag, VERSION) {
        return Ok(None);
    }
    let url = j["assets"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|a| a["name"].as_str().map(|n| n.eq_ignore_ascii_case(ASSET)).unwrap_or(false))
        .and_then(|a| a["browser_download_url"].as_str())
        .ok_or_else(|| format!("release {tag} ไม่มีไฟล์ {ASSET}"))?;
    Ok(Some((tag.trim_start_matches('v').to_string(), url.to_string())))
}

fn status(state: &Shared, v: Value) {
    *state.update.lock().unwrap() = v.clone();
    state.emit("update", &v);
}

/// Check once; if a newer build exists, install it and exit this process.
pub async fn run(state: Shared) {
    if cfg!(debug_assertions) || !state.config().auto_update {
        status(&state, json!({"state": "off", "version": VERSION}));
        return;
    }
    tokio::time::sleep(Duration::from_secs(3)).await; // let the studio window load first
    status(&state, json!({"state": "checking", "version": VERSION}));
    let (ver, url) = match latest().await {
        Ok(Some(x)) => x,
        Ok(None) => return status(&state, json!({"state": "latest", "version": VERSION})),
        Err(e) => return status(&state, json!({"state": "error", "version": VERSION, "message": e})),
    };
    status(&state, json!({"state": "downloading", "version": VERSION, "latest": ver}));
    let bytes = match client().get(&url).send().await.and_then(|r| r.error_for_status()) {
        Ok(r) => match r.bytes().await {
            Ok(b) => b,
            Err(e) => return status(&state, json!({"state": "error", "version": VERSION, "message": e.to_string()})),
        },
        Err(e) => return status(&state, json!({"state": "error", "version": VERSION, "message": e.to_string()})),
    };
    let path = std::env::temp_dir().join(format!("OverlayStudio-Setup-{ver}.exe"));
    if let Err(e) = std::fs::write(&path, &bytes) {
        return status(&state, json!({"state": "error", "version": VERSION, "message": e.to_string()}));
    }
    status(&state, json!({"state": "installing", "version": VERSION, "latest": ver}));
    tokio::time::sleep(Duration::from_millis(1500)).await; // show the banner briefly
    match std::process::Command::new(&path).args(["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CLOSEAPPLICATIONS"]).spawn() {
        Ok(_) => std::process::exit(0),
        Err(e) => status(&state, json!({"state": "error", "version": VERSION, "message": format!("เปิดตัวติดตั้งไม่ได้: {e}")})),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_versions() {
        assert!(is_newer("v0.2.0", "0.1.9"));
        assert!(is_newer("1.0.0", "0.9.9"));
        assert!(!is_newer("v0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.2.0"));
        assert!(is_newer("v0.1.10", "0.1.9"));
    }
}
