// Phase 6 add-on: keyboard and screen-reader access. install(ctx) is called by shell.js before the first level starts.
// Adds: skip link, polite live region, "Explore" list of parts/portals, Space-to-pause and a key-help tip on the stage,
// live reduced-motion, and a light accessible-name audit. Styles live in assets/css/a11y.css (injected here).
const LIST_LIMIT = 60;

export function install(ctx) {
  const { engine, panelEl, stageEl, lens, root = "" } = ctx;
  const canvas = engine.canvas;

  // ---- styles ----
  if (!document.querySelector("link[data-a11y]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = `${root}assets/css/a11y.css`; link.dataset.a11y = "";
    document.head.appendChild(link);
  }

  // ---- skip link + live region ----
  panelEl.id ||= "panel";
  panelEl.tabIndex = -1;
  const skip = document.createElement("a");
  skip.className = "a11y-skip"; skip.href = "#panel"; skip.textContent = "Skip to controls";
  skip.addEventListener("click", (e) => { e.preventDefault(); panelEl.focus({ preventScroll: false }); });
  document.body.prepend(skip);

  const live = document.createElement("div");
  live.className = "a11y-sr-only"; live.setAttribute("aria-live", "polite"); live.setAttribute("role", "status");
  document.body.appendChild(live);
  let liveFlip = false;
  const say = (msg) => { liveFlip = !liveFlip; live.textContent = msg + (liveFlip ? "" : "\u00a0"); };

  // ---- canvas keyboard help ----
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-roledescription", "3D view");
  const tipId = "a11y-keys";
  const tip = document.createElement("div");
  tip.id = tipId; tip.className = "a11y-keys"; tip.setAttribute("role", "note");
  tip.innerHTML = "<b>Keyboard</b><span><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> orbit</span><span><kbd>+</kbd><kbd>−</kbd> zoom</span>" +
    "<span><kbd>Enter</kbd> dive into the selected part</span><span><kbd>Esc</kbd> go up a level</span><span><kbd>Space</kbd> pause or play</span>";
  stageEl.appendChild(tip);
  canvas.setAttribute("aria-describedby", tipId);
  canvas.addEventListener("focus", () => { if (canvas.matches(":focus-visible")) tip.classList.add("show"); });
  canvas.addEventListener("blur", () => tip.classList.remove("show"));
  canvas.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      stageEl.querySelector(".cs-pause")?.click();
      say(engine.paused ? "Paused" : "Playing");
    }
  });
  const hint = stageEl.querySelector(".cs-hint");
  if (hint && !hint.dataset.kb) { hint.dataset.kb = "1"; hint.insertAdjacentHTML("beforeend", " · or click the view and use the arrow keys, + / −, Enter, Esc and Space"); }

  // ---- reduced motion (engine reads it once at construction; keep it live) ----
  try {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { engine.reducedMotion = mq.matches; document.documentElement.classList.toggle("reduce-motion", mq.matches); };
    sync(); mq.addEventListener?.("change", sync);
  } catch {}

  // ---- Explore card ----
  const card = document.createElement("section");
  card.className = "card a11y-explore"; card.setAttribute("aria-labelledby", "a11y-explore-h");
  card.innerHTML = `<h2 id="a11y-explore-h" class="a11y-explore-h"><button type="button" class="a11y-explore-toggle" aria-expanded="false" aria-controls="a11y-explore-body">Explore with the keyboard <span aria-hidden="true">▾</span></button></h2>
    <div id="a11y-explore-body" hidden><p class="hint a11y-explore-note"></p><ul class="a11y-explore-list"></ul></div>`;
  panelEl.prepend(card);
  // other add-ons insert cards into the panel too: keep ours first (cheap, only moves when something got in front)
  let keeping = false;
  new MutationObserver(() => {
    if (keeping || panelEl.firstElementChild === card) return;
    keeping = true; panelEl.prepend(card); keeping = false;
  }).observe(panelEl, { childList: true });
  const toggle = card.querySelector(".a11y-explore-toggle"), body = card.querySelector("#a11y-explore-body");
  const note = card.querySelector(".a11y-explore-note"), list = card.querySelector(".a11y-explore-list");
  toggle.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    toggle.setAttribute("aria-expanded", String(open)); body.hidden = !open;
    card.classList.toggle("open", open);
  });

  // same visibility rule as Engine.pick: hidden, clay-hidden or hidden-by-ancestor parts can't be picked
  const pickable = (o) => { for (let x = o; x; x = x.parent) if (x.visible === false || x.userData?.clayHidden) return false; return true; };
  const tmpV = engine.camera.position.clone();
  const hitFor = (obj, id) => {
    const v = tmpV.clone();
    try {
      if (id != null && obj.isInstancedMesh) { const m = new engine.camera.matrix.constructor(); obj.getMatrixAt(id, m); v.setFromMatrixPosition(m).applyMatrix4(obj.matrixWorld); }
      else obj.getWorldPosition(v);
    } catch {}
    return id != null ? { object: obj, point: v, instanceId: id } : { object: obj, point: v };
  };
  const selectPart = (obj, info, id) => {
    if (!pickable(obj)) { say(`${info.title || "That part"} is not visible right now.`); rebuild(); return; }
    const hit = hitFor(obj, id);
    try { engine.click({ a11y: true }, hit); } catch { engine.select({ ...info, ...hit }); }
    canvas.focus({ preventScroll: true });
    say(`${info.title || info.name || "Part"} selected.${info.portal ? " Press Enter to dive in." : ""}`);
  };

  const entries = () => {
    const L = engine.current, seen = new Set(), out = [];
    if (!L) return out;
    const add = (title, run, kind) => { const k = kind + title; if (!title || seen.has(k)) return; seen.add(k); out.push({ title, run, kind }); };
    for (const p of L.portals || []) add(p.label, () => { say(`Diving into ${p.label}.`); engine.dive(p); }, "dive");
    for (const obj of L.pickables || []) {
      if (out.length >= LIST_LIMIT) break;
      if (!pickable(obj)) continue;
      let info = null;
      try { info = L.info?.(obj); } catch {}
      const title = info && (info.title || info.name || info.label);
      if (!title) continue;
      const t = String(title).replace(/<[^>]+>/g, "");
      if (obj.isInstancedMesh) {
        const n = Math.min(obj.count || 0, 3);   // first few instances (e.g. base pairs)
        for (let k = 0; k < n; k++) add(`${t} (no. ${k + 1})`, () => selectPart(obj, info, k), "select");
      } else add(t, () => selectPart(obj, info), "select");
    }
    return out;
  };

  // cheap signature of the live pickable set; rebuild when it changes (checked about once a second)
  const signature = () => {
    const L = engine.current; let n = 0, h = 0;
    for (const o of L?.pickables || []) if (pickable(o)) { n++; h = (h * 31 + (o.id | 0)) | 0; }
    return n + ":" + h + ":" + (engine.stack?.length || 0);
  };
  let lastSig = "";
  setInterval(() => { if (document.hidden || engine.busy) return; const g = signature(); if (g !== lastSig) { lastSig = g; rebuild(); } }, 1000);

  let stamp = 0;
  const rebuild = () => {
    const mine = ++stamp;
    const L = engine.current;
    list.textContent = "";
    if (!L) return;
    const items = entries();
    note.textContent = items.length ? `${items.length} part${items.length === 1 ? "" : "s"} you can pick in this view. Choose one to select it` + (L.portals?.length ? ", or dive in." : ".") : "Nothing to pick in this view. Use the buttons in the panel.";
    for (const it of items) {
      const li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.className = "btn a11y-explore-btn";
      b.textContent = it.kind === "dive" ? `Dive into ${it.title}` : it.title;
      b.addEventListener("click", () => mine === stamp && it.run());
      li.appendChild(b); list.appendChild(li);
    }
  };
  // level contents mount just after onChange fires, so rebuild again shortly after
  const rebuildSoon = () => { rebuild(); setTimeout(rebuild, 600); };

  ctx.onChange((stack) => {
    const title = stack.at(-1)?.title || "level";
    say(`Now viewing ${title}.${stack.length > 1 ? " Press Escape to go up." : ""}`);
    canvas.setAttribute("aria-label", `Interactive 3D view: ${title}. Click the view, then use the arrow keys to orbit and plus and minus to zoom. The Explore list in the side panel lists the parts you can select.`);
    rebuildSoon(); audit();
  });
  lens?.on?.(() => setTimeout(rebuild, 200));

  // announce selections too (engine calls this.onSelect after each pick)
  const prevSel = engine.onSelect;
  engine.onSelect = (info) => { prevSel?.(info); if (info?.title) say(`${info.title} selected.`); };

  // ---- accessible-name audit (cheap, runs on level change) ----
  function audit() {
    setTimeout(() => {
      for (const b of document.querySelectorAll("button, [role=button]")) {
        if (b.hasAttribute("aria-label") || b.hasAttribute("aria-labelledby") || b.textContent.trim()) continue;
        b.setAttribute("aria-label", b.title || b.dataset.label || "Button");
      }
      for (const s of document.querySelectorAll("input:not([aria-label]):not([aria-labelledby])")) {
        if (!s.labels?.length && s.type !== "hidden") s.setAttribute("aria-label", s.title || s.name || "Control");
      }
      for (const seg of document.querySelectorAll(".segmented")) {
        for (const b of seg.querySelectorAll("button:not([aria-pressed])")) b.setAttribute("aria-pressed", String(b.classList.contains("active") || b.classList.contains("on")));
      }
    }, 700);
  }
  audit();
}
