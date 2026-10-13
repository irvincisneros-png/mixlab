// Station 1, apparatus scale: a beaker (or sealed syringe) of water on a hotplate, with a thermometer, stopwatch, stirrer and an
// optional ice-and-salt cold bath. Driven entirely by the tested heating model (statesModel.js); apparatus parts are in labkit.js.
// Units: 1 world unit = 1 cm. The child level "particles" reads `engine.stack.at(-2).inst.model`.
import * as THREE from "three";
import * as K from "../../kit.js";
import { createStatesModel, WATER } from "./statesModel.js";
import * as LK from "./labkit.js";
import {
  narrative, earthCard, predictFeedback, PARTS, MISSIONS, QUIZ, MIXUPS, SIMPLIFICATIONS, DATA_ROWS, SOURCES,
  fmtT, fmtW, fmtTime, steamLitres, liquidCm3, P,
} from "./statesContent.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MINUS = "−";
const BATH_T = -15;
const RI = 3.35;
const SYR_H = 17;
const CLAMP_Y = 24;
const STATE_COL = { solid: "#93c5fd", liquid: "#38bdf8", gas: "#fbbf24" };

export function create(engine) {
  const lens = engine.lens;
  const M = createStatesModel({ mass: 100, T0: -20 });
  const root = new THREE.Group();
  const pickables = [];
  const pick = (o, kind) => { if (kind) o.userData.kind = kind; pickables.push(o); return o; };

  // ---------- UI state ----------
  const ui = { sealed: false, start: "ice", mass: 100, power: 0, speed: 40, bath: false, running: false, predict: false };
  let sketch = [];
  let energyIn = 0;
  const tr = {};
  const segs = [];
  const recent = [];   // last ~25 simulated seconds of {t, T}, for the warming/cooling rate
  const runs = [];
  function resetTracker() {
    Object.assign(tr, {
      startedIce: false, meltHold: 0, meltDone: false, boiled: false, boilT: 0, boilHold: 0, boilHoldMax: 0, steamMax: 0,
      froze: false, sawFreeze: false, freezeT: 99, runMelt: 0, runBoil: 0, boilDone: false, recorded: false, powMin: 1e9, powMax: -1, doubled: tr.doubled || false,
    });
    segs.length = 0; energyIn = 0; recent.length = 0;
  }
  tr.doubled = false;
  resetTracker();

  // ---------- scene ----------
  const bench = LK.makeBench();
  root.add(bench);
  root.add(LK.makeTileWall());

  // lights: a bright, neutral studio rig on top of the engine's own lights (their colours are adjusted while this level is mounted)
  const key = new THREE.DirectionalLight("#ffffff", 1.5); key.position.set(14, 38, 26);
  const fill = new THREE.DirectionalLight("#dbe8ff", 0.5); fill.position.set(-22, 14, 16);
  root.add(key, fill);

  const hot = LK.makeHotplate(engine);
  root.add(hot.group);
  pick(hot.group.children[0]); pick(hot.group.children[1]); pick(hot.group.children[2]);
  hot.group.children.forEach((c) => { if (c.userData.kind === "hotplate" && !pickables.includes(c)) pickables.push(c); });
  const topY = hot.topY;
  const sh1 = LK.contactShadow(17, 0.5); root.add(sh1);

  // retort stand (behind-left), its clamp arm ends on the thermometer at the beaker axis
  const stand = LK.makeRetortStand({ armLen: 14.1, clampY: CLAMP_Y, rodH: 34 });
  {
    const Pr = new THREE.Vector3(-12, 0, -13), d = new THREE.Vector3(-Pr.x, 0, -Pr.z).normalize();
    stand.group.position.copy(Pr).addScaledVector(d, 3.6);
    stand.group.rotation.y = Math.atan2(-d.z, d.x);
    stand.group.traverse((o) => { if (o.isMesh) pickables.push(o); });
    const s2 = LK.contactShadow(11, 0.5); s2.position.set(Pr.x, 0.02, Pr.z); root.add(s2);
  }
  root.add(stand.group);

  // stopwatch on the bench
  const timer = LK.makeTimer();
  timer.group.position.set(-16, 0, 9); timer.group.rotation.y = 0.28;
  timer.group.traverse((o) => { if (o.isMesh) pickables.push(o); });
  root.add(timer.group);
  { const s3 = LK.contactShadow(6.5, 0.5); s3.position.set(-16, 0.02, 9); root.add(s3); }

  // the vessel: everything that moves with the sample sits in this group (lifted a little when standing in the bath)
  const vessel = new THREE.Group();
  vessel.position.y = topY;
  root.add(vessel);
  const beaker = LK.makeBeaker(engine);
  const syringe = LK.makeSyringe(engine, { Ri: RI, H: SYR_H });
  syringe.group.visible = false;
  vessel.add(beaker.group, syringe.group);
  beaker.print.userData.kind = "beaker";
  const floorY = beaker.floorY;

  const liquid = LK.makeLiquid(engine, { radius: RI - 0.01, floorY, material: LK.waterMaterial() });
  liquid.mesh.userData.clayColor = "#8fc7ea"; liquid.mesh.userData.clayOpacity = 0.65;
  vessel.add(liquid.mesh);
  pick(liquid.mesh, "water");

  const ice = LK.makeIce(engine, { radius: RI, floorY });
  ice.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6, 0), 9);
  ice.mesh.userData.clayColor = "#f4f8ff";
  vessel.add(ice.mesh);
  pick(ice.mesh, "ice");

  const stir = LK.makeStirBar({ len: 2.0, r: 0.38 });
  stir.mesh.position.set(0, floorY + 0.4, 0);
  vessel.add(stir.mesh);
  stir.mesh.traverse((o) => { if (o.isMesh) pickables.push(o); });

  const bubbles = LK.makeBubbles(engine, { radius: RI, floorY });
  vessel.add(bubbles.mesh);
  const mist = LK.makeMist(engine, { radius: RI });
  vessel.add(mist.points);

  // invisible pick helpers: the vessel above its contents, and the mist
  const hiddenMat = new THREE.MeshBasicMaterial({ visible: false });
  hiddenMat.userData.shared = false;
  const vesselProxy = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 1, 20, 1, true), hiddenMat);
  vesselProxy.geometry.translate(0, 0.5, 0);
  vesselProxy.userData.keepMaterial = true; vesselProxy.userData.kind = "beaker";
  vessel.add(vesselProxy); pickables.push(vesselProxy);
  const footProxy = new THREE.Mesh(vesselProxy.geometry, hiddenMat);
  footProxy.scale.set(1, 0.7, 1); footProxy.position.y = 0.05; footProxy.userData.keepMaterial = true; footProxy.userData.kind = "beaker";
  vessel.add(footProxy); pickables.push(footProxy);
  const mistProxy = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 4.6, 8, 14, 1, true), hiddenMat);
  mistProxy.position.y = beaker.H + 4; mistProxy.userData.keepMaterial = true; mistProxy.userData.kind = "mist"; mistProxy.visible = false;
  vessel.add(mistProxy); pickables.push(mistProxy);

  // steam haze inside the sealed syringe (steam is invisible: this only shows where it is)
  const haze = new THREE.Mesh(new THREE.CylinderGeometry(RI - 0.03, RI - 0.03, 1, 40, 1, true), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide }));
  haze.geometry.translate(0, 0.5, 0); haze.renderOrder = 5; haze.visible = false; haze.userData.clayHide = true;
  vessel.add(haze);

  // thermometer: fixed on the clamp (does not move with the vessel)
  const thermo = LK.makeThermometer(engine);
  thermo.group.position.set(0, topY + 0.9, 0);
  thermo.group.traverse((o) => { if (o.isMesh) pickables.push(o); });
  root.add(thermo.group);

  // cold bath (rebuilt when the container changes, because the sample vessel's outer radius differs)
  let bathObj = null;
  function buildBath() {
    if (bathObj) { root.remove(bathObj.group); disposeGroup(bathObj.group); pickables.splice(0, pickables.length, ...pickables.filter((p) => !bathObj.group.getObjectById(p.id))); }
    bathObj = LK.makeColdBath(engine, { innerR: (ui.sealed ? syringe.Ro : beaker.Ro) + 0.03 });
    bathObj.group.position.y = topY;
    bathObj.group.visible = ui.bath;
    bathObj.group.traverse((o) => { if (o.isMesh) pickables.push(o); });
    bathObj.group.children.forEach((c) => { if (c.isInstancedMesh) c.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 10); });
    root.add(bathObj.group);
  }
  function disposeGroup(g) {
    g.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose?.()); });
  }
  buildBath();

  // ---------- model plumbing ----------
  function applyContainer() {
    beaker.group.visible = !ui.sealed;
    syringe.group.visible = ui.sealed;
    { const k = ui.sealed ? syringe.Ro / 3.5 : 1; vesselProxy.scale.set(k, 1, k); }
    buildBath();
  }
  function recordRun() {
    if (tr.recorded || !tr.meltDone || !tr.boilDone || tr.powMax - tr.powMin > 1) return;
    tr.recorded = true;
    runs.push({ mass: ui.mass, power: tr.powMax, melt: tr.runMelt, boil: tr.runBoil });
    for (const a of runs) for (const b of runs) {
      if (a === b || Math.abs(b.mass - 2 * a.mass) > 2 || Math.abs(a.power - b.power) > 1 || a.melt < 5 || a.boil < 5) continue;
      if (Math.abs(b.melt / a.melt - 2) < 0.2 && Math.abs(b.boil / a.boil - 2) < 0.2) tr.doubled = true;
    }
  }
  function resetRun() {
    ui.running = false;
    M.reset({ container: ui.sealed ? "sealed" : "open", bath: ui.bath ? BATH_T : null, mass: ui.mass, T0: ui.start === "ice" ? -20 : 20 });
    M.power = ui.bath ? 0 : ui.power;
    resetTracker();
    tr.startedIce = ui.start === "ice";
    bubbles.clear(); mist.clear();
    ice.reset(M.solid);
    plungerY = null; smoothLevel = null;
    syncRunBtn();
  }
  function setBath(on) {
    ui.bath = on;
    M.bath = on ? BATH_T : null;
    if (on) { ui.power = 0; M.power = 0; if (powerS) powerS.value = 0; ui.running = true; syncRunBtn(); }
    if (powerS) powerS.input.disabled = on;
    bathObj.group.visible = on;
    vessel.position.y = topY + (on ? bathObj.floorY : 0);
    thermo.group.position.y = topY + 0.9 + (on ? bathObj.floorY : 0);
    sh1.visible = true;
    updateLabelsVisible();
  }

  // ---------- derived scene state ----------
  let smoothLevel = null, plungerY = null;
  function surfaceLevel() {
    const A = Math.PI * RI * RI;
    const Vl = liquidCm3(M.liquid, M.T);
    const depthL = Vl / A;
    const sub = M.solid * 1.0 * clamp(depthL / 0.8, 0, 1);   // floating ice displaces its own mass of water (1 g per cm³)
    const h = M.liquid > 1e-4 || sub > 0 ? floorY + (Vl + sub) / A : 0;
    return h;
  }

  // ---------- panel ----------
  let panelNode = null, built = null;
  let chart, cctx, runBtn, powerS, massS, speedS, narrEl, earthEl, selCard, fbEl, missionObj, predBtn, hoverX = null;
  let chips = null, diveLbl, bathLbl, selKind = null, chipFloor = 0;

  function sectionHint(parent, text) {
    const p = document.createElement("p");
    p.className = "hint"; p.style.margin = "10px 0 4px"; p.textContent = text;
    parent.appendChild(p);
    return p;
  }
  function syncRunBtn() { if (runBtn) runBtn.textContent = ui.running ? "⏸ Stop the clock" : (M.t > 0 ? "▶ Start the clock again" : "▶ Start the clock"); }

  function buildPanel(el) {
    panelNode = document.createElement("div");
    panelNode.style.display = "contents";
    el.appendChild(panelNode);
    const band = lens.band;

    // --- apparatus controls ---
    const c = K.card(panelNode, "Apparatus");
    sectionHint(c, "Container");
    K.segmented(c, [{ value: "open", label: "Open beaker" }, { value: "sealed", label: "Sealed syringe" }], ui.sealed ? "sealed" : "open", (v) => { ui.sealed = v === "sealed"; applyContainer(); resetRun(); });
    sectionHint(c, "Start with");
    K.segmented(c, [{ value: "ice", label: "Ice at −20 °C" }, { value: "water", label: "Water at 20 °C" }], ui.start, (v) => { ui.start = v; resetRun(); });
    const mw = document.createElement("div"); mw.style.marginTop = "10px"; c.appendChild(mw);
    massS = K.slider(mw, { label: "Mass of water", min: 50, max: 300, step: 10, value: ui.mass, format: (v) => `${v} g`, onInput: (v) => { ui.mass = v; resetRun(); } });
    const pw = document.createElement("div"); pw.style.marginTop = "6px"; c.appendChild(pw);
    powerS = K.slider(pw, { label: "Hotplate: heat in", min: 0, max: 250, step: 10, value: ui.power, format: (v) => (v ? `${v} W` : "off"), onInput: (v) => { ui.power = v; M.power = ui.bath ? 0 : v; if (v > 0 && !ui.running) { ui.running = true; syncRunBtn(); } } });
    powerS.input.disabled = ui.bath;
    const presets = K.buttonRow(c);
    for (const [label, w] of [["Off", 0], ["100 W", 100], ["Max 250 W", 250]]) K.button(presets, label, () => { if (ui.bath) return; ui.power = w; powerS.value = w; M.power = w; if (w > 0 && !ui.running) { ui.running = true; syncRunBtn(); } });
    const bw = document.createElement("div"); bw.style.marginTop = "10px"; c.appendChild(bw);
    const bathChk = K.checkbox(bw, "Cold bath: ice and salt, −15 °C (replaces the hotplate)", ui.bath, (on) => setBath(on));
    bathChk.setAttribute("aria-label", "Cold bath, ice and salt, minus 15 degrees Celsius");
    const sw = document.createElement("div"); sw.style.marginTop = "6px"; c.appendChild(sw);
    speedS = K.slider(sw, { label: "Time speed", min: 10, max: 120, step: 10, value: ui.speed, format: (v) => `${v}×`, onInput: (v) => { ui.speed = v; } });
    const rr = K.buttonRow(c);
    runBtn = K.button(rr, "", () => { ui.running = !ui.running; syncRunBtn(); }, { kind: "primary" });
    K.button(rr, "↺ Reset", () => resetRun());
    syncRunBtn();
    const zr = K.buttonRow(c);
    K.button(zr, "Zoom into the particles ▸", () => engine.dive(portals[0]));

    // --- heating curve ---
    const cc = K.card(panelNode, "Heating curve");
    cc.insertAdjacentHTML("beforeend", `<p class="hint" style="margin:-2px 0 6px">${P({ y7: "Temperature against time, drawn live from the model. Look for the flat sections.", ext: "Temperature against time. A flat section is either a change of state (energy goes into potential energy of the molecules, not kinetic energy) or heat in balancing heat lost." }, band)}</p>`);
    chart = document.createElement("canvas");
    chart.className = "mini-chart heat-chart";
    chart.style.height = "240px"; chart.style.touchAction = "none"; chart.style.cursor = "crosshair";
    cc.appendChild(chart);
    cctx = chart.getContext("2d");
    wireChart();
    const pr = K.buttonRow(cc);
    predBtn = K.button(pr, "Predict: sketch your line", (on) => { ui.predict = on; chart.style.cursor = on ? "crosshair" : "default"; fbEl.innerHTML = on ? `Drag across the graph to sketch what you think the temperature will do. Dragging backwards rubs out the end of your line.` : ""; }, { toggle: true, pressed: ui.predict });
    K.button(pr, "Check", () => { fbEl.innerHTML = predictFeedback(sketch, M, lens.band, { startsIce: ui.start === "ice", boiled: tr.boiled, meltS: tr.runMelt, boilS: tr.runBoil, power: tr.powMax > 0 ? tr.powMax : ui.power, t: M.t, maxT: Math.max(...M.history.map((p) => p.T), M.T) }).map((l) => `<div>${l}</div>`).join(""); });
    K.button(pr, "Clear", () => { sketch = []; fbEl.innerHTML = ""; drawChart(); });
    fbEl = document.createElement("div"); fbEl.className = "hint"; fbEl.style.lineHeight = "1.45"; fbEl.setAttribute("aria-live", "polite");
    cc.appendChild(fbEl);

    // --- what's happening ---
    const ex = K.card(panelNode, "What's happening", "explain");
    narrEl = document.createElement("div"); narrEl.setAttribute("aria-live", "polite");
    ex.appendChild(narrEl);
    ex.insertAdjacentHTML("beforeend", `<p class="hint">${P({ y7: "Click the beaker, ice, thermometer or hotplate to learn about it. Drag to turn the view; scroll to zoom.", ext: "Zoom into the water to see what the molecules are doing at this temperature." }, band)}</p>`);

    selCard = K.card(panelNode, "", "sel-card");
    selCard.style.display = "none";

    // --- water on Earth ---
    const eg = K.card(panelNode, "Water on Earth");
    earthEl = document.createElement("div");
    eg.appendChild(earthEl);

    // --- missions, quiz ---
    missionObj = K.missions(panelNode, lens.filter(MISSIONS).map((m) => ({ text: `<span>${m.text}</span>`, check: () => m.check(M, tr) })), (m) => engine.toast(`Mission complete: ${m.text.replace(/<[^>]+>/g, "")}`, 3600));
    K.quiz(panelNode, lens.filter(QUIZ));

    // --- common mix-ups ---
    const mc = K.card(panelNode, "Common mix-ups");
    for (const m of MIXUPS) {
      const d = document.createElement("details");
      d.style.margin = "6px 0";
      d.innerHTML = `<summary style="cursor:pointer;color:var(--ink);font-size:0.86rem">${m.myth}</summary><p style="margin:6px 0 0;font-size:0.84rem">${P(m.truth, band)}</p>`;
      mc.appendChild(d);
    }

    // --- data & sources ---
    const dc = K.card(panelNode, "Data and sources");
    dc.insertAdjacentHTML("beforeend", `<div class="io" style="display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:0.82rem;margin-bottom:8px">${DATA_ROWS.map(([a, b]) => `<b style="color:var(--ink-faint);font-weight:600">${a}</b><span>${b}</span>`).join("")}</div>`);
    dc.insertAdjacentHTML("beforeend", `<p style="margin:0 0 4px;font-size:0.82rem;color:var(--ink)"><b>Where the numbers come from</b></p><ul style="margin:0 0 8px;padding-left:18px;font-size:0.8rem;color:var(--ink-dim);display:flex;flex-direction:column;gap:5px">${SOURCES.map((s) => `<li>${s.what}: <a href="${s.url}" target="_blank" rel="noopener" style="color:var(--accent)">${s.ref}</a></li>`).join("")}</ul>`);
    dc.insertAdjacentHTML("beforeend", `<p style="margin:0 0 4px;font-size:0.82rem;color:var(--ink)"><b>What the model simplifies</b></p><ul style="margin:0;padding-left:18px;font-size:0.8rem;color:var(--ink-dim);display:flex;flex-direction:column;gap:5px">${SIMPLIFICATIONS.map((s) => `<li>${s}</li>`).join("")}</ul>`);
    built = band;
    refreshText(true);
  }

  // ---------- heating curve ----------
  const XS = [20, 30, 45, 60, 90, 120, 180, 240, 360, 480, 720];
  const ink = () => K.cssVar("--ink-dim", "#9fb3cf");
  function plotRect(w, h) { return { x0: 44, x1: w - 10, y0: 12, y1: h - 30 }; }
  function axes() {
    let tmax = M.t / 60, tmin = Infinity, tTop = -Infinity;
    for (const p of M.history) { tmin = Math.min(tmin, p.T); tTop = Math.max(tTop, p.T); }
    for (const p of sketch) { tmax = Math.max(tmax, p.t); }
    tmin = Math.min(tmin, M.T); tTop = Math.max(tTop, M.T);
    const X = XS.find((v) => v >= tmax * 1.08) || Math.ceil(tmax * 1.1);
    const y0 = Math.min(-30, Math.floor((tmin - 8) / 10) * 10), y1 = Math.max(120, Math.ceil((tTop + 12) / 20) * 20);
    return { X, y0, y1 };
  }
  function drawChart() {
    if (!chart) return;
    const w = chart.clientWidth, h = chart.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (!w || !h) return;
    if (chart.width !== Math.round(w * dpr) || chart.height !== Math.round(h * dpr)) { chart.width = Math.round(w * dpr); chart.height = Math.round(h * dpr); }
    const c = cctx, R = plotRect(w, h), A = axes();
    const xOf = (m) => R.x0 + (m / A.X) * (R.x1 - R.x0), yOf = (T) => R.y1 - ((T - A.y0) / (A.y1 - A.y0)) * (R.y1 - R.y0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const dim = ink(), grid = K.cssVar("--grid-line", "rgba(159,179,207,0.18)"), inkc = K.cssVar("--ink", "#e8f1ff");
    c.font = "11px Inter, system-ui, sans-serif";
    // grid and ticks
    c.lineWidth = 1; c.fillStyle = dim; c.strokeStyle = grid;
    c.textAlign = "right"; c.textBaseline = "middle";
    for (let T = Math.ceil(A.y0 / 20) * 20; T <= A.y1; T += 20) { const y = yOf(T); c.beginPath(); c.moveTo(R.x0, y); c.lineTo(R.x1, y); c.stroke(); c.fillText(String(T).replace("-", MINUS), R.x0 - 6, y); }
    const xs = A.X <= 30 ? 5 : A.X <= 90 ? 10 : A.X <= 240 ? 30 : 60;
    c.textAlign = "center"; c.textBaseline = "top";
    for (let m = 0; m <= A.X; m += xs) { const x = xOf(m); c.beginPath(); c.moveTo(x, R.y0); c.lineTo(x, R.y1); c.stroke(); c.fillText(String(m), x, R.y1 + 4); }
    c.fillText("Time (minutes)", (R.x0 + R.x1) / 2, h - 13);
    c.save(); c.translate(11, (R.y0 + R.y1) / 2); c.rotate(-Math.PI / 2); c.textBaseline = "middle"; c.fillText("Temperature (°C)", 0, 0); c.restore();
    // flat-section bands
    for (const s of segs) {
      const x0 = xOf(s.t0 / 60), x1 = xOf(Math.max(s.t1, s.t0 + 1) / 60);
      const warm = s.kind === "boiling" || s.kind === "condensing";
      c.fillStyle = warm ? "rgba(251,191,36,0.16)" : "rgba(125,211,252,0.18)";
      c.fillRect(x0, R.y0, Math.max(1.5, x1 - x0), R.y1 - R.y0);
      const wpx = x1 - x0, Ty = s.kind === "melting" || s.kind === "freezing" ? 0 : 100;
      const long = { melting: "melting: temperature stays at 0 °C", freezing: "freezing: temperature stays at 0 °C", boiling: "boiling: temperature stays at 100 °C", condensing: "condensing: stays at 100 °C" }[s.kind];
      c.fillStyle = K.chartCol(warm ? "#fbbf24" : "#7dd3fc"); c.textBaseline = "alphabetic"; c.textAlign = "left";
      const y = yOf(Ty);
      if (wpx > 190) { c.fillText(long, x0 + 6, y - 8); c.fillText(`flat for ${((s.t1 - s.t0) / 60).toFixed(1)} min`, x0 + 6, y + 15); }
      else if (wpx > 74) { c.fillText(s.kind, x0 + 5, y - 8); }
    }
    // guide lines at the melting and boiling points
    c.setLineDash([5, 4]); c.strokeStyle = K.cssVar("--ink-faint", "#6a7f9c"); c.lineWidth = 1;
    for (const T of [0, 100]) { const y = yOf(T); c.beginPath(); c.moveTo(R.x0, y); c.lineTo(R.x1, y); c.stroke(); }
    c.setLineDash([]);
    c.fillStyle = dim; c.textAlign = "right"; c.textBaseline = "bottom";
    c.fillText("100 °C: boiling point", R.x1 - 3, yOf(100) - 2);
    c.textBaseline = "top"; c.fillText("0 °C: melting point", R.x1 - 3, yOf(0) + 3);
    // prediction
    if (sketch.length > 1) {
      const pts = [...sketch].sort((a, b) => a.t - b.t);
      c.strokeStyle = K.chartCol("#fbbf24"); c.lineWidth = 2.4; c.setLineDash([6, 4]); c.lineJoin = "round"; c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(xOf(p.t), yOf(p.T)) : c.moveTo(xOf(p.t), yOf(p.T))));
      c.stroke(); c.setLineDash([]);
      c.fillStyle = K.chartCol("#fbbf24"); c.textAlign = "left"; c.textBaseline = "bottom";
      c.fillText("your prediction", xOf(pts[0].t) + 4, yOf(pts[0].T) - 6);
    }
    // the model's line
    const H = M.history;
    c.strokeStyle = K.chartCol("#38bdf8"); c.lineWidth = 2.6; c.lineJoin = "round"; c.beginPath();
    H.forEach((p, i) => (i ? c.lineTo(xOf(p.t / 60), yOf(p.T)) : c.moveTo(xOf(p.t / 60), yOf(p.T))));
    const last = H[H.length - 1];
    if (!last || M.t - last.t > 0.01) c.lineTo(xOf(M.t / 60), yOf(M.T));
    c.stroke();
    const cx = xOf(M.t / 60), cy = yOf(M.T);
    c.fillStyle = "rgba(56,189,248,0.25)"; c.beginPath(); c.arc(cx, cy, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = K.chartCol("#38bdf8"); c.beginPath(); c.arc(cx, cy, 4.2, 0, Math.PI * 2); c.fill();
    c.strokeStyle = K.cssVar("--bg-card", "#0a1628"); c.lineWidth = 1.5; c.stroke();
    // hover read-out
    if (hoverX != null && !ui.predict && H.length > 1) {
      const tm = clamp(((hoverX - R.x0) / (R.x1 - R.x0)) * A.X, 0, M.t / 60);
      let best = H[0];
      for (const p of H) if (Math.abs(p.t / 60 - tm) < Math.abs(best.t / 60 - tm)) best = p;
      const bx = xOf(best.t / 60), by = yOf(best.T);
      c.strokeStyle = dim; c.lineWidth = 1; c.beginPath(); c.moveTo(bx, R.y0); c.lineTo(bx, R.y1); c.stroke();
      const txt = `${fmtT(best.T)} at ${fmtTime(best.t)}`;
      const tw = c.measureText(txt).width + 12, tx = clamp(bx - tw / 2, R.x0, R.x1 - tw), ty = clamp(by - 28, R.y0, R.y1 - 20);
      c.fillStyle = "rgba(5,11,22,0.9)"; K.roundRect(c, tx, ty, tw, 20, 6); c.fill();
      c.fillStyle = "#e8f1ff"; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText(txt, tx + 6, ty + 10);
    }
    if (H.length < 2 && !sketch.length) {
      c.fillStyle = dim; c.textAlign = "center"; c.textBaseline = "middle"; c.font = "12px Inter, system-ui, sans-serif";
      c.fillText(ui.predict ? "Drag here to sketch your prediction" : "Start the clock and turn up the hotplate", (R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2);
    }
    const segText = segs.length ? ` Flat sections so far: ${segs.map((s) => `${s.kind} for ${((s.t1 - s.t0) / 60).toFixed(1)} minutes`).join(", ")}.` : "";
    chart.setAttribute("role", "img");
    chart.setAttribute("aria-label", `Heating curve. Temperature now ${fmtT(M.T)} after ${fmtTime(M.t)}.${segText}`);
  }
  function wireChart() {
    const toData = (e) => {
      const r = chart.getBoundingClientRect(), R = plotRect(r.width, r.height), A = axes();
      const px = clamp(e.clientX - r.left, R.x0, R.x1), py = clamp(e.clientY - r.top, R.y0, R.y1);
      return { t: ((px - R.x0) / (R.x1 - R.x0)) * A.X, T: A.y1 - ((py - R.y0) / (R.y1 - R.y0)) * (A.y1 - A.y0), px };
    };
    let drawing = false;
    const add = (e) => { const d = toData(e); sketch = sketch.filter((p) => p.t < d.t - 0.02); sketch.push({ t: d.t, T: d.T }); drawChart(); };
    chart.addEventListener("pointerdown", (e) => { if (!ui.predict) return; drawing = true; chart.setPointerCapture(e.pointerId); add(e); });
    chart.addEventListener("pointermove", (e) => { if (drawing) add(e); else { hoverX = e.clientX - chart.getBoundingClientRect().left; drawChart(); } });
    chart.addEventListener("pointerup", () => { drawing = false; });
    chart.addEventListener("pointerleave", () => { hoverX = null; drawChart(); });
  }

  // ---------- selection card and text ----------
  function selBody(kind) {
    const part = PARTS[kind];
    if (!part) return "";
    const now = {
      thermometer: `Reading: <b>${fmtT(M.T)}</b>`,
      hotplate: `Heat in: <b>${M.power ? fmtW(M.power) : "off"}</b>${M.heatLoss > 0.5 ? ` · heat lost: ${M.heatLoss.toFixed(1)} W` : ""}`,
      ice: `Ice left: <b>${M.solid.toFixed(M.solid < 10 ? 1 : 0)} g</b>`,
      water: `Liquid: <b>${M.liquid.toFixed(M.liquid < 10 ? 1 : 0)} g</b>${ui.sealed ? "" : ` · volume ≈ ${Math.round(liquidCm3(M.liquid, M.T))} mL`}`,
      syringe: M.gas > 0 ? `Steam now would fill about <b>${steamLitres(M.gas, M.T).toFixed(1)} litres</b>` : "",
      timer: `Time: <b>${fmtTime(M.t)}</b> at ${ui.speed}×`,
    }[kind];
    return { part, now };
  }
  function showSelection(info) {
    if (!selCard) return;
    selKind = info?.kind || null;
    if (!info || !PARTS[info.kind]) { selCard.style.display = "none"; return; }
    renderSel();
  }
  function renderSel() {
    const { part, now } = selBody(selKind);
    const portal = part.portal || selKind === "ice";
    selCard.style.display = "";
    selCard.innerHTML = `<h2>Selected</h2><p style="color:var(--ink);font-weight:600;margin-bottom:4px">${part.name}</p><p>${P(part.text, lens.band)}</p>${now ? `<p style="color:var(--ink)">${now}</p>` : ""}${portal ? `<div class="btn-row"><button class="btn primary" data-act="zoom">Zoom into the particles ▸</button></div>` : ""}`;
    selCard.querySelector('[data-act="zoom"]')?.addEventListener("click", () => engine.dive(portals[0]));
  }
  function refreshText(force = false) {
    if (!narrEl) return;
    const r0 = recent[0], rate = recent.length >= 2 && M.t - r0.t > 4 && !M.phaseChange ? ((M.T - r0.T) / (M.t - r0.t)) * 60 : null;
    const ctx = { rate, boiled: tr.boiled || M.boiled, sealed: ui.sealed, bath: ui.bath ? BATH_T : null, energyIn, started: ui.running || M.t > 0 };
    const html = narrative(M, ctx, lens.band).map((p) => `<p>${p}</p>`).join("");
    if (force || narrEl.innerHTML !== html) narrEl.innerHTML = html;
    const e = earthCard(M, ctx, lens.band);
    const eh = `<p style="color:var(--ink);font-weight:600;margin-bottom:4px">${e.head}</p><p>${e.text}</p>`;
    if (force || earthEl.innerHTML !== eh) earthEl.innerHTML = eh;
    if (selKind && selCard.style.display !== "none") renderSel();
  }

  // ---------- stage chips and labels ----------
  function buildChips() {
    const ov = engine.overlay;
    ov.innerHTML = "";
    chips = { T: K.chip(ov), state: K.chip(ov), time: K.chip(ov), heat: K.chip(ov) };
  }
  function updateChips() {
    if (!chips) return;
    const dot = (c) => `<i class="dot" style="background:${c}"></i>`;
    const f = M.fractions();
    const col = f.gas > 0.5 ? STATE_COL.gas : f.liquid >= f.solid ? STATE_COL.liquid : STATE_COL.solid;
    chips.T(`${dot(col)}Temperature <b>${fmtT(M.T)}</b>`);
    const pcWord = { melting: "melting", freezing: "freezing", boiling: "boiling", condensing: "condensing" }[M.phaseChange] || "";
    const nm = M.stateName();
    chips.state(`State <b>${nm.charAt(0).toUpperCase() + nm.slice(1)}</b>${pcWord ? ` <span style="color:var(--t-warn)">· ${pcWord}</span>` : ""}`);
    chips.time(`Time <b>${fmtTime(M.t)}</b>${ui.running ? "" : " (stopped)"}`);
    chips.heat(ui.bath ? `Bath <b>${fmtT(BATH_T, 0)}</b> · out <b>${Math.max(0, M.heatLoss).toFixed(0)} W</b>` : `Heat in <b>${M.power ? fmtW(M.power) : "off"}</b>`);
  }
  function measureChipFloor() {
    const r = engine.overlay.getBoundingClientRect(), s = engine.stageEl.getBoundingClientRect();
    chipFloor = Math.max(0, r.bottom - s.top + 6);
    const kids = engine.overlay.children;
    if (kids.length) { let b = 0; for (const k of kids) b = Math.max(b, k.getBoundingClientRect().bottom); chipFloor = Math.max(0, b - s.top + 8); }
  }
  const _lp = new THREE.Vector3();
  function placeClamped(el, v, dx, dy, side) {
    const p = _lp.copy(v).project(engine.camera);
    if (p.z > 1 || p.z < -1) { el.style.display = "none"; return; }
    el.style.display = "";
    const w = el.offsetWidth || 120, h = el.offsetHeight || 24;
    if (side) dx += w / 2 + 8;   // sit beside the vessel, not over the water
    const x = clamp((p.x * 0.5 + 0.5) * engine.w + dx, w / 2 + 6, engine.w - w / 2 - 6);
    const y = Math.max((-p.y * 0.5 + 0.5) * engine.h + dy, chipFloor + h / 2);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
  function makeLabels() {
    diveLbl?.remove(); bathLbl?.remove();
    diveLbl = engine.label("Zoom into the particles ▸", "dive lab-dive");
    bathLbl = engine.label(`Ice and salt bath · ${fmtT(BATH_T, 0)}`, "org lab-org");
  }
  function updateLabelsVisible() { if (bathLbl) bathLbl.style.display = ui.bath ? "" : "none"; }
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  function updateLabels() {
    if (!diveLbl || engine.current !== level) return;
    const hasStuff = M.liquid + M.solid + M.gas > 0.01;
    if (!hasStuff) diveLbl.style.display = "none";
    else placeClamped(diveLbl, _a.set(ui.sealed ? 3.8 : 3.7, vessel.position.y + (ui.sealed ? 6 : 5), 0), 0, 0, true);
    if (ui.bath) placeClamped(bathLbl, _b.set(8.8, topY + 3, 0), 40, 0); else bathLbl.style.display = "none";
  }

  // ---------- engine lights (a neutral lab rig while this level is mounted) ----------
  let savedLights = null;
  const css = document.getElementById("states-style") || Object.assign(document.head.appendChild(document.createElement("style")), { id: "states-style" });
  css.textContent = `.stage.lab-light .cs-hint, .stage.lab-light .cs-scale { color: #f4f8fb; text-shadow: 0 1px 4px rgba(0,0,0,.9), 0 0 2px rgba(0,0,0,.8); }
.stage.lab-light .cs-scale i { border-color: #f4f8fb; }
.lbl3d.lab-dive { background: rgba(8, 20, 30, 0.82); color: #d9fbf5; border-color: #4fd1c5; box-shadow: 0 2px 10px rgba(0,0,0,.35); }
.lbl3d.lab-org { background: rgba(8, 20, 30, 0.82); color: #e8f1ff; }
.heat-chart { background: transparent; border-radius: 8px; }`;
  function tuneLights() {
    engine.stageEl.classList.add("lab-light");
    if (savedLights) return;
    try {
      const ch = engine.lights.children;
      savedLights = ch.map((l) => ({ l, c: l.color.clone(), g: l.groundColor?.clone(), i: l.intensity }));
      const [hemi, k, rim, under] = ch;
      hemi.color.set("#e4ecf5"); hemi.groundColor.set("#6a7079"); hemi.intensity = 0.8;
      k.color.set("#fff7ec"); k.intensity = 2.0;
      rim.color.set("#e7efff"); rim.intensity = 0.7;
      under.color.set("#aab8c4"); under.intensity = 0.15;
    } catch { savedLights = null; }
  }
  function restoreLights() {
    engine.stageEl.classList.remove("lab-light");
    if (!savedLights) return;
    for (const s of savedLights) { s.l.color.copy(s.c); if (s.g) s.l.groundColor.copy(s.g); s.l.intensity = s.i; }
    savedLights = null;
  }

  // ---------- portals ----------
  const portals = [{
    to: "particles", label: "Zoom into the particles", object: liquid.mesh, objects: [liquid.mesh, ice.mesh], radius: 3.6,
    center: () => new THREE.Vector3(0, vessel.position.y + floorY + 3.2, 0).applyMatrix4(root.matrixWorld),
  }];

  // ---------- per-frame ----------
  let uiT = 0, chartT = 0, textT = 0;
  function trackStep(sdt) {
    const pc = M.phaseChange;
    energyIn += Math.max(0, M.heatIn) * sdt;
    recent.push({ t: M.t, T: M.T }); while (recent.length > 2 && M.t - recent[0].t > 25) recent.shift();
    if (ui.running) { tr.powMin = Math.min(tr.powMin, M.power); tr.powMax = Math.max(tr.powMax, M.power); }
    if (pc === "melting") { tr.meltHold += sdt; tr.runMelt += sdt; }
    if (tr.startedIce && tr.meltHold > 1 && M.solid <= 1e-6) tr.meltDone = true;
    if (pc === "boiling") {
      tr.boiled = true; tr.boilT = M.T; tr.runBoil += sdt;
      if (M.power >= 245 && Math.abs(M.T - 100) < 0.05) { tr.boilHold += sdt; tr.boilHoldMax = Math.max(tr.boilHoldMax, tr.boilHold); } else tr.boilHold = 0;
    } else tr.boilHold = 0;
    if (M.container === "sealed" && M.gas > 0) tr.steamMax = Math.max(tr.steamMax, M.T);
    if (pc === "freezing" && ui.bath) { tr.sawFreeze = true; tr.freezeT = M.T; }
    if (tr.sawFreeze && M.liquid <= 1e-6 && M.gas <= 1e-6 && M.solid > 0) tr.froze = true;
    if (tr.boiled && M.liquid <= 1e-6 && M.solid <= 1e-6 && pc !== "boiling") tr.boilDone = true;
    if (tr.boilDone && tr.meltDone) recordRun();
    // flat-section bands for the chart
    if (pc) {
      const lastSeg = segs[segs.length - 1];
      if (lastSeg && lastSeg.kind === pc && M.t - lastSeg.t1 < 3) lastSeg.t1 = M.t;
      else segs.push({ kind: pc, t0: M.t - sdt, t1: M.t });
    }
  }
  function updateScene(dt, t, rdt) {
    const still = engine.reducedMotion;
    // sample state
    const h = surfaceLevel();
    smoothLevel = smoothLevel == null ? h : smoothLevel + (h - smoothLevel) * Math.min(1, rdt * 14);
    const hs = Math.abs(smoothLevel - h) < 0.002 ? h : smoothLevel;
    const boiling = M.phaseChange === "boiling";
    const boilRate = boiling ? M.latentRate / WATER.Lv : 0;       // g/s of vapour made by boiling
    const leave = ui.sealed ? 0 : M.evapRate + boilRate;           // g/s of vapour leaving an open beaker
    const mistI = leave < 0.003 ? 0 : clamp(Math.pow((leave - 0.003) / 0.087, 0.6), 0, 1);
    const ripple = (boiling ? 0.035 + 0.06 * clamp(boilRate / 0.11, 0, 1) : 0) + (M.liquid > 0.1 ? 0.01 : 0);
    ice.update({ solid: M.solid, waterLevel: M.liquid > 1e-4 ? hs : 0, T: M.T, t: still ? 0 : t });
    liquid.setLevel(hs);
    liquid.setRipple(still ? ripple * 0.3 : (dt > 0 ? ripple : liquid.amp), t);
    // bubbles: vapour when boiling, a few tiny dissolved-air bubbles on the way up
    let rate = 0, bsize = 0.3;
    if (boiling) rate = 18 + 150 * clamp(boilRate / 0.11, 0, 1);
    else if (M.liquid > 0 && M.T > 55 && M.T < 99.8 && !ui.sealed) { rate = 1.5 + 5 * clamp((M.T - 55) / 40, 0, 1); bsize = 0.09; }
    bubbles.update(dt, { rate: dt > 0 ? rate : 0, level: hs, size: bsize });
    mist.update(dt, { intensity: mistI, level: hs, rimY: beaker.H });
    mistProxy.visible = !ui.sealed && mistI > 0.12;
    // stir bar
    stir.spin = ui.running && M.liquid > 0.1 ? 7 : 0;
    stir.update(dt);
    // vessel pick proxy: a band round the rim (so the thermometer, ice and water inside stay clickable through the glass)
    const top = Math.max(hs, ice.top || 0, floorY);
    const vTop = ui.sealed ? SYR_H : beaker.H;
    vesselProxy.position.y = vTop - 1.0; vesselProxy.scale.y = 1.0;
    footProxy.scale.set(vesselProxy.scale.x, 0.7, vesselProxy.scale.z);
    // sealed syringe: the plunger rides out as steam forms (drawn on a log scale, clamped to the barrel)
    if (ui.sealed) {
      const yMax = SYR_H - 1.7, base = top + 0.12;
      let target = base;
      if (M.gas > 1e-4) {
        const V = steamLitres(M.gas, M.T) * 1000;   // cm³
        target = base + clamp(Math.log10(1 + V / 25) / Math.log10(1 + 1.7e5 / 25), 0, 1) * (yMax - base);
      }
      target = Math.min(Math.max(target, base), Math.max(yMax, base));
      plungerY = plungerY == null ? target : plungerY + (target - plungerY) * Math.min(1, rdt * 6);
      syringe.setPlunger(plungerY);
      haze.visible = M.gas > 1e-4;
      haze.position.y = top; haze.scale.y = Math.max(0.05, plungerY - top);
      haze.material.opacity = 0.035 + 0.04 * clamp(M.gas / 60, 0, 1);
    } else haze.visible = false;
    // glowing hotplate, thermometer, timer
    hot.setPower(M.power);
    thermo.setTemp(M.T);
    timer.setText(fmtTime(M.t, true), ui.running ? "RUN" : "STOP");
  }

  const level = {
    title: "States of matter",
    topics: ["states-of-matter", "heating-curves", "water-cycle"],
    model: M,
    root, pickables, portals,
    metersPerUnit: 0.01,
    get view() {
      const a = engine.camera.aspect;
      return { target: new THREE.Vector3(0, 11.5, 0), distance: Math.max(43, 11 / (0.344 * a)), dir: new THREE.Vector3(0.1, 0.27, 1) };
    },
    minDistance: 7, maxDistance: 110, near: 0.15, far: 600, minPolar: 0.12, maxPolar: 1.52,
    env: { bg: ["#a9b9c8", "#566573", "#b5c3d0"], fog: ["#8a99a7", 0], exposure: 1.02, bloom: [0.35, 0.4, 2.0], aperture: 0.0004 },
    clay: { groundY: 0, groundR: 40, shadow: 40, freq: 0.5 },
    info(obj) {
      let kind = null;
      for (let o = obj; o && !kind; o = o.parent) kind = o.userData.kind || null;
      if (!kind || !PARTS[kind]) return null;
      let title = PARTS[kind].name;
      if (kind === "water") title = M.phaseChange === "boiling" ? "Water (the bubbles are water vapour, not air)" : "Water";
      if (kind === "ice") title = M.solid > 0 ? "Ice (floats: less dense than water)" : "Ice";
      if (kind === "mist") title = "Mist: tiny droplets of liquid water, not steam";
      if (kind === "thermometer") title = `Thermometer: ${fmtT(M.T)}`;
      return { title, kind, portal: kind === "water" || kind === "ice" ? portals[0] : null };
    },
    /** One frame of model time: model.step(dt * speed) when the clock is running (also called by the particles level while it is on top). */
    advance(simDt) {
      if (ui.running && simDt > 0) { const sdt = simDt * ui.speed; M.step(sdt); trackStep(sdt); }
    },
    get running() { return ui.running; },
    get speed() { return ui.speed; },
    onSelect(info) { showSelection(info); },
    mountPanel(el) {
      tuneLights();
      makeLabels(); updateLabelsVisible();
      if (panelNode && built === lens.band) el.appendChild(panelNode);
      else { panelNode?.remove(); buildPanel(el); }
      buildChips(); measureChipFloor();
    },
    unmountPanel() {
      restoreLights();
      diveLbl && (diveLbl.style.display = "none"); bathLbl && (bathLbl.style.display = "none");
      engine.overlay.innerHTML = ""; chips = null;
    },
    onResume() { tuneLights(); },
    onPause() { restoreLights(); },
    onLens() { panelNode?.remove(); panelNode = null; buildPanel(engine.panel); },
    dispose() {
      restoreLights();
      diveLbl?.remove(); bathLbl?.remove();
    },
    update(dt, t, rdt = dt) {
      level.advance(dt);
      updateScene(dt, t, rdt);
      updateLabels();
      if ((uiT -= rdt) <= 0) { uiT = 0.2; updateChips(); measureChipFloor(); missionObj?.update(); }
      if ((chartT -= rdt) <= 0) { chartT = ui.running ? 0.1 : 0.4; drawChart(); }
      if ((textT -= rdt) <= 0) { textT = 0.45; refreshText(); syncRunBtn(); }
    },
  };
  // clay look: clear glass has no clay equivalent (it would turn into a solid pastel wall), so hide the glass and keep the contents
  root.traverse((o) => { if (o.isMesh && o.material?.userData?.glassU) o.userData.clayHide = true; });
  beaker.print.userData.clayHide = true;
  applyContainer();
  setBath(false);
  resetRun();
  return level;
}
