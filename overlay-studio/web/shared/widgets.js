// Overlay building blocks: chat, goal bar, donor tickers, timer, viewers, socials, alerts.
(function () {
  const { Bus, el, esc, money, money2, compact, clock, ago, initials, ICONS, SOCIAL_LABEL, params } = OS;
  const ui = () => Bus.state.ui;

  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) % 360; return h; };
  const avatarBg = (name) => `background:linear-gradient(135deg,hsl(${hue(name)} 70% 66%),hsl(${(hue(name) + 50) % 360} 60% 42%))`;
  function avatarHTML(src, name, size) {
    const st = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
    if (src) return `<img class="avatar" style="${st}" src="${esc(src)}" referrerpolicy="no-referrer" data-name="${esc(name)}">`;
    return `<div class="avatar" style="${st};${avatarBg(name)}">${initials(name)}</div>`;
  }
  // Broken avatar images fall back to coloured initials.
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains("avatar")) return;
    const d = document.createElement("div");
    d.className = "avatar";
    d.style.cssText = img.style.cssText + ";" + avatarBg(img.dataset.name);
    d.innerHTML = initials(img.dataset.name);
    img.replaceWith(d);
  }, true);

  function runsHTML(runs) {
    return (runs || []).map((r) => (r.t === "emoji" ? `<img class="emoji" src="${esc(r.url)}" alt="${esc(r.alt)}">` : esc(r.v))).join("");
  }

  // ---------------------------------------------------------------- chat
  function ChatPanel(root, opts = {}) {
    root.classList.add("chat");
    const list = el("div", "chat-list");
    root.appendChild(list);
    const ids = new Set();
    let lastReal = 0;

    function badgeHTML(m) {
      if (!ui().chat.badges || !m.badges) return "";
      const b = m.badges;
      let s = "";
      if (b.owner) s += `<i class="badge owner" title="owner">${ICONS.crown}</i>`;
      if (b.moderator) s += `<i class="badge mod">${ICONS.wrench}</i>`;
      if (b.verified) s += `<i class="badge verified">${ICONS.check}</i>`;
      if (b.member && b.member_icon) s += `<img class="badge member" src="${esc(b.member_icon)}">`;
      return s;
    }

    function render(m) {
      const showAv = ui().chat.avatars;
      const b = m.badges || {};
      const role = b.owner ? "owner" : b.moderator ? "mod" : b.member ? "member" : "";
      let node;
      if (m.kind === "donate") {
        node = el("div", "msg donate", `
          <div class="dc-ring"></div>
          <div class="dc-head">
            <span class="dc-icon">${ICONS.blossom}</span>
            <span class="dc-name">${esc(m.name)}</span>
            <span class="dc-amt">${money2(m.amount)}</span>
          </div>
          <div class="dc-label">${ICONS.heart} โดเนทผ่าน EasyDonate${m.test ? " · ทดสอบ" : ""}</div>
          ${m.runs && m.runs[0] && m.runs[0].v ? `<div class="dc-msg">${runsHTML(m.runs)}</div>` : ""}
          <i class="dc-shine"></i>`);
      } else if (m.kind === "superchat" || m.kind === "sticker") {
        node = el("div", "msg sc", `
          <div class="sc-head" style="--sc:${m.header_color || m.color || "rgba(255,202,40,1)"}">
            ${showAv ? avatarHTML(m.avatar, m.name, 40) : ""}
            <div><div class="msg-name">${esc(m.name)}</div><div class="sc-amt">${esc(m.amount)}</div></div>
          </div>
          ${m.kind === "sticker" ? `<img class="sc-sticker" src="${esc(m.sticker)}">` : m.runs?.length ? `<div class="sc-body" style="--sc:${m.color || "rgba(255,202,40,1)"}">${runsHTML(m.runs)}</div>` : ""}`);
      } else if (m.kind === "member" || m.kind === "gift") {
        node = el("div", "msg member-ev", `
          ${showAv ? avatarHTML(m.avatar, m.name, 40) : ""}
          <div class="msg-body">
            <div class="msg-head"><span class="msg-name">${esc(m.name)}</span>${badgeHTML(m)}</div>
            <div class="me-headline">${m.kind === "gift" ? ICONS.gift : ICONS.star} ${esc(m.headline || "สมาชิกใหม่!")}</div>
            ${m.runs?.length ? `<div class="msg-text">${runsHTML(m.runs)}</div>` : ""}
          </div>`);
      } else {
        node = el("div", `msg ${role}`, `
          ${showAv ? avatarHTML(m.avatar, m.name, 40) : ""}
          <div class="msg-body">
            <div class="msg-head"><span class="msg-name">${esc(m.name)}</span>${badgeHTML(m)}</div>
            <div class="msg-text">${runsHTML(m.runs)}</div>
          </div>`);
      }
      node.dataset.id = m.id;
      return node;
    }

    function trim() {
      const max = Math.max(5, ui().chat.max | 0);
      while (list.children.length > max) {
        const first = list.firstElementChild;
        ids.delete(first.dataset.id);
        first.remove();
      }
    }

    function add(items, animate) {
      for (const m of items) {
        if (!m || ids.has(m.id)) continue;
        if (m.kind === "donate" && !ui().chat.donateCards) continue;
        if (!m.demo) lastReal = Date.now();
        ids.add(m.id);
        const node = render(m);
        if (animate && !m.history) node.classList.add("enter");
        list.appendChild(node);
        if (animate && m.kind === "donate") requestAnimationFrame(() => FX.burst(node, 46, 30, 14));
        const hide = ui().chat.hideAfter | 0;
        if (hide > 0) setTimeout(() => remove(m.id), hide * 1000);
      }
      trim();
    }

    function remove(id) {
      const n = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
      if (!n) return;
      n.classList.add("leave");
      setTimeout(() => { n.remove(); ids.delete(id); }, 450);
    }

    function applyStyle() { root.style.setProperty("--chat-fs", (ui().chat.fontSize || 22) + "px"); }

    Bus.on("hello", (d) => { list.innerHTML = ""; ids.clear(); applyStyle(); add(d.chat.slice(-(ui().chat.max || 30)), false); });
    Bus.on("chat", (d) => add(d.items, true));
    Bus.on("chat_remove", (d) => remove(d.id));
    Bus.on("chat_clear", () => { list.innerHTML = ""; ids.clear(); });
    Bus.on("config", applyStyle);

    return { add, root, lastReal: () => lastReal };
  }

  // ---------------------------------------------------------------- tween helper
  function tweenNumber(node, from, to, fmt, ms = 1200) {
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- goal bar
  function GoalBar(root, { variant = "wide" } = {}) {
    root.classList.add("goal", "goal-" + variant);
    root.innerHTML = `
      <div class="goal-top">
        <span class="goal-icon">${ICONS.blossom}</span>
        <span class="goal-title"></span>
        <span class="goal-pct">0%</span>
      </div>
      <div class="goal-track">
        <div class="goal-fill"><i class="goal-shine"></i></div>
        ${[25, 50, 75].map((p) => `<i class="tick" data-at="${p}" style="left:${p}%">${ICONS.blossom}</i>`).join("")}
        <i class="goal-tip">${ICONS.blossom}</i>
      </div>
      <div class="goal-foot"><span class="goal-end"></span><div class="goal-amt"><b class="goal-cur">฿0.00</b><span class="goal-sep">/</span><span class="goal-target">฿0</span></div></div>`;
    const $ = (s) => root.querySelector(s);
    let cur = 0;
    function update(goal) {
      if (!goal || !goal.target) { root.classList.add("empty"); return; }
      root.classList.remove("empty");
      $(".goal-title").textContent = goal.title || "เป้าหมายโดเนท";
      $(".goal-target").textContent = money(goal.target);
      const days = goal.end_at ? Math.ceil((goal.end_at - Date.now()) / 86400000) : null;
      $(".goal-end").textContent = days == null ? "" : days > 0 ? `สิ้นสุดใน ${days} วัน` : "สิ้นสุดแล้ว";
      const pct = Math.max(0, Math.min(100, (goal.current / goal.target) * 100));
      $(".goal-fill").style.width = Math.max(pct, 1.5) + "%";
      $(".goal-tip").style.left = Math.max(pct, 1.5) + "%";
      root.querySelectorAll(".tick").forEach((t) => t.classList.toggle("on", pct >= Number(t.dataset.at)));
      if (goal.current !== cur) {
        tweenNumber($(".goal-cur"), cur, goal.current, money2);
        tweenNumber($(".goal-pct"), (cur / goal.target) * 100, pct, (v) => Math.floor(v) + "%");
        if (goal.current > cur && cur > 0) { root.classList.remove("bump"); void root.offsetWidth; root.classList.add("bump"); }
        cur = goal.current;
      }
    }
    Bus.on("donate_state", (d) => update(d.goal));
    return { update };
  }

  // Animate out (or drop) every current child that isn't already leaving.
  function retire(parent, sel, animate) {
    parent.querySelectorAll(`${sel}:not(.out)`).forEach((n) => {
      if (!animate) return n.remove();
      n.classList.add("out");
      setTimeout(() => n.remove(), 600);
    });
  }

  // ---------------------------------------------------------------- rotating ticker
  function Ticker(root, { kind = "top", label = "TOP DONATE", icon = ICONS.crown, variant = "line" } = {}) {
    root.classList.add("ticker", "ticker-" + kind, "ticker-" + variant);
    root.innerHTML = `
      <div class="tk-label">${icon}<span>${label}</span><span class="tk-dots"></span></div>
      <div class="tk-slot"></div>`;
    const slot = root.querySelector(".tk-slot"), dots = root.querySelector(".tk-dots");
    let items = [], idx = 0, timer = null, sig = "";

    function itemHTML(it) {
      if (!it) return `<div class="tk-item"><span class="tk-empty">ยังไม่มีรายการ</span></div>`;
      if (variant === "spot") {
        const sub = kind === "top" ? `อันดับ ${it.rank} จาก ${items.length}` : ago(it.created_at);
        return `<div class="tk-item spot">
          <div class="sp-av">${avatarHTML("", it.name, 64)}${kind === "top" ? `<i class="sp-rank r${it.rank}">${it.rank}</i>` : `<i class="sp-heart">${ICONS.heart}</i>`}</div>
          <div class="sp-info"><div class="sp-name">${esc(it.name)}</div><div class="sp-amt">${money2(it.amount)}</div><div class="sp-sub">${sub}</div></div>
        </div>`;
      }
      if (kind === "top") {
        return `<div class="tk-item"><span class="tk-rank r${it.rank}">#${it.rank}</span><span class="tk-name">${esc(it.name)}</span><span class="tk-amt">${money2(it.amount)}</span></div>`;
      }
      return `<div class="tk-item"><span class="tk-name">${esc(it.name)}</span><span class="tk-amt">${money2(it.amount)}</span><span class="tk-ago">${ago(it.created_at)}</span></div>`;
    }
    function show(i, animate = true) {
      const it = items.length ? items[i % items.length] : null;
      const next = el("div", "tk-wrap" + (animate ? " in" : ""), itemHTML(it));
      retire(slot, ".tk-wrap", animate);
      slot.appendChild(next);
      dots.innerHTML = items.length > 1 ? items.map((_, j) => `<i class="${j === i % items.length ? "on" : ""}"></i>`).join("") : "";
    }
    function restart() {
      clearInterval(timer);
      const secs = Math.max(2, ui().bar?.rotateSecs || 4);
      if (items.length > 1) timer = setInterval(() => { idx = (idx + 1) % items.length; show(idx); }, secs * 1000);
    }
    function update(list) {
      const s = JSON.stringify(list);
      if (s === sig) return;
      sig = s;
      items = (list || []).slice(0, kind === "top" ? 10 : 10);
      idx = 0;
      show(0);
      restart();
    }
    Bus.on("donate_state", (d) => update(kind === "top" ? d.top : d.latest));
    Bus.on("config", restart);
    show(0, false);
    return { update };
  }

  // ---------------------------------------------------------------- moon clock (Thai time)
  // Round "moon" clock showing the current time in Thailand, whatever the PC's time zone.
  function TimerBox(root) {
    root.classList.add("timerbox", "moon-timer", "running");
    root.innerHTML = `
      <svg class="mt-ring" viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="1.6" stroke-dasharray="2 9" stroke-linecap="round"/><circle cx="100" cy="100" r="84" fill="none" stroke="rgba(207,204,255,.45)" stroke-width="1.2"/></svg>
      <i class="mt-crescent"></i>
      <div class="mt-label">เวลาไทย</div>
      <div class="tm-digits">00:00:00</div>
      <div class="tm-state"></div>`;
    const digits = root.querySelector(".tm-digits"), dateEl = root.querySelector(".tm-state");
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const date = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", weekday: "short", day: "numeric", month: "short" });
    const tick = () => {
      const now = new Date();
      digits.textContent = time.format(now);
      dateEl.textContent = date.format(now);
    };
    tick();
    setInterval(tick, 500);
  }

  // ---------------------------------------------------------------- viewers / socials
  function Viewers(root) {
    root.classList.add("viewers");
    root.innerHTML = `<div class="tiny-label vw-label"><i class="live-dot"></i>VIEWERS</div><div class="vw-row"><span class="vw-eye">${ICONS.eye}</span><b class="vw-num">—</b><span class="vw-yt">${ICONS.youtube}</span></div>`;
    const num = root.querySelector(".vw-num");
    let cur = null;
    Bus.on("live", (l) => {
      root.classList.toggle("is-live", l.state === "live");
      if (l.viewers == null) { num.textContent = "—"; cur = null; return; }
      if (cur == null) num.textContent = compact(l.viewers);
      else tweenNumber(num, cur, l.viewers, (v) => compact(Math.round(v)), 900);
      cur = l.viewers;
    });
  }

  function Socials(root, { all = false } = {}) {
    root.classList.add("socials");
    let i = 0, timer;
    function render() {
      const list = (ui().profile.socials || []).filter((s) => s.handle);
      if (all) {
        root.innerHTML = list.map((s) => `<div class="so-item"><span class="so-icon">${ICONS[s.kind] || ICONS.star}</span><span class="so-handle">${esc(s.handle)}</span></div>`).join("");
        return;
      }
      clearInterval(timer);
      const show = () => {
        if (!list.length) { root.innerHTML = ""; return; }
        const s = list[i++ % list.length];
        const n = el("div", "so-rot in", `<span class="so-icon">${ICONS[s.kind] || ICONS.star}</span><div><div class="tiny-label">${SOCIAL_LABEL[s.kind] || s.kind}</div><div class="so-handle">${esc(s.handle)}</div></div>`);
        retire(root, ".so-rot", true);
        root.appendChild(n);
      };
      show();
      if (list.length > 1) timer = setInterval(show, 5000);
    }
    Bus.on("config", render);
    render();
  }

  // ---------------------------------------------------------------- floating moon dock
  // A rounded capsule (not a full-width bar) holding any of: top, latest, viewers, socials.
  function Dock(root, { parts = ["top", "latest", "viewers", "socials"] } = {}) {
    root.classList.add("dock");
    const div = `<i class="dk-div">${ICONS.blossom}</i>`;
    root.innerHTML = `<span class="dk-moon"><i></i></span>` + parts.map((p) => `<div class="dk-seg dk-${p}"></div>`).join(div);
    const q = (p) => root.querySelector(".dk-" + p);
    if (parts.includes("top")) Ticker(q("top"), { kind: "top", label: "TOP DONATE" });
    if (parts.includes("latest")) Ticker(q("latest"), { kind: "latest", label: "LATEST", icon: ICONS.heart });
    if (parts.includes("viewers")) Viewers(q("viewers"));
    if (parts.includes("socials")) Socials(q("socials"));
  }

  // Avatar + channel name + "LIVE · LABEL" line.
  function Nameplate(root, { label = () => "LIVE", viewers = false } = {}) {
    root.classList.add("nameplate");
    root.innerHTML = `
      <div class="np-logo"></div>
      <div class="np-text">
        <div class="np-name"><b></b><span></span></div>
        <div class="np-sub"><i class="live-dot"></i><span class="np-label"></span>${viewers ? `<span class="np-vw">${ICONS.eye}<b>—</b></span>` : ""}</div>
      </div>`;
    Bus.on("config", () => {
      const p = ui().profile;
      root.querySelector(".np-logo").innerHTML = p.avatar ? `<img src="${esc(p.avatar)}" referrerpolicy="no-referrer">` : `<span>${initials(p.name)}</span>`;
      root.querySelector(".np-name b").textContent = p.name || "";
      root.querySelector(".np-name span").textContent = p.tagline || "";
      root.querySelector(".np-label").textContent = label();
    });
    if (viewers) Bus.on("live", (l) => { root.querySelector(".np-vw b").textContent = l.viewers == null ? "—" : compact(l.viewers); });
  }

  // ---------------------------------------------------------------- alerts
  let audioCtx;
  function chime() {
    try {
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      [880, 1108.73, 1318.51, 1760].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0, t0 + i * 0.09);
        g.gain.linearRampToValueAtTime(0.16, t0 + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.09 + 1.1);
        o.connect(g).connect(audioCtx.destination);
        o.start(t0 + i * 0.09); o.stop(t0 + i * 0.09 + 1.2);
      });
    } catch (e) { /* audio unavailable */ }
  }

  // Centre-screen popup. Off unless ui.alerts.popup is on (or `always`, for /widget/alerts);
  // when off, the chime still plays so a donation in the chat card isn't silent.
  function AlertQueue(root, { enabled = () => true, always = false } = {}) {
    root.classList.add("alerts");
    const q = [];
    let busy = false;
    function next() {
      if (busy || !q.length) return;
      busy = true;
      const d = q.shift();
      const card = el("div", "alert-card", `
        <div class="ac-burst">${ICONS.blossom}</div>
        <div class="ac-body">
          <div class="ac-top"><span class="ac-name">${esc(d.name)}</span><span class="ac-verb">โดเนท</span><span class="ac-amt">${money2(d.amount)}</span></div>
          ${d.message ? `<div class="ac-msg">${esc(d.message)}</div>` : ""}
        </div>
        <i class="ac-shine"></i>`);
      root.appendChild(card);
      requestAnimationFrame(() => FX.burst(root, root.clientWidth / 2, 70, 26));
      if (ui().alerts.sound) chime();
      const dur = Math.max(3, ui().alerts.duration || 8) * 1000;
      setTimeout(() => card.classList.add("leave"), dur);
      setTimeout(() => { card.remove(); busy = false; next(); }, dur + 700);
    }
    Bus.on("donation", (d) => {
      if ((Number(d.amount) || 0) < (Number(ui().alerts.minAmount) || 0)) return;
      if (!always && (!ui().alerts.popup || !enabled())) {
        if (ui().alerts.sound) chime();
        return;
      }
      q.push(d);
      next();
    });
  }

  // ---------------------------------------------------------------- demo data for previews
  function startDemo(chat) {
    const S = Bus.state;
    const people = [
      ["@SrBoyCH", "สวัสดีครับพี่ 👋"], ["@Oomehai", "มาแล้วววว 🌸"], ["@tonpaanXD_16", "หนูออม"], ["@GetTH", "วันนี้เล่นอะไรครับ"],
      ["@moonlit.void", "ธีมสวยมากกก ✨"], ["@samsung_s23", "ไลฟ์ยาวไหมครับวันนี้"], ["@ไอ้ผมแดง", "สวัสดีครับ"], ["@Berryy_R27", "พรุ่งนี้เปิดเทอมแล้ว 😭"],
      ["@nightowl", "ฟังเพลงไปด้วยชิลมาก"], ["@kanomkrok", "ขอเพลงหน่อยครับ"],
    ];
    let n = 0;
    const mk = (i, extra = {}) => {
      const [name, text] = people[i % people.length];
      return { id: "demo-" + n++, kind: "text", demo: true, name, avatar: "", runs: [{ t: "text", v: text }], badges: { moderator: i % 7 === 3, member: i % 5 === 1 }, ...extra };
    };
    const seed = () => {
      if (S.chat.length) return;
      const items = [0, 1, 2, 3, 4].map((i) => mk(i));
      items.splice(3, 0, { id: "demo-don", kind: "donate", demo: true, name: "Nice dih", amount: 270.07, runs: [{ t: "text", v: "ธีมใหม่สวยมากครับ สู้ ๆ นะ 💜" }] });
      items.push(mk(5, { badges: { owner: true }, name: ui().profile.name || "Streamer", runs: [{ t: "text", v: "ขอบคุณทุกคนที่มานะครับ ♡" }] }));
      chat?.add(items, false);
    };
    Bus.on("hello", () => {
      seed();
      const d = S.donate;
      const top = d.top?.length ? null : [["Nice dih", 270.07], ["SrBoyCH", 199], ["moonlit", 150], ["Oomehai", 120], ["GetTH", 99], ["kanomkrok", 80], ["Berryy", 59], ["nightowl", 40], ["tonpaan", 29], ["ไอ้ผมแดง", 20]].map(([name, amount], i) => ({ rank: i + 1, name, amount }));
      const latest = d.latest?.length ? null : [{ name: "Nice dih", amount: 270.07, created_at: Date.now() - 120000 }, { name: "SrBoyCH", amount: 99, created_at: Date.now() - 900000 }];
      const fake = {
        top: top || d.top, latest: latest || d.latest,
        goal: d.goal || { title: "ช่วยค่าคอนโดผมที", current: 4250, target: 15000 },
        timer: d.timer || { remaining_ms: 5524000, running: false, fetched_at: Date.now() },
      };
      Bus.fire("donate_state", fake);
      if (S.live.viewers == null) Bus.fire("live", { ...S.live, state: "live", viewers: 357 });
    });
    let i = 6;
    setInterval(() => {
      if (!chat || Date.now() - chat.lastReal() < 20000) return;
      chat.add([mk(i++)], true);
    }, 2600);
  }

  window.W = { ChatPanel, GoalBar, Ticker, TimerBox, Viewers, Socials, Dock, Nameplate, AlertQueue, startDemo, avatarHTML, chime };
})();
