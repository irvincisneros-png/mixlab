// Boots a MixLab 3D page (engine copied from CellScape; see README): header breadcrumbs, year lens, stage, panel, engine, main loop.
// Used by the homepage (the lab bench) and by station pages.
import * as K from "../kit.js";
import { Engine } from "./engine.js";
import { lens, BANDS } from "./lens.js";

// Each station on the lab bench is a level. Ids are stable (they appear in class links: ?start=<id>).
export const LEVELS = {
  bench: { title: "Lab bench", load: () => import("./levels/bench.js") },
  states: { title: "States of matter", load: () => import("./levels/states.js") },
  particles: { title: "Water particles", load: () => import("./levels/statesParticles.js") },
};

/**
 * opts: { start: level id, levels?: registry, root: path prefix to site root (e.g. "" or "../../") }
 */
export async function boot(opts) {
  const root = opts.root ?? "";
  const levels = opts.levels || LEVELS;
  const header = K.$(".sim-header");
  header.innerHTML = `
    <a class="back" href="${root}index.html" title="MixLab home">MixLab</a>
    <nav class="crumbs" aria-label="Zoom level"></nav>
    <select class="lens-select" aria-label="Year level"></select>
    <span class="cs-theme-slot"></span>
    <a class="lib" href="${root}teacher.html">For teachers</a>`;
  const crumbs = K.$(".crumbs", header);
  const sel = K.$(".lens-select", header);
  sel.innerHTML = BANDS.map((b) => `<option value="${b.id}">${b.label}</option>`).join("");
  sel.value = lens.band;
  sel.addEventListener("change", () => lens.set(sel.value));

  const stageEl = K.$("#stage");
  const panelEl = K.$("#panel");
  const levelPanel = document.createElement("div");
  levelPanel.className = "level-panel";
  levelPanel.style.display = "contents";
  panelEl.appendChild(levelPanel);

  const scaleEl = document.createElement("div");
  scaleEl.className = "cs-scale";
  stageEl.appendChild(scaleEl);
  const hint = document.createElement("div");
  hint.className = "cs-hint";
  hint.innerHTML = "Right-drag (or drag empty space) to look around · scroll / pinch to zoom · double-click to dive in · zoom out to go back up";
  stageEl.appendChild(hint);
  const upBtn = document.createElement("button");
  upBtn.className = "btn cs-up";
  upBtn.type = "button";
  stageEl.appendChild(upBtn);

  const toast = K.toaster(stageEl);
  const engine = new Engine({
    canvas: K.$("#canvas"), stageEl, panel: levelPanel, labelLayer: K.$("#labels"), overlay: K.$("#overlay"),
    scaleEl, levels, toast, root,
  });
  engine.lens = lens;
  window.mixlab = window.cellscape = { engine };   // cellscape alias: testing snippets copied from CellScape

  upBtn.addEventListener("click", () => engine.up());
  // pause freezes the processes (the camera still moves) — for explaining a moment in class
  const pauseBtn = document.createElement("button");
  pauseBtn.className = "btn cs-pause";
  pauseBtn.type = "button";
  pauseBtn.textContent = "⏸ Pause";
  pauseBtn.setAttribute("aria-pressed", "false");
  pauseBtn.addEventListener("click", () => {
    engine.paused = !engine.paused;
    pauseBtn.textContent = engine.paused ? "▶ Play" : "⏸ Pause";
    pauseBtn.setAttribute("aria-pressed", String(engine.paused));
  });
  stageEl.appendChild(pauseBtn);
  // light / dark page theme (theme.js)
  import("./theme.js").then((m) => m.mountThemeToggle(K.$(".cs-theme-slot", header))).catch((e) => console.error(e));
  engine.onChange = (stack) => {
    crumbs.innerHTML = "";
    stack.forEach((s, i) => {
      if (i) crumbs.insertAdjacentHTML("beforeend", `<span class="sep">›</span>`);
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = s.title;
      if (i === stack.length - 1) b.setAttribute("aria-current", "true");
      else b.addEventListener("click", () => engine.up(stack.length - 1 - i));
      crumbs.appendChild(b);
    });
    upBtn.style.display = stack.length > 1 ? "" : "none";
    if (stack.length > 1) upBtn.textContent = `↑ Back to ${stack[stack.length - 2].title.toLowerCase()}`;
    document.title = `${stack.at(-1).title} · MixLab`;
  };
  lens.on(() => engine.current?.onLens?.(lens.band));

  // ---------- syllabus card: the dot points this level covers at the current year level ----------
  let syl = null;
  try { syl = await (await fetch(`${root}content/syllabus.json`)).json(); } catch { /* offline: card hidden */ }
  // ?dot=<id> (official) or ?code=Y7-3.2.3 (the school's own Year + outcome numbering)
  const qs = new URLSearchParams(location.search);
  const dotParam = qs.get("dot"), codeParam = qs.get("code")?.replace(/^y/i, "Y").replace("-", " ");
  const focusDot = syl ? syl.dotpoints.find((d) => (dotParam && d.id === dotParam) || (codeParam && d.school_code === codeParam)) : null;
  if (focusDot) { lens.set(focusDot.band); sel.value = lens.band; }
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const sylCard = K.card(panelEl, "Syllabus links");
  const sylBody = document.createElement("div");
  sylCard.appendChild(sylBody);
  function renderSyllabus() {
    const L = engine.current;
    if (!syl || !L?.topics) { sylCard.style.display = "none"; return; }
    sylCard.style.display = "";
    // Year 7 sees the Year 7 dot points; Extension adds the Years 8–10 points they lead on to
    const bands = lens.band === "ext" ? ["y7", "ext"] : ["y7"];
    const items = syl.dotpoints.filter((d) => bands.includes(d.band) && d.topics.some((t) => L.topics.includes(t)));
    sylBody.innerHTML = items.length
      ? `<ul style="margin:0;padding-left:18px;font-size:0.82rem;color:var(--ink-dim);display:flex;flex-direction:column;gap:6px">${items.map((d) => `<li${focusDot?.id === d.id ? ' style="color:var(--ink);font-weight:600"' : ""}>${d.school_code ? `<b style="color:var(--accent)">${esc(d.school_code)}</b> ` : d.band === "ext" ? `<b style="color:var(--ink-faint)">Ext</b> ` : ""}${esc(d.text)} <span style="color:var(--ink-faint)">(${esc(d.outcome)})</span>${d.subpoints?.length ? `<ul style="padding-left:16px;margin:4px 0 0">${d.subpoints.map((sp) => `<li>${esc(typeof sp === "string" ? sp : sp.text || "")}</li>`).join("")}</ul>` : ""}</li>`).join("")}</ul>`
      : `<p>No dot points map directly to this station at this level.</p>`;
  }
  const prevChange = engine.onChange;
  engine.onChange = (stack) => { prevChange(stack); renderSyllabus(); };
  lens.on(() => { sel.value = lens.band; renderSyllabus(); });

  // graphics card lives at the bottom of the panel, outside the level's cards
  const qCard = K.card(panelEl, "Graphics");
  const qSeg = K.segmented(qCard, [
    { value: "high", label: "Cinematic" }, { value: "medium", label: "Balanced" }, { value: "low", label: "Fast" },
  ], engine.quality, (v) => { engine.lockQuality = true; engine.setQuality(v); });
  qCard.insertAdjacentHTML("beforeend", `<p class="hint">Cinematic adds depth-of-field and glow. It steps down automatically on slower devices.</p>`);
  engine.onQuality = (q) => qSeg.set(q);
  // art style: the realistic glass look (default) or a pastel clay-model diorama; remembered between visits
  let look = "real";
  try { look = localStorage.getItem("mixlab.look") === "clay" ? "clay" : "real"; } catch { /* storage blocked: default look */ }
  const lookHead = document.createElement("p");
  lookHead.className = "hint";
  lookHead.style.margin = "10px 0 6px";
  lookHead.textContent = "Look";
  qCard.appendChild(lookHead);
  const lookSeg = K.segmented(qCard, [{ value: "real", label: "Realistic" }, { value: "clay", label: "Clay model" }], look, (v) => {
    engine.setStyle(v);
    try { localStorage.setItem("mixlab.look", v); } catch { /* ignore */ }
  });
  engine.onStyle = (v) => lookSeg.set(v);
  engine.styleName = look;                 // set before the first level mounts
  engine.style.name = look;
  if (matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency || 8) <= 4) engine.setQuality("medium");

  // ?start=<station id> opens straight onto a station (class links from teacher.html)
  let start = opts.start;
  const startParam = qs.get("start");
  if (startParam && levels[startParam]) start = startParam;

  // Phase 6 add-ons. Each module owns its own cards and UI and installs itself here: revision quiz, teacher mode,
  // keyboard/screen-reader access. onChange(fn) chains a listener for level changes (fn receives the stack).
  const addonCtx = { engine, panelEl, stageEl, header, lens, qs, root, graphicsCard: qCard,
    onChange: (fn) => { const p = engine.onChange; engine.onChange = (s) => { p(s); fn(s); }; } };
  await Promise.all(["teacherMode", "revision", "a11y"].map((name) =>
    import(`./${name}.js`).then((m) => m.install?.(addonCtx)).catch((e) => console.error(`add-on ${name}:`, e))));

  K.loop((dt, t) => engine.render(dt, t));
  await engine.start(start);
  return engine;
}
