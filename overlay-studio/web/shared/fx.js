// Moonlit Blossom visuals: night sky canvas (stars, fireflies, butterflies, falling
// petals), glowing blossom clusters, landscape and frame ornaments.
(function () {
  // Deterministic PRNG so decorations look identical on every reload.
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
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
      gr.addColorStop(0.18, `rgba(${rgb},0.95)`);
      gr.addColorStop(0.45, `rgba(${rgb},0.28)`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    });
  const petalSprite = () =>
    sprite(64, (g, s) => {
      g.translate(s / 2, s / 2);
      g.shadowColor = "rgba(210,205,255,0.95)";
      g.shadowBlur = 12;
      const gr = g.createLinearGradient(0, -16, 0, 16);
      gr.addColorStop(0, "#ffffff");
      gr.addColorStop(1, "#e6e4ff");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, 15);
      g.bezierCurveTo(-13, 6, -12, -10, -3, -15);
      g.lineTo(0, -11);
      g.lineTo(3, -15);
      g.bezierCurveTo(12, -10, 13, 6, 0, 15);
      g.fill();
    });

  // ---------------------------------------------------------------- sky canvas
  function Sky(canvas, opts = {}) {
    const o = { stars: 110, fireflies: 22, petals: 26, butterflies: 4, w: 1920, h: 1080, clip: null, ...opts };
    canvas.width = o.w;
    canvas.height = o.h;
    const g = canvas.getContext("2d");
    const R = Math.random;
    const SPR = { star: glowSprite("200,198,255"), fly: glowSprite("255,226,150"), petal: petalSprite(), wing: glowSprite("255,236,180") };

    const stars = Array.from({ length: o.stars }, () => ({ x: R() * o.w, y: R() * o.h * 0.75, r: 4 + R() * 9, p: R() * 6.28, s: 0.6 + R() * 1.6 }));
    const flies = Array.from({ length: o.fireflies }, () => ({ x: R() * o.w, y: o.h * (0.25 + R() * 0.75), a: R() * 6.28, v: 0.15 + R() * 0.35, p: R() * 6.28, r: 14 + R() * 18 }));
    const newPetal = (top) => ({
      x: R() * (o.w + 300) - 150, y: top ? -40 - R() * 200 : R() * o.h, z: 0.45 + R() * 0.9,
      rot: R() * 6.28, vr: (R() - 0.5) * 0.03, flip: R() * 6.28, vf: 0.02 + R() * 0.04,
      vy: 0.5 + R() * 0.8, sway: 0.6 + R() * 1.4, ph: R() * 6.28,
    });
    const petals = Array.from({ length: o.petals }, () => newPetal(false));
    const bflies = Array.from({ length: o.butterflies }, () => ({ x: R() * o.w, y: o.h * (0.15 + R() * 0.6), a: R() * 6.28, v: 0.5 + R() * 0.5, p: R() * 6.28, s: 0.8 + R() * 0.5 }));

    let last = performance.now(), t = 0, running = true;
    function frame(now) {
      if (!running) return;
      const dt = Math.min(3, (now - last) / 16.67);
      last = now;
      t += dt;
      g.clearRect(0, 0, o.w, o.h);
      g.globalCompositeOperation = "lighter";

      for (const s of stars) {
        const a = 0.25 + 0.75 * Math.abs(Math.sin(s.p + t * 0.02 * s.s));
        g.globalAlpha = a * 0.8;
        g.drawImage(SPR.star, s.x - s.r / 2, s.y - s.r / 2, s.r, s.r);
      }
      for (const f of flies) {
        f.a += (Math.sin(t * 0.01 + f.p) * 0.03);
        f.x += Math.cos(f.a) * f.v * dt;
        f.y += Math.sin(f.a) * f.v * dt * 0.6;
        if (f.x < -40) f.x = o.w + 40; if (f.x > o.w + 40) f.x = -40;
        if (f.y < o.h * 0.15) f.a = Math.abs(f.a); if (f.y > o.h + 20) f.a = -Math.abs(f.a);
        const blink = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.045 + f.p));
        g.globalAlpha = blink;
        g.drawImage(SPR.fly, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
      }
      for (const b of bflies) {
        b.a += Math.sin(t * 0.008 + b.p) * 0.02;
        b.x += Math.cos(b.a) * b.v * dt;
        b.y += Math.sin(b.a) * b.v * dt * 0.5 + Math.sin(t * 0.08 + b.p) * 0.4;
        if (b.x < -60) b.x = o.w + 60; if (b.x > o.w + 60) b.x = -60;
        if (b.y < 60 || b.y > o.h - 120) b.a = -b.a;
        const flap = Math.abs(Math.sin(t * 0.22 + b.p));
        g.save();
        g.translate(b.x, b.y);
        g.rotate(Math.cos(b.a) > 0 ? 0.25 : -0.25);
        g.globalAlpha = 0.55;
        g.drawImage(SPR.wing, -34 * b.s, -34 * b.s, 68 * b.s, 68 * b.s);
        g.globalAlpha = 0.95;
        g.fillStyle = "rgba(255,240,200,0.95)";
        for (const side of [-1, 1]) {
          g.save();
          g.scale(side * (0.25 + 0.75 * flap), 1);
          g.beginPath();
          g.ellipse(7 * b.s, -5 * b.s, 8 * b.s, 6 * b.s, -0.5, 0, 6.28);
          g.ellipse(5.5 * b.s, 5 * b.s, 5.5 * b.s, 4.5 * b.s, 0.5, 0, 6.28);
          g.fill();
          g.restore();
        }
        g.restore();
      }
      g.globalCompositeOperation = "source-over";
      for (let i = 0; i < petals.length; i++) {
        const p = petals[i];
        p.y += p.vy * p.z * dt;
        p.x += (Math.sin(t * 0.02 + p.ph) * p.sway + 0.35) * p.z * dt;
        p.rot += p.vr * dt;
        p.flip += p.vf * dt;
        if (p.y > o.h + 40 || p.x > o.w + 80) { petals[i] = newPetal(true); continue; }
        const sz = 26 * p.z;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.scale(Math.cos(p.flip), 1);
        g.globalAlpha = 0.55 + 0.4 * p.z / 1.35;
        g.drawImage(SPR.petal, -sz / 2, -sz / 2, sz, sz);
        g.restore();
      }
      g.globalAlpha = 1;
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return { stop: () => (running = false) };
  }

  // ---------------------------------------------------------------- blossom clusters (SVG)
  let uid = 0;
  function petalPath(L) {
    return `M0 0 C${-0.56 * L} ${-0.24 * L} ${-0.5 * L} ${-0.86 * L} ${-0.13 * L} ${-L} L0 ${-0.86 * L} L${0.13 * L} ${-L} C${0.5 * L} ${-0.86 * L} ${0.56 * L} ${-0.24 * L} 0 0Z`;
  }
  function leafPath(L) {
    return `M0 0 C${0.38 * L} ${-0.22 * L} ${0.36 * L} ${-0.78 * L} 0 ${-L} C${-0.36 * L} ${-0.78 * L} ${-0.38 * L} ${-0.22 * L} 0 0Z`;
  }
  function flower(x, y, L, rot, id) {
    let s = `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})">`;
    for (let i = 0; i < 5; i++) s += `<path d="${petalPath(L)}" transform="rotate(${i * 72})" fill="url(#pg${id})"/>`;
    s += `<circle r="${(L * 0.2).toFixed(1)}" fill="#c9d0ff"/>`;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.283 + rot;
      s += `<circle cx="${(Math.cos(a) * L * 0.3).toFixed(1)}" cy="${(Math.sin(a) * L * 0.3).toFixed(1)}" r="${(L * 0.05).toFixed(1)}" fill="#8f9cff"/>`;
    }
    return s + "</g>";
  }
  /**
   * Corner blossom cluster. anchor: tl|tr|bl|br. Returns an element sized w×h
   * positioned by the caller.
   */
  function blossoms({ w = 420, h = 360, anchor = "tl", flowers = 13, leaves = 14, seed = 7, size = 1, sway = true } = {}) {
    const id = ++uid;
    const R = rng(seed);
    const fx = anchor.includes("r") ? -1 : 1, fy = anchor.includes("b") ? -1 : 1;
    const ox = fx > 0 ? 0 : w, oy = fy > 0 ? 0 : h;
    const reach = Math.min(w, h) * 0.95;
    const pos = (spread) => {
      const r = Math.pow(R(), 1.25) * reach * spread;
      const a = R() * (Math.PI / 2);
      return [ox + fx * Math.cos(a) * r * (w / Math.min(w, h)), oy + fy * Math.sin(a) * r * (h / Math.min(w, h)), r / reach];
    };
    let leafS = "", flS = "", budS = "";
    for (let i = 0; i < leaves; i++) {
      const [x, y, d] = pos(1.05);
      const L = (34 + R() * 34) * (1.15 - d * 0.5) * size;
      const rot = R() * 360;
      leafS += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})" opacity="${(0.7 + R() * 0.3).toFixed(2)}"><path d="${leafPath(L)}" fill="url(#lg${id})"/><path d="M0 0 L0 ${(-L * 0.9).toFixed(1)}" stroke="rgba(190,205,255,.45)" stroke-width="1.2"/></g>`;
    }
    const fl = [];
    for (let i = 0; i < flowers * 1.6; i++) {
      const [x, y, d] = pos(0.9);
      fl.push({ x, y, L: (13 + R() * 20) * (1.35 - d * 0.75) * size, rot: R() * 72 });
    }
    fl.sort((a, b) => a.L - b.L);
    for (const f of fl) flS += flower(f.x, f.y, f.L, f.rot, id);
    for (let i = 0; i < Math.round(flowers * 0.8); i++) {
      const [x, y] = pos(1.15);
      budS += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(2 + R() * 4.5).toFixed(1)}" fill="#fff" opacity="${(0.6 + R() * 0.4).toFixed(2)}"/>`;
    }
    const wrap = document.createElement("div");
    wrap.className = "blossoms" + (sway ? " sway" : "");
    wrap.style.cssText = `position:absolute;width:${w}px;height:${h}px;pointer-events:none;transform-origin:${fx > 0 ? "0" : "100%"} ${fy > 0 ? "0" : "100%"};`;
    if (sway) wrap.style.animation = `sway ${7 + R() * 4}s ease-in-out ${-R() * 5}s infinite`;
    wrap.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible">
      <defs>
        <radialGradient id="pg${id}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="scale(30)"><stop offset="0" stop-color="#d9dcff"/><stop offset=".55" stop-color="#ffffff"/></radialGradient>
        <linearGradient id="lg${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2a3fb8"/><stop offset="1" stop-color="#6f88f5"/></linearGradient>
        <filter id="gl${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <g opacity=".95">${leafS}</g>
      <g filter="url(#gl${id})">${flS}${budS}</g>
    </svg>`;
    return wrap;
  }

  // ---------------------------------------------------------------- landscape
  function landscape({ w = 1920, h = 1080, seed = 3 } = {}) {
    const R = rng(seed);
    const hill = (base, amp, n) => {
      let d = `M0 ${h} L0 ${base}`;
      const step = w / n;
      for (let i = 0; i <= n; i++) {
        const x = i * step, y = base - amp * (0.45 + 0.55 * R());
        d += ` Q${(x - step / 2).toFixed(0)} ${(y - amp * 0.5).toFixed(0)} ${x.toFixed(0)} ${y.toFixed(0)}`;
      }
      return d + ` L${w} ${h} Z`;
    };
    const cloud = (cx, cy, s) => {
      let d = "";
      for (let i = 0; i < 6; i++) {
        const x = cx + (i - 2.5) * 46 * s, r = (34 + R() * 34) * s;
        d += `<circle cx="${x.toFixed(0)}" cy="${(cy - r * 0.35).toFixed(0)}" r="${r.toFixed(0)}"/>`;
      }
      return `<g>${d}<rect x="${(cx - 140 * s).toFixed(0)}" y="${cy.toFixed(0)}" width="${(280 * s).toFixed(0)}" height="${(26 * s).toFixed(0)}" rx="${(13 * s).toFixed(0)}"/></g>`;
    };
    const div = document.createElement("div");
    div.className = "landscape";
    div.innerHTML = `
      <svg class="clouds c1" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g fill="#8d89e8" opacity=".10">${cloud(320, 230, 1.3)}${cloud(1500, 170, 1.1)}${cloud(980, 330, 0.9)}</g></svg>
      <svg class="clouds c2" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g fill="#b3afff" opacity=".07">${cloud(700, 140, 1.6)}${cloud(1750, 380, 1.2)}</g></svg>
      <svg class="hills" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="h1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3f9e"/><stop offset="1" stop-color="#1b1f66"/></linearGradient>
          <linearGradient id="h2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#252a7d"/><stop offset="1" stop-color="#11154a"/></linearGradient>
          <linearGradient id="h3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151a5a"/><stop offset="1" stop-color="#080b30"/></linearGradient>
          <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8e8af0" stop-opacity="0"/><stop offset="1" stop-color="#8e8af0" stop-opacity=".22"/></linearGradient>
        </defs>
        <path d="${hill(h * 0.7, 120, 5)}" fill="url(#h1)" opacity=".75"/>
        <rect x="0" y="${h * 0.55}" width="${w}" height="${h * 0.3}" fill="url(#mist)"/>
        <path d="${hill(h * 0.8, 110, 4)}" fill="url(#h2)"/>
        <path d="${hill(h * 0.9, 70, 6)}" fill="url(#h3)"/>
      </svg>`;
    return div;
  }

  // Soft out-of-focus light orbs (ref: image 3)
  function bokeh(n = 14, seed = 11, w = 1920, h = 1080) {
    const R = rng(seed);
    const d = document.createElement("div");
    d.className = "bokeh";
    for (let i = 0; i < n; i++) {
      const s = 30 + R() * 110;
      const b = document.createElement("i");
      b.style.cssText = `left:${(R() * w).toFixed(0)}px;top:${(R() * h * 0.8).toFixed(0)}px;width:${s.toFixed(0)}px;height:${s.toFixed(0)}px;animation-delay:${(-R() * 20).toFixed(1)}s;animation-duration:${(14 + R() * 16).toFixed(1)}s;opacity:${(0.05 + R() * 0.12).toFixed(2)}`;
      d.appendChild(b);
    }
    return d;
  }

  // ---------------------------------------------------------------- frames (ref: image 3)
  function frameSVG(w, h, { gap = 10, cut = 16, dots = true } = {}) {
    const o = -gap, W = w + gap, H = h + gap, c = cut;
    const outer = `M${o + c} ${o} H${W - c} L${W} ${o + c} V${H - c} L${W - c} ${H} H${o + c} L${o} ${H - c} V${o + c} Z`;
    const tab = (x, y) => `<rect x="${x - 3.5}" y="${y - 3.5}" width="7" height="7" transform="rotate(45 ${x} ${y})" fill="#fff"/>`;
    let extra = tab(o + c / 2, o + c / 2) + tab(W - c / 2, o + c / 2) + tab(W - c / 2, H - c / 2) + tab(o + c / 2, H - c / 2);
    if (dots) {
      for (let i = 0; i < 3; i++) extra += `<circle cx="${o + 7}" cy="${o + c + 22 + i * 10}" r="2.2" fill="#fff"/>`;
      for (let i = 0; i < 3; i++) extra += `<circle cx="${W - 7}" cy="${H - c - 22 - i * 10}" r="2.2" fill="#fff"/>`;
    }
    const vb = `${-gap - 4} ${-gap - 4} ${w + 2 * gap + 8} ${h + 2 * gap + 8}`;
    return `<svg class="frame-lines" viewBox="${vb}" style="inset:${-gap - 4}px;width:${w + 2 * gap + 8}px;height:${h + 2 * gap + 8}px">
      <path d="${outer}" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="1.6"/>
      <rect x="-3" y="-3" width="${w + 6}" height="${h + 6}" rx="8" fill="none" stroke="rgba(207,204,255,.55)" stroke-width="1.2"/>
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

  // Arched "moon gate" window: rounded top of radius R, small radius r at the bottom.
  function archPath(x, y, w, h, R, r) {
    return `M${x} ${y + R}A${R} ${R} 0 0 1 ${x + R} ${y}H${x + w - R}A${R} ${R} 0 0 1 ${x + w} ${y + R}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}Z`;
  }

  function archFrame(parent, { x, y, w, h, R = 150, r = 12, gap = 12, label = "", cls = "" }) {
    const f = document.createElement("div");
    f.className = "frame arch-frame " + cls;
    f.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
    const pad = gap + 26;
    const outer = archPath(-gap, -gap, w + 2 * gap, h + 2 * gap, R + gap, r + gap);
    const inner = archPath(-3, -3, w + 6, h + 6, R + 3, r + 3);
    const gem = (cx, cy, s = 5) => `<rect x="${cx - s}" y="${cy - s}" width="${2 * s}" height="${2 * s}" transform="rotate(45 ${cx} ${cy})" fill="#fff"/>`;
    let orn = gem(w / 2, -gap, 7) + gem(-gap, h + gap - r - gap) + gem(w + gap, h + gap - r - gap);
    for (let i = -2; i <= 2; i++) if (i) orn += `<circle cx="${w / 2 + i * 16}" cy="${-gap - 12}" r="${i % 2 ? 2 : 2.6}" fill="#fff" opacity=".85"/>`;
    for (let i = 0; i < 3; i++) orn += `<circle cx="${-gap + 8}" cy="${R + 40 + i * 11}" r="2.2" fill="#fff"/><circle cx="${w + gap - 8}" cy="${R + 40 + i * 11}" r="2.2" fill="#fff"/>`;
    f.innerHTML = `<svg class="frame-lines" viewBox="${-pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}" style="inset:${-pad}px;width:${w + 2 * pad}px;height:${h + 2 * pad}px">
        <path d="${outer}" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="1.8"/>
        <path d="${inner}" fill="none" stroke="rgba(207,204,255,.55)" stroke-width="1.2"/>
        ${orn}
      </svg>` + (label ? `<div class="frame-label">${label}</div>` : "");
    parent.appendChild(f);
    return f;
  }

  /** Small one-shot burst of petals/sparkles at (x, y) inside `parent` (DOM based). */
  function burst(parent, x, y, n = 18) {
    for (let i = 0; i < n; i++) {
      const p = document.createElement("i");
      p.className = i % 3 ? "burst-petal" : "burst-spark";
      const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 180;
      p.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.cos(a) * d).toFixed(0)}px;--dy:${(Math.sin(a) * d - 40).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;animation-delay:${(Math.random() * 0.15).toFixed(2)}s`;
      parent.appendChild(p);
      setTimeout(() => p.remove(), 1800);
    }
  }

  window.FX = { Sky, blossoms, landscape, bokeh, frame, frameSVG, archPath, archFrame, burst, rng };
})();
