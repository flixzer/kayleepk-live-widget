#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;
mod easydonate;
mod server;
mod state;
mod updater;
mod youtube;

use state::AppState;
use tao::dpi::LogicalSize;
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoop};
use tao::window::{Icon, WindowBuilder};
use wry::WebViewBuilder;

async fn bind(preferred: u16) -> (tokio::net::TcpListener, u16) {
    for port in preferred..preferred.saturating_add(20) {
        if let Ok(l) = tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
            return (l, port);
        }
    }
    let l = tokio::net::TcpListener::bind(("127.0.0.1", 0)).await.expect("bind");
    let port = l.local_addr().unwrap().port();
    (l, port)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let headless = args.iter().any(|a| a == "--headless");
    let cfg_path = args
        .iter()
        .position(|a| a == "--config")
        .and_then(|i| args.get(i + 1))
        .map(std::path::PathBuf::from)
        .unwrap_or_else(config::config_path);
    let cfg = config::load(&cfg_path);

    let rt = tokio::runtime::Runtime::new().expect("tokio runtime");
    let (listener, port) = rt.block_on(bind(cfg.port));
    let state = AppState::new(cfg.clone(), cfg_path, port, port != cfg.port);

    let app = server::router(state.clone());
    rt.spawn(async move {
        axum::serve(listener, app).await.expect("server");
    });
    rt.spawn(youtube::supervisor(state.clone()));
    rt.spawn(easydonate::supervisor(state.clone()));
    rt.spawn(updater::run(state.clone()));

    let url = format!("http://127.0.0.1:{port}/studio/");
    println!("Overlay Studio running at {url}");
    if headless {
        rt.block_on(std::future::pending::<()>());
        return;
    }
    run_window(&url);
    drop(rt);
}

fn run_window(url: &str) {
    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title("Overlay Studio")
        .with_inner_size(LogicalSize::new(1600.0, 900.0))
        .with_maximized(true)
        .with_resizable(false)
        .with_maximizable(false)
        .with_window_icon(Some(app_icon()))
        .build(&event_loop)
        .expect("window");

    let _webview = WebViewBuilder::new()
        .with_url(url)
        .with_background_color((9, 11, 38, 255))
        .with_devtools(cfg!(debug_assertions))
        .with_clipboard(true)
        .build(&window)
        .expect("webview (WebView2 runtime required)");

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Event::WindowEvent { event: WindowEvent::CloseRequested, .. } = event {
            *control_flow = ControlFlow::Exit;
        }
    });
}

/// Procedural 64×64 icon: a glowing five-petal blossom on a night-blue disc.
fn app_icon() -> Icon {
    const N: u32 = 64;
    let mut px = Vec::with_capacity((N * N * 4) as usize);
    for y in 0..N {
        for x in 0..N {
            let dx = x as f32 - 31.5;
            let dy = y as f32 - 31.5;
            let r = (dx * dx + dy * dy).sqrt();
            let a = dy.atan2(dx);
            let petal = 22.0 * (0.55 + 0.45 * ((5.0 * a / 2.0).cos()).abs());
            let (mut cr, mut cg, mut cb, mut ca) = (0.0f32, 0.0, 0.0, 0.0);
            if r < 31.0 {
                let t = y as f32 / N as f32;
                cr = 28.0 + 40.0 * t;
                cg = 30.0 + 30.0 * t;
                cb = 92.0 + 80.0 * t;
                ca = 255.0 * (31.0 - r).clamp(0.0, 1.0);
            }
            if r < petal {
                let w = ((petal - r) / 2.0).clamp(0.0, 1.0);
                cr = cr * (1.0 - w) + 248.0 * w;
                cg = cg * (1.0 - w) + 246.0 * w;
                cb = cb * (1.0 - w) + 255.0 * w;
            }
            if r < 5.0 {
                cr = 196.0;
                cg = 186.0;
                cb = 255.0;
            }
            px.extend_from_slice(&[cr as u8, cg as u8, cb as u8, ca as u8]);
        }
    }
    Icon::from_rgba(px, N, N).expect("icon")
}
