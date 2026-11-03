// Shared runtime for overlays and the studio: defaults, live state bus, helpers.
(function () {
  const DEFAULT_UI = {
    profile: {
      name: "xAOM",
      tagline: "SAKARIN",
      avatar: "",
      topic: "คุยเล่นสบาย ๆ / Just Chatting",
      socials: [
        { kind: "youtube", handle: "@xAom" },
        { kind: "facebook", handle: "/xAomSK" },
        { kind: "tiktok", handle: "@xaom" },
      ],
    },
    chat: { max: 30, avatars: true, badges: true, fontSize: 22, hideAfter: 0, donateCards: true },
    alerts: { popup: false, duration: 8, minAmount: 0, sound: true, toastInChatScenes: false },
    bar: { rotateSecs: 4 },
    scenes: {
      starting: {
        kicker: "stream will be", title: "Starting Soon..", tagline: "stay tuned!",
        countdownMode: "load", countdownMin: 5, countdownTime: "20:00", countdownDone: "กำลังจะเริ่มแล้ว!",
        showChat: true, showBar: true, showTopic: true,
      },
      chatting: { label: "JUST CHATTING", showChat: true, showGoal: true, showTimer: true, showBar: true, showLatest: true, showTopic: true },
      gameplay: {
        label: "GAMEPLAY", showCam: true, showChat: false, showGoal: true, showTimer: true, showBar: true,
        // Each HUD element: show (null = take the legacy toggle), anchor on a 3×3 grid, scale in %.
        items: {
          profile: { show: null, pos: "tl", scale: 100 },
          goal: { show: null, pos: "tl", scale: 100 },
          clock: { show: null, pos: "tr", scale: 100 },
          chat: { show: null, pos: "mr", scale: 100 },
          dock: { show: null, pos: "bl", scale: 100 },
          cam: { show: null, pos: "br", scale: 100 },
        },
      },
      ending: {
        kicker: "stream ended", title: "Thanks for watching", tagline: "see you next stream ♡",
        showCredits: true, showSocials: true, showBar: true, creditsTitle: "ขอบคุณผู้สนับสนุน",
      },
    },
  };

  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  function deepMerge(base, over) {
    if (!isObj(base)) return over === undefined ? base : over;
    const out = { ...base };
    if (!isObj(over)) return out;
    for (const k of Object.keys(over)) out[k] = isObj(base[k]) ? deepMerge(base[k], over[k]) : over[k];
    return out;
  }
  const clone = (v) => JSON.parse(JSON.stringify(v));

  // Defaults + saved settings, with older single toggles carried over to the per-item settings.
  function normalizeUI(saved) {
    const ui = deepMerge(DEFAULT_UI, saved || {});
    const g = ui.scenes.gameplay, it = g.items;
    const legacy = { profile: true, goal: g.showGoal !== false, clock: g.showTimer !== false, cam: g.showCam !== false, dock: g.showBar !== false, chat: g.showChat === true };
    for (const k of Object.keys(it)) if (it[k].show == null) it[k].show = legacy[k];
    return ui;
  }

  // ---------------------------------------------------------------- helpers
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  const money = (n, dec) => {
    const v = Number(n) || 0;
    const d = dec ?? (Number.isInteger(v) ? 0 : 2);
    return "฿" + v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const money2 = (n) => money(n, 2);
  const compact = (n) => {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M";
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + "K";
    return n.toLocaleString("en-US");
  };
  const clock = (ms) => {
    ms = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(ms / 3600), m = Math.floor((ms % 3600) / 60), s = ms % 60;
    const p = (x) => String(x).padStart(2, "0");
    return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  };
  const ago = (ts) => {
    if (!ts) return "";
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return "เมื่อสักครู่";
    if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
    if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
    return new Date(ts).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  };
  const initials = (name) => {
    const n = String(name || "?").replace(/^@/, "").trim();
    return esc(Array.from(n)[0] || "?").toUpperCase();
  };
  const params = new URLSearchParams(location.search);

  // Scale a fixed 1920×1080 stage to fit the viewport (letterboxed).
  function fitStage(stage, w = 1920, h = 1080) {
    const fit = () => {
      const s = Math.min(innerWidth / w, innerHeight / h);
      stage.style.width = w + "px";
      stage.style.height = h + "px";
      stage.style.transform = `translate(${(innerWidth - w * s) / 2}px, ${(innerHeight - h * s) / 2}px) scale(${s})`;
    };
    addEventListener("resize", fit);
    fit();
  }

  // ---------------------------------------------------------------- live state bus
  const handlers = {};
  const Bus = {
    state: {
      config: null, ui: clone(DEFAULT_UI), live: {}, ed_status: {},
      donate: { top: [], latest: [], goal: null, timer: null }, chat: [], connected: false,
    },
    on(name, fn) { (handlers[name] ||= []).push(fn); return Bus; },
    fire(name, data) { (handlers[name] || []).forEach((fn) => { try { fn(data, Bus.state); } catch (e) { console.error(e); } }); },
    connect() {
      const es = new EventSource("/api/events");
      const S = Bus.state;
      es.addEventListener("hello", (e) => {
        const d = JSON.parse(e.data);
        S.config = d.config; S.ui = normalizeUI(d.config.ui); S.live = d.live; S.donate = d.donate;
        S.chat = d.chat; S.ed_status = d.ed_status; S.countdown = d.countdown; S.port = d.port; S.port_fallback = d.port_fallback; S.connected = true;
        Bus.fire("config", S.config); Bus.fire("live", S.live); Bus.fire("donate_state", S.donate);
        Bus.fire("ed_status", S.ed_status); Bus.fire("hello", d);
      });
      const simple = {
        config: (d) => { S.config = d; S.ui = normalizeUI(d.ui); },
        live: (d) => { S.live = d; },
        donate_state: (d) => { S.donate = d; },
        ed_status: (d) => { S.ed_status = d; },
        chat: (d) => { S.chat = S.chat.concat(d.items).slice(-150); },
        chat_remove: (d) => { S.chat = S.chat.filter((m) => m.id !== d.id); },
        chat_clear: () => { S.chat = []; },
        donation: () => {},
        update: (d) => { S.update = d; },
        countdown: (d) => { S.countdown = d; },
      };
      for (const [name, apply] of Object.entries(simple)) {
        es.addEventListener(name, (e) => { const d = JSON.parse(e.data); apply(d); Bus.fire(name, d); });
      }
      es.onerror = () => { if (S.connected) { S.connected = false; Bus.fire("disconnected"); } };
      return Bus;
    },
  };

  // ---------------------------------------------------------------- icons
  const ICONS = {
    youtube: '<svg viewBox="0 0 24 24"><path fill="#ff3b4e" d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8z"/><path fill="#fff" d="M9.7 15.1V8.9l5.6 3.1z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11.5" fill="#1877f2"/><path fill="#fff" d="M13.3 19.5v-6.2h2.1l.3-2.5h-2.4V9.3c0-.7.2-1.2 1.2-1.2h1.3V5.9a17 17 0 0 0-1.9-.1c-1.9 0-3.2 1.2-3.2 3.3v1.8H8.6v2.5h2.1v6.2z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24"><path fill="#25f4ee" d="M15.6 3h-3v12.2a2.6 2.6 0 1 1-2.6-2.6v-3a5.6 5.6 0 1 0 5.6 5.6V9a7 7 0 0 0 4 1.3v-3a4 4 0 0 1-4-4.3z" transform="translate(-.6 -.5)"/><path fill="#fe2c55" d="M15.6 3h-3v12.2a2.6 2.6 0 1 1-2.6-2.6v-3a5.6 5.6 0 1 0 5.6 5.6V9a7 7 0 0 0 4 1.3v-3a4 4 0 0 1-4-4.3z" transform="translate(.6 .5)"/><path fill="#fff" d="M15.6 3h-3v12.2a2.6 2.6 0 1 1-2.6-2.6v-3a5.6 5.6 0 1 0 5.6 5.6V9a7 7 0 0 0 4 1.3v-3a4 4 0 0 1-4-4.3z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24"><defs><linearGradient id="igg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset=".4" stop-color="#fa7e1e"/><stop offset=".7" stop-color="#d62976"/><stop offset="1" stop-color="#4f5bd5"/></linearGradient></defs><rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="url(#igg)"/><circle cx="12" cy="12" r="4.6" fill="none" stroke="#fff" stroke-width="2"/><circle cx="17.6" cy="6.4" r="1.3" fill="#fff"/></svg>',
    x: '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#111"/><path fill="#fff" d="M13.6 10.7 19.4 4h-1.4l-5 5.8L9 4H4.4l6.1 8.9-6.1 7.1h1.4l5.3-6.2 4.3 6.2h4.6zm-1.9 2.2-.6-.9-4.9-7h2.1l4 5.7.6.9 5.2 7.4H16z"/></svg>',
    twitch: '<svg viewBox="0 0 24 24"><path fill="#9146ff" d="M4 2 2.5 6v14h5v3h3l3-3h4l5-5V2zm16 12-3 3h-5l-3 3v-3H5V4h15z"/><path fill="#9146ff" d="M15 7h2v6h-2zm-5 0h2v6h-2z"/></svg>',
    discord: '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#5865f2"/><path fill="#fff" d="M17.3 7.3a12 12 0 0 0-3-1l-.4.8a11 11 0 0 0-3.8 0l-.4-.8a12 12 0 0 0-3 1C4.8 10.2 4.3 13 4.5 15.8a12 12 0 0 0 3.7 1.9l.8-1.3-1.3-.6.3-.3a8.6 8.6 0 0 0 7.9 0l.3.3-1.3.6.8 1.3a12 12 0 0 0 3.7-1.9c.3-3.2-.5-6-2.1-8.5zM9.6 14.1c-.7 0-1.3-.7-1.3-1.5s.6-1.5 1.3-1.5 1.3.7 1.3 1.5-.6 1.5-1.3 1.5zm4.8 0c-.7 0-1.3-.7-1.3-1.5s.6-1.5 1.3-1.5 1.3.7 1.3 1.5-.6 1.5-1.3 1.5z"/></svg>',
    eye: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 5C6.5 5 2.7 9.2 1.5 12c1.2 2.8 5 7 10.5 7s9.3-4.2 10.5-7C21.3 9.2 17.5 5 12 5zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-2.3a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z"/></svg>',
    crown: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 18h18l1-11-5.5 4L12 4 7.5 11 2 7zm0 2h18v2H3z"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>',
    gift: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 7h-2.2A3 3 0 0 0 12 4a3 3 0 0 0-5.8 3H4a1 1 0 0 0-1 1v3h18V8a1 1 0 0 0-1-1zM9 7a1 1 0 1 1 1-1v1zm5 0V6a1 1 0 1 1 1 1zM4 13v7a1 1 0 0 0 1 1h6v-8zm9 8h6a1 1 0 0 0 1-1v-7h-7z"/></svg>',
    wrench: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M22.7 19 13.6 9.9a6 6 0 0 0-7.9-7.6l3.9 3.9-2.8 2.8-4-3.9a6 6 0 0 0 7.6 7.9l9.1 9.1a1 1 0 0 0 1.4 0l1.8-1.8a1 1 0 0 0 0-1.4z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.5 14.6 4l3.6-.4.9 3.5 3.2 1.8-1.4 3.3 1.4 3.3-3.2 1.8-.9 3.5-3.6-.4L12 22.5 9.4 20l-3.6.4-.9-3.5-3.2-1.8L3.1 12 1.7 8.7l3.2-1.8.9-3.5 3.6.4zm-1.3 13.7 6-6-1.4-1.4-4.6 4.6-2.3-2.3L7 11.5z"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m12 2 2.9 6.6 7.1.7-5.4 4.8 1.6 7L12 17.5 5.8 21l1.6-7L2 9.3l7.1-.7z"/></svg>',
    blossom: '<svg viewBox="0 0 24 24"><g fill="currentColor">' +
      [0, 72, 144, 216, 288].map((r) => `<path transform="rotate(${r} 12 12)" d="M12 11.5C9.6 9 9.4 5.2 10.6 3.4c.5.7 1 1 1.4.6.4.4.9.1 1.4-.6 1.2 1.8 1 5.6-1.4 8.1z"/>`).join("") +
      '</g><circle cx="12" cy="12" r="1.8" fill="#9aa4ff"/></svg>',
  };
  const SOCIAL_LABEL = { youtube: "YOUTUBE", facebook: "FACEBOOK", tiktok: "TIKTOK", instagram: "INSTAGRAM", x: "X", twitch: "TWITCH", discord: "DISCORD" };

  window.OS = { DEFAULT_UI, normalizeUI, deepMerge, clone, esc, el, money, money2, compact, clock, ago, initials, params, fitStage, Bus, ICONS, SOCIAL_LABEL };
})();
