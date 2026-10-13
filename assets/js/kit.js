// MixLab shared kit (copied from CellScape) — canvas stage, loop, controls, missions, drawing helpers.
// Plain ES module, no dependencies. Import with: import * as K from "../../assets/js/kit.js";

// ---------- math ----------
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const TAU = Math.PI * 2;

// ---------- colours (match CSS tokens) ----------
export const C = {
  bg0: "#050b16", bg1: "#0a1628", bg2: "#10213a",
  ink: "#e8f1ff", inkDim: "#9fb3cf", inkFaint: "#6a7f9c",
  teal: "#4fd1c5", violet: "#a78bfa", amber: "#fbbf24", red: "#f87171",
  green: "#4ade80", blue: "#60a5fa", pink: "#f472b6", orange: "#fb923c",
  lipidHead: "#b9a7c9", lipidTail: "#5b4a3a",
};

/** Read a CSS custom property (e.g. "--ink-dim") from the page at draw time, so panel canvases follow the theme. */
export function cssVar(name, fallback = "") {
  try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; } catch { return fallback; }
}

/** Chart series colour for the current page theme: the pale dark-theme hues are darkened on the light panel so
 *  lines and text keep contrast. Accepts "#rgb"/"#rrggbb" or "rgb(a)(r,g,b[,a])"; dark theme returns it unchanged. */
export function chartCol(col) {
  try {
    if (document.documentElement.dataset.theme !== "light") return col;
    let r, g, b, a = null, m;
    if ((m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(col))) {
      const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
      r = parseInt(h.slice(0, 2), 16); g = parseInt(h.slice(2, 4), 16); b = parseInt(h.slice(4, 6), 16);
    } else if ((m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\s*\)$/i.exec(col))) {
      r = +m[1]; g = +m[2]; b = +m[3]; a = m[4] == null ? null : +m[4];
    } else return col;
    const k = 0.55, d = (v) => Math.round(v * k);
    return a == null ? `rgb(${d(r)},${d(g)},${d(b)})` : `rgba(${d(r)},${d(g)},${d(b)},${Math.min(1, a + 0.2)})`;
  } catch { return col; }
}

// ---------- stage ----------
/** HiDPI canvas that tracks its container size. ctx is pre-scaled so you draw in CSS pixels. */
export function createStage(canvas, onResize) {
  const ctx = canvas.getContext("2d");
  const stage = { canvas, ctx, w: 0, h: 0, dpr: 1 };
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    stage.dpr = Math.min(window.devicePixelRatio || 1, 2);
    stage.w = Math.max(1, r.width);
    stage.h = Math.max(1, r.height);
    canvas.width = Math.round(stage.w * stage.dpr);
    canvas.height = Math.round(stage.h * stage.dpr);
    ctx.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
    onResize && onResize(stage);
  };
  new ResizeObserver(fit).observe(canvas.parentElement || canvas);
  fit();
  return stage;
}

/** requestAnimationFrame loop. fn(dt seconds, t seconds). dt is clamped to 1/20 s. */
export function loop(fn) {
  let last = performance.now(), t = 0, running = true, speed = 1, id;
  const tick = (now) => {
    const raw = Math.min((now - last) / 1000, 0.05);
    last = now;
    const dt = running ? raw * speed : 0;
    t += dt;
    fn(dt, t);
    id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return {
    get running() { return running; },
    set running(v) { running = v; },
    get speed() { return speed; },
    set speed(v) { speed = v; },
    toggle() { running = !running; return running; },
    stop() { cancelAnimationFrame(id); },
  };
}

/** Pointer tracking on a canvas in CSS-pixel coordinates. */
export function pointer(canvas, { down, move, up } = {}) {
  const p = { x: -1, y: -1, isDown: false, inside: false };
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    p.x = e.clientX - r.left; p.y = e.clientY - r.top;
  };
  canvas.addEventListener("pointerdown", (e) => {
    pos(e); p.isDown = true; canvas.setPointerCapture(e.pointerId); down && down(p, e);
  });
  canvas.addEventListener("pointermove", (e) => { pos(e); p.inside = true; move && move(p, e); });
  canvas.addEventListener("pointerup", (e) => { pos(e); p.isDown = false; up && up(p, e); });
  canvas.addEventListener("pointercancel", () => { p.isDown = false; });
  canvas.addEventListener("pointerleave", () => { p.inside = false; });
  return p;
}

// ---------- drawing ----------
/** Background wash used by every sim so the suite feels consistent. */
export function backdrop(ctx, w, h, tint = "#0d3b44") {
  const g = ctx.createRadialGradient(w * 0.3, h * 0.2, 0, w * 0.5, h * 0.5, Math.max(w, h));
  g.addColorStop(0, tint);
  g.addColorStop(1, C.bg0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Glossy shaded sphere (molecule, ion, organelle). */
export function sphere(ctx, x, y, r, color, { glow = 0, alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow; }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(color, 0.55));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -0.45));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}

/** Soft additive glow blob. */
export function glow(ctx, x, y, r, color, alpha = 0.5) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}

/** Rounded "blob" protein body with vertical shading. */
export function blob(ctx, x, y, w, h, color, radius = Math.min(w, h) * 0.4) {
  ctx.save();
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, shade(color, -0.35));
  g.addColorStop(0.35, shade(color, 0.35));
  g.addColorStop(1, shade(color, -0.4));
  ctx.fillStyle = g;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, radius);
  ctx.fill();
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Horizontal phospholipid bilayer between y0 (top) and y1 (bottom), from x0 to x1.
 * skip(x) → true leaves a gap (for channel proteins). t animates a gentle wobble.
 */
export function bilayer(ctx, x0, x1, y0, y1, { t = 0, headR = 7, skip = null } = {}) {
  const step = headR * 2.05;
  const mid = (y0 + y1) / 2;
  for (let x = x0 + headR; x < x1; x += step) {
    if (skip && skip(x)) continue;
    const wob = Math.sin(x * 0.05 + t * 1.5) * 1.2;
    // tails
    ctx.strokeStyle = C.lipidTail; ctx.lineWidth = 1.6;
    for (const dx of [-headR * 0.35, headR * 0.35]) {
      ctx.beginPath(); ctx.moveTo(x + dx, y0 + headR + wob);
      ctx.quadraticCurveTo(x + dx + Math.sin(t + x) * 1.5, (y0 + mid) / 2, x + dx, mid - 2);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + dx, y1 - headR + wob);
      ctx.quadraticCurveTo(x + dx - Math.sin(t + x) * 1.5, (y1 + mid) / 2, x + dx, mid + 2);
      ctx.stroke();
    }
    sphere(ctx, x, y0 + wob, headR, C.lipidHead);
    sphere(ctx, x, y1 + wob, headR, C.lipidHead);
  }
}

/** Label with dark pill background. */
export function label(ctx, text, x, y, { color = C.ink, size = 12, align = "center", bg = "rgba(5,11,22,0.72)" } = {}) {
  ctx.save();
  ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = "middle";
  const m = ctx.measureText(text);
  const pw = m.width + 12, ph = size + 8;
  const px = align === "center" ? x - pw / 2 : align === "right" ? x - pw + 6 : x - 6;
  if (bg) { ctx.fillStyle = bg; roundRect(ctx, px, y - ph / 2, pw, ph, ph / 2); ctx.fill(); }
  ctx.fillStyle = color; ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

/** Arrow from (x0,y0) to (x1,y1). */
export function arrow(ctx, x0, y0, x1, y1, color = C.ink, width = 2) {
  const a = Math.atan2(y1 - y0, x1 - x0), hl = 6 + width * 2;
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * hl * 0.6, y1 - Math.sin(a) * hl * 0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - Math.cos(a - 0.45) * hl, y1 - Math.sin(a - 0.45) * hl);
  ctx.lineTo(x1 - Math.cos(a + 0.45) * hl, y1 - Math.sin(a + 0.45) * hl);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---------- colour utils ----------
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** amt in [-1,1]: positive lightens toward white, negative darkens toward black. */
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
export function withAlpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
export function mix(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const c = a.map((v, i) => Math.round(lerp(v, b[i], t)));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

// ---------- DOM controls ----------
const el = (tag, attrs = {}, html = "") => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (html) n.innerHTML = html;
  return n;
};
export const $ = (sel, root = document) => root.querySelector(sel);

/** Range slider. Returns { el, input, get value, set value }. */
export function slider(parent, { label: text, min, max, step = 1, value, unit = "", format, onInput }) {
  const wrap = el("div", { class: "control" });
  const id = "s" + Math.random().toString(36).slice(2, 8);
  const fmt = format || ((v) => `${v}${unit}`);
  wrap.innerHTML = `<div class="control-row"><label for="${id}">${text}</label><output></output></div>`;
  const input = el("input", { type: "range", id, min, max, step, value });
  wrap.appendChild(input);
  const out = wrap.querySelector("output");
  const sync = () => { out.textContent = fmt(+input.value); };
  input.addEventListener("input", () => { sync(); onInput && onInput(+input.value); });
  sync();
  parent.appendChild(wrap);
  return {
    el: wrap, input,
    get value() { return +input.value; },
    set value(v) { input.value = v; sync(); },
  };
}

/** Button. kind: "" | "primary". toggle: true makes aria-pressed toggle. */
export function button(parent, text, onClick, { kind = "", toggle = false, pressed = false } = {}) {
  const b = el("button", { class: `btn ${kind}`, type: "button" }, text);
  if (toggle) b.setAttribute("aria-pressed", String(pressed));
  b.addEventListener("click", () => {
    if (toggle) b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    onClick && onClick(toggle ? b.getAttribute("aria-pressed") === "true" : undefined, b);
  });
  parent.appendChild(b);
  return b;
}

export function buttonRow(parent) {
  const r = el("div", { class: "btn-row" });
  parent.appendChild(r);
  return r;
}

/** Segmented choice. options: [{value, label}]. */
export function segmented(parent, options, value, onChange) {
  const wrap = el("div", { class: "segmented", role: "group" });
  const btns = options.map((o) => {
    const b = el("button", { type: "button", "aria-pressed": String(o.value === value) }, o.label);
    b.addEventListener("click", () => { set(o.value); onChange && onChange(o.value); });
    wrap.appendChild(b);
    return b;
  });
  const set = (v) => btns.forEach((b, i) => b.setAttribute("aria-pressed", String(options[i].value === v)));
  parent.appendChild(wrap);
  return { el: wrap, set };
}

export function checkbox(parent, text, checked, onChange) {
  const l = el("label", { class: "toggle" });
  const i = el("input", { type: "checkbox" });
  i.checked = checked;
  i.addEventListener("change", () => onChange && onChange(i.checked));
  l.appendChild(i); l.appendChild(document.createTextNode(text));
  parent.appendChild(l);
  return i;
}

/** Panel card with a heading. Returns the card element. */
export function card(parent, title, cls = "") {
  const c = el("section", { class: `card ${cls}` });
  if (title) c.appendChild(el("h2", {}, title));
  parent.appendChild(c);
  return c;
}

/** Overlay chip on the stage. Returns setter(html). */
export function chip(overlay, html = "") {
  const c = el("div", { class: "chip" }, html);
  overlay.appendChild(c);
  return (h) => { if (c.innerHTML !== h) c.innerHTML = h; };
}

/** Toast message over the stage. */
export function toaster(stageEl) {
  const t = el("div", { class: "toast", role: "status", "aria-live": "polite" });
  stageEl.appendChild(t);
  let timer;
  return (msg, ms = 2600) => {
    t.innerHTML = msg; t.classList.add("show");
    clearTimeout(timer); timer = setTimeout(() => t.classList.remove("show"), ms);
  };
}

/**
 * Missions: [{ text, check: () => boolean }]. Call .update() every frame (cheap).
 * Once a mission is completed it stays completed. onComplete(mission) fires once.
 */
export function missions(parent, list, onComplete) {
  const c = card(parent, "Missions", "missions");
  const ol = el("ol");
  const items = list.map((m) => {
    const li = el("li", {}, m.text);
    ol.appendChild(li);
    return { ...m, li, done: false };
  });
  c.appendChild(ol);
  const bar = el("div", { class: "progress" }, "<div></div>");
  c.appendChild(bar);
  const fill = bar.firstChild;
  const api = {
    update() {
      let n = 0;
      for (const m of items) {
        if (!m.done) {
          let ok = false;
          try { ok = m.check(); } catch { ok = false; }
          if (ok) { m.done = true; m.li.classList.add("done"); onComplete && onComplete(m); }
        }
        if (m.done) n++;
      }
      fill.style.width = `${(n / items.length) * 100}%`;
    },
    get allDone() { return items.every((m) => m.done); },
  };
  return api;
}

/** Quick check quiz. questions: [{ q, options: [..], answer: index, why }]. */
export function quiz(parent, questions) {
  const c = card(parent, "Check your understanding", "quiz");
  let i = 0, score = 0;
  const render = () => {
    if (i >= questions.length) {
      c.innerHTML = `<h2>Check your understanding</h2><p><strong>${score} / ${questions.length}</strong> correct.</p>`;
      const r = buttonRow(c);
      button(r, "Try again", () => { i = 0; score = 0; render(); });
      return;
    }
    const qq = questions[i];
    c.innerHTML = `<h2>Check your understanding · ${i + 1}/${questions.length}</h2><div class="q">${qq.q}</div><div class="opts"></div><div class="fb" aria-live="polite"></div>`;
    const opts = c.querySelector(".opts"), fb = c.querySelector(".fb");
    let answered = false;
    qq.options.forEach((o, k) => {
      const b = button(opts, o, () => {
        if (answered) return;
        answered = true;
        const right = k === qq.answer;
        if (right) score++;
        b.classList.add(right ? "right" : "wrong");
        opts.children[qq.answer].classList.add("right");
        fb.innerHTML = (right ? "✅ " : "❌ ") + (qq.why || "");
        const r = buttonRow(c);
        button(r, i + 1 < questions.length ? "Next →" : "See score", () => { i++; render(); }, { kind: "primary" });
      });
    });
  };
  render();
}

/** Simple particle helper: returns an array-like pool with update/draw hooks left to the caller. */
export function makeParticles(n, factory) {
  return Array.from({ length: n }, (_, i) => factory(i));
}

/** Bounce a particle {x,y,vx,vy,r} inside rect. */
export function bounce(p, x0, y0, x1, y1) {
  if (p.x - p.r < x0) { p.x = x0 + p.r; p.vx = Math.abs(p.vx); }
  if (p.x + p.r > x1) { p.x = x1 - p.r; p.vx = -Math.abs(p.vx); }
  if (p.y - p.r < y0) { p.y = y0 + p.r; p.vy = Math.abs(p.vy); }
  if (p.y + p.r > y1) { p.y = y1 - p.r; p.vy = -Math.abs(p.vy); }
}

/** Brownian jitter: adds random acceleration, damps velocity. */
export function brownian(p, dt, strength = 120, damping = 0.9) {
  p.vx += rand(-1, 1) * strength * dt;
  p.vy += rand(-1, 1) * strength * dt;
  const d = Math.pow(damping, dt * 60);
  p.vx *= d; p.vy *= d;
  p.x += p.vx * dt; p.y += p.vy * dt;
}
