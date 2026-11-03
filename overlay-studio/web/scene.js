// Builds one of the overlay scenes (1920×1080) from the URL path:
//   /scene/starting | chatting | gameplay | ending      /widget/chat | alerts
(function () {
  const { Bus, el, esc, params, fitStage, ICONS, clock } = OS;
  const parts = location.pathname.split("/").filter(Boolean);
  const kind = parts[0], name = parts[1];
  const preview = params.has("preview"), demo = params.has("demo");
  const stage = document.getElementById("stage");
  document.body.classList.add(`${kind}-${name}`);
  if (preview) document.body.classList.add("preview");

  const ui = () => Bus.state.ui;
  const sc = () => ui().scenes[name] || {};
  const W = 1920, H = 1080;

  // ---------------------------------------------------------------- shared pieces
  // Cut the camera window (an arch) out of the backdrop so the camera below shows through.
  function holeClip(c) {
    return `path(evenodd, "M0 0H${W}V${H}H0Z ${FX.archPath(c.x, c.y, c.w, c.h, c.R, c.r)}")`;
  }

  function backdrop(hole, fxOpts = {}) {
    const bg = el("div", "bg");
    bg.appendChild(el("div", "sky-grad"));
    bg.appendChild(el("div", "moon"));
    bg.appendChild(FX.bokeh());
    bg.appendChild(FX.landscape());
    const cv = el("canvas", "sky");
    bg.appendChild(cv);
    if (hole) bg.style.clipPath = holeClip(hole);
    stage.appendChild(bg);
    FX.Sky(cv, fxOpts);
    return bg;
  }

  function petalsOver(n = 9) {
    const cv = el("canvas", "petal-layer");
    stage.appendChild(cv);
    FX.Sky(cv, { stars: 0, fireflies: 0, butterflies: 0, petals: n });
  }

  function place(node, x, y, w, h, parent = stage) {
    node.style.cssText += `;position:absolute;left:${x}px;top:${y}px;` + (w ? `width:${w}px;` : "") + (h ? `height:${h}px;` : "");
    parent.appendChild(node);
    return node;
  }

  function cluster(x, y, opts, parent = stage) {
    const b = FX.blossoms(opts);
    b.style.left = x + "px";
    b.style.top = y + "px";
    parent.appendChild(b);
    return b;
  }

  function camHole(c, label = "CAMERA", parent = stage) {
    FX.archFrame(parent, { ...c, cls: "cam-frame" });
    if (preview) {
      const ph = place(el("div", "cam-placeholder", `<div>${ICONS.eye}<span>${label}</span></div>`), c.x, c.y, c.w, c.h, parent);
      ph.style.borderRadius = `${c.R}px ${c.R}px ${c.r}px ${c.r}px`;
    }
  }

  function chatBox(r, { label = "CHAT", footer = false } = {}, parent = stage) {
    place(el("div", "chat-bg glass"), r.x, r.y, r.w, r.h, parent);
    FX.frame(parent, { ...r, label });
    const fh = footer ? 74 : 0;
    const host = place(el("div", "chat-host"), r.x + 2, r.y + 14, r.w - 4, r.h - 22 - fh, parent);
    if (footer) {
      const f = place(el("div", "chat-foot", `<div class="cf-viewers"></div><div class="cf-socials"></div>`), r.x + 14, r.y + r.h - fh - 6, r.w - 28, fh, parent);
      Wd.Viewers(f.querySelector(".cf-viewers"));
      Wd.Socials(f.querySelector(".cf-socials"));
    }
    return Wd.ChatPanel(host);
  }

  // Divider ornament: line · blossom · line
  const ornament = () => `<div class="hero-orn"><i></i>${ICONS.blossom}<i></i></div>`;

  function dock(x, y, w, parts) {
    if (sc().showBar === false) return;
    Wd.Dock(place(el("div"), x, y, w, 72), { parts });
  }

  function graphemes(text) {
    try {
      return Array.from(new Intl.Segmenter("th", { granularity: "grapheme" }).segment(text), (s) => s.segment);
    } catch { return [text]; }
  }
  function waveText(node, text) {
    node.innerHTML = graphemes(text).map((g, i) => `<span style="animation-delay:${(i * 0.08).toFixed(2)}s">${g === " " ? "&nbsp;" : esc(g)}</span>`).join("");
  }

  const Wd = window.W;

  // Rebuild when a structural toggle changes; text changes are applied in place.
  let layoutSig = null;
  function watchLayout(keys) {
    Bus.on("config", () => {
      const s = JSON.stringify(keys.map((k) => sc()[k]));
      if (layoutSig !== null && s !== layoutSig) location.reload();
      layoutSig = s;
    });
  }

  // ---------------------------------------------------------------- scenes
  const scenes = {
    starting() {
      backdrop(null);
      cluster(-40, -40, { w: 620, h: 440, anchor: "tl", seed: 3, flowers: 16, leaves: 18 });
      cluster(W - 520, H - 430, { w: 560, h: 450, anchor: "br", seed: 9, flowers: 15, leaves: 16 });
      cluster(-30, H - 300, { w: 320, h: 300, anchor: "bl", seed: 21, flowers: 7, leaves: 8, size: 0.8 });
      cluster(W - 250, -30, { w: 270, h: 150, anchor: "tr", seed: 5, flowers: 5, leaves: 6, size: 0.75 });
      const withChat = sc().showChat !== false;
      // Hero fills the area left of the chat (or the whole width) and centres itself vertically.
      const heroX = withChat ? 100 : 0, heroW = withChat ? 1260 : W;
      const hero = place(el("div", "hero", `
        <div class="hero-kicker"></div>
        <h1 class="hero-title"></h1>
        <div class="hero-tag"></div>
        ${ornament()}
        <div class="countdown"><span class="cd-label">เริ่มใน</span><span class="cd-time">--:--</span></div>
        <div class="hero-topic"><span class="ht-chip">${ICONS.blossom}<b>TOPIC</b></span><span class="topic-text"></span></div>`), heroX, 40, heroW, 920);
      let chat = null;
      if (withChat) chat = chatBox({ x: 1440, y: 96, w: 420, h: 860 });
      petalsOver(10);
      dock(withChat ? heroX + 40 : 340, 984, withChat ? heroW - 80 : 1240, ["top", "latest", "viewers", "socials"]);
      Wd.AlertQueue(place(el("div"), 0, 0, W, 400), { enabled: () => !withChat || ui().alerts.toastInChatScenes });

      const loadedAt = Date.now();
      // Milliseconds left for the current mode: from scene load, to a clock time, or the
      // shared countdown driven by the studio's start / pause / reset buttons.
      const leftMs = () => {
        const s = sc(), now = Date.now();
        if (s.countdownMode === "manual") {
          const c = Bus.state.countdown || {};
          if (c.running) return c.end_at - now;
          return c.remaining_ms ?? (Number(s.countdownMin) || 0) * 60000;
        }
        if (s.countdownMode === "time") {
          const [h, m] = String(s.countdownTime || "20:00").split(":").map(Number);
          const d = new Date();
          d.setHours(h || 0, m || 0, 0, 0);
          return d.getTime() - now;
        }
        return loadedAt + (Number(s.countdownMin) || 0) * 60000 - now;
      };
      const cdT = hero.querySelector(".cd-time"), cd = hero.querySelector(".countdown");
      setInterval(() => {
        const left = leftMs();
        const paused = sc().countdownMode === "manual" && !(Bus.state.countdown || {}).running;
        const done = left <= 0;
        cd.classList.toggle("done", done);
        cd.classList.toggle("paused", paused && !done);
        cdT.textContent = done ? sc().countdownDone || "กำลังจะเริ่มแล้ว!" : clock(left);
      }, 250);
      Bus.on("config", () => {
        const s = sc();
        hero.querySelector(".hero-kicker").textContent = s.kicker || "";
        waveText(hero.querySelector(".hero-title"), s.title || "");
        hero.querySelector(".hero-tag").textContent = s.tagline || "";
        hero.querySelector(".topic-text").textContent = ui().profile.topic || "";
        hero.querySelector(".hero-topic").style.display = s.showTopic === false || !ui().profile.topic ? "none" : "";
      });
      watchLayout(["showChat", "showBar"]);
      return chat;
    },

    // Chat scroll on the left, the camera as an arched moon-gate window on the right,
    // floating info cards underneath. No header strip, no full-width bar.
    chatting() {
      const s0 = sc();
      const withChat = s0.showChat !== false;
      const cam = { x: withChat ? 560 : 308, y: 92, w: 1304, h: 734, R: 150, r: 14 };
      backdrop(cam, { petals: 14, fireflies: 18 });
      let chat = null;
      if (withChat) chat = chatBox({ x: 56, y: 56, w: 440, h: 968 }, { footer: true });
      camHole(cam);
      cluster(cam.x - 70, cam.y + cam.h - 230, { w: 300, h: 270, anchor: "bl", seed: 31, flowers: 9, leaves: 10, size: 0.85 });
      cluster(cam.x + cam.w - 300, -36, { w: 360, h: 260, anchor: "tr", seed: 17, flowers: 9, leaves: 10, size: 0.85 });

      Wd.Nameplate(place(el("div", "np-hang"), cam.x + 44, 30), { label: () => sc().label || "JUST CHATTING" });
      if (s0.showTimer !== false) Wd.TimerBox(place(el("div"), cam.x + cam.w - 176, 26, 180, 180));
      const ribbon = place(el("div", "ribbon", `<span class="rb-chip">${ICONS.blossom}<b>TOPIC</b></span><span class="rb-text"></span>`), cam.x + cam.w / 2, cam.y + cam.h - 34);
      Bus.on("config", () => {
        ribbon.querySelector(".rb-text").textContent = ui().profile.topic || "";
        ribbon.style.display = ui().profile.topic && sc().showTopic !== false ? "" : "none";
      });

      const rowY = 870, rowH = 154;
      const cards = s0.showBar !== false;
      const goalW = cards ? cam.w - 2 * 330 : cam.w;
      if (s0.showGoal !== false) Wd.GoalBar(place(el("div", "glass info-card"), cam.x, rowY, goalW, rowH), { variant: "card" });
      if (cards) {
        Wd.Ticker(place(el("div", "glass info-card"), cam.x + cam.w - 642, rowY, 312, rowH), { kind: "top", label: "TOP DONATE", variant: "spot" });
        Wd.Ticker(place(el("div", "glass info-card"), cam.x + cam.w - 312, rowY, 312, rowH), { kind: "latest", label: "LATEST", icon: ICONS.heart, variant: "spot" });
      }
      petalsOver(7);
      Wd.AlertQueue(place(el("div"), cam.x, cam.y + 150, cam.w, 400), { enabled: () => !withChat || ui().alerts.toastInChatScenes });
      watchLayout(["showChat", "showGoal", "showTimer", "showBar"]);
      return chat;
    },

    // Transparent HUD around the game. Every element can be switched off, anchored to one of
    // nine screen positions (tl tc tr / ml mc mr / bl bc br) and scaled; elements that share
    // an anchor stack in a fixed order.
    gameplay() {
      if (preview) place(el("div", "game-placeholder", `<span>GAME CAPTURE</span>`), 0, 0, W, H);
      const items = () => sc().items;
      let chat = null;
      const DEFS = {
        profile: { make: (b) => { b.classList.add("np-hud", "glass"); Wd.Nameplate(b, { label: () => sc().label || "GAMEPLAY", viewers: true }); } },
        goal: { w: 470, h: 120, make: (b) => { b.classList.add("glass", "info-card"); Wd.GoalBar(b, { variant: "card" }); } },
        clock: { w: 180, h: 180, pad: 16, make: (b) => Wd.TimerBox(b) },
        chat: { w: 384, h: 440, pad: 14, make: (b) => { chat = chatBox({ x: 0, y: 0, w: 384, h: 440 }, {}, b); } },
        dock: { w: 820, h: 72, make: (b) => Wd.Dock(b, { parts: ["top", "latest"] }) },
        cam: {
          w: 472, h: 266, pad: 40,
          make: (b) => {
            camHole({ x: 0, y: 0, w: 472, h: 266, R: 86, r: 12 }, "CAMERA", b);
            cluster(-70, -50, { w: 230, h: 180, anchor: "tl", seed: 61, flowers: 6, leaves: 6, size: 0.7 }, b);
          },
        },
      };
      const ORDER = ["profile", "goal", "clock", "chat", "dock", "cam"];
      const boxes = {};
      for (const id of ORDER) {
        if (!items()[id]?.show) continue;
        const d = DEFS[id];
        const b = place(el("div", "hud-item"), 0, 0, d.w, d.h);
        d.make(b);
        boxes[id] = b;
      }

      const M = 32, GAP = 18;
      function layout() {
        const groups = {};
        for (const id of ORDER) if (boxes[id]) (groups[items()[id].pos || "tl"] ||= []).push(id);
        for (const [pos, ids] of Object.entries(groups)) {
          const [row, col] = pos;
          const sizes = ids.map((id) => {
            const s = Math.max(0.3, (Number(items()[id].scale) || 100) / 100);
            const pad = DEFS[id].pad || 0, b = boxes[id];
            return { id, s, pad, w: (b.offsetWidth + 2 * pad) * s, h: (b.offsetHeight + 2 * pad) * s };
          });
          const total = sizes.reduce((a, z) => a + z.h, 0) + GAP * (sizes.length - 1);
          let y = row === "t" ? M : row === "b" ? H - M - total : (H - total) / 2;
          for (const z of sizes) {
            const x = col === "l" ? M : col === "r" ? W - M - z.w : (W - z.w) / 2;
            const b = boxes[z.id];
            b.style.left = x + z.pad * z.s + "px";
            b.style.top = y + z.pad * z.s + "px";
            b.style.scale = z.s;
            y += z.h + GAP;
          }
        }
      }
      layout();
      document.fonts?.ready.then(layout); // nameplate width depends on the web font
      Bus.on("config", layout);

      Wd.AlertQueue(place(el("div"), 460, 40, 1000, 400), { enabled: () => !boxes.chat || ui().alerts.toastInChatScenes });
      // Showing/hiding rebuilds the scene; anchor and scale changes re-layout live.
      let sig = null;
      Bus.on("config", () => {
        const s = JSON.stringify(ORDER.map((id) => !!items()[id]?.show));
        if (sig !== null && s !== sig) location.reload();
        sig = s;
      });
      return chat;
    },

    ending() {
      backdrop(null, { petals: 34 });
      cluster(-40, -40, { w: 560, h: 420, anchor: "tl", seed: 71, flowers: 15, leaves: 16 });
      cluster(-40, H - 420, { w: 520, h: 420, anchor: "bl", seed: 72, flowers: 13, leaves: 14 });
      cluster(W - 360, H - 330, { w: 380, h: 330, anchor: "br", seed: 73, flowers: 8, leaves: 9, size: 0.8 });
      const s0 = sc();
      const withCredits = s0.showCredits !== false;
      const heroX = withCredits ? 60 : 0, heroW = withCredits ? 1240 : W;
      const hero = place(el("div", "hero hero-end", `
        <div class="hero-kicker"></div>
        <h1 class="hero-title"></h1>
        <div class="hero-tag"></div>
        ${ornament()}
        <div class="end-socials"></div>`), heroX, 40, heroW, 920);
      if (s0.showSocials !== false) Wd.Socials(hero.querySelector(".end-socials"), { all: true });
      if (withCredits) {
        const r = { x: 1360, y: 96, w: 500, h: 860 };
        place(el("div", "chat-bg glass"), r.x, r.y, r.w, r.h);
        FX.frame(stage, { ...r, label: "THANK YOU" });
        const box = place(el("div", "credits", `<div class="cr-title"></div><div class="cr-viewport"><div class="cr-roll"></div></div>`), r.x + 20, r.y + 30, r.w - 40, r.h - 50);
        const roll = box.querySelector(".cr-roll");
        Bus.on("donate_state", (d) => {
          const top = d.top || [];
          const rows = top.map((t) => `<div class="cr-row r${t.rank}"><span class="cr-rank">${t.rank}</span><span class="cr-name">${esc(t.name)}</span><span class="cr-amt">${OS.money2(t.amount)}</span></div>`).join("");
          const latest = (d.latest || []).slice(0, 8).map((t) => `<div class="cr-mini"><span>${esc(t.name)}</span><b>${OS.money2(t.amount)}</b></div>`).join("");
          const html = (rows || `<div class="cr-empty">ขอบคุณทุกคนที่มาดูนะ ♡</div>`) + (latest ? `<div class="cr-sub tiny-label">LATEST SUPPORT</div>${latest}` : "");
          if (html === roll.dataset.html) return;
          roll.dataset.html = html;
          roll.innerHTML = html;
          roll.classList.remove("rolling");
          requestAnimationFrame(() => {
            if (roll.dataset.html !== html) return; // superseded by a newer update
            if (roll.scrollHeight > box.querySelector(".cr-viewport").clientHeight) {
              roll.innerHTML = html + `<div class="cr-gap"></div>` + html;
              roll.style.setProperty("--roll-dur", Math.max(12, top.length * 2.4) + "s");
              roll.classList.add("rolling");
            }
          });
        });
        Bus.on("config", () => { box.querySelector(".cr-title").textContent = sc().creditsTitle || "ขอบคุณผู้สนับสนุน"; });
      }
      petalsOver(6);
      dock(withCredits ? heroX + 40 : 340, 984, withCredits ? heroW - 80 : 1240, ["top", "latest", "viewers", "socials"]);
      Wd.AlertQueue(place(el("div"), 0, 0, withCredits ? 1300 : W, 400));
      Bus.on("config", () => {
        const s = sc();
        hero.querySelector(".hero-kicker").textContent = s.kicker || "";
        waveText(hero.querySelector(".hero-title"), s.title || "");
        hero.querySelector(".hero-tag").textContent = s.tagline || "";
      });
      watchLayout(["showCredits", "showSocials", "showBar"]);
      return null;
    },

    chat() {
      document.body.classList.add("fluid");
      const host = el("div", "chat-host fluid-chat");
      document.body.appendChild(host);
      return Wd.ChatPanel(host);
    },

    alerts() {
      Wd.AlertQueue(place(el("div"), 460, 40, 1000, 400), { always: true });
      return null;
    },
  };

  if (kind === "scene" || name === "alerts") fitStage(stage, W, H);

  // The layout depends on the scene toggles, so load the saved config before building.
  async function start() {
    for (;;) {
      try {
        const snap = await fetch("/api/state").then((r) => r.json());
        Bus.state.config = snap.config;
        Bus.state.ui = OS.normalizeUI(snap.config.ui);
        Bus.state.countdown = snap.countdown;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 2000)); // app not running yet; OBS keeps the source loaded
      }
    }
    const build = scenes[name];
    const chat = build ? build() : null;
    if (demo) Wd.startDemo(chat);
    Bus.connect();
  }
  start();
})();
