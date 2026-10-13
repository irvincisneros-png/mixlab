// Station 2, apparatus scale: the density lab. An electronic balance, a ruler, a 100 mL measuring cylinder, a tray of samples,
// a float-or-sink tank and a tall density column. Driven by the tested density model (densityModel.js); apparatus parts that are
// generic come from labkit.js. Units: 1 world unit = 1 cm. The child level "densityParticles" may read `level.state`.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import * as K from "../../kit.js";
import * as LK from "./labkit.js";
import { SOLIDS, LIQUIDS, makeSample, measure, floatTest, percentError } from "./densityModel.js";
import {
  P, PARTS, narrative, MISSIONS, QUIZ, MIXUPS, SIMPLIFICATIONS, SOURCES, DATA_ROWS, dataBookRows, predictLine, compareBook,
  bodyParams, vBelow, draught, columnLayers, restInColumn,
  CYL_START, POUR_ML, COLUMN_PIECE, TANK_LIQUIDS, COLUMN_ORDER, g2, f1, MINUS,
} from "./densityContent.js";

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const approach = (v, target, rate, dt) => v + (target - v) * (1 - Math.exp(-rate * dt));

// ---------- layout on the bench (cm; +z is toward the viewer) ----------
const TRAY = { x: -20, z: -22, w: 32, d: 12 };
const BAL = { x: -24, z: 2 };
const RULER = { x: -24, z: 21, len: 20, zero: -34.0 };       // zero mark x
const CYL = { x: -3, z: -2, Ri: 1.9, wall: 0.15, H: 13.6, floor: 0.4, footR: 2.9 };
const IRR_MAX = 1.2;   // largest size for pieces measured by displacement (they must fit the bore)
const TANK = { x: 18, z: 3, w: 16, d: 10, h: 12, wall: 0.3, base: 0.4, fill: 7.2 };
const COL = { x: 37, z: -4, Ri: 2.2, wall: 0.15, H: 28, floor: 0.45, footR: 3.7 };
const COL_AREA = Math.PI * COL.Ri * COL.Ri;
const CYL_AREA = Math.PI * CYL.Ri * CYL.Ri;
const TANK_AREA = (TANK.w - 2 * TANK.wall) * (TANK.d - 2 * TANK.wall);
const GRAV = 520;
const SAMPLE_KEYS = Object.keys(SOLIDS);

// how each liquid looks (tint, absorption colour and distance, refractive index, roughness: a mix looks cloudy)
const LOOK = {
  water: { color: "#f4faff", att: "#7fc2e6", dist: 22, ior: 1.333, rough: 0.015, emis: 0.04 },
  salt: { color: "#eef9fc", att: "#6dc6dc", dist: 18, ior: 1.34, rough: 0.015, emis: 0.05 },
  oil: { color: "#f7e7a6", att: "#e3ad14", dist: 7, ior: 1.47, rough: 0.02, emis: 0.3 },
  ethanol: { color: "#efe7ff", att: "#9b7ae6", dist: 12, ior: 1.36, rough: 0.015, emis: 0.08 },
  honey: { color: "#f2a73a", att: "#c06a08", dist: 3.4, ior: 1.49, rough: 0.03, emis: 0.55 },
  syrup: { color: "#e08a28", att: "#a85208", dist: 3.0, ior: 1.47, rough: 0.03, emis: 0.5 },
  dish: { color: "#58d281", att: "#1f9a48", dist: 2.2, ior: 1.40, rough: 0.05, emis: 0.4 },
};
const STATE_COL = { floats: "#34d399", sinks: "#f87171", suspended: "#fbbf24" };

// =====================================================================================================================
//  small builders
// =====================================================================================================================
function liquidMaterial(look, thickness = 3) {
  const m = LK.waterMaterial({ color: look.color, attenuation: look.att, distance: look.dist, ior: look.ior, thickness });
  m.emissive = new THREE.Color(look.att); m.emissiveIntensity = look.emis;
  return m;
}

const texCache = {};
function sharedTex(name, make) {
  if (!texCache[name]) { texCache[name] = make(); texCache[name].userData.shared = true; }
  return texCache[name];
}
const woodTex = () => sharedTex("wood", () => {
  const rnd = LK.mulberry(5);
  return LK.canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = "#dcb682"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {   // grain: long, wavy, slightly darker lines
      const y = rnd() * h, a = 0.05 + rnd() * 0.14;
      c.strokeStyle = `rgba(120,78,36,${a})`; c.lineWidth = 0.6 + rnd() * 2.2;
      c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x * 0.04 + i) * 2.2 + (rnd() - 0.5) * 1.2);
      c.stroke();
    }
    for (let k = 0; k < 2; k++) {   // a couple of knots
      const x = 40 + rnd() * 170, y = 30 + rnd() * 190;
      for (let r = 12; r > 1; r -= 3) { c.strokeStyle = `rgba(105,62,26,${0.18 + (12 - r) * 0.02})`; c.lineWidth = 1.2; c.beginPath(); c.ellipse(x, y, r * 1.8, r * 0.8, 0, 0, TAU); c.stroke(); }
    }
  }, { repeat: [1, 1] });
});
const graniteTex = () => sharedTex("granite", () => {
  const rnd = LK.mulberry(9);
  return LK.canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = "#8f8984"; c.fillRect(0, 0, w, h);
    const cols = ["#2a2a2c", "#d9d4cf", "#b98a82", "#5a5754", "#c9c2bb"];
    for (let i = 0; i < 1500; i++) { c.fillStyle = cols[Math.floor(rnd() * cols.length)]; c.globalAlpha = 0.5 + rnd() * 0.5; const r = 0.8 + rnd() * 2.6; c.beginPath(); c.arc(rnd() * w, rnd() * h, r, 0, TAU); c.fill(); }
    c.globalAlpha = 1;
  });
});
const threadTex = () => sharedTex("thread", () => LK.canvasTexture(64, 64, (c, w, h) => {
  c.fillStyle = "#777"; c.fillRect(0, 0, w, h);
  c.fillStyle = "#ddd"; for (let x = 0; x < w; x += 8) c.fillRect(x, 0, 4, h);
}, { srgb: false, repeat: [1, 1] }));
const noiseTex = () => sharedTex("noise", () => LK.makeNoiseTexture(128, 3, 3));

function solidMaterial(key) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  switch (key) {
    case "pine": return std({ map: woodTex(), bumpMap: woodTex(), bumpScale: 0.5, roughness: 0.78 });
    case "ice": return LK.iceMaterial();
    case "candle": return phys({ color: "#f3eddc", roughness: 0.36, clearcoat: 0.15, clearcoatRoughness: 0.4, sheen: 1, sheenColor: new THREE.Color("#fff3d0"), emissive: new THREE.Color("#3a3220"), emissiveIntensity: 0.14 });
    case "hdpe": return phys({ color: "#eeeee6", roughness: 0.42, clearcoat: 0.22, clearcoatRoughness: 0.35, emissive: new THREE.Color("#222220"), emissiveIntensity: 0.1 });
    case "pet": return phys({ color: "#86cfc4", roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4, emissive: new THREE.Color("#10403a"), emissiveIntensity: 0.25, flatShading: true });
    case "rubber": return std({ color: "#5c2924", roughness: 0.84 });
    case "aluminium": return phys({ color: "#d3d8de", metalness: 1, roughness: 0.3, roughnessMap: noiseTex(), envMapIntensity: 1.5 });
    case "granite": return std({ map: graniteTex(), bumpMap: graniteTex(), bumpScale: 1.2, roughness: 0.62 });
    case "steel": return phys({ color: "#a4acb5", metalness: 1, roughness: 0.28, envMapIntensity: 1.5 });
    case "copper": return phys({ color: "#cc8059", metalness: 1, roughness: 0.24, envMapIntensity: 1.5 });
    case "lead": return phys({ color: "#7b8085", metalness: 0.85, roughness: 0.5, bumpMap: noiseTex(), bumpScale: 0.6, envMapIntensity: 1.1 });
    default: return std({ color: SOLIDS[key].color, roughness: 0.6 });
  }
}

/** lathe of [r, y] pairs */
const lathe = (pts, segs = 40) => LK.lathe(pts, segs);
function displaceBlob(geo, amp, seed) {
  const p = geo.attributes.position, v = new V3();
  const rnd = LK.mulberry(seed), ph = [rnd() * 6, rnd() * 6, rnd() * 6, rnd() * 6];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 2.3 + ph[0]) * Math.sin(v.y * 2.1 + ph[1]) * 0.6 + Math.sin(v.z * 3.1 + ph[2]) * Math.sin(v.x * 1.7 + ph[3]) * 0.4 + Math.sin(v.x * 5.1 + v.y * 4.3 + v.z * 3.7 + ph[1]) * 0.25;
    v.multiplyScalar(1 + amp * n);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
}

/**
 * The 3D body of a sample. Origin = middle of the lowest point; y up. Returns { group, params, radial, bolt }.
 * Cylinders and the bolt lie on their sides (axis along x); everything else stands upright.
 */
function buildSolid(sample) {
  const b = bodyParams(sample), key = sample.key, mat = solidMaterial(key);
  const group = new THREE.Group();
  let radial = 0, bolt = null;
  const add = (g, m = mat) => { const mesh = new THREE.Mesh(g, m); mesh.userData.owner = group; group.add(mesh); return mesh; };
  switch (b.type) {
    case "box": {
      const g = new RoundedBoxGeometry(b.l, b.h, b.w, 4, Math.min(0.14, b.h * 0.1));
      add(g).position.y = b.h / 2;
      radial = Math.hypot(b.l, b.w) / 2;
      break;
    }
    case "cyl": {
      const r = b.r, L = b.L, e = Math.min(0.14, r * 0.12);
      const pts = [[0, -L / 2], [r - e, -L / 2], ...LK.arcPts(r - e, -L / 2 + e, e, -90, 0, 4).slice(1), [r, L / 2 - e], ...LK.arcPts(r - e, L / 2 - e, e, 0, 90, 4).slice(1), [0, L / 2]];
      const g = lathe(pts, 48); g.rotateZ(Math.PI / 2);
      add(g).position.y = r;
      if (key === "candle") {   // wick end
        const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.5, 8), new THREE.MeshStandardMaterial({ color: "#2a2622", roughness: 0.9 }));
        wick.rotation.z = Math.PI / 2; wick.position.set(L / 2 + 0.2, r, 0); wick.userData.owner = group; group.add(wick);
      }
      radial = r;
      break;
    }
    case "ell": {
      const faceted = key === "pet";
      const g = faceted ? new THREE.IcosahedronGeometry(1, 1) : new THREE.SphereGeometry(1, 56, 38);
      displaceBlob(g, { granite: 0.07, hdpe: 0.04, pet: 0.11, lead: 0.02 }[key] ?? 0.05, 11 + key.length);
      g.scale(b.a, b.hh, b.a);
      if (faceted) g.computeVertexNormals();
      add(g).position.y = b.hh;
      if (key === "lead") {   // fishing-sinker eyelet
        const eye = new THREE.Mesh(new THREE.TorusGeometry(0.32 * Math.cbrt(sample.trueV / 12), 0.08, 10, 24), mat);
        eye.position.y = 2 * b.hh + 0.1; eye.userData.owner = group; group.add(eye);
      }
      radial = b.a;
      break;
    }
    case "cone": {
      const R1 = b.R1, R2 = b.R2, h = b.h, e = 0.12;
      const pts = [[0, 0], [R1 - e, 0], ...LK.arcPts(R1 - e, e, e, -90, 0, 3).slice(1), [R2, h - e], ...LK.arcPts(R2 - e, h - e, e, 0, 90, 3).slice(1), [0, h - 0.04]];
      add(lathe(pts, 56));
      radial = Math.max(R1, R2);
      break;
    }
    case "bolt": {
      const Lt = b.L + b.hh;
      const flat = b.rh * 0.866;
      const headG = new THREE.CylinderGeometry(b.rh, b.rh, b.hh, 6); headG.rotateZ(Math.PI / 2);
      const head = add(headG); head.position.set(-Lt / 2 + b.hh / 2, flat, 0);
      const thr = threadTex().clone(); thr.userData.shared = false; thr.repeat.set(1, b.L / 0.28 / 8); thr.wrapS = thr.wrapT = THREE.RepeatWrapping; thr.needsUpdate = true;
      const sm = mat.clone(); sm.bumpMap = thr; sm.bumpScale = 1.4;
      const shaftG = new THREE.CylinderGeometry(b.rs, b.rs * 0.93, b.L, 40, 1); shaftG.rotateZ(-Math.PI / 2);
      const shaft = add(shaftG, sm); shaft.position.set(-Lt / 2 + b.hh + b.L / 2, flat, 0);
      bolt = { Lt, flat };
      radial = b.rh;
      break;
    }
  }
  group.traverse((o) => { if (o.isMesh) o.userData.owner = group; });
  return { group, params: b, radial, bolt };
}

/** (no deformation) the bore fits every irregular piece up to size x1.2; this only sets the standing length of the bolt */
function squeeze(b, radial, rmax) {
  const k = 1;   // rigid solids are never deformed: the bore is wide enough for every allowed size
  if (k >= 0.999) return { k: 1, b: b.type === "bolt" ? { ...b, H: b.L + b.hh } : b };
  const b2 = { ...b };
  if (b.type === "ell") { b2.a = b.a * k; b2.hh = b.hh / (k * k); b2.H = b.H / (k * k); }
  else if (b.type === "cone") { b2.R1 = b.R1 * k; b2.R2 = b.R2 * k; b2.h = b.h / (k * k); b2.H = b.H / (k * k); }
  else if (b.type === "bolt") b2.H = (b.L + b.hh) / (k * k);
  return { k, b: b2 };
}

// ---------- glass tube (measuring cylinder, density column) ----------
function tubePts({ Ri, Ro, H, floor, footR }) {
  const m = (Ri + Ro) / 2, rl = (Ro - Ri) / 2 + 0.03, fh = 0.35;
  return [[0, floor], [Ri - 0.18, floor], ...LK.arcPts(Ri - 0.18, floor + 0.18, 0.18, -90, 0, 4).slice(1), [Ri, H - 0.3],
    ...LK.arcPts(m, H - 0.12, rl, 180, 0, 8), [Ro + 0.1, H - 0.4], [Ro, H - 0.9], [Ro, fh + 1.3],
    [Ro + (footR - Ro) * 0.3, fh + 0.5], [footR - 0.1, fh], [footR, fh - 0.1], [footR, 0.14], ...LK.arcPts(footR - 0.14, 0.14, 0.14, 0, -90, 3).slice(1), [0, 0]];
}
function gradTex(o) {
  const { H, floor, Ri, step, mid, major, cap, label, W = 256, T = 4096 } = o;
  return LK.canvasTexture(W, T, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = "rgba(255,255,255,0.96)"; c.strokeStyle = "rgba(255,255,255,0.96)"; c.textBaseline = "middle";
    const area = Math.PI * Ri * Ri, yOf = (V) => h * (1 - (floor + V / area) / H);
    for (let V = step; V <= cap; V += step) {
      const isMajor = V % major === 0, isMid = V % mid === 0, y = yOf(V);
      c.lineWidth = isMajor ? 4 : isMid ? 3 : 2;
      c.beginPath(); c.moveTo(w * 0.22, y); c.lineTo(w * (isMajor ? 0.5 : isMid ? 0.42 : 0.34), y); c.stroke();
      if (isMajor) { c.font = "700 30px Inter, system-ui, sans-serif"; c.textAlign = "left"; c.fillText(String(V), w * 0.53, y); }
    }
    c.font = "700 26px Inter, system-ui, sans-serif"; c.textAlign = "left"; c.fillText(label, w * 0.2, h * 0.012);
  }, { aniso: 8 });
}
function makeTube(engine, o) {
  const Ro = o.Ri + o.wall;
  const group = new THREE.Group();
  const glass = new THREE.Mesh(lathe(tubePts({ Ri: o.Ri, Ro, H: o.H, floor: o.floor, footR: o.footR }), 72), LK.glassMaterial(engine));
  glass.renderOrder = 4;
  const arc = 90 * Math.PI / 180;
  const print = new THREE.Mesh(new THREE.CylinderGeometry(Ro + 0.006, Ro + 0.006, o.H, 48, 1, true, -arc / 2, arc),
    new THREE.MeshStandardMaterial({ map: gradTex({ H: o.H, floor: o.floor, Ri: o.Ri, step: o.step, mid: o.mid, major: o.major, cap: o.cap, label: o.label }), transparent: true, depthWrite: false, roughness: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, envMapIntensity: 0.5 }));
  print.position.y = o.H / 2; print.renderOrder = 3; print.userData.clayHide = true;
  group.add(glass, print);
  return { group, glass, print, Ro, Ri: o.Ri, H: o.H, floor: o.floor };
}

// ---------- the balance ----------
function makeBalance(engine) {
  const group = new THREE.Group();
  const white = new THREE.MeshPhysicalMaterial({ color: "#e6e9ec", roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.7 });
  const dark = new THREE.MeshPhysicalMaterial({ color: "#23282d", roughness: 0.45, clearcoat: 0.3 });
  const steel = new THREE.MeshPhysicalMaterial({ color: "#c9ced3", metalness: 1, roughness: 0.28, envMapIntensity: 1.4 });
  const BODY_H = 3.5, BASE = 0.3;
  const body = new THREE.Mesh(new RoundedBoxGeometry(18, BODY_H, 23, 5, 0.75), white);
  body.position.y = BASE + BODY_H / 2; body.userData.kind = "balance";
  group.add(body);
  for (const [x, z] of [[-7, -9], [7, -9], [-7, 9], [7, 9]]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, BASE + 0.1, 16), dark); f.position.set(x, (BASE + 0.1) / 2, z); f.userData.kind = "balance"; group.add(f); }
  // pan, on a pillar, with a guard ring
  const top = BASE + BODY_H, panZ = -3.8;
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.95, 24), steel); pillar.position.set(0, top + 0.47, panZ); pillar.userData.kind = "balance";
  const pts = [[0, 0], [5.15, 0], ...LK.arcPts(5.15, 0.12, 0.12, -90, 0, 3).slice(1), [5.27, 0.2], ...LK.arcPts(5.15, 0.2, 0.12, 0, 90, 3).slice(1), [0, 0.32]];
  const pan = new THREE.Mesh(lathe(pts, 64), steel); pan.position.set(0, top + 0.95, panZ); pan.userData.kind = "balance";
  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.35, 0.2, 10, 64), steel); ring.rotation.x = Math.PI / 2; ring.position.set(0, top + 0.2, panZ); ring.userData.kind = "balance";
  group.add(pillar, pan, ring);
  const panTop = top + 0.95 + 0.32;
  // display block, tilted toward the user
  const disp = new THREE.Group(); disp.position.set(0, top + 0.55, 7.6); disp.rotation.x = 0.5;
  const blk = new THREE.Mesh(new RoundedBoxGeometry(13, 1.1, 4.6, 3, 0.3), dark); blk.userData.kind = "balance"; disp.add(blk);
  const lcdCv = document.createElement("canvas"); lcdCv.width = 640; lcdCv.height = 200;
  const lcdTex = new THREE.CanvasTexture(lcdCv); lcdTex.colorSpace = THREE.SRGBColorSpace; lcdTex.anisotropy = 4;
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(11, 3.4), new THREE.MeshBasicMaterial({ map: lcdTex, toneMapped: false }));
  lcd.rotation.x = -Math.PI / 2; lcd.position.y = 0.57; lcd.userData.kind = "balance"; disp.add(lcd);
  group.add(disp);
  // buttons
  const btnMat = (txt, bg) => {
    const t = LK.canvasTexture(128, 128, (c, w, h) => { c.fillStyle = bg; c.fillRect(0, 0, w, h); c.fillStyle = "#fff"; c.font = "800 34px Inter, system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(txt, w / 2, h / 2); });
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 });
  };
  const mkBtn = (x, txt, bg, kind) => {
    const g = new THREE.CylinderGeometry(1.05, 1.15, 0.5, 28);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: bg, roughness: 0.4 }));
    m.position.set(x, top + 0.22, 10.2); m.userData.kind = kind; group.add(m);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.95, 28), btnMat(txt, bg));
    face.rotation.x = -Math.PI / 2; face.position.y = 0.255; face.userData.kind = kind; m.add(face);
    return m;
  };
  const tareBtn = mkBtn(-3.4, "TARE", "#2f5d86", "tare");
  mkBtn(3.4, "ON", "#3c6e47", "balance");
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.9), new THREE.MeshBasicMaterial({ map: LK.canvasTexture(512, 64, (c, w, h) => { c.fillStyle = "rgba(0,0,0,0)"; c.clearRect(0, 0, w, h); c.fillStyle = "#6b737b"; c.font = "600 26px Inter, system-ui, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("max 500 g  ·  d = 0.01 g", w / 2, h / 2); }), transparent: true, toneMapped: false }));
  plate.rotation.x = -Math.PI / 2; plate.position.set(0, top + 0.01, 5.7 - 0.2 + 2.6); plate.visible = false;
  group.add(plate);
  const cx = lcdCv.getContext("2d");
  let last = "";
  const draw = (text, stable, unit = "g", tared = false) => {
    const key = `${text}|${stable}|${unit}|${tared}`;
    if (key === last) return; last = key;
    const w = lcdCv.width, h = lcdCv.height;
    const g = cx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#c5d3bc"); g.addColorStop(1, "#adbfa5");
    cx.fillStyle = g; cx.fillRect(0, 0, w, h);
    cx.font = "700 112px ui-monospace, Menlo, Consolas, monospace"; cx.textAlign = "right"; cx.textBaseline = "middle";
    cx.fillStyle = "rgba(20,36,20,0.045)"; cx.fillText("888.88", 500, h / 2 + 4);
    cx.fillStyle = "#18261a"; cx.fillText(text, 500, h / 2 + 4);
    cx.font = "700 52px ui-monospace, Menlo, Consolas, monospace"; cx.textAlign = "left"; cx.fillText(unit, 520, h / 2 + 24);
    cx.font = "700 26px ui-monospace, Menlo, monospace";
    cx.fillStyle = stable ? "#18261a" : "rgba(24,38,26,0.15)"; cx.fillText("● stable", 22, 34);
    cx.fillStyle = tared ? "#18261a" : "rgba(24,38,26,0.15)"; cx.fillText("TARED", 22, 172);
    lcdTex.needsUpdate = true;
  };
  draw("0.00", true);
  return { group, panTop, panZ, body, tareBtn, draw, lcdTex };
}

// ---------- the ruler ----------
function makeRuler() {
  const W = 2048, Hh = 160, len = RULER.len + 0.8;
  const tex = LK.canvasTexture(W, Hh, (c, w, h) => {
    c.fillStyle = "#f5f3ea"; c.fillRect(0, 0, w, h);
    const px = w / len, x0 = 0.4 * px;
    c.strokeStyle = "#181a1c"; c.fillStyle = "#181a1c"; c.textAlign = "center"; c.textBaseline = "top";
    for (let mm = 0; mm <= RULER.len * 10; mm++) {
      const x = x0 + (mm / 10) * px, cm = mm % 10 === 0, half = mm % 5 === 0;
      c.lineWidth = cm ? 3 : 2;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, cm ? 62 : half ? 46 : 32); c.stroke();
      if (cm) { c.font = "700 36px Inter, system-ui, sans-serif"; c.fillText(String(mm / 10), x, 68); }
    }
    c.font = "600 24px Inter, system-ui, sans-serif"; c.textAlign = "right"; c.fillText("cm", w - 12, 112);
  }, { aniso: 8 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.26, 3.2), new THREE.MeshStandardMaterial({ color: "#d8d4c6", roughness: 0.5 }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
  face.rotation.x = -Math.PI / 2; face.position.y = 0.131; face.userData.kind = "ruler"; m.add(face);
  m.position.y = 0.13; m.userData.kind = "ruler";
  return m;
}

// =====================================================================================================================
//  the level
// =====================================================================================================================
export function create(engine) {
  const lens = engine.lens;
  const root = new THREE.Group();
  const pickables = [];
  const disposables = [];

  // ---------- state ----------
  const ui = { size: 1, tankLiquid: "water", focus: "overview", predicted: null };
  const S = {
    E: null,                 // the current sample entity
    haveMass: false, haveVol: false, tare: 0, massRead: 0,
    tankResult: null,        // { result, submerged, key, m, liquid }
    colKeys: [],             // liquids poured, in order
    pieces: [],              // small pieces dropped in the column
    lastFocus: null,
  };
  const tr = { rows: [], drops: [], colMax: 0, colMix: false };
  const rows = tr.rows;

  // ---------- scene ----------
  const bench = LK.makeBench({ w: 320, d: 220 });
  Object.assign(bench.material, { roughnessMap: null, bumpMap: null, roughness: 0.82, envMapIntensity: 0.12 }); bench.material.needsUpdate = true;
  root.add(bench); pickables.push(bench);
  root.add(LK.makeTileWall({ w: 420, h: 90 }));
  const key = new THREE.DirectionalLight("#ffffff", 1.5); key.position.set(14, 48, 30);
  const fill = new THREE.DirectionalLight("#dbe8ff", 0.5); fill.position.set(-30, 18, 20);
  root.add(key, fill);
  const shadow = (r, x, z, s = 0.5) => { const m = LK.contactShadow(r, s); m.position.set(x, 0.02, z); root.add(m); return m; };

  // balance
  const bal = makeBalance(engine);
  bal.group.position.set(BAL.x, 0, BAL.z); root.add(bal.group);
  bal.group.traverse((o) => { if (o.isMesh && o.userData.kind) pickables.push(o); });
  shadow(15, BAL.x, BAL.z + 1);
  const PAN = { x: BAL.x, y: bal.panTop, z: BAL.z + bal.panZ };

  // ruler (lying on the bench in front of the balance)
  const ruler = makeRuler(); ruler.position.set(RULER.x, 0, RULER.z); root.add(ruler); pickables.push(ruler, ruler.children[0]);
  shadow(12, RULER.x, RULER.z, 0.35);
  const markGeo = new THREE.PlaneGeometry(0.1, 3.2);
  const mark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: "#e0272d", toneMapped: false, transparent: true, depthWrite: false }));
  mark.rotation.x = -Math.PI / 2; mark.position.set(0, 0.275, RULER.z); mark.visible = false; mark.renderOrder = 6; mark.userData.clayHide = true; root.add(mark);

  // sample tray
  const tray = new THREE.Group();
  {
    const wallMat = new THREE.MeshPhysicalMaterial({ color: "#eceff0", roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2 });
    const base = new THREE.Mesh(new RoundedBoxGeometry(TRAY.w, 0.5, TRAY.d, 3, 0.2), wallMat); base.position.y = 0.25; base.userData.kind = "tray";
    tray.add(base);
    const rim = (w, d, x, z) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, 0.9, d, 2, 0.18), wallMat); m.position.set(x, 0.65, z); m.userData.kind = "tray"; tray.add(m); };
    rim(TRAY.w, 0.5, 0, -TRAY.d / 2 + 0.25); rim(TRAY.w, 0.5, 0, TRAY.d / 2 - 0.25); rim(0.5, TRAY.d, -TRAY.w / 2 + 0.25, 0); rim(0.5, TRAY.d, TRAY.w / 2 - 0.25, 0);
    const mat = new THREE.MeshStandardMaterial({ color: "#2b2f33", roughness: 0.8 });
    const liner = new THREE.Mesh(new THREE.PlaneGeometry(TRAY.w - 1.4, TRAY.d - 1.4), new THREE.MeshStandardMaterial({ color: "#3a4047", roughness: 0.9 }));
    liner.rotation.x = -Math.PI / 2; liner.position.y = 0.52; liner.userData.kind = "tray"; tray.add(liner);
    tray.traverse((o) => { if (o.isMesh) pickables.push(o); });
    tray.position.set(TRAY.x, 0, TRAY.z); root.add(tray);
    shadow(20, TRAY.x, TRAY.z, 0.4);
  }
  const trayY = 0.52, MINI = 0.55;
  const mini = {};
  SAMPLE_KEYS.forEach((k, i) => {
    const row = i < 6 ? 0 : 1, col = row === 0 ? i : i - 6, per = row === 0 ? 6 : 5;
    const x = TRAY.x + (col - (per - 1) / 2) * 5.0, z = TRAY.z + (row === 0 ? -2.7 : 2.7);
    const s = makeSample(k, 1), body = buildSolid(s);
    body.group.scale.setScalar(MINI);
    const bolt = body.bolt ? 0 : 0;
    body.group.position.set(x, trayY, z);
    body.group.rotation.y = (i * 0.9) % TAU;
    body.group.traverse((o) => { if (o.isMesh) { o.userData.trayKey = k; o.userData.kind = "tray"; pickables.push(o); } });
    root.add(body.group);
    mini[k] = { group: body.group, x, z, y: trayY };
  });

  // measuring cylinder
  const cyl = makeTube(engine, { Ri: CYL.Ri, wall: CYL.wall, H: CYL.H, floor: CYL.floor, footR: CYL.footR, step: 1, mid: 5, major: 10, cap: 100, label: "100 mL ±1.0" });
  cyl.group.position.set(CYL.x, 0, CYL.z); root.add(cyl.group);
  shadow(5, CYL.x, CYL.z, 0.55);
  const cylLiq = LK.makeLiquid(engine, { radius: CYL.Ri - 0.012, floorY: CYL.floor, material: liquidMaterial(LOOK.water, 3.3) });
  cylLiq.mesh.position.set(CYL.x, 0, CYL.z); root.add(cylLiq.mesh);
  cylLiq.mesh.userData.clayColor = "#8fc7ea"; cylLiq.mesh.userData.clayOpacity = 0.65;
  const cylLevel0 = CYL.floor + CYL_START / CYL_AREA;
  cylLiq.setLevel(cylLevel0);
  const hiddenMat = new THREE.MeshBasicMaterial({ visible: false });
  const proxy = (geo, kind, x, y, z) => { const m = new THREE.Mesh(geo, hiddenMat); m.position.set(x, y, z); m.userData.keepMaterial = true; m.userData.kind = kind; root.add(m); pickables.push(m); return m; };
  const cylProxy = proxy(new THREE.CylinderGeometry(CYL.Ri + 0.2, CYL.Ri + 0.2, CYL.H, 16, 1, true), "cylinder", CYL.x, CYL.H / 2, CYL.z);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), new THREE.MeshStandardMaterial({ color: "#aab2ba", metalness: 1, roughness: 0.3 }));
  wire.geometry.translate(0, 0.5, 0); wire.visible = false; wire.userData.clayHide = true; root.add(wire);

  // float-or-sink tank
  const tankGroup = new THREE.Group(); tankGroup.position.set(TANK.x, 0, TANK.z); root.add(tankGroup);
  {
    const gm = LK.glassMaterial(engine);
    const mk = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.12, w / 3, h / 3, d / 3)), gm); m.position.set(x, y, z); m.renderOrder = 4; tankGroup.add(m); return m; };
    mk(TANK.w, TANK.base, TANK.d, 0, TANK.base / 2, 0);
    mk(TANK.w, TANK.h, TANK.wall, 0, TANK.h / 2, TANK.d / 2 - TANK.wall / 2);
    mk(TANK.w, TANK.h, TANK.wall, 0, TANK.h / 2, -TANK.d / 2 + TANK.wall / 2);
    mk(TANK.wall, TANK.h, TANK.d - 2 * TANK.wall, TANK.w / 2 - TANK.wall / 2, TANK.h / 2, 0);
    mk(TANK.wall, TANK.h, TANK.d - 2 * TANK.wall, -TANK.w / 2 + TANK.wall / 2, TANK.h / 2, 0);
    shadow(12, TANK.x, TANK.z, 0.5);
  }
  const tankMats = {};
  const tankMat = (k) => (tankMats[k] ||= liquidMaterial(LOOK[k], 0.7));
  const tankLiqGeo = new RoundedBoxGeometry(1, 1, 1, 3, 0.03);
  const tankLiq = new THREE.Mesh(tankLiqGeo, tankMat("water")); tankLiq.renderOrder = 1; tankLiq.frustumCulled = false;
  tankLiq.userData.clayColor = "#8fc7ea"; tankLiq.userData.clayOpacity = 0.65;
  const tankBody = new THREE.Mesh(tankLiqGeo, LK.glassMaterial(engine, { base: 0.14, rim: 0.5, power: 1.7, tint: "#5fc4cf", env: 2.4, ior: 1.33, double: false, roughness: 0.02 }));
  tankBody.renderOrder = 2; tankBody.frustumCulled = false; tankBody.userData.clayHide = true;
  tankLiq.add(tankBody);
  tankGroup.add(tankLiq);
  const tankIW = TANK.w - 2 * TANK.wall - 0.04, tankID = TANK.d - 2 * TANK.wall - 0.04;
  let tankLevel = TANK.base + TANK.fill, tankLevelShown = tankLevel;
  const tankFloor = TANK.base;
  const tankProxy = proxy(new THREE.BoxGeometry(TANK.w, TANK.h, TANK.d), "tank", TANK.x, TANK.h / 2, TANK.z);
  tankProxy.material = new THREE.MeshBasicMaterial({ visible: false, side: THREE.BackSide }); tankProxy.userData.keepMaterial = true;
  // ripple ring where a sample enters
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.72, 48), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 6; ring.visible = false; ring.userData.clayHide = true; root.add(ring);
  let ringT = 9, ringAt = new V3();

  function setTankLevelMesh() {
    const h = tankLevelShown - tankFloor;
    tankLiq.scale.set(tankIW, Math.max(0.01, h), tankID);
    tankLiq.position.set(0, tankFloor + h / 2, 0);
  }
  setTankLevelMesh();

  // density column
  const col = makeTube(engine, { Ri: COL.Ri, wall: COL.wall, H: COL.H, floor: COL.floor, footR: COL.footR, step: 10, mid: 50, major: 50, cap: 400, label: "400 mL" });
  col.group.position.set(COL.x, 0, COL.z); root.add(col.group);
  shadow(7, COL.x, COL.z, 0.55);
  const colProxy = proxy(new THREE.CylinderGeometry(COL.Ri + 0.25, COL.Ri + 0.25, COL.H, 20, 1, true), "column", COL.x, COL.H / 2, COL.z);
  const layerGeo = new THREE.CylinderGeometry(COL.Ri - 0.012, COL.Ri - 0.012, 1, 48, 1, false); layerGeo.translate(0, 0.5, 0);
  const layerObjs = new Map();   // id -> { mesh, h, color, att, dist, rough }
  const layerGroup = new THREE.Group(); layerGroup.position.set(COL.x, 0, COL.z); root.add(layerGroup);
  const rampTex = (up) => LK.canvasTexture(4, 64, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, up ? "#fff" : "#000"); g.addColorStop(1, up ? "#000" : "#fff"); c.fillStyle = g; c.fillRect(0, 0, w, h); }, { srgb: false });
  const rampUp = rampTex(true), rampDn = rampTex(false);   // canvas top = v 1; "up" = opaque at the top
  const bands = [];
  for (let i = 0; i < 6; i++) {
    const mkBand = (map) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(COL.Ri - 0.02, COL.Ri - 0.02, 0.5, 40, 1, true), new THREE.MeshBasicMaterial({ color: "#fff", alphaMap: map, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false })); m.renderOrder = 3; m.visible = false; m.userData.clayHide = true; layerGroup.add(m); return m; };
    bands.push({ lo: mkBand(rampUp), hi: mkBand(rampDn) });
  }
  // pouring beaker (liquid stays level via a clipping plane)
  const pourer = new THREE.Group(); pourer.visible = false; root.add(pourer);
  const pBeaker = LK.makeBeaker(engine, { Ro: 2.1, wall: 0.12, H: 5.6, capacity: 100 });
  const clipPlane = new THREE.Plane(new V3(0, -1, 0), 10);
  const pFillMat = new THREE.MeshPhysicalMaterial({ color: "#fff", roughness: 0.1, transparent: true, opacity: 0.9, clippingPlanes: [clipPlane], side: THREE.DoubleSide });
  const pFill = new THREE.Mesh(new THREE.CylinderGeometry(pBeaker.Ri - 0.03, pBeaker.Ri - 0.03, pBeaker.H - 0.4, 28), pFillMat);
  pFill.position.y = pBeaker.floorY + (pBeaker.H - 0.4) / 2; pFill.userData.clayHide = true;
  const pBeakerWrap = new THREE.Group(); pBeakerWrap.position.set(pBeaker.Ro, -pBeaker.H, 0);   // lip of the beaker at the pivot
  pBeakerWrap.add(pBeaker.group, pFill);
  pourer.add(pBeakerWrap);
  pBeaker.group.traverse((o) => { if (o.isMesh) o.userData.clayHide = true; });
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 1, 10), new THREE.MeshStandardMaterial({ color: "#fff", transparent: true, opacity: 0.88, roughness: 0.1 }));
  stream.geometry.translate(0, -0.5, 0); stream.visible = false; stream.userData.clayHide = true; root.add(stream);
  pourer.traverse((o) => { if (o.isMesh) o.userData.kind = "pourer"; });
  const pour = { on: false, t: 0, key: null, committed: false };

  // ---------- poses and tweens ----------
  const tweens = [];
  const newPose = (o = {}) => ({ x: 0, y: 0, z: 0, up: 0, k: 1, s: 1, yaw: 0, ...o });
  function applyPose(E) {
    const p = E.pose, g = E.group, b = E.body;
    const kk = lerp(1, p.k, 1);
    if (E.bolt) {
      const sx = lerp(1, 1 / (p.k * p.k), p.up), sy = lerp(1, p.k, p.up);
      g.scale.set(sx * p.s, sy * p.s, sy * p.s);
      g.rotation.set(0, p.yaw * (1 - p.up), -p.up * Math.PI / 2);
      g.position.set(p.x + p.up * E.bolt.flat * sy * p.s, p.y + p.up * (E.bolt.Lt / 2) * sx * p.s, p.z);
    } else {
      g.scale.set(p.k * p.s, (1 / (p.k * p.k)) * p.s, p.k * p.s);
      g.rotation.set(0, p.yaw, 0);
      g.position.set(p.x, p.y, p.z);
    }
  }
  function moveTo(E, to, { dur = 0.8, lift = 7 } = {}) {
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].E === E) { tweens[i].res(false); tweens.splice(i, 1); }
    E.phys = null;
    return new Promise((res) => {
      const d = engine.reducedMotion ? 0.05 : dur;
      tweens.push({ E, from: { ...E.pose }, to: { ...E.pose, ...to }, t: 0, dur: d, lift, res });
    });
  }
  function stepTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const u = easeInOut(tw.t), p = tw.E.pose;
      for (const k of Object.keys(tw.to)) p[k] = lerp(tw.from[k], tw.to[k], u);
      p.y += tw.lift * Math.sin(Math.PI * tw.t);
      if (tw.t >= 1) { tweens.splice(i, 1); tw.res(true); }
    }
  }

  // ---------- samples ----------
  function removeOwned(g) { for (let i = pickables.length - 1; i >= 0; i--) if (pickables[i].userData.owner === g) pickables.splice(i, 1); }
  function disposeGroup(g) { g.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { if (!x.userData?.shared) x.dispose?.(); }); }); }

  function makeEntity(key, size, startPose) {
    const sample = makeSample(key, size), body = buildSolid(sample);
    const E = {
      key, size, sample, meas: measure(sample, CYL_START), body: body.params, radial: body.radial, bolt: body.bolt, group: body.group,
      pose: newPose(startPose), loc: "tray", phys: null, yaw: 0,
    };
    E.group.traverse((o) => { if (o.isMesh) { o.userData.kind = "sample"; pickables.push(o); } });
    root.add(E.group);
    applyPose(E);
    return E;
  }
  function destroyEntity(E) {
    if (!E) return;
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].E === E) { tweens[i].res(false); tweens.splice(i, 1); }
    removeOwned(E.group); root.remove(E.group); disposeGroup(E.group);
  }
  const balancePose = (E) => ({ x: PAN.x, y: PAN.y, z: PAN.z, up: 0, k: 1, s: 1, yaw: 0.35 });
  function rulerPose(E) {
    const b = E.body;
    const lenX = b.type === "box" ? b.l : b.L, depth = b.type === "box" ? b.w : 2 * b.r;
    return { x: RULER.zero + lenX / 2, y: 0, z: RULER.z - 1.6 - 0.2 - depth / 2, up: 0, k: 1, s: 1, yaw: 0 };
  }
  const cylTopY = CYL.H;
  function cylPoses(E) {
    const sq = squeeze(E.body, E.radial, CYL.Ri - 0.12);
    E.sq = sq;
    const up = E.bolt ? 1 : 0;
    return {
      above: { x: CYL.x, y: cylTopY + 7, z: CYL.z, up, k: sq.k, s: 1, yaw: 0 },
      in: { x: CYL.x, y: CYL.floor + 0.02, z: CYL.z, up, k: sq.k, s: 1, yaw: 0 },
    };
  }

  function resetMeasure() { S.haveMass = false; S.haveVol = false; S.tankResult = null; ui.predicted = null; }
  function massOn() {   // raw mass on the pan (0 when empty)
    return S.E && S.E.loc === "balance" ? S.E.meas.mass : 0;
  }
  let lcdSettle = 0;
  function updateLcd(force) {
    const raw = massOn(), val = raw - S.tare;
    S.massRead = val;
    const stable = lcdSettle <= 0;
    let shown = val;
    if (!stable && raw > 0) shown = val + Math.sin(performance.now() * 0.05) * 0.08 * lcdSettle * (1 + Math.abs(val) * 0.02);
    const txt = (shown < 0 ? MINUS : "") + Math.abs(stable ? val : shown).toFixed(2);
    bal.draw(txt, stable, "g", Math.abs(S.tare) > 0.004);
  }

  async function chooseSample(k, { size } = {}) {
    if (size != null) ui.size = size;
    if (S.E && S.E.key === k && size == null) { await putOnBalance(); return; }
    if (SOLIDS[k].kind === "irregular" && ui.size > IRR_MAX) { ui.size = IRR_MAX; if (sizeS) sizeS.value = IRR_MAX; engine.toast("Pieces measured by displacement are limited to size ×1.2 so they fit the cylinder.", 3200); }
    const old = S.E;
    if (old) {   // the old sample goes back to its tray slot
      const m = mini[old.key];
      old.group.visible = false; destroyEntity(old);
      if (m) m.group.visible = true;
    }
    S.E = null; resetMeasure(); wipeColumnPieceHint();
    const m = mini[k];
    m.group.visible = false;
    const E = makeEntity(k, ui.size, { x: m.x, y: m.y, z: m.z, s: MINI, yaw: 0 });
    S.E = E;
    E.pose.s = MINI;
    syncUI();
    await putOnBalance();
  }
  function wipeColumnPieceHint() { /* pieces in the column stay until removed */ }

  async function putOnBalance() {
    const E = S.E; if (!E) return;
    const from = E.loc;
    if (from === "balance") return;
    E.loc = "move";
    S.tankResult = null;
    const poseOnBal = balancePose(E);
    if (from === "cyl") { const cp = cylPoses(E); await moveTo(E, { ...cp.above }, { dur: 0.7, lift: 0 }); }
    await moveTo(E, poseOnBal, { dur: 0.85, lift: 6 });
    if (S.E !== E) return;
    E.loc = "balance"; lcdSettle = 0.9; S.haveMass = true;
    syncUI();
  }
  async function measureVolume() {
    const E = S.E; if (!E) return;
    if (E.sample.kind === "regular") {
      if (E.loc === "ruler") return;
      E.loc = "move";
      await moveTo(E, rulerPose(E), { dur: 0.85, lift: 7 });
      if (S.E !== E) return;
      E.loc = "ruler"; S.haveVol = true;
    } else {
      if (E.loc === "cyl") return;
      E.loc = "move";
      const cp = cylPoses(E);
      await moveTo(E, cp.above, { dur: 0.85, lift: 5 });
      if (S.E !== E) return;
      E.loc = "cyl-in";
      await moveTo(E, cp.in, { dur: 1.9 + (E.sq.b.H) * 0.08, lift: 0 });
      if (S.E !== E) return;
      E.loc = "cyl"; S.haveVol = true;
    }
    syncUI();
  }
  function tare() {
    S.tare = massOn();
    lcdSettle = 0.7;
    updateLcd();
    syncUI();
    refreshText(true);
  }

  // ---------- results table ----------
  function record() {
    const E = S.E;
    if (!E || !S.haveMass || !S.haveVol) return;
    if (Math.abs(S.tare) > 0.004) { engine.toast("The balance was zeroed with something on the pan. Take the sample off, press TARE, and weigh it again.", 4200); return; }
    const m = E.meas;
    if (rows.some((r) => r.key === E.key && Math.abs(r.size - E.size) < 1e-6)) { engine.toast("That result is already in the table: change the size or pick another sample.", 3200); return; }
    const c = compareBook(E.key, m, E.sample);
    rows.push({ key: E.key, size: E.size, kind: E.sample.kind, name: SOLIDS[E.key].name, m: m.mass, V: m.volume, rho: m.rho, book: SOLIDS[E.key].rho, err: c.err, u: c.u, inRange: c.inRange, overlaps: c.overlaps });
    renderTable(); drawChart(); missionObj?.update(); refreshText(true);
    engine.toast(`Recorded: ${SOLIDS[E.key].name}, ρ = ${g2(m.rho)} g/cm³`, 2200);
  }

  // ---------- tank ----------
  const tankSurface = () => tankLevel;
  async function dropInTank() {
    const E = S.E; if (!E) return;
    const lq = LIQUIDS[ui.tankLiquid];
    E.loc = "move"; S.tankResult = null;
    const ox = (Math.random() - 0.5) * 3, oz = (Math.random() - 0.5) * 2;
    const to = { x: TANK.x + ox, y: tankSurface() + 8, z: TANK.z + oz, up: 0, k: 1, s: 1, yaw: Math.random() * TAU };
    await moveTo(E, to, { dur: 0.95, lift: 6 });
    if (S.E !== E) return;
    E.loc = "tank";
    E.phys = { vy: 0, t: 0, settled: false, logged: false, liquid: ui.tankLiquid };
    if (E.bolt) E.pose.up = 0;
  }
  function takeOut() { if (S.E) putOnBalance(); }
  function setTankLiquid(k) {
    ui.tankLiquid = k;
    tankLiq.material = tankMat(k);
    S.tankResult = null; ui.predicted = null;
    const E = S.E;
    if (E && E.loc === "tank" && E.phys) { E.phys.settled = false; E.phys.logged = false; E.phys.t = 0; E.phys.liquid = k; }
    syncUI(); refreshText(true);
  }
  function stepTankPhysics(E, dt) {
    const ph = E.phys, b = E.body, rho = E.sample.rho, lq = LIQUIDS[ph.liquid];
    const ft = floatTest(rho, lq.rho);
    const rhoEff = rho;
    const n = Math.max(1, Math.ceil(dt / 0.006)), h = dt / n;
    const mid = tankFloor + (tankLevel - tankFloor) * 0.5 - b.H / 2;
    for (let i = 0; i < n; i++) {
      const y = E.pose.y, depth = tankLevel - y;
      const sub = depth <= 0 ? 0 : vBelow(b, depth) / b.V;
      let a = -GRAV + GRAV * (lq.rho / rhoEff) * sub;
      if (sub > 0) a -= (ft.result === "floats" ? 11 : 17) * ph.vy;
      ph.vy += a * h;
      E.pose.y += ph.vy * h;
      if (E.pose.y <= tankFloor) { E.pose.y = tankFloor; if (ph.vy < 0) ph.vy = -ph.vy * 0.12; if (Math.abs(ph.vy) < 3) ph.vy = 0; }
      if (!ph.entered && E.pose.y < tankLevel) { ph.entered = true; ringT = 0; ringAt.set(E.pose.x, tankLevel + 0.03, E.pose.z); }
    }
    ph.t += dt;
    const still = Math.abs(ph.vy) < 1.2;
    if (!ph.settled && ph.t > 0.8 && still) ph.stillT = (ph.stillT || 0) + dt; else if (!still) ph.stillT = 0;
    if (!ph.settled && (ph.stillT > 0.5 || ph.t > 4)) {
      ph.settled = true;
      S.tankResult = { ...ft, key: E.key, m: E.sample.trueM, liquid: ph.liquid, rho: E.sample.rho };
      if (ui.predicted) S.tankResult.predicted = ui.predicted;
      tr.drops.push({ key: E.key, liquid: ph.liquid, result: ft.result, m: E.sample.trueM, submerged: ft.submerged });
      syncUI(); refreshText(true); missionObj?.update();
    }
    if (ph.settled && ft.result === "floats") { /* gentle bob handled by the physics */ }
  }

  // ---------- density column ----------
  const colLayersTarget = () => columnLayers(S.colKeys, COL_AREA);
  let layersT = [];   // target layers (bottom first)
  function colCurrentStack() {   // bottom-first with current heights
    const out = []; let y = COL.floor;
    for (const L of layersT) { const o = layerObjs.get(L.id); const h = o ? o.h : 0; out.push({ rho: L.rho, y0: y, y1: y + h, id: L.id, L }); y += h; }
    return { stack: out, top: y };
  }
  function lookOf(keys) {
    const c = new THREE.Color(0, 0, 0), a = new THREE.Color(0, 0, 0); let d = 0, rough = 0, emis = 0;
    keys.forEach((k) => { c.add(new THREE.Color(LOOK[k].color)); a.add(new THREE.Color(LOOK[k].att)); d += LOOK[k].dist; rough += LOOK[k].rough; emis += LOOK[k].emis; });
    const n = keys.length;
    c.multiplyScalar(1 / n); a.multiplyScalar(1 / n);
    return { color: c, att: a, dist: d / n, rough: keys.length > 1 ? 0.2 : rough / n, emis: emis / n };
  }
  function ensureLayer(L) {
    let o = layerObjs.get(L.id);
    if (!o) {
      const look = lookOf(L.keys);
      const mat = LK.waterMaterial({ color: "#fff", attenuation: "#fff", distance: look.dist, ior: LOOK[L.keys[0]].ior, thickness: 4.4 });
      mat.color.copy(look.color); mat.attenuationColor.copy(look.att); mat.roughness = look.rough; mat.emissive.copy(look.att); mat.emissiveIntensity = look.emis;
      const mesh = new THREE.Mesh(layerGeo, mat); mesh.renderOrder = 1; mesh.frustumCulled = false;
      mesh.userData.clayColor = "#" + look.color.getHexString(); mesh.userData.clayOpacity = 0.7;
      const body = new THREE.Mesh(layerGeo, LK.glassMaterial(engine, { base: 0.0, rim: 0.32, power: 2.2, tint: "#ffffff", env: 1.6, ior: LOOK[L.keys[0]].ior, double: false, roughness: 0.03 }));
      body.renderOrder = 2; body.frustumCulled = false; body.userData.clayHide = true; mesh.add(body);
      layerGroup.add(mesh);
      o = { mesh, body, h: 0, color: look.color.clone(), att: look.att.clone(), dist: look.dist, rough: look.rough, emis: look.emis, dispColor: new THREE.Color() };
      layerObjs.set(L.id, o);
    }
    return o;
  }
  function stepColumn(dt) {
    layersT = colLayersTarget();
    // grow heights toward the target; colours toward the target mix
    for (const L of layersT) {
      const o = ensureLayer(L), look = lookOf(L.keys);
      o.h = approach(o.h, L.h, 3.2, dt); if (Math.abs(o.h - L.h) < 0.004) o.h = L.h;
      o.color.lerp(look.color, 1 - Math.exp(-4 * dt)); o.att.lerp(look.att, 1 - Math.exp(-4 * dt));
      o.dist = approach(o.dist, look.dist, 4, dt); o.rough = approach(o.rough, look.rough + (L.mixedZone ? 0.3 : 0), 4, dt); o.emis = approach(o.emis, look.emis, 4, dt);
      o.body.material.userData.glassU.gTint.value.copy(o.color); const m = o.mesh.material; m.color.copy(o.color); m.attenuationColor.copy(o.att); m.attenuationDistance = o.dist; m.roughness = o.rough; m.emissive.copy(o.att); m.emissiveIntensity = o.emis;
    }
    let y = COL.floor, prev = null, bi = 0;
    for (const o of bands) { o.lo.visible = false; o.hi.visible = false; }
    for (const L of layersT) {
      const o = layerObjs.get(L.id);
      o.mesh.visible = o.h > 0.012;
      o.mesh.position.y = y; o.mesh.scale.set(1, Math.max(0.001, o.h), 1);
      if (prev && (prev.L.slowMix || L.slowMix) && o.h > 0.3 && prev.o.h > 0.3 && bi < bands.length) {   // slow-mixing interface: a soft blur
        const bd = bands[bi++], hh = Math.min((L.mixedZone || prev.L.mixedZone) ? 1.3 : 0.5, prev.o.h * 0.4, o.h * 0.4);
        bd.lo.scale.set(1, hh / 0.5, 1); bd.hi.scale.set(1, hh / 0.5, 1); const mz = L.mixedZone || prev.L.mixedZone; bd.lo.material.opacity = bd.hi.material.opacity = mz ? 0.8 : 0.55;
        bd.lo.position.y = y - hh / 2; bd.hi.position.y = y + hh / 2;
        bd.lo.material.color.copy(o.color); bd.hi.material.color.copy(prev.o.color);
        bd.lo.visible = bd.hi.visible = true;
      }
      prev = { o, L }; y += o.h;
    }
    colTop = y;
    const nLayers = layersT.filter((L) => L.h > 0).length;
    if (nLayers > tr.colMax && layersT.every((L) => layerObjs.get(L.id).h > L.h - 0.05)) tr.colMax = nLayers;
    if (layersT.some((L) => L.mixed && L.keys.includes("ethanol"))) tr.colMix = true;
  }
  let colTop = COL.floor;
  const piecePos = [[-1.0, -0.5], [1.0, -0.5], [0, 1.0]];
  function pieceTarget(pc) {
    const { stack, top } = colCurrentStack();
    const rho = pc.sample.rho, b = pc.body;
    const rest = restInColumn(stack.map((s) => ({ rho: s.rho })), rho);
    pc.rest = rest;
    if (rest.mode === "bottom" || rest.mode === "empty") return COL.floor;
    if (rest.mode === "top") return top - draught(b, rest.f);
    return stack[rest.k].y1 - draught(b, rest.f);
  }
  function addPiece(key) {
    if (!key) return;
    if (S.pieces.length >= 3) { const old = S.pieces.shift(); removeOwned(old.group); root.remove(old.group); disposeGroup(old.group); }
    const sample = makeSample(key, COLUMN_PIECE), bd = buildSolid(sample);
    const used = new Set(S.pieces.map((p) => p.slot));
    const slot = [0, 1, 2].find((s) => !used.has(s));
    const [ox, oz] = piecePos[slot];
    bd.group.position.set(COL.x + ox, COL.H + 6, COL.z + oz);
    bd.group.rotation.y = Math.random() * TAU;
    bd.group.traverse((o) => { if (o.isMesh) { o.userData.kind = "column"; } });
    root.add(bd.group);
    const pc = { key, group: bd.group, body: bd.params, slot, y: COL.H + 6, vy: 0, rest: { mode: "empty" }, sample };
    S.pieces.push(pc);
    syncUI(); refreshText(true);
  }
  function stepPieces(dt) {
    for (const pc of S.pieces) {
      const target = pieceTarget(pc);
      const d = target - pc.y;
      const sp = Math.max(Math.abs(d) * 4, 4);
      pc.y += clamp(d, -sp * dt * (pc.y > colTop ? 8 : 1), sp * dt * 2);
      pc.group.position.y = pc.y;
    }
  }
  function pourLiquid(k) {
    if (pour.on || S.colKeys.includes(k)) return;
    pour.on = true; pour.t = 0; pour.key = k; pour.committed = false;
    const look = LOOK[k];
    pFillMat.color.set(look.color); pFillMat.color.lerp(new THREE.Color(look.att), 0.45);
    stream.material.color.copy(pFillMat.color);
    pourer.visible = true;
    syncUI();
  }
  const POUR = { approach: 0.8, pour: 1.9, leave: 0.7 };
  const _lh = new V3(), _lp2 = new V3(), _bw = new V3(), _lw = new V3();
  function stepPour(dt) {
    if (!pour.on) return;
    if (engine.reducedMotion) dt *= 8;
    pour.t += dt;
    const T = pour.t, T1 = POUR.approach, T2 = T1 + POUR.pour, T3 = T2 + POUR.leave;
    const lipHome = _lh.set(COL.x + 11, COL.H + 4, COL.z + 1), lipPour = _lp2.set(COL.x + 0.9, COL.H + 1.6, COL.z);
    let tilt = 0, u = 0, fillF = 1, sOn = false;
    if (T < T1) { u = easeInOut(T / T1); tilt = u * 1.0; }
    else if (T < T2) {
      u = 1; const q = (T - T1) / POUR.pour;
      tilt = lerp(1.0, 1.45, easeInOut(Math.min(1, q * 1.6)));
      fillF = 1 - clamp((q - 0.05) / 0.9, 0, 1);
      sOn = q > 0.05 && q < 0.96;
      if (!pour.committed && q > 0.06) { pour.committed = true; S.colKeys.push(pour.key); syncUI(); }
    } else { u = 1 - easeInOut((T - T2) / POUR.leave); tilt = 1.45 * u; fillF = 0; }
    pourer.position.lerpVectors(lipHome, lipPour, u);
    pourer.rotation.z = tilt;
    pourer.updateMatrixWorld(true);
    // the liquid in the pouring beaker stays level: a clipping plane at its surface
    const bottom = _bw.set(0, pBeaker.floorY, 0); pBeaker.group.localToWorld(bottom);
    const hFull = pBeaker.heightForVolume(POUR_ML) - pBeaker.floorY;
    const up = bottom.y + 0.02 + fillF * hFull;
    const nearLip = pourer.position.y - 0.25 - (1 - fillF) * 3.2;
    const tf = clamp((tilt - 0.4) / 0.8, 0, 1);
    clipPlane.constant = lerp(up, Math.min(up + 20, nearLip), tf);
    pFill.visible = fillF > 0.01;
    stream.visible = sOn;
    if (sOn) {
      const lip = _lw.set(-pBeaker.Ro, pBeaker.H, 0); pBeaker.group.localToWorld(lip);
      stream.position.set(lip.x - 0.1, lip.y - 0.1, COL.z);
      stream.scale.set(1, Math.max(0.1, lip.y - 0.1 - colTop), 1);
    }
    if (T >= T3) { pour.on = false; pourer.visible = false; stream.visible = false; syncUI(); refreshText(true); missionObj?.update(); }
  }
  function emptyColumn() {
    if (pour.on) return;
    S.colKeys.length = 0;
    for (const o of layerObjs.values()) { layerGroup.remove(o.mesh); o.mesh.material.dispose(); }
    layerObjs.clear();
    for (const pc of S.pieces) { removeOwned(pc.group); root.remove(pc.group); disposeGroup(pc.group); }
    S.pieces.length = 0;
    syncUI(); refreshText(true);
  }
  function removePieces() {
    for (const pc of S.pieces) { removeOwned(pc.group); root.remove(pc.group); disposeGroup(pc.group); }
    S.pieces.length = 0; syncUI(); refreshText(true);
  }

  // ---------- derived scene state each frame ----------
  const _w = new V3();
  function updateScene(dt, t) {
    stepTweens(dt);
    const E = S.E;
    if (E) {
      if (E.loc === "tank" && E.phys) stepTankPhysics(E, dt);
      applyPose(E);
    }
    // measuring cylinder: displaced volume of whatever is in the bore
    let disp = 0;
    if (E) {
      const p = E.pose, inBore = Math.hypot(p.x - CYL.x, p.z - CYL.z) < 0.7;
      if (inBore) {
        const sq = E.sq || squeeze(E.body, E.radial, CYL.Ri - 0.12);
        const b = sq.b, bottom = E.bolt ? p.y : p.y;   // bottom of the body
        let lvl = cylLevel0;
        for (let i = 0; i < 5; i++) { const depth = Math.max(0, lvl - bottom); disp = depth > 0 ? vBelow(b, depth) : 0; lvl = cylLevel0 + disp / CYL_AREA; }
      }
      // the wire that holds the sample under
      wire.visible = inBore && E.loc !== "balance" && E.loc !== "tank";
      if (wire.visible) {
        const topY = p.y + (E.bolt ? (E.body.L + E.body.hh) / ((E.sq?.k || 1) ** 2) : (E.sq?.b.H ?? E.body.H));
        wire.position.set(CYL.x, topY, CYL.z); wire.scale.set(1, Math.max(0.1, CYL.H + 9 - topY), 1);
      }
    } else wire.visible = false;
    const cylLvl = cylLevel0 + disp / CYL_AREA;
    cylLiq.setLevel(cylLvl);
    cylReading = (cylLvl - CYL.floor) * CYL_AREA;

    // tank: level rises with whatever is displaced
    let tdisp = 0;
    if (E && E.loc === "tank") {
      const p = E.pose;
      const depth = Math.max(0, tankLevel - p.y);
      tdisp = vBelow(E.body, depth);
    }
    const baseL = tankFloor + TANK.fill, target = baseL + tdisp / TANK_AREA;
    tankLevel = target;
    tankLevelShown = approach(tankLevelShown, tankLevel, 14, dt);
    setTankLevelMesh();
    if (ringT < 1.2) {
      ringT += dt; ring.visible = true; ring.position.copy(ringAt).add(new V3(TANK.x, 0, TANK.z).multiplyScalar(0)); ring.position.y = tankLevelShown + 0.03;
      const s = 1 + ringT * 5; ring.scale.set(s, s, s); ring.material.opacity = Math.max(0, 0.5 * (1 - ringT / 1.2));
    } else ring.visible = false;
    // ruler marker
    if (E && E.loc === "ruler") {
      const lenX = E.body.type === "box" ? E.body.l : E.body.L, rl = E.meas.dims[E.sample.shape === "box" ? 0 : 1];
      mark.visible = true; mark.position.x = RULER.zero + rl; mark.position.z = RULER.z;
    } else mark.visible = false;
    // column
    stepPour(dt);
    stepColumn(dt);
    stepPieces(dt);
    // balance display
    if (lcdSettle > 0) lcdSettle = Math.max(0, lcdSettle - dt);
    updateLcd();
    // tray minis: hide the one in use
    for (const k of SAMPLE_KEYS) mini[k].group.visible = !(E && E.key === k);
  }
  let cylReading = CYL_START;

  // ---------- panel ----------
  let panelNode = null, built = null;
  let narrEl, selCard, missionObj, tableEl, chartEl, chartCtx, calcEl, fbEl, tankFbEl, colNoteEl;
  let sampleBtns = {}, sizeS, stepBtns = {}, tankSeg, predBtns = {}, pourBtns = {}, focusSeg, colBtns = {};
  let chips = null, diveLblTank, diveLblCol, readLbl, dimLbls = [], chipFloor = 0, resultLbl, selKind = null;

  function sectionHint(parent, text) { const p = document.createElement("p"); p.className = "hint"; p.style.margin = "10px 0 4px"; p.textContent = text; parent.appendChild(p); return p; }

  function fullState() {
    const E = S.E;
    const cmp = E && S.haveMass && S.haveVol && Math.abs(S.tare) < 0.004 ? compareBook(E.key, E.meas, E.sample) : null;
    const layers = layersT.length ? layersT : colLayersTarget();
    return {
      sample: E ? { key: E.key, name: SOLIDS[E.key].name, size: E.size, m: E.meas.mass, V: E.meas.volume, kind: E.sample.kind, shape: E.sample.shape } : null,
      loc: E?.loc, tare: S.tare, massRead: S.massRead, haveMass: S.haveMass, haveVol: S.haveVol, meas: E?.meas, cmp,
      tank: { liquid: ui.tankLiquid, predicted: ui.predicted || S.tankResult?.predicted, result: S.tankResult },
      column: { keys: S.colKeys, layers: S.colKeys.length ? colLayersTarget() : [], pieces: S.pieces.map((p) => ({ key: p.key, rest: p.rest, rho: p.sample.rho })) },
      focusColumn: ui.focus === "column",
    };
  }
  function buildPanel(el) {
    panelNode = document.createElement("div"); panelNode.style.display = "contents";
    el.appendChild(panelNode);
    const band = lens.band;

    // --- look at ---
    const lc = K.card(panelNode, "Density lab");
    lc.insertAdjacentHTML("beforeend", `<p class="hint" style="margin:-2px 0 6px">${P({ y7: "Measure the density of a solid, test whether it floats, then build a density column. Use <b>Look at</b> to get close to each piece of equipment.", ext: "Find ρ = m ÷ V with the instrument uncertainty, test ρ(object) against ρ(liquid), then layer liquids by density. Use <b>Look at</b> to get close to each piece of equipment." }, band)}</p>`);
    focusSeg = K.segmented(lc, [{ value: "overview", label: "Whole bench" }, { value: "balance", label: "Balance" }, { value: "cylinder", label: "Cylinder" }, { value: "tank", label: "Tank" }, { value: "column", label: "Column" }], ui.focus, (v) => focusOn(v));

    // --- choose a sample ---
    const sc = K.card(panelNode, "1 · Choose a sample");
    const grid = document.createElement("div"); grid.className = "dgrid"; sc.appendChild(grid);
    sampleBtns = {};
    for (const k of SAMPLE_KEYS) {
      const b = document.createElement("button"); b.type = "button"; b.className = "btn dsamp"; b.dataset.key = k;
      b.innerHTML = `<i style="background:${SOLIDS[k].color}"></i><span>${SOLIDS[k].name.replace(/ \(.*\)/, "")}</span>`;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => chooseSample(k));
      grid.appendChild(b); sampleBtns[k] = b;
    }
    const sw = document.createElement("div"); sw.style.marginTop = "10px"; sc.appendChild(sw);
    sizeS = K.slider(sw, { label: "Size of the piece", min: 0.5, max: 2.5, step: 0.1, value: ui.size, format: (v) => `×${v.toFixed(1)}`, onInput: (v) => resize(v) });
    sc.insertAdjacentHTML("beforeend", `<p class="hint">${P({ y7: "A bigger piece of the same material has more mass and more volume, but the density doesn't change.", ext: "Mass and volume scale together: ρ is intensive." }, band)}</p>`);

    // --- measure ---
    const mc = K.card(panelNode, "2 · Measure");
    const r1 = K.buttonRow(mc);
    stepBtns.bal = K.button(r1, "Put on the balance", () => putOnBalance());
    stepBtns.tare = K.button(r1, "TARE (zero)", () => tare());
    const r2 = K.buttonRow(mc);
    stepBtns.vol = K.button(r2, "Measure the volume", () => measureVolume(), { kind: "primary" });
    calcEl = document.createElement("div"); calcEl.className = "dcalc"; calcEl.setAttribute("aria-live", "polite"); mc.appendChild(calcEl);
    const r3 = K.buttonRow(mc);
    stepBtns.rec = K.button(r3, "Record in the table", () => record(), { kind: "primary" });
    fbEl = document.createElement("div"); fbEl.className = "hint"; mc.appendChild(fbEl);

    // --- what's happening ---
    const ex = K.card(panelNode, "What's happening", "explain");
    narrEl = document.createElement("div"); narrEl.setAttribute("aria-live", "polite"); ex.appendChild(narrEl);
    ex.insertAdjacentHTML("beforeend", `<p class="hint">${P({ y7: "Click the balance, cylinder, ruler, tank or column to learn about it. Drag to turn the view; scroll to zoom.", ext: "Double-click the tank or column (or zoom in) to see why the particles make the densities different." }, band)}</p>`);
    selCard = K.card(panelNode, "", "sel-card"); selCard.style.display = "none";

    // --- results ---
    const rc = K.card(panelNode, "Results table");
    tableEl = document.createElement("div"); tableEl.className = "dtable-wrap"; rc.appendChild(tableEl);
    chartEl = document.createElement("canvas"); chartEl.className = "mini-chart"; chartEl.style.height = "190px"; chartEl.style.marginTop = "8px";
    rc.appendChild(chartEl); chartCtx = chartEl.getContext("2d");
    const rr = K.buttonRow(rc);
    K.button(rr, "Clear the table", () => { rows.length = 0; renderTable(); drawChart(); });
    rc.insertAdjacentHTML("beforeend", `<p class="hint">${P({ y7: "Mass against volume: each material's points fall on a straight line through (0, 0). The steeper the line, the denser the material.", ext: "m–V graph: slope = ρ. Dashed lines are the data-book densities." }, band)}</p>`);

    // --- float or sink ---
    const tc = K.card(panelNode, "3 · Float or sink");
    sectionHint(tc, "Liquid in the tank");
    tankSeg = K.segmented(tc, TANK_LIQUIDS.map((k) => ({ value: k, label: LIQUIDS[k].name.replace(/ \(.*\)/, "").replace("Salt water", "Salt water").replace("Vegetable oil", "Oil").replace("Methylated spirits", "Meths") + ` ${Number(LIQUIDS[k].rho.toFixed(3))}` })), ui.tankLiquid, (v) => setTankLiquid(v));
    sectionHint(tc, "Predict first, then test");
    const pr = K.buttonRow(tc);
    for (const [v, lab] of [["floats", "It floats"], ["sinks", "It sinks"]]) {
      predBtns[v] = K.button(pr, lab, () => { ui.predicted = ui.predicted === v ? null : v; syncUI(); refreshText(true); });
    }
    const dr = K.buttonRow(tc);
    stepBtns.drop = K.button(dr, "Drop it in", () => dropInTank(), { kind: "primary" });
    stepBtns.out = K.button(dr, "Take it out", () => takeOut());
    tankFbEl = document.createElement("div"); tankFbEl.className = "hint"; tankFbEl.setAttribute("aria-live", "polite"); tc.appendChild(tankFbEl);
    const zr = K.buttonRow(tc);
    K.button(zr, "Zoom into the particles ▸", () => engine.dive(portals[0]));

    // --- column ---
    const cc = K.card(panelNode, "4 · Density column");
    cc.insertAdjacentHTML("beforeend", `<p class="hint" style="margin:-2px 0 6px">${P({ y7: "Pour 50 mL of each liquid gently, densest first, and watch them settle. Then drop in a small piece of the sample.", ext: "Equal 50 mL pours, poured gently. Miscible liquids merge into one layer; slowly-mixing ones keep their layers for a while and blur over time." }, band)}</p>`);
    const pg = document.createElement("div"); pg.className = "dgrid"; cc.appendChild(pg);
    pourBtns = {};
    for (const k of COLUMN_ORDER) {
      const b = document.createElement("button"); b.type = "button"; b.className = "btn dsamp";
      b.innerHTML = `<i style="background:${LOOK[k].att}"></i><span>${LIQUIDS[k].name.replace(/ \(.*\)/, "").replace("Methylated spirits", "Meths").replace("Dishwashing liquid", "Dish liquid")} <small>${LIQUIDS[k].rho}</small></span>`;
      b.addEventListener("click", () => pourLiquid(k));
      pg.appendChild(b); pourBtns[k] = b;
    }
    const cr = K.buttonRow(cc);
    colBtns.piece = K.button(cr, "Drop in a piece of the sample", () => { if (S.E) addPiece(S.E.key); });
    colBtns.empty = K.button(cr, "Empty the column", () => emptyColumn());
    colBtns.rm = K.button(cr, "Remove pieces", () => removePieces());
    const zc = K.buttonRow(cc);
    K.button(zc, "Zoom into the particles ▸", () => engine.dive(portals[1]));
    colNoteEl = document.createElement("div"); colNoteEl.className = "hint"; cc.appendChild(colNoteEl);

    // --- missions, quiz, mix-ups, data ---
    missionObj = K.missions(panelNode, lens.filter(MISSIONS).map((m) => ({ text: `<span>${m.text}</span>`, check: () => m.check(tr) })), (m) => engine.toast(`Mission complete: ${m.text.replace(/<[^>]+>/g, "")}`, 3600));
    K.quiz(panelNode, lens.filter(QUIZ));
    const mx = K.card(panelNode, "Common mix-ups");
    for (const m of MIXUPS) {
      const d = document.createElement("details"); d.style.margin = "6px 0";
      d.innerHTML = `<summary style="cursor:pointer;color:var(--ink);font-size:0.86rem">${m.myth}</summary><p style="margin:6px 0 0;font-size:0.84rem">${P(m.truth, band)}</p>`;
      mx.appendChild(d);
    }
    const dc = K.card(panelNode, "Data and sources");
    dc.insertAdjacentHTML("beforeend", `<div class="io" style="display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:0.82rem;margin-bottom:8px">${DATA_ROWS.map(([a, b]) => `<b style="color:var(--ink-faint);font-weight:600">${a}</b><span>${b}</span>`).join("")}</div>`);
    dc.insertAdjacentHTML("beforeend", `<details style="margin:0 0 8px"><summary style="cursor:pointer;color:var(--ink);font-size:0.84rem">The data book (typical values, g/cm³)</summary><div class="io" style="display:grid;grid-template-columns:1fr auto;gap:2px 10px;font-size:0.78rem;margin-top:6px">${dataBookRows().map(([a, b]) => `<span>${a}</span><span style="color:var(--ink-dim)">${b}</span>`).join("")}</div><p class="hint">Values are typical; real woods, plastics, oils and honey vary, which is why a range is given.</p></details>`);
    dc.insertAdjacentHTML("beforeend", `<p style="margin:0 0 4px;font-size:0.82rem;color:var(--ink)"><b>Where the numbers come from</b></p><ul style="margin:0 0 8px;padding-left:18px;font-size:0.8rem;color:var(--ink-dim);display:flex;flex-direction:column;gap:5px">${SOURCES.map((s) => `<li>${s.what}: <a href="${s.url}" target="_blank" rel="noopener" style="color:var(--accent)">${s.ref}</a></li>`).join("")}</ul>`);
    dc.insertAdjacentHTML("beforeend", `<p style="margin:0 0 4px;font-size:0.82rem;color:var(--ink)"><b>What the model simplifies</b></p><ul style="margin:0;padding-left:18px;font-size:0.8rem;color:var(--ink-dim);display:flex;flex-direction:column;gap:5px">${SIMPLIFICATIONS.map((s) => `<li>${s}</li>`).join("")}</ul>`);

    built = band;
    renderTable(); drawChart(); syncUI(); refreshText(true);
  }

  function resize(v) {
    ui.size = v;
    const E = S.E; if (!E) return;
    const k = E.key;
    destroyEntity(E); S.E = null; resetMeasure();
    const ne = makeEntity(k, v, balancePose({}));
    // keep the sample where the balance is
    ne.pose = newPose({ ...balancePose(), }); ne.loc = "balance"; S.E = ne; applyPose(ne);
    lcdSettle = 0.7; S.haveMass = true; S.haveVol = false;
    syncUI(); refreshText(true);
  }

  function syncUI() {
    const E = S.E, busy = E && ["move", "cyl-in"].includes(E.loc);
    for (const [k, b] of Object.entries(sampleBtns)) b.setAttribute("aria-pressed", String(E?.key === k));
    if (sizeS) sizeS.input.max = E && E.sample.kind === "irregular" ? IRR_MAX : 2.5;
    if (stepBtns.bal) {
      stepBtns.bal.disabled = !E || busy || E.loc === "balance";
      stepBtns.tare.disabled = false;
      const reg = E?.sample.kind === "regular";
      stepBtns.vol.textContent = !E ? "Measure the volume" : reg ? "Measure with the ruler" : "Lower into the measuring cylinder";
      stepBtns.vol.disabled = !E || busy || (reg ? E.loc === "ruler" : E.loc === "cyl");
      stepBtns.rec.disabled = !E || !S.haveMass || !S.haveVol || busy;
      stepBtns.drop.disabled = !E || busy || !!(E.loc === "tank" && E.phys && !E.phys.settled);
      stepBtns.out.disabled = !E || E.loc !== "tank";
    }
    for (const [v, b] of Object.entries(predBtns)) b.setAttribute("aria-pressed", String(ui.predicted === v));
    for (const [k, b] of Object.entries(pourBtns)) { b.disabled = pour.on || S.colKeys.includes(k); b.setAttribute("aria-pressed", String(S.colKeys.includes(k))); }
    if (colBtns.piece) { colBtns.piece.disabled = !E; colBtns.empty.disabled = pour.on || (!S.colKeys.length && !S.pieces.length); colBtns.rm.disabled = !S.pieces.length; }
    // calculation
    if (calcEl) {
      const m = E?.meas;
      const massLine = S.haveMass ? (Math.abs(S.tare) > 0.004 ? `Mass: <span style="color:#fbbf24">balance was zeroed with something on it: re-weigh</span>` : `Mass (measured): <b>${m.mass.toFixed(2)} g</b>`) : `Mass: <span style="color:var(--ink-faint)">not measured</span>`;
      let vol = `Volume: <span style="color:var(--ink-faint)">not measured</span>`;
      if (S.haveVol) vol = E.sample.kind === "regular"
        ? (E.sample.shape === "box" ? `Ruler: ${f1(m.dims[0])} × ${f1(m.dims[1])} × ${f1(m.dims[2])} cm → V = <b>${f1(m.volume)} cm³</b>` : `Ruler: r = ${f1(m.dims[0])} cm, length ${f1(m.dims[1])} cm → V = π r² h = <b>${f1(m.volume)} cm³</b>`)
        : `Cylinder: ${m.before} mL → <b>${m.after} mL</b> → V = ${m.after} − ${m.before} = <b>${m.volume} cm³</b>`;
      let rho = "";
      if (S.haveMass && S.haveVol && Math.abs(S.tare) < 0.004) rho = `<div class="drho">ρ = m ÷ V = ${m.mass.toFixed(2)} g ÷ ${E.sample.kind === "regular" ? f1(m.volume) : m.volume} cm³ = <b>${g2(m.rho)} g/cm³</b></div>`;
      calcEl.innerHTML = E ? `<div>${massLine}</div><div>${vol}</div>${rho}` : `<p class="hint">Choose a sample above.</p>`;
    }
    if (tankFbEl) {
      const r = S.tankResult;
      tankFbEl.innerHTML = r ? `<span style="color:${STATE_COL[r.result]}">●</span> ${predictLineOrResult(r)}` : (E?.loc === "tank" ? "Settling…" : "Pick a liquid, predict, then press Drop it in.");
    }
    if (colNoteEl) colNoteEl.textContent = pour.on ? "Pouring…" : S.colKeys.length ? `${S.colKeys.length} liquid${S.colKeys.length > 1 ? "s" : ""} poured (50 mL each).` : "";
  }
  function predictLineOrResult(r) {
    const w = { floats: "floats", sinks: "sinks", suspended: "hangs in the middle" };
    const base = `${SOLIDS[r.key].name} in ${LIQUIDS[r.liquid].name.toLowerCase()}: <b>${w[r.result]}</b>${r.result === "floats" ? ` (${Math.round(r.submerged * 100)} % under)` : ""}.`;
    return r.predicted ? `${base} ${predictLine(r.predicted, r.result)}` : `${base} (Predict first next time.)`;
  }

  // ---------- results table and chart ----------
  function renderTable() {
    if (!tableEl) return;
    if (!rows.length) { tableEl.innerHTML = `<p class="hint">Nothing recorded yet. Weigh a sample, measure its volume, then press <b>Record in the table</b>.</p>`; return; }
    const trs = rows.map((r) => {
      const ok = r.err <= 5;
      return `<tr><td>${r.name.replace(/ \(.*\)/, "")}${Math.abs(r.size - 1) > 0.01 ? ` <small>×${r.size.toFixed(1)}</small>` : ""}</td><td>${r.m.toFixed(2)}</td><td>${r.kind === "regular" ? f1(r.V) : r.V}</td><td><b>${g2(r.rho)}</b></td><td>${g2(r.book)}</td><td style="color:${ok ? "#34d399" : "#fbbf24"}" title="${r.inRange ? "inside the data-book range" : r.overlaps ? "outside the range but within instrument uncertainty" : "outside the data-book range"}">${r.err.toFixed(1)}${r.inRange ? " ✓" : ""}</td></tr>`;
    }).join("");
    tableEl.innerHTML = `<table class="dtab"><thead><tr><th>Sample</th><th>m (g)</th><th>V (cm³)</th><th>ρ = m÷V (g/cm³)</th><th>Data book</th><th>% diff</th></tr></thead><tbody>${trs}</tbody></table><p class="hint">% diff = |measured − data book| ÷ data book × 100; ✓ = inside the typical range for the material. Instruments read to 0.01 g, 1 mm and 1 mL, so small pieces can be a few % out.</p>`;
  }
  const CHART_COLS = ["#38bdf8", "#f59e0b", "#34d399", "#f472b6", "#a78bfa", "#fb7185", "#22d3ee", "#facc15", "#4ade80", "#fb923c", "#94a3b8"];
  function drawChart() {
    if (!chartEl) return;
    const w = chartEl.clientWidth, h = chartEl.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (!w || !h) return;
    if (chartEl.width !== Math.round(w * dpr) || chartEl.height !== Math.round(h * dpr)) { chartEl.width = Math.round(w * dpr); chartEl.height = Math.round(h * dpr); }
    const c = chartCtx, R = { x0: 42, x1: w - 10, y0: 10, y1: h - 30 };
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    const dim = K.cssVar("--ink-dim", "#9fb3cf"), grid = K.cssVar("--grid-line", "rgba(159,179,207,0.18)");
    let xm = 30, ym = 60;
    for (const r of rows) { xm = Math.max(xm, r.V * 1.15); ym = Math.max(ym, r.m * 1.15); }
    const niceStep = (m) => (m <= 40 ? 5 : m <= 80 ? 10 : m <= 200 ? 20 : m <= 500 ? 50 : 100);
    xm = Math.ceil(xm / niceStep(xm)) * niceStep(xm); ym = Math.ceil(ym / niceStep(ym)) * niceStep(ym);
    const X = (v) => R.x0 + (v / xm) * (R.x1 - R.x0), Y = (v) => R.y1 - (v / ym) * (R.y1 - R.y0);
    c.font = "11px Inter, system-ui, sans-serif"; c.lineWidth = 1; c.strokeStyle = grid; c.fillStyle = dim;
    c.textAlign = "right"; c.textBaseline = "middle";
    for (let v = 0; v <= ym; v += niceStep(ym)) { c.beginPath(); c.moveTo(R.x0, Y(v)); c.lineTo(R.x1, Y(v)); c.stroke(); c.fillText(String(v), R.x0 - 5, Y(v)); }
    c.textAlign = "center"; c.textBaseline = "top";
    for (let v = 0; v <= xm; v += niceStep(xm)) { c.beginPath(); c.moveTo(X(v), R.y0); c.lineTo(X(v), R.y1); c.stroke(); c.fillText(String(v), X(v), R.y1 + 4); }
    c.fillText("Volume (cm³)", (R.x0 + R.x1) / 2, h - 14);
    c.save(); c.translate(11, (R.y0 + R.y1) / 2); c.rotate(-Math.PI / 2); c.textBaseline = "middle"; c.fillText("Mass (g)", 0, 0); c.restore();
    const seen = new Set();
    for (const r of rows) {
      const col = K.chartCol(CHART_COLS[SAMPLE_KEYS.indexOf(r.key) % CHART_COLS.length]);
      if (!seen.has(r.key)) {   // data-book line
        seen.add(r.key);
        c.setLineDash([5, 4]); c.strokeStyle = col; c.globalAlpha = 0.55; c.lineWidth = 1.4; c.beginPath(); c.moveTo(X(0), Y(0));
        const vEnd = Math.min(xm, ym / r.book); c.lineTo(X(vEnd), Y(vEnd * r.book)); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
        c.fillStyle = col; c.textAlign = "left"; c.textBaseline = "bottom"; c.fillText(g2(r.book), Math.min(X(vEnd) + 3, R.x1 - 28), Y(vEnd * r.book) - 2);
      }
      c.fillStyle = col; c.beginPath(); c.arc(X(r.V), Y(r.m), 4.4, 0, TAU); c.fill();
      c.strokeStyle = K.cssVar("--bg-card", "#0a1628"); c.lineWidth = 1.2; c.stroke();
    }
    if (!rows.length) { c.fillStyle = dim; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("Recorded points appear here", (R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2); }
    chartEl.setAttribute("role", "img");
    chartEl.setAttribute("aria-label", `Mass against volume graph with ${rows.length} recorded points. Each material's points lie on a straight line through the origin; the slope is its density.`);
  }

  // ---------- selection card and text ----------
  function selBody(kind) {
    const part = PARTS[kind]; if (!part) return null;
    const E = S.E;
    const now = {
      balance: `Display: <b>${(S.massRead < 0 ? MINUS : "") + Math.abs(S.massRead).toFixed(2)} g</b>${Math.abs(S.tare) > 0.004 ? ` · tare ${S.tare.toFixed(2)} g` : ""}`,
      cylinder: `Reading: <b>${Math.round(cylReading)} mL</b> (water + any solid)`,
      tank: `Liquid: <b>${LIQUIDS[ui.tankLiquid].name}</b> · ρ = ${LIQUIDS[ui.tankLiquid].rho} g/cm³`,
      column: S.colKeys.length ? `Layers: ${colLayersTarget().length} · ${S.colKeys.length * POUR_ML} mL poured` : "Empty",
      sample: E ? `${SOLIDS[E.key].name}: data-book ρ = ${SOLIDS[E.key].rho} g/cm³ (range ${SOLIDS[E.key].range[0]} to ${SOLIDS[E.key].range[1]})` : "",
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
    const b = selBody(selKind); if (!b) return;
    const { part, now } = b;
    selCard.style.display = "";
    selCard.innerHTML = `<h2>Selected</h2><p style="color:var(--ink);font-weight:600;margin-bottom:4px">${part.name}</p><p>${P(part.text, lens.band)}</p>${now ? `<p style="color:var(--ink)">${now}</p>` : ""}${part.portal ? `<div class="btn-row"><button class="btn primary" data-act="zoom">Zoom into the particles ▸</button></div>` : ""}`;
    selCard.querySelector('[data-act="zoom"]')?.addEventListener("click", () => engine.dive(selKind === "column" ? portals[1] : portals[0]));
  }
  function refreshText(force = false) {
    if (!narrEl) return;
    const html = narrative(fullState(), lens.band).map((p) => `<p>${p}</p>`).join("");
    if (force || narrEl.innerHTML !== html) narrEl.innerHTML = html;
    if (selKind && selCard.style.display !== "none") renderSel();
    syncUI();
  }

  // ---------- chips, labels ----------
  function buildChips() {
    const ov = engine.overlay; ov.innerHTML = "";
    chips = { s: K.chip(ov), mv: K.chip(ov), r: K.chip(ov) };
  }
  function updateChips() {
    if (!chips) return;
    const E = S.E, dot = (c) => `<i class="dot" style="background:${c}"></i>`;
    chips.s(E ? `${dot(SOLIDS[E.key].color)}<b>${SOLIDS[E.key].name.replace(/ \(.*\)/, "")}</b>${Math.abs(E.size - 1) > 0.01 ? ` ×${E.size.toFixed(1)}` : ""}` : `${dot("#64748b")}No sample yet`);
    chips.mv(S.haveMass || S.haveVol ? `m <b>${S.haveMass ? S.E.meas.mass.toFixed(2) : "?"} g</b> · V <b>${S.haveVol ? (E.sample.kind === "regular" ? f1(E.meas.volume) : E.meas.volume) : "?"} cm³</b>` : `m ? · V ?`);
    const r = S.tankResult;
    chips.r(S.haveMass && S.haveVol && Math.abs(S.tare) < 0.004 ? `ρ <b>${g2(E.meas.rho)} g/cm³</b>${r ? ` · ${dot(STATE_COL[r.result])}${r.result}` : ""}` : (r ? `${dot(STATE_COL[r.result])}${r.result} in ${LIQUIDS[r.liquid].name.split(" ")[0].toLowerCase()}` : `ρ = m ÷ V`));
  }
  function measureChipFloor() {
    const s = engine.stageEl.getBoundingClientRect(), kids = engine.overlay.children;
    let b = 0; for (const k of kids) b = Math.max(b, k.getBoundingClientRect().bottom);
    chipFloor = Math.max(0, b - s.top + 8);
  }
  const _lp = new V3();
  function placeClamped(el, v, dx = 0, dy = 0, side = false) {
    const p = _lp.copy(v).project(engine.camera);
    if (p.z > 1 || p.z < -1 || Math.abs(p.x) > 1.04 || p.y < -1.04 || p.y > 1.04) { el.style.display = "none"; return; }
    el.style.display = "";
    const w = el.offsetWidth || 120, h = el.offsetHeight || 24;
    if (side) dx += w / 2 + 8;
    const x = clamp((p.x * 0.5 + 0.5) * engine.w + dx, w / 2 + 6, engine.w - w / 2 - 6);
    const y = Math.max((-p.y * 0.5 + 0.5) * engine.h + dy, chipFloor + h / 2);
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
  function makeLabels() {
    diveLblTank?.remove(); diveLblCol?.remove(); readLbl?.remove(); resultLbl?.remove(); dimLbls.forEach((d) => d.remove());
    diveLblTank = engine.label("Zoom into the particles ▸", "dive lab-dive");
    diveLblCol = engine.label("Column close-up: zoom into its particles ▸", "dive lab-dive");
    readLbl = engine.label("", "org lab-org");
    resultLbl = engine.label("", "org lab-org");
    dimLbls = [0, 1, 2].map(() => engine.label("", "org lab-org"));
  }
  const _a = new V3();
  function updateLabels() {
    if (!diveLblTank || engine.current !== level) return;
    placeClamped(diveLblTank, _a.set(TANK.x, TANK.h + 3, TANK.z), 0, 0, false);
    if (ui.focus === "column") placeClamped(diveLblCol, _a.set(COL.x, COL.H + 3, COL.z), 0, 0, false); else diveLblCol.style.display = "none";
    const E = S.E;
    // measuring cylinder reading
    if (E && (E.loc === "cyl" || E.loc === "cyl-in")) {
      const shown = E.loc === "cyl" ? E.meas.after : Math.round(cylReading);
      readLbl.innerHTML = `Reading: <b>${shown} mL</b><small>bottom of the curved surface, eye level</small>`;
      placeClamped(readLbl, _a.set(CYL.x + CYL.footR, cylLiq.level + 0.2, CYL.z), 0, 0, true);
    } else readLbl.style.display = "none";
    // result of the tank test
    if (E && E.loc === "tank" && S.tankResult) {
      const r = S.tankResult;
      resultLbl.innerHTML = `<b style="color:${STATE_COL[r.result]}">${r.result === "floats" ? `Floats · ${Math.round(r.submerged * 100)} % under` : r.result === "sinks" ? "Sinks" : "Hangs in the middle"}</b>`;
      placeClamped(resultLbl, _a.set(TANK.x - TANK.w / 2, TANK.h + 0.5, TANK.z), 0, -4, true);
    } else resultLbl.style.display = "none";
    // ruler readings
    if (E && E.loc === "ruler") {
      const m = E.meas, b = E.body, z0 = RULER.z - 1.6;
      const lenX = b.type === "box" ? b.l : b.L, depth = b.type === "box" ? b.w : 2 * b.r;
      const defs = b.type === "box"
        ? [[`length ${f1(m.dims[0])} cm`, RULER.zero + lenX / 2, 0.4, z0 + 0.8], [`width ${f1(m.dims[1])} cm`, RULER.zero - 0.4, 0.4, z0 - depth / 2 - 0.2], [`height ${f1(m.dims[2])} cm`, RULER.zero + lenX + 0.6, b.h + 0.4, z0 - depth - 0.4]]
        : [[`length ${f1(m.dims[1])} cm`, RULER.zero + lenX / 2, 0.4, z0 + 0.8], [`radius ${f1(m.dims[0])} cm (diameter ${f1(2 * m.dims[0])})`, RULER.zero - 0.4, b.r * 2 + 0.4, z0 - depth / 2], null];
      defs.forEach((d, i) => { if (!d) { dimLbls[i].style.display = "none"; return; } dimLbls[i].innerHTML = d[0]; placeClamped(dimLbls[i], _a.set(d[1], d[2], d[3]), 0, i === 0 ? 12 : 0, false); });
    } else dimLbls.forEach((d) => (d.style.display = "none"));
  }

  // ---------- camera focus ----------
  const FOCUS = {
    overview: { target: [3, 9, 2], hw: 46, hh: 22, dir: [0.03, 0.8, 1] },
    balance: { target: [-24, 2, 10], hw: 22, hh: 19, dir: [0.02, 0.7, 1] },
    cylinder: { target: [-3, 9.5, -2], hw: 7.5, hh: 13, dir: [0.03, 0.12, 1] },
    tank: { target: [18, 5.5, 3], hw: 15, hh: 9, dir: [0.04, 0.36, 1] },
    column: { target: [37, 16, -4], hw: 10, hh: 22, dir: [0.1, 0.2, 1] },
  };
  function focusView(name) {
    const f = FOCUS[name] || FOCUS.overview, a = engine.camera.aspect;
    const dist = Math.max(f.hw / (0.344 * a), f.hh / 0.344);
    return { target: new V3(...f.target), distance: dist, dir: new V3(...f.dir) };
  }
  function focusOn(name) {
    ui.focus = name;
    const v = focusView(name);
    engine.fly(v.target, v.target.clone().addScaledVector(v.dir.clone().normalize(), v.distance), 0.9);
    focusSeg?.set(name);
    refreshText(true);
  }

  // ---------- engine lights ----------
  let savedLights = null;
  const css = document.getElementById("density-style") || Object.assign(document.head.appendChild(document.createElement("style")), { id: "density-style" });
  css.textContent = `.stage.lab-light .cs-hint, .stage.lab-light .cs-scale { color: #f4f8fb; text-shadow: 0 1px 4px rgba(0,0,0,.9), 0 0 2px rgba(0,0,0,.8); }
.stage.lab-light .cs-scale i { border-color: #f4f8fb; }
.lbl3d.lab-dive { background: rgba(8, 20, 30, 0.82); color: #d9fbf5; border-color: #4fd1c5; box-shadow: 0 2px 10px rgba(0,0,0,.35); }
.lbl3d.lab-org { background: rgba(8, 20, 30, 0.82); color: #e8f1ff; }
.dgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.dgrid .btn { display: flex; align-items: center; gap: 7px; text-align: left; padding: 6px 8px; font-size: 0.8rem; line-height: 1.2; }
.dgrid .btn i { flex: none; width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(255,255,255,.35); }
.dgrid .btn small { color: var(--ink-faint); }
.dgrid .btn[aria-pressed="true"] { border-color: var(--accent); background: var(--btn-bg-hover); }
.dgrid .btn:disabled { opacity: 0.5; }
.dcalc { font-size: 0.84rem; color: var(--ink-dim); display: flex; flex-direction: column; gap: 3px; margin: 8px 0 2px; }
.dcalc b { color: var(--ink); }
.drho { margin-top: 3px; padding: 6px 8px; border-radius: 8px; background: var(--tint-1); color: var(--ink); }
.dtable-wrap { overflow-x: auto; }
.dtab { width: 100%; border-collapse: collapse; font-size: 0.74rem; }
.dtab th { text-align: right; color: var(--ink-faint); font-weight: 600; padding: 2px 4px; vertical-align: bottom; }
.dtab td { text-align: right; padding: 3px 4px; border-top: 1px solid var(--panel-border); color: var(--ink-dim); }
.dtab th:first-child, .dtab td:first-child { text-align: left; }
.dtab td b { color: var(--ink); }
.dtab small { color: var(--ink-faint); }`;
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
  const portals = [
    { to: "densityParticles", label: "Zoom into the particles", object: tankProxy, objects: [tankProxy, tankLiq], radius: 7, center: () => new V3(TANK.x, TANK.base + TANK.fill * 0.55, TANK.z).applyMatrix4(root.matrixWorld) },
    { to: "densityParticles", label: "Zoom into the particles", object: colProxy, objects: [colProxy, ...[]], radius: 5, center: () => new V3(COL.x, COL.floor + 6, COL.z).applyMatrix4(root.matrixWorld) },
  ];

  // ---------- the level object ----------
  let uiT = 0, textT = 0, chartT = 0;
  const level = {
    title: "Density lab",
    topics: ["density"],
    root, pickables, portals,
    metersPerUnit: 0.01,
    get state() { return { sample: S.E ? { key: S.E.key, size: S.E.size, loc: S.E.loc } : null, haveMass: S.haveMass, haveVol: S.haveVol, massRead: S.massRead, tare: S.tare, tankResult: S.tankResult, tankLiquid: ui.tankLiquid, columnKeys: [...S.colKeys], columnLayers: S.colKeys.length ? colLayersTarget() : [] }; },
    get view() {
      const a = engine.camera.aspect;
      if (a < 0.8 && ui.focus === "overview") { const w = focusView("overview"); w.target.set(-4, 5, 2); w.distance = Math.max(38 / (0.344 * a), 40); return w; }
      return focusView(ui.focus);
    },
    minDistance: 6, maxDistance: 150, near: 0.2, far: 900, minPolar: 0.12, maxPolar: 1.45,
    env: { bg: ["#a9b9c8", "#566573", "#b5c3d0"], fog: ["#8a99a7", 0], exposure: 1.02, bloom: [0.35, 0.4, 2.0], aperture: 0.0004 },
    clay: { groundY: 0, groundR: 60, shadow: 60, freq: 0.5 },
    info(obj) {
      if (obj.userData.trayKey) return { title: `${SOLIDS[obj.userData.trayKey].name} (click to test it)`, kind: "tray", key: obj.userData.trayKey };
      let kind = null;
      for (let o = obj; o && !kind; o = o.parent) kind = o.userData.kind || null;
      if (!kind || !PARTS[kind]) return null;
      let title = PARTS[kind].name;
      if (kind === "balance") title = `Electronic balance: ${(S.massRead < 0 ? MINUS : "") + Math.abs(S.massRead).toFixed(2)} g`;
      if (kind === "tank") title = `Tank of ${LIQUIDS[ui.tankLiquid].name.toLowerCase()}`;
      if (kind === "sample" && S.E) title = SOLIDS[S.E.key].name;
      return { title, kind, portal: kind === "tank" ? portals[0] : kind === "column" ? portals[1] : null };
    },
    onClick(e, hit) {
      const o = hit?.object;
      if (o?.userData.trayKey) { chooseSample(o.userData.trayKey); return true; }
      if (o?.userData.kind === "tare") { tare(); return true; }
      return false;
    },
    onSelect(info) { showSelection(info); },
    mountPanel(el) {
      tuneLights(); makeLabels();
      if (panelNode && built === lens.band) el.appendChild(panelNode);
      else { panelNode?.remove(); buildPanel(el); }
      buildChips(); measureChipFloor(); updateChips();
    },
    unmountPanel() {
      restoreLights();
      [diveLblTank, diveLblCol, readLbl, resultLbl, ...dimLbls].forEach((l) => l && (l.style.display = "none"));
      engine.overlay.innerHTML = ""; chips = null;
    },
    onResume() { tuneLights(); },
    onPause() { restoreLights(); },
    onLens() { panelNode?.remove(); panelNode = null; buildPanel(engine.panel); },
    dispose() {
      restoreLights();
      [diveLblTank, diveLblCol, readLbl, resultLbl, ...dimLbls].forEach((l) => l?.remove());
      for (const m of Object.values(tankMats)) m.dispose();
      for (const o of layerObjs.values()) o.mesh.material.dispose();
      rampUp.dispose(); rampDn.dispose(); bal.lcdTex.dispose();
    },
    update(dt, t, rdt = dt) {
      updateScene(dt, t);
      updateLabels();
      if ((uiT -= rdt) <= 0) { uiT = 0.2; updateChips(); measureChipFloor(); missionObj?.update(); }
      if ((textT -= rdt) <= 0) { textT = 0.5; refreshText(); }
      if ((chartT -= rdt) <= 0) { chartT = 1.5; drawChart(); }
    },
  };
  // clay look: clear glass has no clay equivalent, so hide it and keep the contents
  root.traverse((o) => { if (o.isMesh && o.material?.userData?.glassU) o.userData.clayHide = true; });
  layersT = [];
  return level;
}
