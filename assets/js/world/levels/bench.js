// Level 0: the MixLab lab bench. Units: 1 world unit = 0.1 m (10 cm), so the scale bar reads in centimetres.
// A clean school lab under soft studio light: matte epoxy-resin bench top, glazed tile splash-back, borosilicate glassware,
// brushed-steel hotplate and retort stand. Each *built* station on the bench is a portal into its own level.
// To add a station: build its level, register it in shell.js, then add a row to STATIONS (slot = position along the bench).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import * as K from "../../kit.js";
import { physical, glass, hash, softDot } from "../materials.js";

// ---------- stations ----------
const SLOT_DX = 6;     // distance between station slots along the bench (units = 10 cm each)
const STATIONS = [
  { to: "states", label: "States of matter", codes: "Y7 4.1", slot: 0,
    blurb: "Heat and cool water in a beaker. Watch it melt, boil, freeze and condense, then zoom in to see the particles doing it." },
  { to: "density", label: "Density lab", codes: "Y7 4.2", slot: 1,
    blurb: "Measure mass and volume, work out density, test float or sink, and build a density column. Then zoom in to see why." },
  // later slots (kept here so the layout stays fixed): density column, dissolving beaker, separation kit,
  // fractionating column, water-treatment train
];
const TOPICS = ["states-of-matter", "heating-curves", "particle-theory", "density", "surface-tension"];   // union of the built stations' topics

// ---------- scene sizes ----------
const R = 0.35, H = 0.95, WALL = 0.025, BASE = 0.055;     // 250 mL Griffin beaker: 7 cm wide, 9.5 cm tall
const R_IN = R - WALL;
const PLATE_Y = 0.6;                                      // top of the hotplate plate (bench top is y = 0)
const WATER_Y = BASE + 0.46;                              // water surface above the beaker floor (about 150 mL)
const WALL_Z = -4;                                        // splash-back plane

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- procedural textures (all drawn on canvases: no downloads, works offline) ----------
function canvasTex(w, h, draw, { srgb = false, repeat = null, aniso = 8 } = {}) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = aniso;
  return t;
}
function noiseFill(g, w, h, base, amp, seed = 1, cell = 1) {
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = clamp(base + (hash(((x / cell) | 0) * 1.7 + ((y / cell) | 0) * 91.3 + seed) - 0.5) * amp, 0, 255);
    const i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
function blotches(g, w, h, n, rmin, rmax, a, seed) {
  for (let i = 0; i < n; i++) {
    const x = hash(i * 3 + seed) * w, y = hash(i * 5 + seed + 7) * h, r = rmin + hash(i * 7 + seed + 3) * (rmax - rmin);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = hash(i + seed) > 0.5;
    gr.addColorStop(0, `rgba(${dark ? "0,0,0" : "255,255,255"},${a})`); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function benchTextures() {
  const rough = canvasTex(512, 512, (g, w, h) => { noiseFill(g, w, h, 150, 70, 3, 1); blotches(g, w, h, 40, 30, 120, 0.06, 5); }, { repeat: [8, 3] });
  const color = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#2c3236"; g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < w * h; i++) { const n = (hash(i * 0.37) - 0.5) * 9; img.data[i * 4] += n; img.data[i * 4 + 1] += n; img.data[i * 4 + 2] += n; }
    g.putImageData(img, 0, 0);
    blotches(g, w, h, 26, 40, 160, 0.025, 11);
  }, { srgb: true, repeat: [8, 3] });
  return { rough, color };
}

function tileTextures(tiles = 8) {
  const S = 1024, c = S / tiles, grout = 5, bevel = 14;
  const color = canvasTex(S, S, (g) => {
    g.fillStyle = "#a9afb0"; g.fillRect(0, 0, S, S);
    for (let j = 0; j < tiles; j++) for (let i = 0; i < tiles; i++) {
      const v = 238 + Math.floor((hash(i * 13 + j * 71) - 0.5) * 10), w = v + 2;
      g.fillStyle = `rgb(${v},${w},${w - 1})`;
      g.fillRect(i * c + grout / 2, j * c + grout / 2, c - grout, c - grout);
      const gr = g.createLinearGradient(i * c, j * c, i * c + c, j * c + c);
      gr.addColorStop(0, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(0,0,0,0.06)");
      g.fillStyle = gr; g.fillRect(i * c + grout / 2, j * c + grout / 2, c - grout, c - grout);
    }
  }, { srgb: true, repeat: [1, 1], aniso: 16 });
  const bump = canvasTex(S, S, (g) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, S, S);
    for (let j = 0; j < tiles; j++) for (let i = 0; i < tiles; i++) {
      const x0 = i * c + grout / 2, y0 = j * c + grout / 2, w = c - grout;
      g.fillStyle = "#fff"; g.fillRect(x0 + bevel, y0 + bevel, w - bevel * 2, w - bevel * 2);
      // soft bevel: four gradient strips
      let gr = g.createLinearGradient(0, y0, 0, y0 + bevel); gr.addColorStop(0, "#000"); gr.addColorStop(1, "#fff");
      g.fillStyle = gr; g.fillRect(x0 + bevel, y0, w - bevel * 2, bevel);
      gr = g.createLinearGradient(0, y0 + w, 0, y0 + w - bevel); gr.addColorStop(0, "#000"); gr.addColorStop(1, "#fff");
      g.fillStyle = gr; g.fillRect(x0 + bevel, y0 + w - bevel, w - bevel * 2, bevel);
      gr = g.createLinearGradient(x0, 0, x0 + bevel, 0); gr.addColorStop(0, "#000"); gr.addColorStop(1, "#fff");
      g.fillStyle = gr; g.fillRect(x0, y0 + bevel, bevel, w - bevel * 2);
      gr = g.createLinearGradient(x0 + w, 0, x0 + w - bevel, 0); gr.addColorStop(0, "#000"); gr.addColorStop(1, "#fff");
      g.fillStyle = gr; g.fillRect(x0 + w - bevel, y0 + bevel, bevel, w - bevel * 2);
    }
  }, { repeat: [1, 1], aniso: 16 });
  return { color, bump };
}

/** Beaker graduation marks (white print), drawn for a 250 mL Griffin beaker: 50 mL steps. */
function graduationTex() {
  return canvasTex(512, 1024, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#fff"; g.strokeStyle = "#fff";
    const yOf = (cm) => h - (((BASE + cm / 10 * 0) + cm / 10) / H) * h;   // cm of height above the beaker floor
    const floorCm = 0, mlToCm = (ml) => ml / (Math.PI * (R_IN * 10) ** 2);      // height of ml of water, in cm
    const marks = [50, 100, 150, 200, 250];
    for (const ml of marks) {
      const cm = floorCm + mlToCm(ml) + BASE * 10;          // distance above the outside bottom, in cm
      const y = h - (cm / 10 / H) * h;
      const major = ml % 100 === 0 || ml === 250;
      const len = major ? 120 : 70;
      g.lineWidth = 6;
      g.beginPath(); g.moveTo(w * 0.5 - len / 2 - 30, y); g.lineTo(w * 0.5 + len / 2 - 30, y); g.stroke();
      g.font = "700 46px Inter, Arial, sans-serif"; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(String(ml), w * 0.5 + len / 2 - 14, y);
    }
    // minor ticks every 10 mL
    for (let ml = 10; ml < 250; ml += 10) {
      if (ml % 50 === 0) continue;
      const cm = mlToCm(ml) + BASE * 10, y = h - (cm / 10 / H) * h;
      g.lineWidth = 4; g.beginPath(); g.moveTo(w * 0.5 - 30 - 22, y); g.lineTo(w * 0.5 - 30 + 22, y); g.stroke();
    }
    g.font = "700 44px Inter, Arial, sans-serif"; g.textAlign = "center";
    g.fillText("250 mL", w * 0.5 - 20, h * 0.1);
    g.font = "500 22px Inter, Arial, sans-serif";
    g.fillText("approx.", w * 0.5 - 20, h * 0.1 + 34);
  }, { srgb: true });
}

function dropletTex() {
  return canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1100; i++) {
      const x = hash(i * 1.3) * w, y = hash(i * 2.9 + 4) * h, r = 1.1 + Math.pow(hash(i * 5.1 + 2), 2.6) * 3.8;
      const stretch = 1 + hash(i + 9) * (r > 4 ? 1.4 : 0.3);
      g.save(); g.translate(x, y); g.scale(1, stretch);
      const gr = g.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
      gr.addColorStop(0, "rgba(255,255,255,0.95)"); gr.addColorStop(0.28, "rgba(255,255,255,0.22)"); gr.addColorStop(0.8, "rgba(255,255,255,0.3)"); gr.addColorStop(1, "rgba(255,255,255,0.7)");
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fill(); g.restore();
    }
    // a few faint run tracks
    g.globalAlpha = 0.12; g.strokeStyle = "#fff"; g.lineWidth = 1.2;
    for (let i = 0; i < 30; i++) { const x = hash(i * 7.7) * w, y0 = hash(i * 3.3) * h * 0.6; g.beginPath(); g.moveTo(x, y0); g.lineTo(x + (hash(i) - 0.5) * 4, y0 + 40 + hash(i * 9) * 140); g.stroke(); }
  }, { repeat: null });
}

function iceTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#e4f2f8"; g.fillRect(0, 0, w, h);
    // cloudy core and trapped-air streaks
    const gr = g.createRadialGradient(w / 2, h / 2, 6, w / 2, h / 2, w * 0.55);
    gr.addColorStop(0, "rgba(255,255,255,0.95)"); gr.addColorStop(0.55, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(160,205,225,0.35)");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.lineCap = "round";
    for (let i = 0; i < 26; i++) {
      const x = w * (0.2 + hash(i * 2.1) * 0.6), y = h * 0.1 + hash(i * 3.7) * h * 0.8, len = 14 + hash(i * 5.3) * 60;
      g.strokeStyle = `rgba(255,255,255,${0.35 + hash(i) * 0.5})`; g.lineWidth = 1 + hash(i * 9) * 2.4;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (hash(i * 7) - 0.5) * 18, y + len); g.stroke();
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,255,${0.4 + hash(i * 4) * 0.5})`;
      g.beginPath(); g.arc(hash(i * 1.9) * w, hash(i * 6.1) * h, 0.8 + hash(i) * 1.8, 0, 6.2832); g.fill();
    }
  }, { srgb: true });
}
function iceBumpTex() {
  return canvasTex(128, 128, (g, w, h) => { noiseFill(g, w, h, 128, 90, 8, 4); blotches(g, w, h, 16, 14, 50, 0.3, 2); }, { repeat: null });
}

function brushedRings() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = "#808080"; g.fillRect(0, 0, w, h);
    for (let r = 4; r < 256; r += 1) {
      const v = 128 + (hash(r * 1.31) - 0.5) * 70;
      g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1.2;
      g.beginPath(); g.arc(256, 256, r, 0, 6.2832); g.stroke();
    }
  }, {});
}
function brushedLinear() {
  return canvasTex(256, 256, (g, w, h) => {
    for (let y = 0; y < h; y++) { const v = 128 + (hash(y * 2.17) - 0.5) * 80; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, y, w, 1); }
  }, { repeat: [1, 2] });
}

function lcdTex(lines) {
  return canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = "#0a0d0c"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#cfe9d4"; g.font = "600 44px 'Space Grotesk', monospace"; g.textBaseline = "middle"; g.textAlign = "left";
    g.fillText(lines[0], 16, h * 0.4);
    g.font = "500 22px Inter, monospace"; g.fillStyle = "#7fb590";
    g.fillText(lines[1], 16, h * 0.8);
  }, { srgb: true });
}

const T_BULB = 0.1, T_LEN = 2.5, T_Y0 = 0.05;              // thermometer: bulb centre, length, strip start
const T_ZERO = 0.35, T_PER_C = 0.0146;                    // y of the -10 °C mark, and units per °C
const tY = (c) => T_ZERO + (c + 10) * T_PER_C;
function thermoScaleTex() {
  return canvasTex(128, 1024, (g, w, h) => {
    g.fillStyle = "#f5f2e8"; g.fillRect(0, 0, w, h);
    const yOf = (y) => h - ((y - T_Y0) / (T_LEN - 0.2)) * h;
    g.fillStyle = "#16202c"; g.strokeStyle = "#16202c";
    for (let c = -10; c <= 110; c += 1) {
      const y = yOf(tY(c)), five = c % 5 === 0, ten = c % 10 === 0;
      g.lineWidth = ten ? 2.4 : 1.4;
      const len = ten ? 34 : five ? 24 : 14;
      g.beginPath(); g.moveTo(w * 0.62 - len, y); g.lineTo(w * 0.62, y); g.stroke();
      if (ten && c % 20 === 0 || c === 0 || c === 100) {
        g.font = "600 22px Inter, Arial, sans-serif"; g.textAlign = "left"; g.textBaseline = "middle";
        g.fillText(String(c), w * 0.66, y);
      }
    }
    g.font = "700 18px Inter, Arial, sans-serif"; g.textAlign = "center";
    g.fillText("°C", w * 0.3, yOf(tY(114)));
  }, { srgb: true });
}

function bottleLabelTex() {
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = "#f6f7f4"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1f4f8f"; g.fillRect(0, 0, w, 30); g.fillRect(0, h - 30, w, 30);
    g.fillStyle = "#1b2a3c"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "700 60px 'Space Grotesk', Arial, sans-serif"; g.fillText("DISTILLED", w / 2, h * 0.38);
    g.fillText("WATER", w / 2, h * 0.68);
  }, { srgb: true });
}

function signTex() {
  return canvasTex(512, 768, (g, w, h) => {
    g.fillStyle = "#fbfbf8"; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 36); g.fill();
    g.strokeStyle = "#1f5fa8"; g.lineWidth = 10; g.stroke();
    g.fillStyle = "#1f5fa8"; g.beginPath(); g.arc(w / 2, 270, 190, 0, 6.2832); g.fill();
    g.strokeStyle = "#fff"; g.lineWidth = 16; g.lineJoin = "round";
    // safety glasses pictogram
    g.beginPath(); g.roundRect(w / 2 - 128, 232, 108, 74, 26); g.stroke();
    g.beginPath(); g.roundRect(w / 2 + 20, 232, 108, 74, 26); g.stroke();
    g.beginPath(); g.moveTo(w / 2 - 20, 258); g.quadraticCurveTo(w / 2, 246, w / 2 + 20, 258); g.stroke();
    g.beginPath(); g.moveTo(w / 2 - 128, 252); g.lineTo(w / 2 - 162, 244); g.moveTo(w / 2 + 128, 252); g.lineTo(w / 2 + 162, 244); g.stroke();
    g.fillStyle = "#16324f"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "700 58px 'Space Grotesk', Arial, sans-serif";
    g.fillText("Safety glasses", w / 2, 540); g.fillText("must be worn", w / 2, 610);
    g.font = "500 30px Inter, Arial, sans-serif"; g.fillStyle = "#3b4b5f";
    g.fillText("when heating or pouring", w / 2, 680);
  }, { srgb: true });
}

let _shadowTex;
function shadowTex() {
  if (_shadowTex) return _shadowTex;
  _shadowTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64);
    gr.addColorStop(0, "rgba(0,0,0,0.62)"); gr.addColorStop(0.45, "rgba(0,0,0,0.32)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }, {});
  _shadowTex.userData.shared = true;
  return _shadowTex;
}

function padTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "#7ee8dc"; g.lineWidth = 7; g.lineJoin = "round";
    g.beginPath(); g.roundRect(18, 18, w - 36, h - 36, 46); g.stroke();
    g.globalAlpha = 0.35; g.lineWidth = 20; g.stroke();
  }, { srgb: true });
}

// ---------- geometry helpers ----------
const V2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
const arc = (cx, cy, r, a0, a1, n = 7) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * (i / n); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });

/** Outer skin of a Griffin beaker, bottom centre to the lip. */
function beakerOuter() {
  const heel = 0.075;
  return [[0, 0], [R - heel, 0], ...arc(R - heel, heel, heel, -Math.PI / 2, 0).slice(1), [R, H - 0.045],
    [R + 0.01, H - 0.026], [R + 0.014, H - 0.012], [R + 0.01, H + 0.004], [R + 0.002, H + 0.012], [R - WALL / 2, H + 0.014]];
}
/** Inner skin, lip down to the centre of the floor. */
function beakerInner() {
  const heel = 0.05;
  return [[R - WALL / 2, H + 0.014], [R - WALL - 0.003, H + 0.006], [R - WALL, H - 0.012], [R - WALL, BASE + heel],
    ...arc(R - WALL - heel, BASE + heel, heel, 0, -Math.PI / 2).slice(1), [0, BASE]];
}
function liquidProfile(level, rise = 0.018) {
  const rw = R_IN - 0.004, heel = 0.048, b = BASE + 0.003;
  return [[0, b], [rw - heel, b], ...arc(rw - heel, b + heel, heel, -Math.PI / 2, 0).slice(1), [rw, level - 0.002],
    [rw, level + rise], [rw - 0.007, level + rise * 0.36], [rw - 0.02, level + rise * 0.1], [rw - 0.05, level + 0.001], [rw - 0.1, level], [0, level]];
}

function bendAroundY(geo, rb) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), a = x / rb;
    p.setX(i, rb * Math.sin(a));
    p.setZ(i, p.getZ(i) - rb * (1 - Math.cos(a)));
  }
  geo.computeVertexNormals();
  return geo;
}

function roundedRectShape(w, h, r, cx = 0, cy = 0, hole = false) {
  const s = hole ? new THREE.Path() : new THREE.Shape();
  const x = cx - w / 2, y = cy - h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// ---------- the level ----------
export function create(engine) {
  const lens = engine.lens;
  const root = new THREE.Group();
  const pickables = [], fallbackPickables = [];
  const stations = STATIONS.filter((s) => engine.levelsDef[s.to]).sort((a, b) => a.slot - b.slot);   // built stations only: no dead ends
  const slotX = (s) => s.slot * SLOT_DX;
  const maxSlot = stations.reduce((m, s) => Math.max(m, s.slot), 0);
  const x0 = -6.5, x1 = maxSlot * SLOT_DX + 6.5;
  const benchW = x1 - x0, benchCx = (x0 + x1) / 2;
  const tag = (m, kind) => { m.userData.kind = kind; pickables.push(m); return m; };
  const place = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };
  const cast = (o, c = true, r = true) => { o.castShadow = c; o.receiveShadow = r; return o; };
  const decal = (w, d, x, z, alpha = 1, y = 0.004) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, opacity: alpha, depthWrite: false, fog: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.userData.clayHide = true; m.renderOrder = -5;
    return m;
  };

  // =============== room: bench top, cabinet, splash-back tiles, wall ===============
  const bt = benchTextures();
  const benchMat = physical("#ffffff", { map: bt.color, roughnessMap: bt.rough, bumpMap: bt.rough, bumpScale: 0.35, roughness: 1, clearcoat: 0.12, clearcoatRoughness: 0.5, sheen: 0, metalness: 0, envMapIntensity: 0.45 });
  bt.color.repeat.set(benchW / 3, 2); bt.rough.repeat.set(benchW / 3, 2);
  const BENCH_D = 8, BENCH_T = 0.4;
  const benchTop = new THREE.Mesh(new RoundedBoxGeometry(benchW, BENCH_T, BENCH_D, 4, 0.06), benchMat);
  benchTop.position.set(benchCx, -BENCH_T / 2, 0.0);
  benchTop.receiveShadow = true;
  benchTop.userData.clayColor = "#d9d3cb";
  root.add(benchTop);
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(benchW - 0.4, 6, BENCH_D - 0.6), physical("#252a2e", { roughness: 0.7, clearcoat: 0 }));
  cabinet.position.set(benchCx, -BENCH_T - 3, -0.05);
  cabinet.userData.clayHide = true;
  root.add(cabinet);

  const tt = tileTextures(8);
  const TILE_U = 0.75, TILE_H = 4.6;
  const tileMat = physical("#ffffff", { map: tt.color, bumpMap: tt.bump, bumpScale: 1.4, roughness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.08, sheen: 0 });
  const wallW = benchW + 20;
  tt.color.repeat.set(wallW / (TILE_U * 8), TILE_H / (TILE_U * 8)); tt.bump.repeat.copy(tt.color.repeat);
  const tiles = new THREE.Mesh(new THREE.PlaneGeometry(wallW, TILE_H), tileMat);
  tiles.position.set(benchCx, TILE_H / 2, WALL_Z); tiles.userData.clayHide = true;
  root.add(tiles);
  const paintMat = physical("#e9ecea", { roughness: 0.92, clearcoat: 0, sheen: 0.2 });
  const paint = new THREE.Mesh(new THREE.PlaneGeometry(wallW, 12), paintMat);
  paint.position.set(benchCx, TILE_H + 6, WALL_Z - 0.01); paint.userData.clayHide = true;
  root.add(paint);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(wallW, 0.14, 0.12), physical("#cfd5d6", { roughness: 0.4 }));
  trim.position.set(benchCx, TILE_H + 0.07, WALL_Z + 0.04); trim.userData.clayHide = true;
  root.add(trim);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.95), new THREE.MeshStandardMaterial({ map: signTex(), roughness: 0.4 }));
  sign.position.set(slotX(STATIONS[0]) + 3.9, 2.55, WALL_Z + 0.012); sign.userData.clayHide = true;
  root.add(sign);

  // =============== steel and glass materials ===============
  const ringTex = brushedRings();
  const steel = physical("#c9ced1", { metalness: 1, roughness: 0.34, roughnessMap: brushedLinear(), clearcoat: 0, sheen: 0, envMapIntensity: 1.1 });
  const plateMat = physical("#bcc2c6", { metalness: 1, roughness: 0.4, roughnessMap: ringTex, clearcoat: 0, sheen: 0, envMapIntensity: 1.1 });
  const blackSatin = physical("#1d2124", { roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.4, sheen: 0 });
  const graphite = physical("#2e3337", { roughness: 0.46, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0 });

  // =============== station 0: hotplate + beaker of ice water + thermometer + retort stand ===============
  const station = new THREE.Group();
  station.name = "station-states";
  root.add(station);
  const sx = slotX(STATIONS[0]);
  station.position.set(sx, 0, 0);
  station.visible = stations.some((s) => s.to === "states");
  const pads = {};            // per station: the work-area outline that brightens on hover
  const mark = (m, kind) => { tag(m, kind); return m; };

  // work-area outline on the bench (portal marker; brightens when hovered)
  const padMat = new THREE.MeshBasicMaterial({ map: padTex(), transparent: true, opacity: 0.0, depthWrite: false, fog: false });
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.6), padMat);
  pad.rotation.x = -Math.PI / 2; pad.position.set(-0.55, 0.008, 0.1); pad.renderOrder = -4; pad.userData.clayHide = true; pad.userData.kind = "station";
  station.add(pad);
  fallbackPickables.push(pad);
  pads.states = { mesh: pad, mat: padMat };
  const shadowHot = decal(3.4, 3.5, 0, 0.1, 0.9); station.add(shadowHot);
  const shadowStand = decal(2.4, 1.8, -2.5, -0.2, 0.75); station.add(shadowStand);

  // ---- hotplate ----
  const hot = new THREE.Group();
  station.add(hot);
  const body = mark(cast(new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.5, 2.2, 5, 0.07), graphite)), "hotplate");
  body.position.y = 0.04 + 0.25;
  body.userData.clayColor = "#c8d3dc";
  hot.add(body);
  for (const [fx, fz] of [[-0.85, -0.9], [0.85, -0.9], [-0.85, 0.9], [0.85, 0.9]]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.05, 20), physical("#0e1011", { roughness: 0.9, clearcoat: 0, sheen: 0 }));
    foot.position.set(fx, 0.025, fz); foot.userData.clayHide = true; hot.add(foot);
  }
  const plate = mark(cast(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.06, 96), plateMat)), "hotplate");
  plate.position.y = 0.54 + 0.03;
  plate.userData.clayColor = "#e1e6ea";
  hot.add(plate);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.915, 0.022, 14, 96), blackSatin);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.575; rim.userData.clayHide = true; hot.add(rim);
  // heating element ring: dull when off, glows orange when the station heats (the station level owns the real heater)
  const glowMat = new THREE.MeshStandardMaterial({ color: "#3a2f2c", emissive: new THREE.Color("#ff6a1a"), emissiveIntensity: 0, roughness: 0.6 });
  const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.016, 10, 96), glowMat);
  ringGlow.rotation.x = Math.PI / 2; ringGlow.position.y = 0.604; ringGlow.userData.clayHide = true; hot.add(ringGlow);
  // front panel: display, knob, LED
  const panelPlate = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.34, 0.03, 3, 0.012), physical("#171a1c", { roughness: 0.4, clearcoat: 0.6 }));
  panelPlate.position.set(0, 0.3, 1.1); panelPlate.userData.clayHide = true; hot.add(panelPlate);
  const lcdMat = new THREE.MeshStandardMaterial({ map: lcdTex(["OFF", "plate 21 °C"]), emissive: new THREE.Color("#ffffff"), emissiveMap: lcdTex(["OFF", "plate 21 °C"]), emissiveIntensity: 0.55, roughness: 0.3 });
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.292), lcdMat);
  lcd.position.set(-0.36, 0.3, 1.118); lcd.userData.clayHide = true; hot.add(lcd);
  const knobGeo = new THREE.CylinderGeometry(0.135, 0.15, 0.1, 40); knobGeo.rotateX(Math.PI / 2);
  const knob = new THREE.Mesh(knobGeo, steel);
  knob.position.set(0.52, 0.3, 1.16); hot.add(knob);
  const knobCap = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.02, 32).rotateX(Math.PI / 2), blackSatin);
  knobCap.position.set(0.52, 0.3, 1.215); hot.add(knobCap);
  const tick = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.075, 0.012), physical("#f0f0f0", { roughness: 0.5 }));
  tick.position.set(0.52, 0.35, 1.222); tick.rotation.z = 2.45; tick.position.set(0.52 + Math.sin(-2.45) * 0.0, 0.3 + 0.05, 1.222);
  tick.position.set(0.52 - 0.035, 0.3 + 0.035, 1.222); tick.rotation.z = Math.PI / 4;
  hot.add(tick);
  const ledMat = new THREE.MeshStandardMaterial({ color: "#222", emissive: new THREE.Color("#ff3b30"), emissiveIntensity: 0, roughness: 0.4 });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), ledMat);
  led.position.set(0.85, 0.3, 1.125); hot.add(led);

  // ---- beaker of ice water ----
  const beaker = new THREE.Group();
  beaker.position.set(0, PLATE_Y, 0.0);
  station.add(beaker);
  const glassBase = {
    color: "#ffffff", transmission: 1, ior: 1.47, thickness: 0.05, roughness: 0.02, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03,
    attenuationColor: new THREE.Color("#bfe7da"), attenuationDistance: 0.55, specularIntensity: 1, envMapIntensity: 1.4, depthWrite: false,
    opacity: 0.14,   // ignored while transmission is on; the Balanced / Fast tiers fall back to this alpha
  };
  const glassOuterMat = new THREE.MeshPhysicalMaterial(glassBase);
  const glassInnerMat = new THREE.MeshPhysicalMaterial({ ...glassBase });
  const outer = mark(cast(new THREE.Mesh(new THREE.LatheGeometry(V2(beakerOuter()), 96), glassOuterMat), false, false), "beaker");
  const inner = new THREE.Mesh(new THREE.LatheGeometry(V2(beakerInner()), 96), glassInnerMat);
  inner.renderOrder = 1; outer.renderOrder = 2;
  inner.userData.clayHide = true;
  outer.userData.clayColor = "#cfe3ee"; outer.userData.clayOpacity = 0.55;
  beaker.add(inner, outer);
  // fresnel rim overlay: the bright edges and highlights of real glass, composited on top of the water
  const rimMat = glass("#ffffff", { rim: "#ffffff", rimPower: 2.6, rimStrength: 0.55, minAlpha: 0.0, maxAlpha: 0.55, clearcoat: 1, roughness: 0.05 });
  const rimShell = new THREE.Mesh(new THREE.LatheGeometry(V2(beakerOuter().map(([x, y]) => [x + 0.0015, y])), 96), rimMat);
  rimShell.renderOrder = 8; rimShell.userData.clayHide = true;
  beaker.add(rimShell);
  // printed graduations (white on the front)
  const gradLen = 0.95;
  const gradGeo = new THREE.CylinderGeometry(R + 0.0035, R + 0.0035, H, 64, 1, true, -gradLen / 2, gradLen);
  const gradMat = new THREE.MeshStandardMaterial({ map: graduationTex(), transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const grad = new THREE.Mesh(gradGeo, gradMat);
  grad.position.y = H / 2; grad.renderOrder = 9; grad.userData.clayHide = true;
  beaker.add(grad);
  // condensation on the cold glass: small drops of water from the air (not leaking through the glass)
  const dropGeo = new THREE.CylinderGeometry(R + 0.005, R + 0.006, H * 0.86, 64, 1, true);
  const dropMat = new THREE.MeshPhysicalMaterial({ color: "#f4fbff", alphaMap: dropletTex(), transparent: true, opacity: 0.5, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false, metalness: 0, ior: 1.33 });
  const drops = new THREE.Mesh(dropGeo, dropMat);
  drops.position.y = H * 0.43 + 0.07; drops.renderOrder = 7; drops.userData.clayHide = true;
  beaker.add(drops);

  // water: transmissive, ior 1.33, faint blue attenuation, raised meniscus rim
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: "#c2e3f5", transmission: 1, ior: 1.33, thickness: 0.55, roughness: 0.02, metalness: 0, clearcoat: 0, specularIntensity: 1, opacity: 0.4,
    attenuationColor: new THREE.Color("#5db3e0"), attenuationDistance: 1.1, envMapIntensity: 1.2, depthWrite: false,
  });
  const water = mark(new THREE.Mesh(new THREE.LatheGeometry(V2(liquidProfile(WATER_Y)), 96), waterMat), "water");
  water.renderOrder = 3; water.userData.clayColor = "#a8d9f2"; water.userData.clayOpacity = 0.8;
  beaker.add(water);

  // ice cubes: frosted, cloudy, with trapped-air streaks. (Opaque-ish so the water and glass refract them.)
  const iceTexMap = iceTex(), iceBump = iceBumpTex();
  const iceMat = physical("#e9f6fb", {
    map: iceTexMap, bumpMap: iceBump, bumpScale: 0.6, roughness: 0.22, clearcoat: 0.55, clearcoatRoughness: 0.18, ior: 1.31,
    sheen: 0.4, sheenColor: new THREE.Color("#cfeaf6"), sheenRoughness: 0.4, emissive: new THREE.Color("#8cc3dc"), emissiveIntensity: 0.04,
  });
  const CUBE = 0.25;
  const iceGeo = new RoundedBoxGeometry(CUBE, CUBE, CUBE, 5, 0.026);
  { const p = iceGeo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 0.007; p.setXYZ(i, x + Math.sin(y * 31 + z * 17) * k, y + Math.sin(x * 29 + z * 23) * k, z + Math.sin(x * 19 + y * 37) * k); } iceGeo.computeVertexNormals(); }
  const ice = new THREE.Group();
  ice.position.y = 0;
  beaker.add(ice);
  // ice floats with about 92 % of its volume under the surface (density 917 vs 1000 kg/m³): only a sliver shows above
  const sub = 0.917, top = WATER_Y + CUBE * (1 - sub) - 0.0;
  const cubes = [
    { x: -0.105, z: -0.045, y: top - CUBE / 2, ry: 0.5, rx: 0.04, rz: -0.03 },
    { x: 0.1, z: -0.07, y: top - CUBE / 2 - 0.004, ry: 1.2, rx: -0.03, rz: 0.04 },
    { x: 0.005, z: 0.115, y: top - CUBE / 2 + 0.002, ry: 0.15, rx: 0.05, rz: 0.03 },
    { x: -0.02, z: -0.01, y: top + CUBE / 2 - 0.02, ry: 0.9, rx: 0.1, rz: -0.12 },   // resting on the others
    { x: 0.075, z: 0.065, y: top + CUBE / 2 - 0.045, ry: 2.2, rx: -0.14, rz: 0.1 },
  ];
  cubes.forEach((c, i) => {
    const m = mark(new THREE.Mesh(iceGeo, iceMat), "ice");
    m.position.set(c.x, c.y, c.z); m.rotation.set(c.rx, c.ry, c.rz);
    m.userData.clayColor = "#e6f2f8";
    ice.add(m);
  });

  // ---- thermometer (alcohol, reads 0 °C: ice and water together are at the melting point) ----
  const thermo = new THREE.Group();
  thermo.position.set(0.215, PLATE_Y + 0.07, 0.17);
  
  beaker.add(thermo); thermo.position.set(0.215, 0.07, 0.17);
  const tubeMat = glass("#ffffff", { rim: "#ffffff", rimPower: 2.0, rimStrength: 0.5, minAlpha: 0.05, maxAlpha: 0.55, clearcoat: 1 });
  const tube = mark(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, T_LEN - 0.1, 32, 1, true), tubeMat), "thermometer");
  tube.position.y = T_LEN / 2 + 0.05; tube.renderOrder = 6; thermo.add(tube);
  const bulbGlass = mark(new THREE.Mesh(new THREE.SphereGeometry(0.055, 28, 20), tubeMat), "thermometer");
  bulbGlass.position.y = T_BULB; bulbGlass.renderOrder = 6; thermo.add(bulbGlass);
  const spiritMat = physical("#d3202a", { roughness: 0.25, clearcoat: 0.8, emissive: new THREE.Color("#7a0a10"), emissiveIntensity: 0.25 });
  const bulbFill = mark(new THREE.Mesh(new THREE.SphereGeometry(0.043, 24, 16), spiritMat), "thermometer");
  bulbFill.position.y = T_BULB; thermo.add(bulbFill);
  const colH = tY(0) - T_BULB;
  const col = mark(new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 1, 12), spiritMat), "thermometer");
  col.scale.y = colH; col.position.y = T_BULB + colH / 2; thermo.add(col);
  const stripH = T_LEN - 0.2;
  const strip = mark(new THREE.Mesh(new THREE.BoxGeometry(0.078, stripH, 0.01), new THREE.MeshStandardMaterial({ map: thermoScaleTex(), roughness: 0.45 })), "thermometer");
  strip.position.set(0, T_Y0 + stripH / 2, -0.02); strip.userData.clayColor = "#fbf6ec"; thermo.add(strip);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 24), blackSatin);
  cap.position.y = T_LEN + 0.02; cap.userData.clayHide = true; thermo.add(cap);

  // ---- retort stand holding the thermometer ----
  const stand = new THREE.Group();
  station.add(stand);
  const sbase = mark(cast(new THREE.Mesh(new RoundedBoxGeometry(1.55, 0.1, 1.0, 3, 0.03), blackSatin)), "stand");
  sbase.position.set(-2.4, 0.05, -0.2); sbase.userData.clayColor = "#b4bcc6"; stand.add(sbase);
  const rodX = -2.95, rodZ = -0.4, rodH = 3.6, armY = 2.15;
  const rod = mark(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, rodH, 24), steel), "stand");
  rod.position.set(rodX, 0.1 + rodH / 2, rodZ); stand.add(rod);
  const rodFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.08, 20), steel);
  rodFoot.position.set(rodX, 0.12, rodZ); rodFoot.userData.clayHide = true; stand.add(rodFoot);
  const boss = mark(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.2, 0.2, 3, 0.03), steel), "stand");
  boss.position.set(rodX, armY, rodZ); stand.add(boss);
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 14).rotateZ(Math.PI / 2), blackSatin);
  screw.position.set(rodX - 0.16, armY, rodZ); screw.userData.clayHide = true; stand.add(screw);
  const tx = 0.215, tz = 0.17;     // thermometer axis (station coordinates)
  const dir = new THREE.Vector3(tx - rodX, 0, tz - rodZ), armLen = dir.length() - 0.04;
  const arm = mark(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, armLen, 16), steel), "stand");
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  arm.position.set(rodX, armY, rodZ).addScaledVector(dir.clone().normalize(), armLen / 2 + 0.08); stand.add(arm);
  const clampRing = mark(new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.02, 12, 28), steel), "stand");
  clampRing.rotation.x = Math.PI / 2; clampRing.position.set(tx, armY, tz); stand.add(clampRing);
  const clampPad = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.014, 10, 24), physical("#38302a", { roughness: 0.9, clearcoat: 0, sheen: 0 }));
  clampPad.rotation.x = Math.PI / 2; clampPad.position.set(tx, armY, tz); clampPad.userData.clayHide = true; stand.add(clampPad);
  // the thermometer passes through the clamp at armY: align its group height so the clamp holds it
  // (bulb sits just above the beaker floor)


  // =============== station 1: density column + electronic balance ===============
  const dX = slotX(STATIONS[1]);
  const dens = new THREE.Group();
  dens.name = "station-density";
  dens.position.set(dX, 0, 0);
  dens.visible = stations.some((s) => s.to === "density");
  root.add(dens);
  {
    const dtag = (m, kind) => { m.userData.kind = kind; pickables.push(m); return m; };
    const dpadMat = new THREE.MeshBasicMaterial({ map: padTex(), transparent: true, opacity: 0, depthWrite: false, fog: false });
    const dpad = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 3.7), dpadMat);
    dpad.rotation.x = -Math.PI / 2; dpad.position.set(0.05, 0.008, 0.15); dpad.renderOrder = -4; dpad.userData.clayHide = true; dpad.userData.kind = "station-density";
    dens.add(dpad); fallbackPickables.push(dpad);
    pads.density = { mesh: dpad, mat: dpadMat };
    dens.add(decal(1.6, 1.6, -1.2, 0.2, 0.85));
    dens.add(decal(3.0, 3.4, 1.3, 0.15, 0.85));

    // ---- 250 mL measuring cylinder with four layers (bottom to top: honey, dish liquid, water, oil) ----
    const CX = -1.2, CZ = 0.2, CR = 0.2, CW = 0.02, CRI = CR - CW, CY0 = 0.12, CH = 3.3, FLOOR = 0.2;
    const cyl = new THREE.Group();
    cyl.position.set(CX, 0, CZ);
    dens.add(cyl);
    const baseMat = physical("#2a6fb5", { roughness: 0.42, clearcoat: 0.4, sheen: 0 });
    const cbase = dtag(cast(new THREE.Mesh(new THREE.LatheGeometry(V2([[0, 0], [0.4, 0], [0.42, 0.03], [0.4, 0.07], [0.3, 0.12], [0.24, 0.16], [0.22, 0.2], [0, 0.2]]), 6), baseMat)), "cylinder");
    cbase.userData.clayColor = "#9ec4ea";
    cbase.rotation.y = Math.PI / 6; cyl.add(cbase);
    const layers = [
      { h: 0.55, color: "#c8780f", emissive: "#6b3a00", ei: 0.28, opacity: 0.94, rough: 0.12, name: "honey" },
      { h: 0.55, color: "#2fae62", emissive: "#0c3f21", ei: 0.18, opacity: 0.88, rough: 0.1, name: "dish liquid" },
      { h: 0.65, color: "#6cc2f0", emissive: "#0d3a58", ei: 0.1, opacity: 0.58, rough: 0.03, name: "water" },
      { h: 0.55, color: "#f0c424", emissive: "#6a5000", ei: 0.18, opacity: 0.8, rough: 0.05, name: "oil" },
    ];
    let y = FLOOR;
    layers.forEach((L, i) => {
      const top = y + L.h, rw = CRI - 0.003, last = i === layers.length - 1;
      const prof = last
        ? [[0, y], [rw, y], [rw, top], [rw - 0.008, top + 0.012], [rw - 0.02, top + 0.004], [rw - 0.05, top], [0, top]]
        : [[0, y], [rw, y], [rw, top], [0, top]];
      const m = dtag(new THREE.Mesh(new THREE.LatheGeometry(V2(prof), 48), new THREE.MeshPhysicalMaterial({
        color: L.color, emissive: new THREE.Color(L.emissive), emissiveIntensity: L.ei, roughness: L.rough, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.08,
        transparent: true, opacity: L.opacity, depthWrite: false, ior: 1.4, envMapIntensity: 1.1 })), "layer");
      m.renderOrder = 2 + i * 0.01; m.userData.layer = L.name; m.userData.clayColor = L.color; m.userData.clayOpacity = Math.min(1, L.opacity + 0.15);
      cyl.add(m);
      y = top;
    });
    // glass tube, rolled lip and spout, with printed graduations
    const tubeProfile = V2([[CR, CY0], [CR, CY0 + CH - 0.04], [CR + 0.012, CY0 + CH - 0.02], [CR + 0.012, CY0 + CH - 0.004], [CR + 0.002, CY0 + CH + 0.008], [CR - CW / 2, CY0 + CH + 0.01]]);
    const tubeMat = glass("#ffffff", { rim: "#ffffff", rimPower: 2.3, rimStrength: 0.6, minAlpha: 0.02, maxAlpha: 0.6, clearcoat: 1, roughness: 0.04 });
    const tubeMesh = dtag(new THREE.Mesh(new THREE.LatheGeometry(tubeProfile, 64), tubeMat), "cylinder");
    tubeMesh.renderOrder = 8; tubeMesh.userData.clayColor = "#dbe8f0"; tubeMesh.userData.clayOpacity = 0.35;
    cyl.add(tubeMesh);
    const ghr = CH + 0.14, mlU = (ml) => ml / (Math.PI * 1.8 * 1.8) / 10;
    const gradTex2 = canvasTex(256, 2048, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.fillStyle = "#fff"; g.strokeStyle = "#fff";
      const yOf = (u) => h - ((u - CY0) / CH) * h;   // u = height above the bench
      for (let ml = 10; ml <= 250; ml += 10) {
        const yy = yOf(FLOOR + mlU(ml)), major = ml % 50 === 0;
        g.lineWidth = major ? 5 : 3; const len = major ? 70 : (ml % 10 === 0 ? 38 : 20);
        g.beginPath(); g.moveTo(w * 0.42, yy); g.lineTo(w * 0.42 + len, yy); g.stroke();
        if (major) { g.font = "700 30px Inter, Arial, sans-serif"; g.textAlign = "right"; g.textBaseline = "middle"; g.fillText(String(ml), w * 0.42 - 8, yy); }
      }
      g.font = "700 26px Inter, Arial, sans-serif"; g.textAlign = "center"; g.fillText("250 mL", w * 0.5, h * 0.03);
    }, { srgb: true });
    const gradMesh = new THREE.Mesh(new THREE.CylinderGeometry(CR + 0.003, CR + 0.003, CH, 48, 1, true, -0.55, 1.1), new THREE.MeshStandardMaterial({ map: gradTex2, transparent: true, roughness: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    gradMesh.position.y = CY0 + CH / 2; gradMesh.renderOrder = 9; gradMesh.userData.clayHide = true;
    cyl.add(gradMesh);

    // ---- electronic balance with an aluminium block on the pan ----
    const bal = new THREE.Group();
    bal.position.set(1.35, 0, 0.1); bal.rotation.y = -0.18;
    dens.add(bal);
    const bodyMat = physical("#e3e6e7", { roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.35, sheen: 0 });
    const bbody = dtag(cast(new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.5, 2.7, 5, 0.09), bodyMat)), "balance");
    bbody.position.y = 0.04 + 0.25; bbody.userData.clayColor = "#d8dee6"; bal.add(bbody);
    for (const [fx, fz] of [[-0.85, -1.05], [0.85, -1.05], [-0.85, 1.05], [0.85, 1.05]]) {
      const ft = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.05, 16), physical("#15181a", { roughness: 0.9, clearcoat: 0, sheen: 0 }));
      ft.position.set(fx, 0.025, fz); ft.userData.clayHide = true; bal.add(ft);
    }
    // top panel (dark glass) with LCD readout and buttons, at the front
    const topY = 0.54;
    const pnl = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.02, 0.78, 3, 0.008), physical("#14181b", { roughness: 0.25, clearcoat: 0.8 }));
    pnl.position.set(0, topY + 0.003, 0.92); pnl.userData.clayHide = true; bal.add(pnl);
    const lcdT = canvasTex(256, 96, (g, w, h) => {
      g.fillStyle = "#0a0d0c"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#d4efd9"; g.font = "600 52px 'Space Grotesk', monospace"; g.textBaseline = "middle"; g.textAlign = "right";
      g.fillText("72.9", w - 62, h * 0.52);
      g.font = "600 30px Inter, monospace"; g.textAlign = "left"; g.fillText("g", w - 52, h * 0.58);
      g.font = "500 16px Inter, monospace"; g.fillStyle = "#7fb590"; g.fillText("stable", 12, 18);
    }, { srgb: true });
    const lcd2 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.375), new THREE.MeshStandardMaterial({ map: lcdT, emissive: new THREE.Color("#ffffff"), emissiveMap: lcdT, emissiveIntensity: 0.55, roughness: 0.3 }));
    lcd2.rotation.x = -Math.PI / 2; lcd2.position.set(-0.4, topY + 0.016, 0.93); lcd2.userData.clayHide = true; bal.add(lcd2);
    for (let i = 0; i < 3; i++) {
      const bt = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 24), physical(i === 0 ? "#2b78c8" : "#9aa2a8", { roughness: 0.4, clearcoat: 0.3 }));
      bt.position.set(0.4 + i * 0.27, topY + 0.016, 0.93); bt.userData.clayHide = true; bal.add(bt);
    }
    // pan on a short stem
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.1, 20), steel);
    stem.position.set(0, topY + 0.05, -0.4); stem.userData.clayHide = true; bal.add(stem);
    const pan = dtag(cast(new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.035, 72), plateMat)), "balance");
    pan.position.set(0, topY + 0.11, -0.4); pan.userData.clayColor = "#e1e6ea"; bal.add(pan);
    const blockMat = physical("#c7ccd0", { metalness: 1, roughness: 0.36, roughnessMap: brushedLinear(), clearcoat: 0, sheen: 0, envMapIntensity: 1.1 });
    const block = dtag(cast(new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.3, 0.3, 4, 0.012), blockMat)), "block");
    block.position.set(0.02, topY + 0.1275 + 0.15, -0.4); block.rotation.y = 0.35; block.userData.clayColor = "#cfd6dc"; bal.add(block);
  }

  // =============== decor (kept light) ===============
  const decor = new THREE.Group();
  root.add(decor);
  const dInfo = {};

  // wash bottle (distilled water)
  const bottle = new THREE.Group();
  bottle.position.set(sx + 3.0, 0, -0.35); bottle.rotation.y = -0.5;
  const bProfile = V2([[0, 0], [0.26, 0], [0.3, 0.035], [0.3, 1.05], [0.285, 1.22], [0.2, 1.36], [0.115, 1.44], [0.105, 1.5]]);
  const bottleMat = physical("#f1f3f1", { roughness: 0.38, clearcoat: 0.2, clearcoatRoughness: 0.4, sheen: 0.3, sheenColor: new THREE.Color("#ffffff") });
  const bBody = mark(new THREE.Mesh(new THREE.LatheGeometry(bProfile, 48), bottleMat), "bottle");
  bBody.userData.clayColor = "#f2eee6";
  bottle.add(bBody);
  const bLabel = new THREE.Mesh(new THREE.CylinderGeometry(0.3045, 0.3045, 0.56, 40, 1, true, -0.95 - Math.PI / 2 * 0, 1.9), new THREE.MeshStandardMaterial({ map: bottleLabelTex(), roughness: 0.5 }));
  bLabel.position.y = 0.58; bLabel.rotation.y = Math.PI / 2; bLabel.userData.clayHide = true; bottle.add(bLabel);
  const bCapMat = physical("#2b78c8", { roughness: 0.4, clearcoat: 0.3 });
  const bCap = mark(new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.125, 0.14, 32), bCapMat), "bottle");
  bCap.position.y = 1.57; bottle.add(bCap);
  const nozzleCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.62, 0), new THREE.Vector3(0, 1.82, 0), new THREE.Vector3(0.05, 1.98, 0), new THREE.Vector3(0.2, 2.06, 0.04), new THREE.Vector3(0.36, 2.04, 0.1)]);
  const nozzle = mark(new THREE.Mesh(new THREE.TubeGeometry(nozzleCurve, 28, 0.034, 12), bCapMat), "bottle");
  bottle.add(nozzle);
  decor.add(bottle);
  decor.add(decal(1.0, 1.0, sx + 3.0, -0.35, 0.8));

  // safety glasses (upright, temples back)
  const glasses = new THREE.Group();
  glasses.position.set(sx - 0.75, 0, 2.15); glasses.rotation.y = 0.28;
  {
    const lw = 0.62, lh = 0.4, gap = 0.035, rb = 0.95;
    const lensShape = (cx) => roundedRectShape(lw, lh, 0.11, cx, 0);
    const lensGeo = new THREE.ExtrudeGeometry([lensShape(-(lw + gap) / 2), lensShape((lw + gap) / 2)], { depth: 0.012, bevelEnabled: false, curveSegments: 14 });
    // finer tessellation across x so the bend is smooth
    const lg = bendAroundY(lensGeo, rb);
    const lensMat = new THREE.MeshPhysicalMaterial({ color: "#e8f6ff", transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.58, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 0.9 });
    const lensMesh = mark(new THREE.Mesh(lg, lensMat), "glasses");
    lensMesh.position.y = 0.3; lensMesh.renderOrder = 4; glasses.add(lensMesh);
    // frame: a rounded border around each lens
    const frameShapes = [-(lw + gap) / 2, (lw + gap) / 2].map((cx) => { const s = roundedRectShape(lw + 0.045, lh + 0.045, 0.125, cx, 0); s.holes.push(roundedRectShape(lw - 0.02, lh - 0.02, 0.1, cx, 0, true)); return s; });
    const frameGeo = bendAroundY(new THREE.ExtrudeGeometry(frameShapes, { depth: 0.03, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 14 }), rb);
    const frame = mark(new THREE.Mesh(frameGeo, physical("#3b4a5c", { roughness: 0.55, clearcoat: 0.3 })), "glasses");
    frame.position.set(0, 0.3, -0.008); glasses.add(frame);
    for (const sgn of [-1, 1]) {
      const tp = new THREE.Mesh(new RoundedBoxGeometry(0.045, 0.05, 0.8, 2, 0.012), physical("#3b4a5c", { roughness: 0.55, clearcoat: 0.2 }));
      const ex = Math.sin((lw + gap / 2) / rb) * rb * sgn;
      tp.position.set(ex + sgn * 0.07, 0.3, -0.47); tp.rotation.y = -sgn * 0.15; tp.userData.clayHide = false;
      mark(tp, "glasses"); glasses.add(tp);
    }
  }
  decor.add(glasses);
  decor.add(decal(1.9, 1.4, sx - 0.75, 1.8, 0.55));

  // test-tube rack with tubes (instanced, level-of-detail aware)
  const rack = new THREE.Group();
  rack.position.set(sx + 1.9, 0, -2.45); rack.rotation.y = 0.12;
  {
    const rackMat = physical("#4aa3c2", { roughness: 0.55, clearcoat: 0.35 });
    const topP = mark(new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.07, 0.5, 2, 0.02), rackMat), "rack");
    topP.position.y = 0.74; rack.add(topP);
    const lowP = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.07, 0.5, 2, 0.02), rackMat);
    lowP.position.y = 0.16; rack.add(lowP);
    for (const sx2 of [-0.86, 0.86]) { const up = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.8, 0.5, 2, 0.02), rackMat); up.position.set(sx2, 0.4, 0); rack.add(up); }
    const N = 6;
    const tubeProfile = V2([[0, 0.005], [0.058, 0.01], ...arc(0.058, 0.07, 0.065, -Math.PI / 2, 0).slice(1).map(([x, y]) => [Math.min(x, 0.075), y]), [0.075, 1.38], [0.082, 1.4], [0.075, 1.41]]);
    const tubeGeo = new THREE.LatheGeometry(tubeProfile, 24);
    const tubeInst = new THREE.InstancedMesh(tubeGeo, glass("#ffffff", { rim: "#ffffff", rimPower: 2.2, rimStrength: 0.5, minAlpha: 0.04, maxAlpha: 0.5, clearcoat: 1 }), N);
    const liqGeo = new THREE.CylinderGeometry(0.066, 0.058, 1, 20); liqGeo.translate(0, 0.5, 0);
    const liqInst = new THREE.InstancedMesh(liqGeo, new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.04, transparent: true, opacity: 0.75, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false }), N);
    const cols = ["#6cc4ea", "#f3cf5f", "#8ed69a", "#ef8fae", "#b9a6ee", "#9bd8e8"], hts = [0.62, 0.5, 0.7, 0.44, 0.58, 0.66];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const x = -0.72 + i * 0.288;
      tubeInst.setMatrixAt(i, m4.makeTranslation(x, 0.2, 0));
      sc.set(1, hts[i], 1);
      liqInst.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.215, 0), q, sc));
      liqInst.setColorAt(i, new THREE.Color(cols[i]));
    }
    tubeInst.userData.lod = liqInst.userData.lod = true;
    tubeInst.renderOrder = 5; liqInst.renderOrder = 4;
    tubeInst.userData.clayColor = "#dfeaf0"; tubeInst.userData.clayOpacity = 0.5;
    // the instanced tubes are decor: picked as one part
    mark(tubeInst, "rack");
    rack.add(liqInst, tubeInst);
  }
  decor.add(rack);
  decor.add(decal(2.4, 1.0, sx + 1.9, -2.45, 0.7));

  // =============== look: lights, env, camera ===============
  const centre = new THREE.Vector3(sx, 0, 0);
  const view = {
    // frames every built station: from the retort stand (left of the first) to the right edge of the last apparatus
    get span() {
      const xs = stations.map(slotX), lo = Math.min(...xs) - 3.2, hi = Math.max(...xs) + (stations.length > 1 ? 2.5 : 3.6);
      return { lo, hi };
    },
    get target() { const { lo, hi } = this.span; return new THREE.Vector3((lo + hi) / 2 + (stations.length > 1 ? 0 : engine.camera.aspect < 0.9 ? 0.1 : 0.45), stations.length > 1 ? (engine.camera.aspect < 0.9 ? 0.5 : 1.6) : 1.35, stations.length > 1 ? (engine.camera.aspect < 0.9 ? 0.2 : -0.4) : 0.25); },
    get distance() {
      const a = engine.camera.aspect, tanH = Math.tan(THREE.MathUtils.degToRad(engine.camera.fov / 2)), { lo, hi } = this.span;
      const multi = stations.length > 1, narrow = a < 0.9;
      const wNeed = multi ? (hi - lo + 0.8) : narrow ? 4.4 : 7.4, hNeed = narrow ? 6.4 : 5.2;
      return clamp(Math.max(wNeed / (2 * tanH * a), hNeed / (2 * tanH)), 7.5, 30);
    },
    dir: new THREE.Vector3(0.24, 0.5, 1),
  };

  // The engine's lights are cool and dark (made for a cell interior). While the bench is mounted they are retuned to a soft,
  // warm-white lab; unmountPanel puts them back for the levels below.
  let savedLights = null, savedEnvI = null;
  function studioLights() {
    const L = engine.lights?.children; if (!L) return;
    if (!savedLights) savedLights = L.map((l) => ({ l, color: l.color.clone(), ground: l.groundColor?.clone(), i: l.intensity, p: l.position.clone() }));
    const [hemi, key, rimL, under] = L;
    hemi?.color.set("#f2f6f9"); hemi?.groundColor?.set("#8d9599"); if (hemi) hemi.intensity = 0.95;
    key?.color.set("#fff3e4"); key?.position.set(-6, 10, 9); if (key) key.intensity = 2.5;
    rimL?.color.set("#e1ebff"); rimL?.position.set(6, 5, -7); if (rimL) rimL.intensity = 1.1;
    under?.color.set("#fff0de"); if (under) under.intensity = 0.35;
    if (savedEnvI === null) savedEnvI = engine.scene.environmentIntensity;
    if (!engine.style.clay) engine.scene.environmentIntensity = 1.05;
  }
  function restoreLights() {
    if (savedLights) for (const s of savedLights) { s.l.color.copy(s.color); if (s.ground) s.l.groundColor.copy(s.ground); s.l.intensity = s.i; s.l.position.copy(s.p); }
    savedLights = null;
    if (savedEnvI !== null) { if (!engine.style.clay) engine.scene.environmentIntensity = savedEnvI; savedEnvI = null; }
  }

  // ---------- labels ----------
  const _lp = new THREE.Vector3();
  const lbls = stations.map((st) => ({
    st, x: slotX(st),
    name: engine.label(`<b>${st.label}</b><small>${st.codes}</small>`, "org"),
    dive: engine.label("🔍 Double-click or zoom in", "dive"),
  }));
  const topAt = { states: [0, 3.55, 0.2], density: [-1.2, 3.8, 0.2] }, baseAt = { states: [0.2, 0, 1.35], density: [0.1, 0, 1.75] };
  const placed = [];
  function putLabel(el, v, dx, dy, minY, maxY) {
    const p = _lp.copy(v).project(engine.camera);
    if (p.z > 1 || p.z < -1) { el.style.display = "none"; return; }
    el.style.display = "";
    const w = el.offsetWidth || 120, h = el.offsetHeight || 24;
    let x = (p.x * 0.5 + 0.5) * engine.w + dx, y = (-p.y * 0.5 + 0.5) * engine.h + dy;
    x = clamp(x, w / 2 + 8, engine.w - w / 2 - 8);
    y = clamp(y, minY + h / 2, maxY - h / 2);
    for (let pass = 0; pass < 3; pass++) for (const q of placed) if (Math.abs(x - q.x) < (w + q.w) / 2 + 6 && Math.abs(y - q.y) < (h + q.h) / 2 + 4) y = clamp(q.y + (h + q.h) / 2 + 4, minY + h / 2, maxY - h / 2);
    placed.push({ x, y, w, h });
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
  function hideLabels() { for (const l of lbls) { l.name.style.display = "none"; l.dive.style.display = "none"; } }
  function updateLabels() {
    if (engine.current !== level) { hideLabels(); return; }
    const narrow = engine.camera.aspect < 0.9;
    placed.length = 0;
    for (const l of lbls) {
      // labels clamp to the stage edges (phones), but vanish once the apparatus itself has been panned or zoomed off screen
      const c = _lp.set(l.x, 1.0, 0).project(engine.camera), cx = (c.x * 0.5 + 0.5) * engine.w, cy = (-c.y * 0.5 + 0.5) * engine.h;
      if (c.z > 1 || cx < -30 || cx > engine.w + 30 || cy < -30 || cy > engine.h + 30) { l.name.style.display = "none"; l.dive.style.display = "none"; continue; }
      putLabel(l.name, lblTop.set(l.x + topAt[l.st.to][0], topAt[l.st.to][1], topAt[l.st.to][2]), 0, narrow ? 0 : -10, 10, engine.h - 100);
      // two stations on a phone: only the picked one shows its dive hint, so the labels don't pile up
      if (lbls.length > 1 && narrow && l.st.to !== (activeTo || "")) l.dive.style.display = "none";
      else putLabel(l.dive, lblBase.set(l.x + baseAt[l.st.to][0], baseAt[l.st.to][1], baseAt[l.st.to][2]), 0, 24, 10, engine.h - 86);
    }
  }
  const lblTop = new THREE.Vector3(), lblBase = new THREE.Vector3();
  let hoverTo = null, selectedTo = null, activeTo = null;

  // ---------- panel ----------
  let node = null, builtBand = null, selBody = null, selCard = null, savedSelection = null;
  const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  function buildPanel() {
    node = document.createElement("div");
    node.style.display = "contents";
    builtBand = lens.band;
    const ext = lens.band === "ext";

    const welcome = K.card(node, "Welcome to MixLab");
    welcome.insertAdjacentHTML("beforeend", `
      <p>This is a lab bench you can step into. Each experiment on the bench is a <b>station</b>. Zoom in on a station to see the real apparatus up close, then keep zooming to see the <b>particles</b> that make up the stuff inside it.</p>
      <ul class="mx-list">
        <li><b>Look around:</b> drag to turn the bench, scroll or pinch to zoom.</li>
        <li><b>Dive in:</b> double-click a station, or zoom right in on it.</li>
        <li><b>Climb back:</b> zoom out, press the button at the bottom left, or click a name in the top bar.</li>
      </ul>
      <p>Everything on the bench is drawn at <b>real size</b>. The scale bar reads in centimetres: this beaker is a 250 mL beaker, about 7 cm wide.</p>
      ${ext ? `<p class="mx-ext"><b>Extension:</b> each zoom is a different <i>model</i> of the same stuff. The bench model shows what you can see and measure (centimetres, temperature). The particle model explains <i>why</i> it behaves that way (nanometres). A good scientist picks the scale that answers the question.</p>` : ""}`);

    const stCard = K.card(node, "Stations");
    if (!stations.length) stCard.insertAdjacentHTML("beforeend", `<p>No stations are ready yet.</p>`);
    for (const s of stations) {
      const row = document.createElement("div");
      row.className = "mx-station";
      row.innerHTML = `<div><b>${esc(s.label)}</b> <span class="mx-codes">${esc(s.codes)}</span></div><p>${esc(s.blurb)}</p>`;
      const btns = K.buttonRow(row);
      K.button(btns, `Go to ${s.label.toLowerCase()}`, () => {
        const p = level.portals.find((q) => q.to === s.to);
        if (p) engine.dive(p);
      }, { kind: "primary" });
      stCard.appendChild(row);
    }

    selCard = K.card(node, "Selected");
    selBody = document.createElement("div");
    selBody.innerHTML = `<p class="hint">Click something on the bench to find out about it.</p>`;
    selCard.appendChild(selBody);

    const look = K.card(node, "Look closer");
    look.insertAdjacentHTML("beforeend", `
      <ul class="mx-list">
        <li><b>Why are there drops of water on the <i>outside</i> of the cold beaker?</b> They did not leak out. Water vapour in the air touched the cold glass and condensed into liquid.</li>
        <li><b>How much of each ice cube is above the water?</b> Only a sliver. Ice is less dense than liquid water, so about nine tenths of a floating cube sits under the surface.</li>
        <li><b>What does the thermometer read?</b> About 0 °C. While ice and water are together at normal air pressure, they sit at the melting point of ice.</li>
        ${ext ? `<li><b>What is the red liquid?</b> Dyed alcohol, not mercury (which is toxic). It expands as it warms, so it climbs the narrow tube. That is why a thermometer works.</li>` : ""}
      </ul>`);

    injectCss();
    if (savedSelection) showSelection(savedSelection);
  }
  function injectCss() {
    if (document.getElementById("mixlab-bench-style")) return;
    const s = document.createElement("style");
    s.id = "mixlab-bench-style";
    s.textContent = `.mx-list{margin:0 0 8px;padding-left:18px;font-size:.84rem;color:var(--ink-dim);display:flex;flex-direction:column;gap:6px}
.mx-list b{color:var(--ink)} .mx-ext{font-size:.84rem;color:var(--ink-dim)}
.mx-station{padding:8px 0;border-top:1px solid var(--panel-border)} .mx-station:first-of-type{border-top:0;padding-top:0}
.mx-station p{margin:4px 0 8px;font-size:.82rem;color:var(--ink-dim)} .mx-codes{font-size:.72rem;font-weight:700;color:var(--accent);margin-left:4px}`;
    document.head.appendChild(s);
  }

  // ---------- info / selection ----------
  const INFO = {
    station: { title: "States of matter station", kind: "Y7 4.1", text: "A beaker of ice water on a hotplate, with a thermometer held in a retort stand. Heat it, cool it, and watch ice become water and water become steam.", portal: true },
    hotplate: { title: "Hotplate", kind: "Station · States of matter", text: "An electric hotplate. It is switched off and the plate is at room temperature. In the station you control how much heat goes in.", portal: true },
    beaker: { title: "250 mL glass beaker", kind: "Station · States of matter", text: "Borosilicate glass (it does not crack when heated). The marks show roughly how much liquid is inside. The drops on the outside are water vapour from the air that condensed on the cold glass: they did not leak through.", portal: true },
    water: { title: "Ice water", kind: "Station · States of matter", text: "About 150 mL of liquid water with ice floating in it. Zoom in to see the water particles (molecules).", portal: true },
    ice: { title: "Ice cubes", kind: "Station · States of matter", text: "Solid water. Ice floats because it is less dense than liquid water: roughly nine tenths of each cube is under the surface. The white streaks are trapped air.", portal: true },
    thermometer: { title: "Thermometer", kind: "Station · States of matter", text: "Reads about 0 °C: ice and water together sit at the melting point of ice. The red liquid is dyed alcohol, which expands as it warms and climbs the tube.", portal: true },
    stand: { title: "Retort stand and clamp", kind: "Station · States of matter", text: "Holds the thermometer steady in the water without touching the hot glass or the bottom of the beaker.", portal: true },
    bottle: { title: "Wash bottle", kind: "Bench equipment", text: "Holds distilled water for rinsing glassware. Squeeze to get a thin jet from the nozzle.", portal: false },
    glasses: { title: "Safety glasses", kind: "Bench equipment", text: "Wear them whenever you heat something, pour a liquid or use chemicals. They protect your eyes from splashes.", portal: false },
    "station-density": { to: "density", title: "Density lab station", kind: "Y7 4.2", text: "A measuring cylinder holding four liquids that do not mix, next to an electronic balance with a metal block on it. Measure mass and volume, work out density, and see why some things float and others sink.", portal: true },
    cylinder: { to: "density", title: "250 mL measuring cylinder", kind: "Station · Density lab", text: "Tall and narrow, so the layers are easy to see and the volume can be read accurately. It holds four liquids poured in gently so they stay in layers (honey, dish liquid and water do slowly mix over hours; oil never mixes with water).", portal: true },
    layer: { to: "density", title: "Layers by density", kind: "Station · Density lab", text: "From the bottom: honey (about 1.4 g/mL), dish liquid (a little over 1), water (1.0) and cooking oil (about 0.9). The denser liquid sinks below the less dense one, so the order tells you the order of density.", portal: true },
    balance: { to: "density", title: "Electronic balance", kind: "Station · Density lab", text: "Measures mass in grams. Press tare with the empty container on the pan so the reading shows only what you add.", portal: true },
    block: { to: "density", title: "Aluminium block", kind: "Station · Density lab", text: "A 3 cm cube: volume 27 cm³. The balance reads about 73 g, so its density is about 2.7 g/cm³ (mass divided by volume). That is denser than water, so it sinks.", portal: true },
    rack: { title: "Test-tube rack", kind: "Bench equipment", text: "Keeps test tubes upright so they do not roll off the bench or tip over.", portal: false },
  };
  for (const k of ["station", "hotplate", "beaker", "water", "ice", "thermometer", "stand"]) INFO[k].to = "states";
  function infoFor(kind) { return INFO[kind] ? { ...INFO[kind], kind0: kind } : null; }
  function showSelection(info) {
    if (!selBody) { savedSelection = info; return; }
    savedSelection = info;
    if (!info) { selBody.innerHTML = `<p class="hint">Click something on the bench to find out about it.</p>`; selBody.querySelectorAll("button").forEach((b) => b.remove()); return; }
    selBody.innerHTML = `<p style="margin:0 0 2px"><b>${esc(info.title)}</b></p><p class="hint" style="margin:0 0 6px">${esc(info.kind)}</p><p style="margin:0 0 8px;font-size:.84rem;color:var(--ink-dim)">${esc(info.text)}</p>`;
    const st = info.portal && stations.find((q) => q.to === info.to);
    if (st) {
      const r = K.buttonRow(selBody);
      K.button(r, `Dive into ${st.label.toLowerCase()}`, () => engine.dive(level.portals.find((q) => q.to === st.to)), { kind: "primary" });
    }
  }

  // ---------- the level object ----------
  const groups = { states: station, density: dens };
  const portals = stations.map((st) => ({
    to: st.to, label: st.label, object: groups[st.to], radius: st.to === "density" ? 1.5 : 1.3,
    center: () => (st.to === "density" ? new THREE.Vector3(slotX(st) + 0.1, 1.5, 0.2) : new THREE.Vector3(sx, PLATE_Y + 0.5, 0)), auto: true,
  }));

  const level = {
    title: "Lab bench",
    topics: TOPICS,
    root, pickables, fallbackPickables, portals,
    metersPerUnit: 0.1,
    get view() { return view; },
    minDistance: 2.0, maxDistance: 34, near: 0.02, far: 600,
    minPolar: 0.3, maxPolar: 1.42, minAzimuth: -1.15, maxAzimuth: 1.15,
    enablePan: true,
    env: {
      bg: ["#dde5e9", "#aeb9bf", "#cdd7db"], fog: ["#c9d3d8", 0.004], exposure: 0.88, bloom: [0.1, 0.4, 0.93], aperture: 0.0005,
    },
    clay: { groundY: -0.45, groundR: 14, shadow: 7, freq: 3.2, amount: 0.09 },
    clayEnv: { bg: ["#f4efea", "#ddd6cf", "#e8e2dc"], fog: ["#d9d2cb", 0], exposure: 0.95, bloom: [0, 0.4, 1], aperture: 0.0008 },
    info(obj) {
      for (let o = obj; o; o = o.parent) {
        const k = o.userData?.kind;
        if (k && INFO[k]) return infoFor(k);
      }
      return null;
    },
    onSelect(info) { selectedTo = info?.portal ? info.to : null; if (selectedTo) activeTo = selectedTo; showSelection(info); },
    onHover(obj, info) { hoverTo = info?.portal ? info.to : null; },
    mountPanel(el) {
      if (!node || builtBand !== lens.band) buildPanel();
      el.appendChild(node);
      studioLights();
    },
    unmountPanel() {
      hideLabels();
      restoreLights();
    },
    onResume() { studioLights(); },
    onStyle() { if (!engine.style.clay) { engine.scene.environmentIntensity = 1.05; } },
    onLens() { const old = node, parent = old?.parentNode; node = null; buildPanel(); if (parent) { parent.insertBefore(node, old); old.remove(); } },
    update(dt, t, rdt = dt) {
      updateLabels();
      // work-area outlines: faint at rest, bright when hovered or selected
      for (const k in pads) {
        const pd = pads[k], want = hoverTo === k || selectedTo === k ? 0.95 : 0.0;
        pd.mat.opacity += (want - pd.mat.opacity) * (engine.reducedMotion ? 1 : Math.min(1, rdt * 8));
        if (pd.mat.opacity < 0.005) pd.mat.opacity = 0;
        pd.mesh.visible = pd.mat.opacity > 0;
      }
    },
    dispose() { for (const l of lbls) { l.name.remove(); l.dive.remove(); } restoreLights(); },
  };
  return level;
}
