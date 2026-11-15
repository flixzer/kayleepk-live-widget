// Overlay Studio control panel.
(function () {
  const { Bus, esc, money2, compact, fitStage, deepMerge, clone, DEFAULT_UI, ICONS, ago, viewerTotals } = OS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const stage = $("#stage");

  // ---------------------------------------------------------------- UI icons (inline SVG, follow currentColor)
  const ICON_PATHS = {
    youtube: '<rect x="2.5" y="5" width="19" height="14" rx="4"/><path d="M10.2 9.3v5.4l4.6-2.7z" fill="currentColor"/>',
    twitch: '<path d="M4.5 3h15v10.5L15.5 17.5h-4l-3 3v-3h-4z"/><path d="M11 7.5v4M15 7.5v4"/>',
    heart: '<path d="M12 20s-7-4.3-8.8-8.6C1.9 8.1 4 4.8 7.3 4.8c1.9 0 3.3 1 4.7 2.7 1.4-1.7 2.8-2.7 4.7-2.7 3.3 0 5.4 3.3 4.1 6.6C19 15.7 12 20 12 20z"/>',
    hourglass: '<path d="M6 3h12M6 21h12M7.5 3c0 4.5 4.5 6 4.5 9s-4.5 4.5-4.5 9M16.5 3c0 4.5-4.5 6-4.5 9s4.5 4.5 4.5 9"/>',
    chat: '<path d="M7 18H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7l-5 3.5z"/><path d="M8 9.5h8M8 13h5"/>',
    gamepad: '<path d="M7 7h10a4 4 0 0 1 4 4v3.5a2.5 2.5 0 0 1-4.6 1.4L15 14H9l-1.4 1.9A2.5 2.5 0 0 1 3 14.5V11a4 4 0 0 1 4-4z"/><path d="M8 9.5v3.5M6.25 11.25h3.5M15.5 10.5h.01M17.5 12.5h.01"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
    star: '<path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
    eraser: '<path d="M20 20H9.5M15.5 4l5 5-9.5 9.5H7L3.5 15z"/><path d="m10 9.5 5 5"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5M4 3.5v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20.5v-4h-4"/>',
    reset: '<path d="M3.5 4v5h5"/><path d="M4.3 9A8 8 0 1 1 4 13.5"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    gem: '<path d="M6.5 4h11l3.5 5-9 11L3 9z"/><path d="M3 9h18M12 20 8.5 9l1.5-5M12 20l3.5-11L14 4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17z"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    play: '<path d="M7.5 5v14L19 12z" fill="currentColor"/>',
    pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3.2"/>',
    pin: '<path d="M9 3.5h6l-1 5.5 3.5 3.5V14h-11v-1.5L10 9z"/><path d="M12 14v6.5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  };
  const ic = (name, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
  for (const e of document.querySelectorAll("[data-ic]")) e.insertAdjacentHTML("afterbegin", ic(e.dataset.ic));
  fitStage(stage);
  $("#stage").prepend(FX.milkyWay({ seed: 12, from: [0.15, 1.05], to: [1.05, -0.05], width: 0.14 }));
  FX.Sky($("#studio-sky"), { stars: 120, bright: 3, meteors: 0.6, dust: 0, top: 1 });
  $(".brand-logo").innerHTML = ICONS.sparkle;
  const sideStars = FX.constellations({ w: 260, h: 220, anchor: "tr", seed: 88, sparkles: 4, stars: 8, size: 0.7 });
  sideStars.style.right = "-30px"; sideStars.style.top = "-30px";
  $(".side").appendChild(sideStars);

  const ORIGIN = location.origin.replace("localhost", "127.0.0.1");
  $("#host").textContent = location.host;

  // ---------------------------------------------------------------- config model
  let cfg = null; // full config incl. secrets (local only)
  async function loadConfig() {
    const raw = await fetch("/api/config").then((r) => r.json());
    raw.ui = OS.normalizeUI(raw.ui);
    cfg = raw;
  }
  const getPath = (p) => p.split(".").reduce((o, k) => (o == null ? undefined : o[k]), cfg);
  function setPath(p, v) {
    const ks = p.split(".");
    let o = cfg;
    for (const k of ks.slice(0, -1)) o = o[k] ??= {};
    o[ks.at(-1)] = v;
  }
  let saveTimer;
  function save(now) {
    clearTimeout(saveTimer);
    const run = async () => {
      const r = await fetch("/api/config", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(cfg) });
      toast(r.ok ? "บันทึกแล้ว" : "บันทึกไม่สำเร็จ", r.ok ? "check" : "x");
    };
    if (now) run(); else saveTimer = setTimeout(run, 350);
  }

  let toastTimer;
  function toast(msg, icon) {
    const t = $("#toast");
    t.innerHTML = (icon ? ic(icon) : "") + `<span>${esc(msg)}</span>`;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  }
  const post = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) }).then((r) => r.json().catch(() => ({})));

  // ---------------------------------------------------------------- form builders
  const F = {
    sec: (t, chip) => `<div class="sec">${chip ? `<span class="sec-chip">${chip}</span>` : ""}<span class="sec-t">${t}</span></div>`,
    text: (p, label, o = {}) => `<div class="field" ${o.showIf ? `data-show-if="${o.showIf}"` : ""}><label>${label}</label><input class="inp" type="${o.type || "text"}" data-path="${p}" placeholder="${esc(o.ph || "")}" ${o.lazy ? "data-lazy" : ""}>${o.hint ? `<div class="hint">${o.hint}</div>` : ""}</div>`,
    num: (p, label, o = {}) => `<div class="field" ${o.showIf ? `data-show-if="${o.showIf}"` : ""}><label>${label}</label><input class="inp" type="number" data-path="${p}" data-type="num" min="${o.min ?? ""}" max="${o.max ?? ""}" step="${o.step ?? 1}">${o.hint ? `<div class="hint">${o.hint}</div>` : ""}</div>`,
    toggle: (p, label, hint) => `<label class="toggle"><input type="checkbox" data-path="${p}" data-type="bool"><span class="sw"></span><span>${label}${hint ? `<span class="t-hint">${hint}</span>` : ""}</span></label>`,
    select: (p, label, opts, o = {}) => `<div class="field" ${o.showIf ? `data-show-if="${o.showIf}"` : ""}><label>${label}</label><select class="inp" data-path="${p}">${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>${o.hint ? `<div class="hint">${o.hint}</div>` : ""}</div>`,
    range: (p, label, min, max, step = 1, suffix = "") => `<div class="field"><label>${label}</label><div class="range"><input type="range" data-path="${p}" data-type="num" min="${min}" max="${max}" step="${step}"><output data-suffix="${suffix}"></output></div></div>`,
    dt: (p, label, showIf) => `<div class="field" ${showIf ? `data-show-if="${showIf}"` : ""}><label>${label}</label><input class="inp" type="datetime-local" data-path="${p}"></div>`,
    time: (p, label, showIf) => `<div class="field" ${showIf ? `data-show-if="${showIf}"` : ""}><label>${label}</label><input class="inp" type="time" data-path="${p}"></div>`,
    // HUD element row: on/off, 3×3 anchor picker, scale slider.
    hudItem: (base, label) => `
      <div class="hud-row">
        ${F.toggle(`${base}.show`, label)}
        <div class="hud-ctl" data-show-if="${base}.show=true">
          <div class="posgrid" data-pos-path="${base}.pos" title="ตำแหน่งบนจอ">
            ${["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"].map((p) => `<button type="button" data-pos="${p}"></button>`).join("")}
          </div>
          <div class="range hud-scale"><input type="range" data-path="${base}.scale" data-type="num" min="50" max="160" step="5"><output data-suffix="%"></output></div>
        </div>
      </div>`,
  };
  const RANGE_OPTS = [["all", "ทั้งหมด"], ["today", "วันนี้"], ["week", "7 วันล่าสุด"], ["month", "เดือนนี้"], ["session", "ตั้งแต่เปิดโปรแกรม (ไลฟ์นี้)"], ["custom", "กำหนดวันที่เอง"]];
  const rangeBlock = (base, title) => `
    ${F.select(`${base}.preset`, `ช่วงเวลา ${title}`, RANGE_OPTS)}
    <div class="dt-pair" data-show-if="${base}.preset=custom">${F.dt(`${base}.start`, "เริ่มต้น")}${F.dt(`${base}.end`, "สิ้นสุด (เว้นว่าง = ถึงตอนนี้)")}</div>`;

  function bindForm(root) {
    for (const inp of $$("[data-path]", root)) {
      const p = inp.dataset.path, type = inp.dataset.type;
      const v = getPath(p);
      if (type === "bool") inp.checked = !!v;
      else inp.value = v ?? "";
      const out = inp.parentElement.querySelector("output");
      const showOut = () => out && (out.textContent = inp.value + (out.dataset.suffix || ""));
      showOut();
      const commit = () => {
        let val = type === "bool" ? inp.checked : inp.value;
        if (type === "num") val = inp.value === "" ? 0 : Number(inp.value);
        setPath(p, val);
        showOut();
        refreshShowIf(root);
        save();
      };
      inp.addEventListener("change", commit);
      if (type === "num" && inp.type === "range") inp.addEventListener("input", showOut);
      if (inp.tagName === "INPUT" && inp.type === "text" && !("lazy" in inp.dataset)) {
        let t;
        inp.addEventListener("input", () => { clearTimeout(t); t = setTimeout(commit, 600); });
      }
    }
    for (const grid of $$("[data-pos-path]", root)) {
      const p = grid.dataset.posPath;
      const mark = () => $$("button", grid).forEach((b) => b.classList.toggle("on", b.dataset.pos === getPath(p)));
      mark();
      grid.addEventListener("click", (e) => {
        const b = e.target.closest("[data-pos]");
        if (!b) return;
        setPath(p, b.dataset.pos);
        mark();
        save();
      });
    }
    refreshShowIf(root);
  }

  // Socials: drag a row by its handle to change the order shown on the overlays.
  function bindSocialDrag() {
    let from = null;
    for (const row of $$(".social-row")) {
      row.addEventListener("dragstart", (e) => { from = Number(row.dataset.i); row.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
      row.addEventListener("dragend", () => { row.classList.remove("dragging"); $$(".social-row").forEach((r) => r.classList.remove("drop-above", "drop-below")); });
      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        const r = row.getBoundingClientRect(), below = e.clientY > r.top + r.height / 2;
        row.classList.toggle("drop-below", below);
        row.classList.toggle("drop-above", !below);
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop-above", "drop-below"));
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const list = cfg.ui.profile.socials;
        const r = row.getBoundingClientRect();
        let to = Number(row.dataset.i) + (e.clientY > r.top + r.height / 2 ? 1 : 0);
        if (from == null || to === from || to === from + 1) return;
        const [moved] = list.splice(from, 1);
        if (to > from) to--;
        list.splice(to, 0, moved);
        save();
        go("profile");
      });
    }
  }
  function refreshShowIf(root) {
    for (const n of $$("[data-show-if]", root)) {
      // "path=value" or "path!=value"
      const neg = n.dataset.showIf.includes("!=");
      const [p, v] = n.dataset.showIf.split(neg ? "!=" : "=");
      n.style.display = (String(getPath(p)) === v) !== neg ? "" : "none";
    }
  }

  // ---------------------------------------------------------------- pages
  const PAGES = [
    { id: "youtube", ico: "youtube", t: "YouTube Live", s: "เลือกช่อง / ไลฟ์ที่ดึงแชท", url: "/widget/chat", sub: "เลือกไลฟ์ที่จะดึงแชท (innertube — ไม่ต้องใช้ API key)", size: "Chat only · แนะนำ 450 × 800" },
    { id: "twitch", ico: "twitch", t: "Twitch", s: "แชท + ยอดคนดู (ไม่ใช้ API key)", url: "/widget/chat", sub: "ดึงแชทและยอดคนดูจาก Twitch โดยไม่ต้องใช้ API key — รวมกับแชท YouTube ในช่องเดียวกัน", size: "Chat only · แนะนำ 450 × 800" },
    { id: "easydonate", ico: "heart", t: "EasyDonate", s: "API · Goal · Top · Latest", url: "/scene/chatting", sub: "เชื่อมต่อ API เพื่อดึงโดเนท หลอดเป้าหมาย Top & Latest", size: "1920 × 1080" },
    { id: "starting", ico: "hourglass", t: "Starting Soon", s: "นับถอยหลัง + ต้อนรับ", url: "/scene/starting", sub: "หน้าก่อนเริ่มไลฟ์ — นับถอยหลังใต้ท้องฟ้าเต็มไปด้วยดาว", size: "1920 × 1080" },
    { id: "chatting", ico: "chat", t: "Just Chatting", s: "แชทซ้าย + กล้องทรงโค้ง", url: "/scene/chatting", sub: "แชทด้านซ้าย กล้องทรงซุ้มโค้ง และการ์ดโดเนทใต้กล้อง", size: "1920 × 1080" },
    { id: "gameplay", ico: "gamepad", t: "Gameplay", s: "กล้องเล็ก + แจ้งเตือน", url: "/scene/gameplay", sub: "พื้นหลังโปร่งใส วางทับเกม — กล้องทรงโค้งมุมขวาล่าง", size: "1920 × 1080" },
    { id: "ending", ico: "moon", t: "Stream Ended", s: "ขอบคุณ + เครดิตผู้สนับสนุน", url: "/scene/ending", sub: "ปิดไลฟ์อย่างอบอุ่น พร้อมรายชื่อผู้สนับสนุน", size: "1920 × 1080" },
    { id: "profile", ico: "user", t: "ข้อมูลช่อง", s: "ชื่อ · โซเชียล · หัวข้อ", url: "/scene/chatting", sub: "ข้อมูลที่ใช้ร่วมกันทุกซีน", size: "1920 × 1080" },
  ];

  $("#nav").innerHTML = PAGES.map((p) => `<button class="nav-item" data-page="${p.id}"><span class="nav-ico">${ic(p.ico)}</span><span><div class="nav-t">${p.t}</div><div class="nav-s">${p.s}</div></span></button>`).join("");
  $("#nav").addEventListener("click", (e) => { const b = e.target.closest("[data-page]"); if (b) go(b.dataset.page); });
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-goto]"); if (b) go(b.dataset.goto); });

  let page = null;
  function go(id) {
    page = PAGES.find((p) => p.id === id) || PAGES[0];
    localStorage.setItem("os-page", page.id);
    $$(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.page === page.id));
    $("#page-title").textContent = page.t;
    $("#page-sub").textContent = page.sub;
    $("#url-text").textContent = ORIGIN + page.url;
    $("#url-size").textContent = page.size;
    const fluid = page.url.startsWith("/widget/");
    $("#preview-box").innerHTML = `<iframe class="${fluid ? "fluid" : ""}" src="${page.url}?preview&demo"></iframe>`;
    const R = RENDER[page.id];
    $("#settings").innerHTML = R.settings();
    $("#extras").innerHTML = R.extras ? R.extras() : "";
    bindForm($("#settings"));
    bindForm($("#extras"));
    R.after && R.after();
  }

  $("#copy-url").addEventListener("click", async () => {
    const url = $("#url-text").textContent;
    try { await navigator.clipboard.writeText(url); }
    catch {
      const ta = document.createElement("textarea"); ta.value = url; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    toast("คัดลอก URL แล้ว — วางใน OBS › Browser Source");
  });
  $("#open-url").addEventListener("click", () => window.open($("#url-text").textContent, "_blank"));
  $("#reload-preview").addEventListener("click", () => { const f = $("#preview-box iframe"); if (f) f.src = f.src; });
  $("#open-folder").addEventListener("click", () => post("/api/open-folder"));
  $("#modal-x").addEventListener("click", () => $("#modal").classList.remove("show"));

  const obsHelp = (extra = "") => `
    <div class="help">
      <h3>เพิ่มลง OBS</h3>
      <ul>
        <li>กด <b>คัดลอก URL</b> แล้วใน OBS เพิ่ม <b>Browser Source</b> › วาง URL</li>
        <li>ตั้ง Width <b>1920</b> Height <b>1080</b> (ซีนปรับสเกลให้อัตโนมัติถ้าใช้ขนาดอื่นที่เป็น 16:9)</li>
        <li>วาง Video Capture (กล้อง) ไว้ <b>ใต้</b> Browser Source — ช่องกล้องเป็นพื้นที่โปร่งใส</li>
        ${extra}
      </ul>
    </div>
    <div class="btn-row">
      <button class="btn btn-rose" data-act="test-donate">${ic("heart")}ทดสอบโดเนท</button>
      <button class="btn" data-act="test-chat">${ic("chat")}ทดสอบแชท</button>
      <button class="btn" data-act="test-sc">${ic("star")}ทดสอบ Super Chat</button>
    </div>`;

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    if (act === "test-donate") {
      const n = $("#td-name")?.value, a = Number($("#td-amt")?.value) || undefined, m = $("#td-msg")?.value;
      await post("/api/test/donation", { name: n || undefined, amount: a, message: m || undefined });
      toast("ส่งโดเนททดสอบแล้ว");
    } else if (act === "test-chat") {
      const msgs = ["สวัสดีครับ 👋", "ธีมดาวสวยมากเลย ✨", "วันนี้เล่นอะไรครับ", "มาแล้วววว"];
      await post("/api/test/chat", { name: "@viewer" + Math.floor(Math.random() * 99), message: msgs[Math.floor(Math.random() * msgs.length)] });
    } else if (act === "test-sc") {
      await post("/api/test/chat", { name: "@supporter", message: "Super Chat ทดสอบ ✨", kind: "superchat" });
    } else if (act === "tw-test-chat") {
      const msgs = ["สวัสดีจาก Twitch 👋", "PogChamp ธีมดาวสวยมาก", "มาแล้วครับ", "GG"];
      await post("/api/test/chat", { source: "twitch", name: "twitch_viewer" + Math.floor(Math.random() * 99), message: msgs[Math.floor(Math.random() * msgs.length)] });
    } else if (act === "tw-test-bits") {
      await post("/api/test/chat", { source: "twitch", kind: "superchat", name: "cheer_fan", message: "Cheer100 สู้ ๆ นะ ✨" });
    } else if (act === "tw-reconnect") {
      await post("/api/tw/reconnect"); toast("กำลังเชื่อมต่อ Twitch ใหม่…");
    } else if (act === "tw-connect") {
      cfg.twitch = { ...(cfg.twitch || {}), channel: $("#tw-q").value.trim() };
      save(true);
      toast(cfg.twitch.channel ? "กำลังเชื่อมต่อ Twitch…" : "ปิดการดึงแชท Twitch แล้ว");
    } else if (act === "clear-chat") {
      await post("/api/chat/clear"); toast("ล้างแชทแล้ว");
    } else if (act === "yt-reconnect") {
      await post("/api/yt/reconnect"); toast("กำลังเชื่อมต่อใหม่…");
    } else if (act === "ed-raw") {
      const raw = await fetch("/api/ed/raw").then((r) => r.json());
      $("#modal-body").textContent = Object.keys(raw).length ? JSON.stringify(raw, null, 2) : "ยังไม่มีข้อมูล — ใส่ API key แล้วรอสักครู่";
      $("#modal").classList.add("show");
    } else if (act === "ed-refresh") {
      await post("/api/ed/refresh"); toast("กำลังดึงข้อมูลใหม่…");
    } else if (act === "ed-test") {
      const key = $("[data-path='easydonate.api_key']").value.trim();
      const out = $("#ed-test-out");
      out.innerHTML = `<span class="spinner"></span> กำลังทดสอบ…`;
      const r = await post("/api/ed/test", { api_key: key });
      const line = (label, x) => `<div>${x.ok ? `<span class='ok'>${ic("check", "ic-sm")}</span>` : `<span class='bad'>${ic("x", "ic-sm")}</span>`} ${label}${x.ok ? "" : ` — <span class="bad">${esc(x.message)}</span>`}</div>`;
      out.innerHTML = (r.account ? `<div>บัญชี: <b>${esc(r.account)}</b></div>` : "") + line("ข้อมูลบัญชี (read:profile)", r.profile) + line("รายการโดเนท (read:donations)", r.donations) + line("วิดเจ็ต goal (read:widgets)", r.widgets);
    } else if (act === "toggle-key") {
      const i = $("[data-path='easydonate.api_key']"); i.type = i.type === "password" ? "text" : "password";
    } else if (act === "add-social") {
      cfg.ui.profile.socials.push({ kind: "youtube", handle: "" }); save(); go("profile");
    } else if (act === "del-social") {
      cfg.ui.profile.socials.splice(Number(b.dataset.i), 1); save(); go("profile");
    } else if (act === "cd-toggle" || act === "cd-reset" || act === "cd-add") {
      const c = Bus.state.countdown || {};
      const ms = (Number(cfg.ui.scenes.starting.countdownMin) || 0) * 60000;
      let body;
      if (act === "cd-reset") body = { action: "reset", ms };
      else if (act === "cd-add") body = { action: "add", ms: Number(b.dataset.ms) };
      else if (c.running) body = { action: "pause" };
      else if (c.remaining_ms == null || c.remaining_ms <= 0) body = { action: "start", ms };
      else body = { action: "resume" };
      Bus.state.countdown = await post("/api/countdown", body);
      renderCountdown();
    } else if (act === "reset-scene") {
      cfg.ui.scenes[b.dataset.scene] = clone(DEFAULT_UI.scenes[b.dataset.scene]); cfg.ui = OS.normalizeUI(cfg.ui); save(true); go(b.dataset.scene);
    }
  });

  // ---------------------------------------------------------------- page renderers
  const RENDER = {
    youtube: {
      settings: () => `
        <div class="yt-head"><span class="yt-chip">YOUTUBE</span><span class="page-sub">เลือกไลฟ์ที่จะดึงแชท</span></div>
        <div class="field"><label>ชื่อช่อง YouTube</label>
          <div class="row"><input class="inp" id="yt-q" placeholder="@channel" value="${esc(cfg.youtube.channel)}"><button class="btn btn-primary" id="yt-search">${ic("search")}ค้นหาไลฟ์</button></div>
          <div class="hint">เช่น @flixzer · https://youtube.com/@flixzer · UCxxxx · หรือวางลิงก์ไลฟ์โดยตรง</div>
        </div>
        <div class="stream-list" id="yt-list"></div>`,
      extras: () => `
        ${F.sec("ตั้งค่าแชท")}
        <div class="mini-grid">
          ${F.range("ui.chat.max", "จำนวนข้อความสูงสุด", 5, 80, 1)}
          ${F.range("ui.chat.fontSize", "ขนาดตัวอักษร", 14, 36, 1, "px")}
          ${F.range("ui.chat.hideAfter", "ซ่อนข้อความหลัง (0 = ไม่ซ่อน)", 0, 120, 5, "s")}
          ${F.toggle("ui.chat.avatars", "แสดงรูปโปรไฟล์")}
          ${F.toggle("ui.chat.badges", "แสดงป้าย Owner / Mod / Member")}
          ${F.toggle("ui.chat.donateCards", "การ์ดโดเนทในช่องแชท")}
        </div>
        <div class="btn-row">
          <button class="btn" data-act="test-chat">${ic("chat")}ทดสอบแชท</button>
          <button class="btn" data-act="test-sc">${ic("star")}ทดสอบ Super Chat</button>
          <button class="btn btn-rose" data-act="test-donate">${ic("heart")}ทดสอบโดเนท</button>
          <button class="btn" data-act="clear-chat">${ic("eraser")}ล้างแชท</button>
          <button class="btn" data-act="yt-reconnect">${ic("refresh")}เชื่อมต่อใหม่</button>
        </div>`,
      after() {
        $("#yt-search").addEventListener("click", ytSearch);
        $("#yt-q").addEventListener("keydown", (e) => { if (e.key === "Enter") ytSearch(); });
        renderStreams(lastStreams);
        if (cfg.youtube.channel && !lastStreams) ytSearch();
      },
    },

    twitch: {
      settings: () => `
        <div class="yt-head"><span class="yt-chip tw-chip">TWITCH</span><span class="page-sub">แชท + ยอดคนดู ไม่ต้องใช้ API key</span></div>
        <div class="field"><label>ชื่อช่อง Twitch</label>
          <div class="row"><input class="inp" id="tw-q" placeholder="kayleepk" value="${esc(cfg.twitch?.channel || "")}"><button class="btn btn-primary" data-act="tw-connect">${ic("link")}เชื่อมต่อ</button></div>
          <div class="hint">เช่น kayleepk · @kayleepk · https://twitch.tv/kayleepk — เว้นว่างแล้วกดเชื่อมต่อ = ปิด Twitch</div>
        </div>
        <div class="tw-status" id="tw-status"></div>
        <div class="help"><h3>ทำงานอย่างไร</h3><ul>
          <li>แชท: เชื่อมต่อ Twitch IRC แบบผู้ชมไม่ล็อกอิน (อ่านอย่างเดียว) — ไม่ต้องใช้บัญชีหรือ API key</li>
          <li>ยอดคนดู ชื่อไลฟ์ และหมวดเกม: อัปเดตทุก 20 วินาทีจากข้อมูลสาธารณะของหน้าเว็บ Twitch</li>
          <li>แชท Twitch ขึ้นในช่องแชทเดียวกับ YouTube · Bits ขึ้นเป็นการ์ดสีม่วง · ยอดคนดูรวมสองแพลตฟอร์ม</li>
        </ul></div>`,
      extras: () => `
        ${F.sec("ทดสอบ")}
        <div class="btn-row">
          <button class="btn" data-act="tw-test-chat">${ic("chat")}ทดสอบแชท Twitch</button>
          <button class="btn" data-act="tw-test-bits">${ic("gem")}ทดสอบ Bits</button>
          <button class="btn" data-act="clear-chat">${ic("eraser")}ล้างแชท</button>
          <button class="btn" data-act="tw-reconnect">${ic("refresh")}เชื่อมต่อใหม่</button>
        </div>
        <div class="hint">ตั้งค่าหน้าตาแชท (จำนวนข้อความ ขนาดตัวอักษร ป้าย) ได้ที่หน้า YouTube Live — ใช้ร่วมกันทั้งสองแพลตฟอร์ม</div>`,
      after() {
        $("#tw-q").addEventListener("keydown", (e) => { if (e.key === "Enter") $("[data-act='tw-connect']").click(); });
        renderTwitch();
      },
    },

    easydonate: {
      settings: () => `
        ${F.sec("การเชื่อมต่อ", "API")}
        <div class="field"><label>API key (ezdn_v1_…)</label>
          <div class="row"><input class="inp" type="password" data-path="easydonate.api_key" data-lazy placeholder="ezdn_v1_xxxxxxxx"><button class="btn" data-act="toggle-key" title="แสดง/ซ่อน">${ic("eye")}</button></div>
          <div class="hint">สร้างได้ที่ easydonate.app › หน้าจัดการ › โซนผู้พัฒนา › API Keys — เลือก scope <b>read:donations</b>, <b>read:widgets</b> (และ read:profile ถ้าต้องการชื่อบัญชี)</div>
        </div>
        <div class="row"><button class="btn btn-primary" data-act="ed-test">ทดสอบการเชื่อมต่อ</button><button class="btn" data-act="ed-refresh">${ic("refresh")}ดึงข้อมูลใหม่</button></div>
        <div class="test-result" id="ed-test-out"></div>
        ${F.range("easydonate.poll_secs", "ตรวจโดเนทใหม่ทุก", 3, 30, 1, " วิ")}

        ${F.sec("หลอดโดเนท (Goal)")}
        ${F.select("easydonate.goal.source", "แหล่งข้อมูล", [["easydonate", "ใช้ Goal ที่ตั้งไว้ใน EasyDonate"], ["custom", "กำหนดเอง (รวมยอดตามช่วงเวลา)"], ["off", "ปิด"]])}
        <div data-show-if="easydonate.goal.source=custom">
          ${F.text("easydonate.goal.title", "ชื่อเป้าหมาย", { ph: "ช่วยค่าคอนโดผมที" })}
          ${F.num("easydonate.goal.target", "ยอดเป้าหมาย (บาท)", { min: 1 })}
          ${rangeBlock("easydonate.goal.range", "ที่นับยอด")}
        </div>

        ${F.sec("Top Donate (สลับอันดับ 1–10)")}
        ${rangeBlock("easydonate.top", "Top Donate")}
        <div class="two">
          ${F.num("easydonate.top.count", "จำนวนอันดับ", { min: 1, max: 10 })}
          ${F.num("ui.bar.rotateSecs", "สลับทุก (วินาที)", { min: 2, max: 30 })}
        </div>

        ${F.sec("Latest Donate")}
        ${rangeBlock("easydonate.latest", "Latest Donate")}
        ${F.num("easydonate.latest.count", "จำนวนรายการที่สลับแสดง", { min: 1, max: 10 })}

        ${F.sec("แจ้งเตือน")}
        ${F.toggle("ui.chat.donateCards", "โดเนทขึ้นเป็นการ์ดในช่องแชท")}
        ${F.toggle("ui.alerts.sound", "เสียงกระดิ่งเมื่อมีโดเนท")}
        ${F.toggle("ui.alerts.popup", "ป๊อปอัพแจ้งเตือนกลางจอ", "ปิดไว้ = โดเนทขึ้นเป็นการ์ดในแชทอย่างเดียว (วิดเจ็ต /widget/alerts แสดงเสมอ)")}
        <div data-show-if="ui.alerts.popup=true">
          ${F.toggle("ui.alerts.toastInChatScenes", "แสดงป๊อปอัพในซีนที่มีแชทด้วย", "ปกติป๊อปอัพจะแสดงเฉพาะซีนที่ไม่มีช่องแชท")}
          ${F.num("ui.alerts.duration", "แสดงป๊อปอัพนาน (วินาที)", { min: 3, max: 30 })}
        </div>
        ${F.num("ui.alerts.minAmount", "ยอดขั้นต่ำที่แจ้งเตือน (บาท)", { min: 0 })}`,
      extras: () => `
        <div class="status-line"><span>สถานะ:</span><b id="ed-state">—</b><span style="flex:1"></span>
          <button class="btn btn-sm" data-act="ed-raw">{ } ดูข้อมูลดิบ</button></div>
        <div class="data-cols">
          <div class="data-box"><span class="tiny-label">TOP DONATE</span><div id="ed-top"></div></div>
          <div class="data-box"><span class="tiny-label">LATEST DONATE</span><div id="ed-latest"></div></div>
          <div class="data-box"><span class="tiny-label">GOAL</span><div id="ed-goal"></div></div>
        </div>
        <div class="test-form">
          <input class="inp" id="td-name" placeholder="ชื่อผู้โดเนท">
          <input class="inp" id="td-amt" type="number" placeholder="฿" value="100">
          <input class="inp" id="td-msg" placeholder="ข้อความ">
          <button class="btn btn-rose" data-act="test-donate">${ic("heart")}ทดสอบ</button>
        </div>`,
      after() { renderEdData(); renderEdStatus(); },
    },

    starting: {
      settings: () => `
        ${F.sec("ข้อความ")}
        ${F.text("ui.scenes.starting.kicker", "ข้อความเล็กด้านบน")}
        ${F.text("ui.scenes.starting.title", "หัวข้อใหญ่")}
        ${F.text("ui.scenes.starting.tagline", "ข้อความด้านล่าง")}
        ${F.sec("นับถอยหลัง")}
        ${F.select("ui.scenes.starting.countdownMode", "รูปแบบ", [["manual", "ควบคุมด้วยปุ่ม (เริ่ม / หยุด / รีเซ็ต)"], ["load", "นับจากตอนเปิดซีน"], ["time", "นับถึงเวลาที่กำหนด"]])}
        <div data-show-if="ui.scenes.starting.countdownMode!=time">${F.num("ui.scenes.starting.countdownMin", "จำนวนนาที", { min: 0, max: 180 })}</div>
        <div class="cd-ctl" data-show-if="ui.scenes.starting.countdownMode=manual">
          <div class="cd-ctl-time" id="cd-ctl-time">--:--</div>
          <div class="btn-row">
            <button class="btn btn-primary" data-act="cd-toggle" id="cd-toggle">${ic("play")}เริ่ม</button>
            <button class="btn" data-act="cd-reset">${ic("reset")}รีเซ็ต</button>
            <button class="btn btn-sm" data-act="cd-add" data-ms="-60000">${ic("minus")}1 นาที</button>
            <button class="btn btn-sm" data-act="cd-add" data-ms="60000">${ic("plus")}1 นาที</button>
          </div>
        </div>
        ${F.time("ui.scenes.starting.countdownTime", "เริ่มไลฟ์เวลา", "ui.scenes.starting.countdownMode=time")}
        ${F.text("ui.scenes.starting.countdownDone", "ข้อความเมื่อนับครบ")}
        ${F.sec("องค์ประกอบ")}
        ${F.toggle("ui.scenes.starting.showChat", "แสดงช่องแชท")}
        ${F.toggle("ui.scenes.starting.showTopic", "แสดงหัวข้อไลฟ์")}
        ${F.toggle("ui.scenes.starting.showBar", "แสดงแถบลอย", "Top · Latest · ยอดคนดู · โซเชียล")}
        <div class="btn-row"><button class="btn btn-sm" data-act="reset-scene" data-scene="starting">คืนค่าเริ่มต้น</button></div>`,
      extras: () => obsHelp(`<li>ติ๊ก <b>Refresh browser when scene becomes active</b> เพื่อให้นับถอยหลังใหม่ทุกครั้งที่สลับมาซีนนี้</li>`),
    },

    chatting: {
      settings: () => `
        ${F.sec("ข้อความ")}
        ${F.text("ui.profile.topic", "หัวข้อไลฟ์ (TOPIC)")}
        ${F.text("ui.scenes.chatting.label", "ป้ายใต้ชื่อ", { ph: "JUST CHATTING" })}
        ${F.sec("องค์ประกอบ")}
        ${F.toggle("ui.scenes.chatting.showTopic", "แสดงหัวข้อไลฟ์ (TOPIC)")}
        ${F.toggle("ui.scenes.chatting.showChat", "แสดงช่องแชท")}
        ${F.toggle("ui.scenes.chatting.showGoal", "แสดงหลอดโดเนท")}
        ${F.toggle("ui.scenes.chatting.showTimer", "แสดงนาฬิกาพระจันทร์ (เวลาไทย)")}
        ${F.toggle("ui.scenes.chatting.showBar", "แสดงการ์ด Top / Latest ใต้กล้อง")}
        <div class="btn-row"><button class="btn btn-sm" data-act="reset-scene" data-scene="chatting">คืนค่าเริ่มต้น</button></div>`,
      extras: () => obsHelp(),
    },

    gameplay: {
      settings: () => `
        ${F.sec("ข้อความ")}
        ${F.text("ui.scenes.gameplay.label", "ป้ายใต้ชื่อ", { ph: "GAMEPLAY" })}
        ${F.sec("องค์ประกอบ · ตำแหน่ง · ขนาด")}
        ${[
          ["profile", "ป้ายชื่อช่อง + ยอดคนดู"],
          ["goal", "หลอดโดเนท"],
          ["clock", "นาฬิกาพระจันทร์ (เวลาไทย)"],
          ["chat", "ช่องแชท"],
          ["dock", "แคปซูล Top / Latest"],
          ["cam", "กรอบกล้อง"],
        ].map(([id, label]) => F.hudItem(`ui.scenes.gameplay.items.${id}`, label)).join("")}
        <div class="hint">องค์ประกอบที่อยู่ตำแหน่งเดียวกันจะเรียงต่อกันอัตโนมัติ</div>
        <div class="btn-row"><button class="btn btn-sm" data-act="reset-scene" data-scene="gameplay">คืนค่าเริ่มต้น</button></div>`,
      extras: () => obsHelp(`<li>วาง Game Capture ไว้ใต้ Browser Source — พื้นหลังซีนนี้โปร่งใสทั้งหมด โดเนทจะเด้งเป็นป๊อปอัพด้านบน</li>`),
    },

    ending: {
      settings: () => `
        ${F.sec("ข้อความ")}
        ${F.text("ui.scenes.ending.kicker", "ข้อความเล็กด้านบน")}
        ${F.text("ui.scenes.ending.title", "หัวข้อใหญ่")}
        ${F.text("ui.scenes.ending.tagline", "ข้อความด้านล่าง")}
        ${F.text("ui.scenes.ending.creditsTitle", "หัวข้อกล่องเครดิต")}
        ${F.sec("องค์ประกอบ")}
        ${F.toggle("ui.scenes.ending.showCredits", "แสดงเครดิตผู้สนับสนุน (Top Donate)", "ช่วงเวลาตามที่ตั้งไว้ในหน้า EasyDonate › Top Donate")}
        ${F.toggle("ui.scenes.ending.showSocials", "แสดงช่องทางโซเชียล")}
        ${F.toggle("ui.scenes.ending.showBar", "แสดงแถบลอย", "Top · Latest · ยอดคนดู · โซเชียล")}
        <div class="btn-row"><button class="btn btn-sm" data-act="reset-scene" data-scene="ending">คืนค่าเริ่มต้น</button></div>`,
      extras: () => obsHelp(),
    },

    profile: {
      settings: () => `
        ${F.sec("ชื่อ & รูป")}
        ${F.text("ui.profile.name", "ชื่อช่อง (แสดงใหญ่)")}
        ${F.text("ui.profile.tagline", "ชื่อรอง")}
        ${F.text("ui.profile.avatar", "URL รูปโลโก้/โปรไฟล์", { ph: "https://…", hint: "เว้นว่างไว้จะใช้ตัวอักษรแรกของชื่อ" })}
        ${F.text("ui.profile.topic", "หัวข้อไลฟ์")}
        ${F.sec("โซเชียล")}
        ${(cfg.ui.profile.socials || []).map((s, i) => `
          <div class="social-row" draggable="true" data-i="${i}">
            <span class="drag-handle" title="ลากเพื่อสลับลำดับ">⋮⋮</span>
            <select class="inp" data-path="ui.profile.socials.${i}.kind">${Object.keys(OS.SOCIAL_LABEL).map((k) => `<option value="${k}">${OS.SOCIAL_LABEL[k]}</option>`).join("")}</select>
            <input class="inp" data-path="ui.profile.socials.${i}.handle" placeholder="@handle">
            <button class="btn" data-act="del-social" data-i="${i}" title="ลบ">${ic("x")}</button>
          </div>`).join("")}
        <button class="btn btn-sm" data-act="add-social">${ic("plus")}เพิ่มช่องทาง</button>
        ${F.sec("ระบบ")}
        ${F.toggle("auto_update", "อัปเดตอัตโนมัติเมื่อเปิดโปรแกรม", "ตรวจสอบ build ใหม่จาก GitHub ทุกครั้งที่เปิดโปรแกรม")}
        ${F.num("port", "พอร์ตเซิร์ฟเวอร์", { min: 1024, max: 65535, hint: "มีผลหลังเปิดโปรแกรมใหม่ — URL ใน OBS ต้องเปลี่ยนตาม" })}`,
      after: bindSocialDrag,
      extras: () => `<div class="help"><h3>ข้อมูลที่ใช้ร่วมกัน</h3><ul>
        <li>ชื่อช่อง โลโก้ หัวข้อ และโซเชียล ใช้ในป้ายชื่อและแถบลอยของทุกซีน</li>
        <li>ช่องทางโซเชียลในแถบลอยและใต้ช่องแชทจะสลับทุก 5 วินาที — ซีน Stream Ended แสดงพร้อมกันทั้งหมด</li>
        <li>ทุกการแก้ไขบันทึกอัตโนมัติ และ overlay ใน OBS อัปเดตทันทีโดยไม่ต้องรีเฟรช</li>
      </ul></div>`,
    },
  };

  // ---------------------------------------------------------------- YouTube stream picker
  let lastStreams = null, searching = false;
  async function ytSearch() {
    const q = $("#yt-q").value.trim();
    if (!q || searching) return;
    searching = true;
    $("#yt-list").innerHTML = `<div class="empty-note"><span class="spinner"></span> กำลังค้นหาไลฟ์ของ ${esc(q)}…</div>`;
    try {
      const r = await fetch("/api/yt/streams?q=" + encodeURIComponent(q));
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "ค้นหาไม่สำเร็จ");
      lastStreams = { q, ...d };
    } catch (e) {
      lastStreams = { q, error: e.message, streams: [] };
    }
    searching = false;
    if (page?.id === "youtube") renderStreams(lastStreams);
  }

  function renderStreams(d) {
    const list = $("#yt-list");
    if (!list) return;
    const q = d?.q || cfg.youtube.channel;
    const y = cfg.youtube;
    const autoSel = y.mode !== "manual";
    let html = `
      <div class="stream ${autoSel ? "sel" : ""}" data-auto>
        <div class="st-thumb">${ic("refresh", "ic-lg")}</div>
        <div class="st-body"><div class="st-title">อัตโนมัติ</div><div class="st-meta">ใช้ไลฟ์ที่กำลังออนอยู่ของ ${esc(q || "ช่องนี้")} — ถ้ายังไม่ไลฟ์จะรอแล้วต่อให้เองเมื่อเริ่ม</div></div>
        <span class="st-radio"></span>
      </div>`;
    const streams = d?.streams || [];
    if (!autoSel && y.video_id && !streams.some((s) => s.video_id === y.video_id)) {
      streams.unshift({ video_id: y.video_id, title: y.video_title || y.video_id, status: "selected", thumbnail: `https://i.ytimg.com/vi/${y.video_id}/hqdefault.jpg`, info: "ไลฟ์ที่เลือกไว้" });
    }
    for (const s of streams) {
      const badge = s.status === "live" ? `<span class="badge-live">LIVE</span>` : s.status === "upcoming" ? `<span class="badge-up">เร็ว ๆ นี้</span>` : s.status === "selected" ? "" : `<span class="badge-past">จบแล้ว</span>`;
      html += `
        <div class="stream ${!autoSel && y.video_id === s.video_id ? "sel" : ""}" data-vid="${esc(s.video_id)}" data-title="${esc(s.title)}">
          <img class="st-thumb" src="${esc(s.thumbnail)}" referrerpolicy="no-referrer">
          <div class="st-body"><div class="st-title">${esc(s.title)}</div><div class="st-meta">${badge}<span>${esc(s.info || "")}</span></div></div>
          <span class="st-radio"></span>
        </div>`;
    }
    if (d?.error) html += `<div class="empty-note bad">${esc(d.error)}</div>`;
    else if (d && !streams.length) html += `<div class="empty-note">ไม่พบไลฟ์ที่กำลังออนหรือกำลังจะเริ่มของช่องนี้<br>เลือก “อัตโนมัติ” ไว้ได้เลย ระบบจะต่อให้เองเมื่อเริ่มไลฟ์</div>`;
    else if (!d) html += `<div class="empty-note">พิมพ์ชื่อช่องแล้วกด <b>ค้นหาไลฟ์</b> เพื่อดูไลฟ์ทั้งหมดของช่อง</div>`;
    list.innerHTML = html;
    for (const n of $$(".stream", list)) {
      n.addEventListener("click", async () => {
        const channel = $("#yt-q").value.trim();
        const body = "auto" in n.dataset ? { channel, mode: "auto" } : { channel, mode: "manual", video_id: n.dataset.vid, title: n.dataset.title };
        await post("/api/yt/select", body);
        Object.assign(cfg.youtube, { channel, mode: body.mode, video_id: body.video_id || "", video_title: body.title || "" });
        toast(body.mode === "auto" ? "ใช้โหมดอัตโนมัติ" : "เลือกไลฟ์แล้ว — กำลังดึงแชท");
        renderStreams(lastStreams);
        renderSource();
      });
    }
  }

  // ---------------------------------------------------------------- live status (sidebar)
  const LIVE_TEXT = { idle: "ยังไม่ได้ตั้งค่า", searching: "กำลังค้นหา…", waiting: "รอเริ่มไลฟ์", connecting: "กำลังเชื่อมต่อ…", live: "เชื่อมต่อแล้ว", ended: "ไลฟ์จบแล้ว", error: "ผิดพลาด" };
  const ED_TEXT = { off: "ยังไม่ได้ตั้งค่า", connecting: "กำลังเชื่อมต่อ…", ok: "เชื่อมต่อแล้ว", warn: "เชื่อมต่อแล้ว (บางส่วน)", error: "ผิดพลาด" };
  const cls = (st) => (st === "live" || st === "ok" ? "ok" : st === "error" ? "bad" : "mid");

  function renderLive() {
    const l = Bus.state.live || {}, t = Bus.state.twitch || {}, v = viewerTotals();
    const live = l.state === "live" || t.state === "live";
    const pill = $("#lc-pill");
    pill.className = "lc-pill" + (live ? " live" : l.state === "error" ? " warn" : "");
    pill.textContent = live ? "LIVE" : (l.state || "offline").toUpperCase();
    $("#lc-viewers").textContent = v.total != null ? Number(v.total).toLocaleString("en-US") : "";
    $("#lc-viewers").title = v.parts.length > 1 ? `YouTube ${v.yt} · Twitch ${v.tw}` : "";
    $("#lc-title").textContent = l.title || (t.state === "live" && t.title) || l.message || "ยังไม่ได้เชื่อมต่อไลฟ์";
    const yt = $("#lc-yt");
    yt.textContent = LIVE_TEXT[l.state] || "—";
    yt.className = cls(l.state);
    yt.title = l.message || "";
  }
  const TW_TEXT = { idle: "ยังไม่ได้ตั้งค่า", connecting: "กำลังเชื่อมต่อ…", live: "ไลฟ์อยู่", offline: "เชื่อมต่อแล้ว (ยังไม่ไลฟ์)", error: "ผิดพลาด" };
  function renderTwitch() {
    const t = Bus.state.twitch || {};
    const chatErr = t.chat === "error";
    const lc = $("#lc-tw");
    lc.textContent = chatErr ? "แชทหลุด — กำลังต่อใหม่" : TW_TEXT[t.state] || "—";
    lc.className = chatErr ? "bad" : t.state === "live" || t.state === "offline" ? "ok" : t.state === "error" ? "bad" : "mid";
    lc.title = t.message || "";
    renderLive();
    const box = $("#tw-status");
    if (!box) return;
    if (!t.channel) { box.innerHTML = `<div class="empty-note">${esc(t.message || "ใส่ชื่อช่องแล้วกดเชื่อมต่อ")}</div>`; return; }
    const pill = t.state === "live" ? `<span class="badge-live">LIVE</span>` : t.state === "offline" ? `<span class="badge-past">OFFLINE</span>` : `<span class="badge-up">${esc((t.state || "").toUpperCase())}</span>`;
    box.innerHTML = `
      <div class="stream sel tw-card">
        ${t.avatar ? `<img class="st-thumb tw-av" src="${esc(t.avatar)}" referrerpolicy="no-referrer">` : `<div class="st-thumb">${ic("twitch", "ic-lg")}</div>`}
        <div class="st-body">
          <div class="st-title">${esc(t.display_name || t.channel)} ${pill}</div>
          <div class="st-meta"><span>${t.state === "live" ? `${ic("eye", "ic-sm")} ${Number(t.viewers || 0).toLocaleString("en-US")} คน${t.game ? " · " + esc(t.game) : ""}` : "แชทใช้งานได้แม้ยังไม่ไลฟ์"}</span></div>
          ${t.title ? `<div class="st-meta"><span>${esc(t.title)}</span></div>` : ""}
          <div class="st-meta"><span>แชท: ${t.chat === "connected" ? "เชื่อมต่อแล้ว" : chatErr ? "หลุด — กำลังต่อใหม่" : "กำลังเชื่อมต่อ…"}${t.message ? " · " + esc(t.message) : ""}</span></div>
        </div>
      </div>`;
  }
  function renderEdStatus() {
    const s = Bus.state.ed_status || {};
    const e = $("#lc-ed");
    e.textContent = ED_TEXT[s.state] || "—";
    e.className = cls(s.state);
    e.title = s.message || "";
    const st = $("#ed-state");
    if (st) { st.textContent = (ED_TEXT[s.state] || "—") + (s.account ? ` · ${s.account}` : "") + (s.state !== "ok" && s.message ? ` — ${s.message}` : ""); st.className = cls(s.state); }
  }
  function renderSource() {
    const y = cfg.youtube;
    $("#src-mode").innerHTML = y.mode === "manual" ? `${ic("pin")}ไลฟ์ที่เลือก` : `${ic("refresh")}อัตโนมัติ`;
    $("#src-title").textContent = y.mode === "manual" ? y.video_title || y.video_id : y.channel || "ยังไม่ได้ใส่ช่อง";
  }
  function renderEdData() {
    const d = Bus.state.donate || {};
    const top = $("#ed-top"), latest = $("#ed-latest"), goal = $("#ed-goal");
    if (!top) return;
    top.innerHTML = (d.top || []).slice(0, 10).map((t) => `<div class="dl"><span>#${t.rank} ${esc(t.name)}</span><b>${money2(t.amount)}</b></div>`).join("") || `<div class="dl"><span>—</span></div>`;
    latest.innerHTML = (d.latest || []).slice(0, 10).map((t) => `<div class="dl"><span>${esc(t.name)} · ${ago(t.created_at)}</span><b>${money2(t.amount)}</b></div>`).join("") || `<div class="dl"><span>—</span></div>`;
    const g = d.goal;
    goal.innerHTML = g ? `<div class="dl"><span>${esc(g.title || "Goal")}</span></div><div class="dl"><span>${money2(g.current)} / ${money2(g.target)}</span><b>${Math.floor((g.current / g.target) * 100) || 0}%</b></div>` : `<div class="dl"><span>Goal: —</span></div>`;
  }

  Bus.on("live", renderLive).on("twitch", renderTwitch).on("ed_status", renderEdStatus).on("donate_state", renderEdData);
  // ---------------------------------------------------------------- updater status
  const UPD = {
    checking: (u) => `กำลังตรวจสอบอัปเดต…`,
    downloading: (u) => `พบเวอร์ชันใหม่ v${u.latest} — กำลังดาวน์โหลด…`,
    installing: (u) => `กำลังติดตั้ง v${u.latest} โปรแกรมจะเปิดใหม่อัตโนมัติ`,
  };
  function renderUpdate(u) {
    if (!u) return;
    $("#host").textContent = `${location.host} · v${u.version}`;
    $("#host").title = u.state === "error" ? "อัปเดตไม่สำเร็จ: " + u.message : u.state === "latest" ? "เป็นเวอร์ชันล่าสุดแล้ว" : "";
    const b = $("#update-banner");
    const msg = UPD[u.state]?.(u);
    b.textContent = msg || "";
    b.classList.toggle("show", !!msg && u.state !== "checking");
  }
  Bus.on("update", renderUpdate);

  // ---------------------------------------------------------------- countdown controls (Starting Soon)
  function cdLeft() {
    const c = Bus.state.countdown || {};
    if (c.running) return Math.max(0, c.end_at - Date.now());
    return c.remaining_ms ?? (Number(cfg?.ui.scenes.starting.countdownMin) || 0) * 60000;
  }
  function renderCountdown() {
    const t = $("#cd-ctl-time"), b = $("#cd-toggle");
    if (!t || !b) return;
    const c = Bus.state.countdown || {}, left = cdLeft();
    t.textContent = OS.clock(left);
    t.classList.toggle("running", !!c.running);
    const label = c.running ? "หยุดชั่วคราว" : c.remaining_ms == null || c.remaining_ms <= 0 ? "เริ่ม" : "นับต่อ";
    if (b.dataset.label !== label) { b.dataset.label = label; b.innerHTML = ic(c.running ? "pause" : "play") + label; }
  }
  Bus.on("countdown", renderCountdown);
  setInterval(renderCountdown, 250);
  Bus.on("hello", (d) => {
    renderUpdate(d.update);
    if (d.port_fallback) toast(`พอร์ตที่ตั้งไว้ถูกใช้อยู่ — ใช้พอร์ต ${d.port} แทน`);
  });

  (async () => {
    await loadConfig();
    renderSource();
    go(localStorage.getItem("os-page") || "youtube");
    Bus.connect();
  })();
})();
