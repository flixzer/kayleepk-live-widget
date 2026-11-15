// Starry Night visuals: Milky Way and nebula glow, a twinkling star field with shooting
// stars, drifting star dust, constellation corner ornaments, a hill-and-pine horizon and
// frame ornaments.
(function () {
  // Deterministic PRNG so decorations look identical on every reload.
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  // Star tints: blue-white, warm white, lavender, pale gold.
  const TINTS = ["205,218,255", "255,246,226", "196,188,255", "255,226,170"];
  const tint = (r) => (r < 0.5 ? TINTS[0] : r < 0.78 ? TINTS[1] : r < 0.93 ? TINTS[2] : TINTS[3]);

  /** SVG path of a four-point sparkle of arm length L centred on 0,0 (k = waist). */
  function sparklePath(L, k = 0.14) {
    const a = (k * L).toFixed(2), l = L.toFixed(2);
    return `M0 -${l}Q${a} -${a} ${l} 0Q${a} ${a} 0 ${l}Q-${a} ${a} -${l} 0Q-${a} -${a} 0 -${l}Z`;
  }

  // ---------------------------------------------------------------- sprites
  function sprite(size, draw) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    draw(c.getContext("2d"), size);
    return c;
  }
  const glowSprite = (rgb) =>
    sprite(64, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, `rgba(255,255,255,1)`);
      gr.addColorStop(0.16, `rgba(${rgb},0.95)`);
      gr.addColorStop(0.42, `rgba(${rgb},0.24)`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    });
  // Four-point sparkle with a soft halo and a faint diagonal cross.
  const sparkleSprite = (rgb) =>
    sprite(128, (g, s) => {
      const c = s / 2;
      const halo = g.createRadialGradient(c, c, 0, c, c, c * 0.5);
      halo.addColorStop(0, `rgba(${rgb},0.6)`);
      halo.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = halo;
      g.fillRect(0, 0, s, s);
      g.translate(c, c);
      g.shadowColor = `rgba(${rgb},1)`;
      g.shadowBlur = 12;
      g.fillStyle = "rgba(255,255,255,.55)";
      g.save();
      g.rotate(Math.PI / 4);
      g.fill(new Path2D(sparklePath(c * 0.42, 0.12)));
      g.restore();
      g.fillStyle = "#fff";
      g.fill(new Path2D(sparklePath(c * 0.92, 0.1)));
    });

  // ---------------------------------------------------------------- sky canvas
  /**
   * Animated sky layer. stars: small twinkling points, bright: large sparkles,
   * dust: drifting star dust (foreground), meteors: shooting-star rate (0 = off).
   */
  function Sky(canvas, opts = {}) {
    const o = { stars: 170, bright: 8, dust: 0, meteors: 1, w: 1920, h: 1080, top: 0.82, ...opts };
    canvas.width = o.w;
    canvas.height = o.h;
    const g = canvas.getContext("2d");
    const R = Math.random;
    const DOT = TINTS.map(glowSprite), SPARK = TINTS.map(sparkleSprite);
    const pick = () => { const r = R(); return r < 0.5 ? 0 : r < 0.78 ? 1 : r < 0.93 ? 2 : 3; };

    const stars = Array.from({ length: o.stars }, () => ({ x: R() * o.w, y: Math.pow(R(), 1.3) * o.h * o.top, r: 3 + Math.pow(R(), 2.2) * 11, p: R() * 6.28, s: 0.5 + R() * 1.8, c: pick() }));
    const bright = Array.from({ length: o.bright }, () => ({ x: R() * o.w, y: R() * o.h * o.top * 0.85, r: 14 + R() * 16, p: R() * 6.28, s: 0.4 + R() * 0.6, rot: (R() - 0.5) * 0.3, c: pick() }));
    const newDust = (top) => ({ x: R() * (o.w + 200) - 100, y: top ? -30 - R() * 120 : R() * o.h, z: 0.4 + R() * 0.9, vx: (R() - 0.3) * 0.25, vy: 0.18 + R() * 0.32, p: R() * 6.28, rot: R() * 0.8, c: pick() });
    const dust = Array.from({ length: o.dust }, () => newDust(false));
    const meteors = [];
    let nextMeteor = o.meteors > 0 ? 90 + R() * 240 : Infinity;
    function spawnMeteor() {
      const dir = R() < 0.65 ? -1 : 1; // mostly falling to the left
      const ang = Math.PI / 2 + dir * (0.55 + R() * 0.35);
      meteors.push({
        x: dir < 0 ? o.w * (0.35 + R() * 0.7) : o.w * (-0.05 + R() * 0.6), y: o.h * R() * 0.3,
        dx: Math.cos(ang), dy: Math.sin(ang), v: 13 + R() * 9, len: 170 + R() * 160, life: 0, max: 48 + R() * 30, c: pick(),
      });
      nextMeteor = t + (260 + R() * 420) / o.meteors;
    }

    let last = performance.now(), t = 0, running = true;
    function frame(now) {
      if (!running) return;
      const dt = Math.min(3, (now - last) / 16.67);
      last = now;
      t += dt;
      g.clearRect(0, 0, o.w, o.h);
      g.globalCompositeOperation = "lighter";

      for (const s of stars) {
        const a = 0.2 + 0.8 * Math.pow(Math.abs(Math.sin(s.p + t * 0.018 * s.s)), 1.6);
        g.globalAlpha = a * 0.9;
        g.drawImage(DOT[s.c], s.x - s.r / 2, s.y - s.r / 2, s.r, s.r);
      }
      for (const b of bright) {
        const k = 0.55 + 0.45 * Math.sin(b.p + t * 0.025 * b.s);
        const r = b.r * (0.75 + 0.25 * k);
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.rot + Math.sin(t * 0.004 + b.p) * 0.12);
        g.globalAlpha = 0.5 + 0.5 * k;
        g.drawImage(SPARK[b.c], -r, -r, r * 2, r * 2);
        g.restore();
      }

      if (t >= nextMeteor) spawnMeteor();
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.life += dt;
        m.x += m.dx * m.v * dt;
        m.y += m.dy * m.v * dt;
        if (m.life > m.max) { meteors.splice(i, 1); continue; }
        const f = Math.min(1, m.life / 8) * Math.min(1, (m.max - m.life) / 18);
        const tx = m.x - m.dx * m.len, ty = m.y - m.dy * m.len;
        const gr = g.createLinearGradient(m.x, m.y, tx, ty);
        gr.addColorStop(0, `rgba(255,255,255,${0.95 * f})`);
        gr.addColorStop(0.25, `rgba(${TINTS[m.c]},${0.45 * f})`);
        gr.addColorStop(1, `rgba(${TINTS[m.c]},0)`);
        g.globalAlpha = 1;
        g.strokeStyle = gr;
        g.lineCap = "round";
        g.lineWidth = 3.2;
        g.beginPath();
        g.moveTo(m.x, m.y);
        g.lineTo(tx, ty);
        g.stroke();
        g.globalAlpha = f;
        g.drawImage(DOT[m.c], m.x - 20, m.y - 20, 40, 40);
      }

      for (let i = 0; i < dust.length; i++) {
        const d = dust[i];
        d.x += (d.vx + Math.sin(t * 0.012 + d.p) * 0.18) * d.z * dt;
        d.y += d.vy * d.z * dt;
        if (d.y > o.h + 30 || d.x < -120 || d.x > o.w + 120) { dust[i] = newDust(true); continue; }
        const k = Math.pow(Math.abs(Math.sin(d.p + t * 0.03)), 2);
        const r = (5 + 7 * d.z) * (0.55 + 0.45 * k);
        g.save();
        g.translate(d.x, d.y);
        g.rotate(d.rot);
        g.globalAlpha = (0.15 + 0.85 * k) * (0.5 + 0.4 * d.z);
        g.drawImage(SPARK[d.c], -r, -r, r * 2, r * 2);
        g.restore();
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return { stop: () => (running = false) };
  }

  // ---------------------------------------------------------------- Milky Way (static, drawn once)
  /** Diagonal Milky Way band with nebula glow, dust lanes and dense faint stars. */
  function milkyWay({ w = 1920, h = 1080, seed = 5, from = [-0.05, 0.92], to = [1.05, 0.02], width = 0.17 } = {}) {
    const R = rng(seed);
    const c = document.createElement("canvas");
    c.className = "milky-way";
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    const [x0, y0] = [from[0] * w, from[1] * h], [x1, y1] = [to[0] * w, to[1] * h];
    const len = Math.hypot(x1 - x0, y1 - y0), nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    const bw = width * h;
    const gauss = () => (R() + R() + R() + R() - 2) / 2; // ~N(0, .58)
    const at = (u, off) => [x0 + (x1 - x0) * u + nx * off, y0 + (y1 - y0) * u + ny * off];
    const blob = (x, y, r, rgba) => {
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, rgba);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };

    g.globalCompositeOperation = "lighter";
    const NEB = ["120,110,255", "90,140,255", "190,120,240", "110,200,255", "255,150,210"];
    for (let i = 0; i < 70; i++) {
      const u = R();
      const [x, y] = at(u, gauss() * bw * 0.6);
      const col = NEB[Math.floor(R() * NEB.length)];
      blob(x, y, bw * (0.5 + R() * 0.9), `rgba(${col},${(0.045 + R() * 0.06).toFixed(3)})`);
    }
    for (let i = 0; i < 30; i++) {
      const [x, y] = at(R(), gauss() * bw * 0.3);
      blob(x, y, bw * (0.25 + R() * 0.35), `rgba(235,232,255,${(0.04 + R() * 0.05).toFixed(3)})`);
    }
    // dark dust lanes
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 34; i++) {
      const [x, y] = at(R(), (gauss() * 0.25 + 0.08) * bw);
      blob(x, y, bw * (0.12 + R() * 0.22), `rgba(0,0,0,${(0.25 + R() * 0.3).toFixed(2)})`);
    }
    // star clouds
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 3400; i++) {
      const [x, y] = at(R(), gauss() * bw * 0.75);
      const r = 0.35 + Math.pow(R(), 3) * 1.3;
      g.fillStyle = `rgba(${tint(R())},${(0.25 + R() * 0.6).toFixed(2)})`;
      g.beginPath();
      g.arc(x, y, r, 0, 6.283);
      g.fill();
    }
    // a light sprinkle over the whole sky
    for (let i = 0; i < 520; i++) {
      g.fillStyle = `rgba(${tint(R())},${(0.15 + R() * 0.45).toFixed(2)})`;
      g.beginPath();
      g.arc(R() * w, Math.pow(R(), 1.2) * h * 0.85, 0.4 + R() * 0.8, 0, 6.283);
      g.fill();
    }
    return c;
  }

  // ---------------------------------------------------------------- constellation clusters (SVG)
  let uid = 0;
  /**
   * Corner constellation ornament. anchor: tl|tr|bl|br. Returns an element sized w×h
   * positioned by the caller: a few large sparkles near the corner, constellations
   * (stars joined by a minimum spanning tree) and fine star dust.
   */
  function constellations({ w = 420, h = 360, anchor = "tl", stars = 14, sparkles = 7, seed = 7, size = 1, sway = true } = {}) {
    const id = ++uid;
    const R = rng(seed);
    const fx = anchor.includes("r") ? -1 : 1, fy = anchor.includes("b") ? -1 : 1;
    const ox = fx > 0 ? 0 : w, oy = fy > 0 ? 0 : h;
    const reach = Math.min(w, h) * 0.95;
    const pos = (spread, pow = 1.1) => {
      const r = (0.12 + Math.pow(R(), pow) * 0.88) * reach * spread;
      const a = R() * (Math.PI / 2);
      return [ox + fx * Math.cos(a) * r * (w / Math.min(w, h)), oy + fy * Math.sin(a) * r * (h / Math.min(w, h)), r / reach];
    };
    const f = (n) => n.toFixed(1);

    // constellation nodes + MST links (long links dropped so it splits into several figures)
    const pts = Array.from({ length: stars }, () => pos(1.0, 0.9));
    const inTree = [0], edges = [];
    const maxLink = reach * 0.42;
    while (inTree.length < pts.length) {
      let best = null;
      for (const i of inTree) for (let j = 0; j < pts.length; j++) {
        if (inTree.includes(j)) continue;
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
        if (!best || d < best.d) best = { i, j, d };
      }
      inTree.push(best.j);
      if (best.d < maxLink) edges.push(best);
    }
    let lines = "", nodes = "";
    for (const e of edges) lines += `<line x1="${f(pts[e.i][0])}" y1="${f(pts[e.i][1])}" x2="${f(pts[e.j][0])}" y2="${f(pts[e.j][1])}"/>`;
    pts.forEach(([x, y], i) => {
      const r = (1.8 + R() * 2.6) * size;
      nodes += `<g transform="translate(${f(x)} ${f(y)})"><circle class="tw" r="${f(r)}" fill="rgb(${tint(R())})" style="animation-duration:${f(2.6 + R() * 3)}s;animation-delay:${f(-R() * 4)}s"/>${i % 3 === 0 ? `<path class="tw" d="${sparklePath(r * 3.2)}" fill="#fff" opacity=".85" style="animation-duration:${f(3 + R() * 3)}s;animation-delay:${f(-R() * 4)}s"/>` : ""}</g>`;
    });

    // big sparkles, larger near the corner
    let big = "";
    const sp = [];
    for (let i = 0; i < sparkles; i++) {
      const [x, y, d] = pos(0.85, 1.4);
      sp.push({ x, y, L: (12 + R() * 22) * (1.45 - d * 0.9) * size, rot: (R() - 0.5) * 20 });
    }
    sp.sort((a, b) => a.L - b.L);
    for (const s of sp) {
      big += `<g transform="translate(${f(s.x)} ${f(s.y)}) rotate(${f(s.rot)})"><g class="tw" style="animation-duration:${f(3.5 + R() * 3)}s;animation-delay:${f(-R() * 5)}s">` +
        `<circle r="${f(s.L * 0.55)}" fill="url(#hg${id})"/>` +
        `<path d="${sparklePath(s.L * 0.5, 0.16)}" transform="rotate(45)" fill="#fff" opacity=".55"/>` +
        `<path d="${sparklePath(s.L, 0.12)}" fill="url(#sg${id})"/></g></g>`;
    }

    // fine star dust
    let dust = "";
    for (let i = 0; i < Math.round(stars * 2.2); i++) {
      const [x, y] = pos(1.15, 1);
      dust += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.6 + R() * 1.6)}" fill="#fff" opacity="${(0.35 + R() * 0.55).toFixed(2)}"/>`;
    }

    const wrap = document.createElement("div");
    wrap.className = "constellation" + (sway ? " sway" : "");
    wrap.style.cssText = `position:absolute;width:${w}px;height:${h}px;pointer-events:none;transform-origin:${fx > 0 ? "0" : "100%"} ${fy > 0 ? "0" : "100%"};`;
    if (sway) wrap.style.animation = `drift-float ${9 + R() * 5}s ease-in-out ${-R() * 6}s infinite`;
    wrap.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible">
      <defs>
        <radialGradient id="sg${id}"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f4f2ff"/><stop offset="1" stop-color="#cfd6ff"/></radialGradient>
        <radialGradient id="hg${id}"><stop offset="0" stop-color="#dfe4ff" stop-opacity=".55"/><stop offset="1" stop-color="#8f9cff" stop-opacity="0"/></radialGradient>
        <filter id="gl${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <g class="c-lines" stroke="rgba(214,222,255,.5)" stroke-width="${f(1.3 * size)}" stroke-linecap="round" stroke-dasharray="${f(5 * size)} ${f(4 * size)}">${lines}</g>
      <g>${dust}</g>
      <g filter="url(#gl${id})">${nodes}${big}</g>
    </svg>`;
    return wrap;
  }

  // ---------------------------------------------------------------- horizon
  /** Layered hills with a pine-tree line on the nearest ridge and a soft horizon glow. */
  function landscape({ w = 1920, h = 1080, seed = 3 } = {}) {
    const R = rng(seed);
    // smooth ridge from a few random sine waves; returns y(x)
    const ridge = (base, amp) => {
      const waves = Array.from({ length: 3 }, (_, i) => ({ f: (1.2 + R() * 2.2) * (i + 1), p: R() * 6.28, a: 1 / (i + 1.4) }));
      const norm = waves.reduce((s, v) => s + v.a, 0);
      return (x) => base - amp * (0.5 + 0.5 * waves.reduce((s, v) => s + v.a * Math.sin((x / w) * v.f * Math.PI + v.p), 0) / norm);
    };
    const hillPath = (y) => {
      let d = `M0 ${h} L0 ${y(0).toFixed(1)}`;
      for (let x = 16; x <= w; x += 16) d += ` L${x} ${y(x).toFixed(1)}`;
      return d + ` L${w} ${h} Z`;
    };
    const far = ridge(h * 0.74, 130), mid = ridge(h * 0.83, 90), near = ridge(h * 0.92, 60);

    // pines in a few groups along the near ridge
    let trees = "";
    const groups = Array.from({ length: 4 }, () => { const c = R() * w, half = 80 + R() * 170; return [c - half, c + half]; });
    for (let x = -10; x < w + 10; x += 9 + R() * 16) {
      if (!groups.some(([a, b]) => x > a && x < b)) continue;
      const th = 34 + R() * 70, tw = th * (0.32 + R() * 0.08), y = near(x) + 6;
      // trunk, then three overlapping tiers
      let d = `M${(x - 1.5).toFixed(1)} ${y.toFixed(1)} h3 v${(-th * 0.2).toFixed(1)} h-3z`;
      for (let k = 0; k < 3; k++) {
        const top = y - th * (0.45 + k * 0.28), base = y - th * (0.12 + k * 0.26), half = tw * (1 - k * 0.24) / 2;
        d += ` M${(x - half).toFixed(1)} ${base.toFixed(1)} L${x.toFixed(1)} ${top.toFixed(1)} L${(x + half).toFixed(1)} ${base.toFixed(1)} Z`;
      }
      trees += `<path d="${d}"/>`;
    }

    const div = document.createElement("div");
    div.className = "landscape";
    div.innerHTML = `
      <svg class="hills" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="hz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f7cff" stop-opacity="0"/><stop offset=".7" stop-color="#8a7cf0" stop-opacity=".2"/><stop offset="1" stop-color="#b48ce8" stop-opacity=".32"/></linearGradient>
          <linearGradient id="h1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#262c7a"/><stop offset="1" stop-color="#141850"/></linearGradient>
          <linearGradient id="h2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#161b58"/><stop offset="1" stop-color="#0b0e36"/></linearGradient>
          <linearGradient id="h3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0d34"/><stop offset="1" stop-color="#04061c"/></linearGradient>
        </defs>
        <rect x="0" y="${h * 0.5}" width="${w}" height="${h * 0.3}" fill="url(#hz)"/>
        <path d="${hillPath(far)}" fill="url(#h1)" opacity=".8"/>
        <path d="${hillPath(mid)}" fill="url(#h2)"/>
        <g fill="#080b2c">${trees}</g>
        <path d="${hillPath(near)}" fill="url(#h3)"/>
      </svg>`;
    return div;
  }

  // ---------------------------------------------------------------- frames
  function frameSVG(w, h, { gap = 10, cut = 16, dots = true } = {}) {
    const o = -gap, W = w + gap, H = h + gap, c = cut;
    const outer = `M${o + c} ${o} H${W - c} L${W} ${o + c} V${H - c} L${W - c} ${H} H${o + c} L${o} ${H - c} V${o + c} Z`;
    const star = (x, y, L = 7) => `<path d="${sparklePath(L, 0.16)}" transform="translate(${x} ${y})" fill="#fff"/>`;
    let extra = star(o + c / 2, o + c / 2) + star(W - c / 2, o + c / 2) + star(W - c / 2, H - c / 2) + star(o + c / 2, H - c / 2);
    if (dots) {
      for (let i = 0; i < 3; i++) extra += `<circle cx="${o + 7}" cy="${o + c + 22 + i * 10}" r="2.2" fill="#fff"/>`;
      for (let i = 0; i < 3; i++) extra += `<circle cx="${W - 7}" cy="${H - c - 22 - i * 10}" r="2.2" fill="#fff"/>`;
    }
    const vb = `${-gap - 4} ${-gap - 4} ${w + 2 * gap + 8} ${h + 2 * gap + 8}`;
    return `<svg class="frame-lines" viewBox="${vb}" style="inset:${-gap - 4}px;width:${w + 2 * gap + 8}px;height:${h + 2 * gap + 8}px">
      <path d="${outer}" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="1.6"/>
      <rect x="-3" y="-3" width="${w + 6}" height="${h + 6}" rx="8" fill="none" stroke="rgba(207,214,255,.55)" stroke-width="1.2"/>
      ${extra}
    </svg>`;
  }

  function frame(parent, { x, y, w, h, label = "", gap, cut, dots, cls = "" }) {
    const f = document.createElement("div");
    f.className = "frame " + cls;
    f.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    f.innerHTML = frameSVG(w, h, { gap, cut, dots }) + (label ? `<div class="frame-label">${label}</div>` : "");
    parent.appendChild(f);
    return f;
  }

  // Arched window: rounded top of radius R, small radius r at the bottom.
  function archPath(x, y, w, h, R, r) {
    return `M${x} ${y + R}A${R} ${R} 0 0 1 ${x + R} ${y}H${x + w - R}A${R} ${R} 0 0 1 ${x + w} ${y + R}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}Z`;
  }

  function archFrame(parent, { x, y, w, h, R = 150, r = 12, gap = 12, label = "", cls = "" }) {
    const f = document.createElement("div");
    f.className = "frame arch-frame " + cls;
    f.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    const pad = gap + 30;
    const outer = archPath(-gap, -gap, w + 2 * gap, h + 2 * gap, R + gap, r + gap);
    const inner = archPath(-3, -3, w + 6, h + 6, R + 3, r + 3);
    const star = (cx, cy, L) => `<path d="${sparklePath(L, 0.15)}" transform="translate(${cx} ${cy})" fill="#fff"/>`;
    let orn = star(w / 2, -gap, 13) + star(-gap, h + gap - r - gap, 8) + star(w + gap, h + gap - r - gap, 8);
    for (let i = -2; i <= 2; i++) if (i) orn += `<circle cx="${w / 2 + i * 18}" cy="${-gap}" r="${i % 2 ? 2 : 2.6}" fill="#fff" opacity=".85"/>`;
    for (let i = 0; i < 3; i++) orn += `<circle cx="${-gap + 8}" cy="${R + 40 + i * 11}" r="2.2" fill="#fff"/><circle cx="${w + gap - 8}" cy="${R + 40 + i * 11}" r="2.2" fill="#fff"/>`;
    f.innerHTML = `<svg class="frame-lines" viewBox="${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}" style="inset:${-pad}px;width:${w + 2 * pad}px;height:${h + 2 * pad}px">
        <path d="${outer}" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="1.8"/>
        <path d="${inner}" fill="none" stroke="rgba(207,214,255,.55)" stroke-width="1.2"/>
        ${orn}
      </svg>` + (label ? `<div class="frame-label">${label}</div>` : "");
    parent.appendChild(f);
    return f;
  }

  /** Small one-shot burst of stars/sparkles at (x, y) inside `parent` (DOM based). */
  function burst(parent, x, y, n = 18) {
    for (let i = 0; i < n; i++) {
      const p = document.createElement("i");
      p.className = i % 3 ? "burst-star" : "burst-spark";
      const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 180;
      p.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d - 40).toFixed(0)}px;--r:${(Math.random() * 360 - 180).toFixed(0)}deg;animation-delay:${(Math.random() * 0.15).toFixed(2)}s`;
      parent.appendChild(p);
      setTimeout(() => p.remove(), 1800);
    }
  }

  window.FX = { Sky, milkyWay, constellations, landscape, frame, frameSVG, archPath, archFrame, burst, sparklePath, rng };
})();
