// MixLab lab kit: reusable, realistic laboratory apparatus for any station. No station logic lives here.
// Units: 1 world unit = 1 cm (so a 250 mL beaker is 7 units across). Everything is built from three.js r169 primitives.
//
// API (all builders return plain objects; add `.group` to your root; call `.update(dt, t)` where noted):
//   glassMaterial(engine, o)     borosilicate look: clear face-on, bright reflections and a blue-green edge, alpha-blended with
//                                premultiplied specular (so reflections are not dimmed by transparency). o: base, rim, power, tint, env.
//   waterMaterial(o)             refracting liquid (transmission, ior 1.33, faint blue attenuation). o: color, attenuation, distance, ior.
//   iceMaterial()                frosted ice: pale blue-white, cloudy with trapped-air streaks, wet gloss. (opaque on purpose: see NOTE)
//   makeBeaker(engine, o)        thick-walled lathe glass with rolled rim and printed graduations. o: Ro, wall, H, floor, capacity.
//                                -> { group, glass, print, Ri, Ro, H, floorY, rimY, heightForVolume(mL), volumeForHeight(cm) }
//   makeLiquid(engine, {radius, floorY, material})
//                                -> { mesh, setLevel(h), setRipple(amp, t), level }   (meniscus rim, analytic ripple normals)
//   makeIce(engine, {radius, floorY, cubeSize})
//                                -> { mesh, reset(grams), update({solid, waterLevel, T, t, dt}), pileHeight }   floats on water, shrinks as it melts
//   makeBubbles(engine, {radius, floorY, max})
//                                -> { mesh, update(dt, {rate, level, active, size}) }   rising vapour/air bubbles (rate per second)
//   makeMist(engine, {radius, n})
//                                -> { points, update(dt, {intensity, level, rimY}) }   soft white droplets rising from the surface
//   makeHotplate(engine, {size, height, plateR, maxW})
//                                -> { group, topY, setPower(W), setDisplay(text), update(dt, t) }   brushed plate, glowing ring, knob, LED display
//   makeThermometer({min, max, scaleLen, bulbR})
//                                -> { group, setTemp(T), scaleY(T) }   origin = bulb tip; red column; printed scale
//   makeRetortStand({armLen, clampY, rodH})   -> { group }   brushed steel; arm clamp ends at local (armLen, clampY, 0)
//   makeStirBar(o)               -> { mesh, update(dt) , spin }   white PTFE capsule that spins
//   makeColdBath(engine, {dishR, dishH, innerR, level})
//                                -> { group, floorY }   glass dish of ice + salt brine (annulus), crushed ice and salt crystals
//   makeSyringe(engine, {Ri, H})
//                                -> { group, setPlunger(y), floorY, boreX }   sealed barrel with a piston (thermometer passes through a bore)
//   makeTimer()                  -> { group, setText(s) }   LCD stopwatch
//   makeBench(), makeTileWall()  bench top (matte dark-grey epoxy) and white tiled splash-back (gives refraction something to bend)
//   contactShadow(r, strength)   soft dark disc to ground an object on the bench
//   canvasTexture, makeNoiseTexture, mulberry, lathe, arcPts: small helpers
//
// NOTE on transmission: three.js transmissive materials only "see" opaque objects (not other transmissive or blended ones).
// So the water is the one transmissive volume, everything that sits inside or behind it that should be refracted (ice, thermometer,
// stir bar, hotplate) is opaque, and glass, bubbles, mist and brine are alpha-blended and drawn after it (renderOrder 1..6).
// The engine's Balanced/Fast tiers switch transmission off automatically (materials.js applyTier).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { softDot } from "../materials.js";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

export const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export function canvasTexture(w, h, draw, { srgb = true, repeat = null, aniso = 4 } = {}) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/** Tileable greyscale value noise (for roughness / bump maps). */
export function makeNoiseTexture(n = 128, seed = 1, octaves = 3) {
  const rnd = mulberry(seed);
  const grids = [];
  for (let o = 0; o < octaves; o++) { const f = 4 << o; grids.push({ f, g: Float32Array.from({ length: f * f }, rnd) }); }
  const data = new Uint8Array(n * n * 4);
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = 0, wsum = 0;
    grids.forEach(({ f, g }, i) => {
      const w = 1 / (1 << i), gx = (x / n) * f, gy = (y / n) * f, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = sm(gx - x0), ty = sm(gy - y0);
      const a = g[(y0 % f) * f + (x0 % f)], b = g[(y0 % f) * f + ((x0 + 1) % f)], c = g[((y0 + 1) % f) * f + (x0 % f)], d = g[((y0 + 1) % f) * f + ((x0 + 1) % f)];
      v += w * (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty); wsum += w;
    });
    const o = (y * n + x) * 4, u = Math.round((v / wsum) * 255);
    data[o] = data[o + 1] = data[o + 2] = u; data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

/** Points on an arc: centre (cx, cy), radius r, angles in degrees. */
export function arcPts(cx, cy, r, a0, a1, n = 6) {
  const out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + ((a1 - a0) * i) / n) * DEG; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return out;
}
export const lathe = (pts, segs = 72, phi = TAU, start = 0) => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), segs, start, phi);

function sharedEnv(engine) {
  const e = engine.scene.environment;
  if (e) e.userData.shared = true;   // disposeTree must not free the engine's environment map
  return e;
}

// ---------- materials ----------
/** Borosilicate glass: nearly clear, with bright reflections and a faint blue-green edge. Alpha-blended; specular is added in full. */
export function glassMaterial(engine, o = {}) {
  const { base = 0.03, rim = 0.5, power = 2.4, tint = "#bfe8df", env = 1.8, ior = 1.47, double = true, roughness = 0.03 } = o;
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x000000, roughness, metalness: 0, ior, clearcoat: 1, clearcoatRoughness: 0.02,
    transparent: true, premultipliedAlpha: true, depthWrite: false, side: double ? THREE.DoubleSide : THREE.FrontSide,
    envMap: sharedEnv(engine), envMapIntensity: env,
  });
  const U = { gBase: { value: base }, gRim: { value: rim }, gPow: { value: power }, gTint: { value: new THREE.Color(tint) } };
  m.userData.glassU = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader
      .replace("void main() {", "uniform float gBase, gRim, gPow; uniform vec3 gTint;\nvoid main() {")
      .replace("#include <opaque_fragment>", `
        float gF = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), gPow);
        float gA = clamp(gBase + gRim * gF, 0.0, 0.95);
        gl_FragColor = vec4(outgoingLight + gTint * gA, gA);`);
  };
  m.customProgramCacheKey = () => "mixlab-glass";
  return m;
}

/** Water: refracts what is behind it (ior 1.33) with a faint blue attenuation. The one transmissive volume in a scene. */
export function waterMaterial(o = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: o.color || "#f3faff", roughness: 0.015, metalness: 0, ior: o.ior ?? 1.333, transmission: 1, thickness: o.thickness ?? 1.4,
    attenuationColor: new THREE.Color(o.attenuation || "#a8d8ee"), attenuationDistance: o.distance ?? 22,
    specularIntensity: 1, clearcoat: 0.25, clearcoatRoughness: 0.03, envMapIntensity: 1.2, depthWrite: false,
  });
}

let _iceTex;
function iceTexture() {
  if (_iceTex) return _iceTex;
  const rnd = mulberry(7);
  _iceTex = canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = "#d9eaf5"; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {   // soft cloudy patches (trapped micro-bubbles scatter light)
      const x = rnd() * w, y = rnd() * h, r = 14 + rnd() * 46, g = c.createRadialGradient(x, y, 0, x, y, r);
      const white = rnd() < 0.7;
      g.addColorStop(0, white ? "rgba(255,255,255,0.55)" : "rgba(120,170,205,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    c.lineCap = "round";
    for (let i = 0; i < 16; i++) {   // air streaks and hairline cracks
      let x = rnd() * w, y = rnd() * h, a = rnd() * TAU;
      c.strokeStyle = `rgba(255,255,255,${0.35 + rnd() * 0.4})`; c.lineWidth = 0.8 + rnd() * 2.2;
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 6; k++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * (6 + rnd() * 14); y += Math.sin(a) * (6 + rnd() * 14); c.lineTo(x, y); }
      c.stroke();
    }
  }, { repeat: null });
  _iceTex.userData.shared = true;
  return _iceTex;
}
/** Frosted ice. Opaque on purpose (see NOTE at the top): milky blue-white with a wet clearcoat and a faint blue glow inside. */
export function iceMaterial() {
  const t = iceTexture();
  return new THREE.MeshPhysicalMaterial({
    color: "#f2f9ff", map: t, bumpMap: t, bumpScale: 0.35, roughness: 0.22, metalness: 0, ior: 1.31,
    clearcoat: 0.9, clearcoatRoughness: 0.12, emissive: new THREE.Color("#5f94bd"), emissiveIntensity: 0.16, envMapIntensity: 1.1,
  });
}

// ---------- scene dressing ----------
export function contactShadow(r, strength = 0.5) {
  const t = canvasTexture(128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w / 2);
    g.addColorStop(0, `rgba(0,0,0,${strength})`); g.addColorStop(0.55, `rgba(0,0,0,${strength * 0.55})`); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, { srgb: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = -2; m.userData.clayHide = true;
  return m;
}

export function makeBench({ w = 130, d = 80, thick = 3 } = {}) {
  const n = makeNoiseTexture(128, 11, 3);
  n.repeat.set(10, 6);
  const nrm = n.clone(); nrm.repeat.set(10, 6); nrm.needsUpdate = true;
  const m = new THREE.MeshPhysicalMaterial({ color: "#3c4249", roughness: 0.78, roughnessMap: nrm, bumpMap: nrm, bumpScale: 0.12, metalness: 0, clearcoat: 0, envMapIntensity: 0.3 });
  const bench = new THREE.Mesh(new RoundedBoxGeometry(w, thick, d, 3, 0.35), m);
  bench.position.y = -thick / 2;
  bench.userData.kind = "bench"; bench.userData.clayHide = false;
  return bench;
}

export function makeTileWall({ w = 190, h = 70, z = -38 } = {}) {
  const t = canvasTexture(512, 512, (c, W, H) => {
    c.fillStyle = "#cfd6db"; c.fillRect(0, 0, W, H);
    const n = 4, s = W / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const g = c.createLinearGradient(i * s, j * s, (i + 1) * s, (j + 1) * s);
      g.addColorStop(0, "#9fb0bb"); g.addColorStop(1, "#8696a2");
      c.fillStyle = g; c.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
    }
    c.strokeStyle = "#dfe5e8"; c.lineWidth = 5;
    for (let i = 0; i <= n; i++) { c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s, H); c.stroke(); c.beginPath(); c.moveTo(0, i * s); c.lineTo(W, i * s); c.stroke(); }
  }, { repeat: [w / 7.6, h / 7.6] });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.4, clearcoat: 0.25, clearcoatRoughness: 0.3, color: "#ffffff", envMapIntensity: 0.3 }));
  wall.position.set(0, h / 2, z);
  wall.userData.clayHide = true;
  return wall;
}

// ---------- glassware ----------
function gradTexture(o) {
  // printed graduations (white enamel): minor every 25 mL, major every 50 mL with numbers, a "250 mL" rating
  const { H, floor, Ri, capacity } = o, W = 256, T = 1024;
  return canvasTexture(W, T, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = "rgba(255,255,255,0.95)"; c.strokeStyle = "rgba(255,255,255,0.95)"; c.textBaseline = "middle";
    const yOf = (V) => h * (1 - (floor + V / (Math.PI * Ri * Ri)) / H);
    const step = capacity <= 150 ? 10 : 25;
    for (let V = step; V <= capacity; V += step) {
      const major = V % (step * 2) === 0, y = yOf(V);
      c.lineWidth = major ? 3.5 : 2.5;
      c.beginPath(); c.moveTo(w * 0.28, y); c.lineTo(w * (major ? 0.5 : 0.42), y); c.stroke();
      if (major) { c.font = "600 20px Inter, system-ui, sans-serif"; c.textAlign = "left"; c.fillText(String(V), w * 0.53, y); }
    }
    c.font = "600 17px Inter, system-ui, sans-serif"; c.textAlign = "center";
    c.fillText(`${capacity} mL`, w * 0.5, h * 0.08);
    c.font = "500 12px Inter, system-ui, sans-serif"; c.fillText("± 5 %  ·  borosilicate 3.3", w * 0.5, h * 0.108);
  }, { aniso: 8 });
}

/** A 250 mL-style beaker. Heights are in cm; volume marks are true for the inner radius. */
export function makeBeaker(engine, o = {}) {
  const capacity = o.capacity ?? 250, Ro = o.Ro ?? 3.5, wall = o.wall ?? 0.15, H = o.H ?? 9.4, floor = o.floor ?? 0.3;
  const Ri = Ro - wall, rc = 0.55, rci = 0.35, cx = (Ri + Ro) / 2, rl = (Ro - Ri) / 2 + 0.05;
  const pts = [[0, floor], ...arcPts(Ri - rci, floor + rci, rci, -90, 0, 6), [Ri, H - 0.4], ...arcPts(cx, H - 0.12, rl, 180, 0, 8), [Ro + 0.02, H - 0.45], [Ro, H - 0.9], [Ro, rc], ...arcPts(Ro - rc, rc, rc, 0, -90, 8), [0, 0]];
  const group = new THREE.Group();
  const glass = new THREE.Mesh(lathe(pts, 80), glassMaterial(engine));
  glass.renderOrder = 4;
  group.add(glass);
  const arc = 120 * DEG;
  const printMat = new THREE.MeshStandardMaterial({ map: gradTexture({ H, floor, Ri, capacity }), transparent: true, depthWrite: false, roughness: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, envMapIntensity: 0.5 });
  const print = new THREE.Mesh(new THREE.CylinderGeometry(Ro + 0.006, Ro + 0.006, H, 48, 1, true, -arc / 2, arc), printMat);
  print.position.y = H / 2; print.renderOrder = 3;
  group.add(print);
  return {
    group, glass, print, Ri, Ro, H, floorY: floor, rimY: H, capacity,
    heightForVolume: (mL) => floor + mL / (Math.PI * Ri * Ri),
    volumeForHeight: (h) => Math.max(0, (h - floor) * Math.PI * Ri * Ri),
  };
}

/** The liquid in a vessel: lathe with a concave meniscus; setLevel(h) sets the surface height (cm); ripples keep exact analytic normals. */
export function makeLiquid(engine, { radius, floorY = 0.3, material = waterMaterial(), segs = 64 } = {}) {
  const R = radius;
  // profile from the surface centre, out across the surface, over the meniscus, down the wall, round the bottom corner, to the floor centre
  const prof = [];
  const topR = [0, 0.25, 0.5, 0.7, 0.85, 0.94].map((f) => f * (R - 0.55));
  for (const r of topR) prof.push({ r, top: true, dy: 0, surf: true });
  for (const [dr, dy] of [[-0.42, 0.02], [-0.26, 0.07], [-0.13, 0.14], [0, 0.23]]) prof.push({ r: R + dr, top: true, dy, surf: false });
  prof.push({ r: R, top: false, y: floorY + 0.35 });
  for (const [dr, y] of [[-0.06, 0.2], [-0.14, 0.12], [-0.35, 0.02]]) prof.push({ r: R + dr, top: false, y: floorY + y });
  prof.push({ r: 0, top: false, y: floorY });
  const geo = lathe(prof.map((p) => [p.r, 0]), segs);
  const P = geo.attributes.position, N = geo.attributes.normal, np = prof.length;
  const surfIdx = [];
  for (let i = 0; i <= segs; i++) for (let j = 0; j < np; j++) if (prof[j].surf) surfIdx.push(i * np + j);
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  const obj = { mesh, level: 0, radius: R, floorY, amp: 0 };
  const apply = (t = 0) => {
    const h = obj.level, a = obj.amp;
    for (let i = 0; i <= segs; i++) for (let j = 0; j < np; j++) {
      const k = i * np + j, p = prof[j];
      let y = p.top ? h + p.dy : p.y;
      if (a > 0 && p.top && p.r > 0) {
        const x = P.getX(k), z = P.getZ(k), s = Math.min(1, p.r / (R * 0.5));
        const f1 = x * 1.7 + z * 0.9 + t * 3.1, f2 = x * -0.8 + z * 1.9 + t * 2.3, f3 = x * 2.6 - z * 2.2 - t * 4.1;
        y += a * s * (Math.sin(f1) + 0.8 * Math.sin(f2) + 0.5 * Math.sin(f3));
        if (j < 6) {   // exact slope of the ripple for the surface rings
          const dx = a * s * (1.7 * Math.cos(f1) - 0.8 * 0.8 * Math.cos(f2) + 0.5 * 2.6 * Math.cos(f3));
          const dz = a * s * (0.9 * Math.cos(f1) + 0.8 * 1.9 * Math.cos(f2) - 0.5 * 2.2 * Math.cos(f3));
          const l = Math.hypot(dx, 1, dz);
          N.setXYZ(k, -dx / l, 1 / l, -dz / l);
        }
      }
      P.setY(k, y);
    }
    P.needsUpdate = true; N.needsUpdate = true;
  };
  obj.setLevel = (h) => {
    h = Math.max(0, h);
    mesh.visible = h > floorY + 0.03;
    if (Math.abs(h - obj.level) > 1e-5 || obj.dirty) { obj.level = h; obj.dirty = false; apply(obj.t || 0); }
  };
  obj.setRipple = (amp, t) => {
    obj.t = t;
    if (!mesh.visible) return;
    if (amp > 0 || obj.amp > 0) { obj.amp = amp; apply(t); if (amp === 0) { for (const k of surfIdx) N.setXYZ(k, 0, 1, 0); N.needsUpdate = true; } }
  };
  // a blended body over the refracting water: blue-green tint, bright fresnel rim and surface sheen that survive the Balanced/Fast tiers
  const body = new THREE.Mesh(geo, glassMaterial(engine, { base: 0.16, rim: 0.55, power: 1.6, tint: "#5fc4cf", env: 2.6, ior: 1.33, double: false, roughness: 0.02 }));
  body.renderOrder = 2; body.frustumCulled = false;
  mesh.add(body);
  obj.body = body;
  obj.setLevel(0);
  return obj;
}

// ---------- ice ----------
let _cubeGeo;
function cubeGeometry() {
  if (_cubeGeo) return _cubeGeo;
  const g = new RoundedBoxGeometry(1, 1, 1, 4, 0.1);
  const p = g.attributes.position, r = mulberry(3);
  const jit = new Map();
  for (let i = 0; i < p.count; i++) {   // slightly irregular faces, same offset for coincident vertices
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!jit.has(key)) jit.set(key, [(r() - 0.5) * 0.045, (r() - 0.5) * 0.045, (r() - 0.5) * 0.045]);
    const j = jit.get(key);
    p.setXYZ(i, p.getX(i) + j[0], p.getY(i) + j[1], p.getZ(i) + j[2]);
  }
  g.computeVertexNormals();
  g.userData.shared = true;
  _cubeGeo = g;
  return g;
}

export function makeIce(engine, { radius, floorY = 0.3, cubeSize = 1.8, max = 48 } = {}) {
  const mat = iceMaterial();
  const mesh = new THREE.InstancedMesh(cubeGeometry(), mat, max);
  mesh.count = 0; mesh.frustumCulled = false;
  const rnd = mulberry(21);
  const cubes = Array.from({ length: max }, () => ({ yaw: rnd() * TAU, tiltX: (rnd() - 0.5) * 0.35, tiltZ: (rnd() - 0.5) * 0.35, jx: rnd() - 0.5, jz: rnd() - 0.5, jy: rnd(), sz: 0.9 + rnd() * 0.2, ph: rnd() * TAU }));
  const obj = { mesh, n: 0, solid0: 0, pileHeight: 0, material: mat };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const volOf = (g) => g / 0.917;   // cm³ of ice (density 0.917 g/cm³)
  obj.reset = (grams) => {
    obj.solid0 = grams;
    obj.n = grams > 0.01 ? clamp(Math.round(volOf(grams) / (cubeSize ** 3 * 0.8)), 1, max) : 0;
    mesh.count = obj.n;
  };
  /** state: { solid g, waterLevel cm (surface height, 0 if no liquid), T °C, t s } */
  obj.update = ({ solid, waterLevel = 0, T = -20, t = 0 }) => {
    const n = obj.n;
    if (!n || solid <= 0.001) { mesh.count = 0; obj.pileHeight = 0; obj.base = floorY; obj.top = floorY; return; }
    mesh.count = n;
    // every cube keeps the same share of the remaining volume; they shrink together
    const s = Math.cbrt(volOf(solid) / n / 0.8) * 1.0;
    const pitch = 0.88 * s, layers = Math.ceil(n / 6);
    const pileH = layers * pitch + 0.12 * s;
    obj.pileHeight = pileH;
    const depth = waterLevel - floorY;
    const base = Math.max(floorY, waterLevel - 0.92 * pileH);   // floating: ~92 % sits below the surface (about 8 % above, as ice 0.917 g/cm3 in water)
    const floating = depth > 0.1 && base > floorY + 0.01 ? 1 : 0;
    obj.base = base; obj.top = base + pileH;
    const ring = Math.min(Math.max(1.07 * s, 0.85 + 0.55 * s), Math.max(0.6, radius - 0.78 * s));
    for (let k = 0; k < n; k++) {
      const c = cubes[k], layer = Math.floor(k / 6), slot = k % 6;
      const ang = slot * (TAU / 6) + layer * 0.62;
      const rr = ring;   // a ring of cubes round the thermometer
      const bob = floating ? Math.sin(t * 1.1 + c.ph) * 0.035 : 0;
      const cs = s * c.sz;
      _p.set(Math.cos(ang) * rr + c.jx * 0.18 * s, base + cs * 0.5 + layer * pitch + c.jy * 0.1 * s + bob, Math.sin(ang) * rr + c.jz * 0.18 * s);
      _e.set(c.tiltX, c.yaw + floating * Math.sin(t * 0.25 + c.ph) * 0.25, c.tiltZ);
      _q.setFromEuler(_e);
      _s.setScalar(cs);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(k, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    // frost on cold dry ice, wet gloss once it is at the melting point
    const frost = clamp(-T / 12, 0, 1) * (waterLevel > floorY + 0.1 ? 0.3 : 1);
    mat.roughness = lerp(0.2, 0.55, frost); mat.clearcoat = lerp(0.9, 0.2, frost);
  };
  return obj;
}

// ---------- bubbles ----------
export function makeBubbles(engine, { radius, floorY = 0.3, max = 140 } = {}) {
  const mat = glassMaterial(engine, { base: 0.05, rim: 0.7, power: 1.8, tint: "#ffffff", env: 2.4, ior: 1.2, double: false, roughness: 0.02 });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), mat, max);
  mesh.count = max; mesh.frustumCulled = false; mesh.renderOrder = 2;
  const S = Array.from({ length: max }, () => ({ on: false, x: 0, z: 0, y: 0, r: 0.2, v: 0, ph: 0 }));
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();
  let acc = 0, t = 0;
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < max; i++) mesh.setMatrixAt(i, hide);
  return {
    mesh,
    /** rate: bubbles per second to nucleate; level: surface height; size: base radius (cm) */
    update(dt, { rate = 0, level = 0, size = 0.28 }) {
      t += dt; acc += rate * dt;
      const water = level > floorY + 0.3;
      for (let i = 0; i < max; i++) {
        const b = S[i];
        if (!b.on) {
          if (acc >= 1 && water) {
            acc -= 1; b.on = true;
            const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * (radius - 0.5);
            b.x = Math.cos(a) * rr; b.z = Math.sin(a) * rr; b.y = floorY + 0.05; b.r = size * (0.55 + Math.random() * 0.8); b.v = 0.4 + Math.random() * 0.6; b.ph = Math.random() * TAU;
          } else { if (!water) acc = 0; continue; }
        }
        b.v = Math.min(b.v + dt * 9, 11 + b.r * 6);       // buoyancy against drag: cm/s
        b.y += b.v * dt;
        if (b.y >= level - b.r * 0.4) { b.on = false; mesh.setMatrixAt(i, hide); continue; }
        const grow = 1 + 0.35 * clamp((b.y - floorY) / Math.max(1, level - floorY), 0, 1);   // less pressure near the surface
        const wob = Math.sin(t * 7 + b.ph) * 0.05;
        _p.set(b.x + wob, b.y, b.z + Math.cos(t * 6 + b.ph) * 0.05);
        const r = b.r * grow;
        _s.set(r * (1 + Math.sin(t * 11 + b.ph) * 0.08), r * (1 - Math.sin(t * 11 + b.ph) * 0.08), r);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(i, _m);
      }
      if (acc > 3) acc = 3;
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() { for (let i = 0; i < max; i++) { S[i].on = false; mesh.setMatrixAt(i, hide); } mesh.instanceMatrix.needsUpdate = true; },
  };
}

// ---------- mist ----------
export function makeMist(engine, { radius, n = 90 } = {}) {
  const pos = new Float32Array(n * 3), al = new Float32Array(n), sz = new Float32Array(n);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aAlpha", new THREE.BufferAttribute(al, 1));
  g.setAttribute("aSize", new THREE.BufferAttribute(sz, 1));
  const U = { map: { value: softDot() }, uScale: { value: 900 }, uColor: { value: new THREE.Color("#f4f8fb") } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: `attribute float aAlpha; attribute float aSize; varying float vA; uniform float uScale;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = aAlpha; gl_PointSize = min(aSize * uScale / -mv.z, 220.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uColor; varying float vA;
      void main(){ float a = texture2D(map, gl_PointCoord).a * vA; gl_FragColor = vec4(uColor, a); }`,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false; points.renderOrder = 6;
  const P = Array.from({ length: n }, () => ({ age: 99, life: 4, x: 0, y: 0, z: 0, vx: 0, vy: 4, vz: 0, s0: 1.2, ph: 0 }));
  let acc = 0, t = 0;
  return {
    points,
    /** intensity 0..1 (how much vapour is leaving), level = surface height, rimY = top of the vessel */
    update(dt, { intensity = 0, level = 0, rimY = 9.4 }) {
      t += dt;
      U.uScale.value = (engine.h * engine.renderer.getPixelRatio()) / (2 * Math.tan((engine.camera.fov * Math.PI) / 360));
      acc += dt * 26 * intensity;
      for (let i = 0; i < n; i++) {
        const p = P[i];
        if (p.age >= p.life) {
          if (acc >= 1 && intensity > 0.01) {
            acc -= 1; p.age = 0; p.life = 3 + Math.random() * 2.5;
            const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * (radius - 0.6);
            p.x = Math.cos(a) * rr; p.z = Math.sin(a) * rr; p.y = level + 0.4;
            p.vy = 1.8 + Math.random() * 1.6 + intensity * 1.6; p.vx = (Math.random() - 0.5) * 0.9; p.vz = (Math.random() - 0.5) * 0.9; p.s0 = 1.1 + Math.random() * 1.2; p.ph = Math.random() * TAU;
          } else { al[i] = 0; continue; }
        }
        p.age += dt;
        const k = p.age / p.life;
        p.x += (p.vx + Math.sin(t * 1.3 + p.ph) * 0.7 * k) * dt; p.z += (p.vz + Math.cos(t * 1.1 + p.ph) * 0.7 * k) * dt;
        p.y += p.vy * dt; p.vy *= 1 - 0.22 * dt;
        if (p.y > rimY) { const r = Math.hypot(p.x, p.z) || 1, push = Math.min(1.6, (p.y - rimY) * 0.25) * dt; p.x += (p.x / r) * push; p.z += (p.z / r) * push; }   // spreads out over the rim
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        sz[i] = p.s0 * (0.8 + 2.2 * k);
        al[i] = Math.sin(Math.PI * Math.pow(k, 0.75)) * (0.22 + 0.4 * intensity) * Math.min(1, intensity * 3 + 0.25);
      }
      g.attributes.position.needsUpdate = g.attributes.aAlpha.needsUpdate = g.attributes.aSize.needsUpdate = true;
    },
    clear() { al.fill(0); g.attributes.aAlpha.needsUpdate = true; for (const p of P) p.age = 99; },
  };
}

// ---------- hotplate ----------
export function makeHotplate(engine, { size = 21, height = 4.2, plateR = 8.2, maxW = 250 } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(size, height, size, 4, 0.9), new THREE.MeshPhysicalMaterial({ color: "#2c3237", roughness: 0.46, clearcoat: 0.3, clearcoatRoughness: 0.4, envMapIntensity: 0.9 }));
  body.position.y = height / 2; body.userData.kind = "hotplate";
  group.add(body);
  // brushed aluminium plate: concentric machining marks
  const brushed = canvasTexture(512, 512, (c, w, h) => {
    const rnd = mulberry(5);
    c.fillStyle = "#808080"; c.fillRect(0, 0, w, h);
    for (let r = 4; r < w / 2; r += 1.2) { const v = 110 + Math.floor(rnd() * 70); c.strokeStyle = `rgb(${v},${v},${v})`; c.lineWidth = 1.2; c.beginPath(); c.arc(w / 2, h / 2, r, 0, TAU); c.stroke(); }
  }, { srgb: false });
  const plateMat = new THREE.MeshPhysicalMaterial({ color: "#b9bec3", metalness: 1, roughness: 0.38, roughnessMap: brushed, bumpMap: brushed, bumpScale: 0.25, emissive: new THREE.Color("#ff4d12"), emissiveIntensity: 0, envMapIntensity: 1.1 });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(plateR, plateR + 0.12, 0.55, 72), plateMat);
  plate.position.y = height + 0.1; plate.userData.kind = "hotplate";
  group.add(plate);
  const topY = height + 0.375;
  const ringMat = new THREE.MeshStandardMaterial({ color: "#2a1d18", emissive: new THREE.Color("#ff5a1f"), emissiveIntensity: 0, roughness: 0.5 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(plateR + 0.75, 0.2, 12, 96), ringMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = height + 0.04; ring.userData.kind = "hotplate";
  group.add(ring);
  const frontZ = size / 2;
  // knob
  const knob = new THREE.Group();
  const kb = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.7, 1.3, 40), new THREE.MeshPhysicalMaterial({ color: "#1e2226", roughness: 0.45, clearcoat: 0.3 }));
  kb.rotation.x = Math.PI / 2;
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.1, 0.12), new THREE.MeshStandardMaterial({ color: "#f3f4f5", roughness: 0.4 }));
  mark.position.set(0, 0.55, 0.68);
  knob.add(kb, mark);
  knob.position.set(-5.8, height * 0.46, frontZ + 0.55);
  knob.userData.kind = "hotplate"; kb.userData.kind = "hotplate";
  group.add(knob);
  // dial scale printed around the knob
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    map: canvasTexture(256, 256, (c, w, h) => {
      c.strokeStyle = "#e9edf0"; c.fillStyle = "#e9edf0"; c.lineWidth = 3; c.font = "600 16px Inter, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      for (let i = 0; i <= 10; i++) { const a = (-135 + i * 27) * DEG, x = w / 2 + Math.sin(a) * 100, y = h / 2 - Math.cos(a) * 100, x2 = w / 2 + Math.sin(a) * 114, y2 = h / 2 - Math.cos(a) * 114; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); }
      c.fillText("0", w / 2 - 82, h / 2 + 100); c.fillText("max", w / 2 + 84, h / 2 + 100);
    }),
  }));
  dial.position.set(-5.8, height * 0.46, frontZ + 0.02);
  group.add(dial);
  // LED display
  const dcv = document.createElement("canvas");
  dcv.width = 256; dcv.height = 80;
  const dtex = new THREE.CanvasTexture(dcv); dtex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.9), new THREE.MeshBasicMaterial({ map: dtex, toneMapped: false }));
  screen.position.set(3.2, height * 0.46, frontZ + 0.02);
  group.add(screen);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), new THREE.MeshStandardMaterial({ color: "#222", emissive: new THREE.Color("#ff3b30"), emissiveIntensity: 0 }));
  led.position.set(7.2, height * 0.46, frontZ + 0.1);
  group.add(led);
  const glow = new THREE.PointLight("#ff7a2e", 0, 22, 2);
  glow.position.set(0, height + 1.6, 0);
  group.add(glow);
  const obj = { group, topY, height, size, plateR, maxW, power: 0, plateMat, ringMat };
  obj.setDisplay = (text) => {
    if (obj._disp === text) return;
    obj._disp = text;
    const c = dcv.getContext("2d");
    c.fillStyle = "#1a0c0a"; c.fillRect(0, 0, 256, 80);
    c.font = "700 54px ui-monospace, Menlo, Consolas, monospace"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = "#ff4a2e"; c.shadowColor = "#ff2a10"; c.shadowBlur = 12; c.fillText(text, 128, 42);
    dtex.needsUpdate = true;
  };
  obj.setPower = (W) => {
    obj.power = W;
    const p = clamp(W / maxW, 0, 1);
    plateMat.emissiveIntensity = p * 0.07; ringMat.emissiveIntensity = p * 3.2;
    led.material.emissiveIntensity = W > 0 ? 2.4 : 0;
    glow.intensity = p * 30;
    knob.rotation.z = -(-135 + p * 270) * DEG;
    obj.setDisplay(W > 0 ? `${Math.round(W)} W` : "OFF");
  };
  obj.setPower(0);
  return obj;
}

// ---------- retort stand ----------
export function makeRetortStand({ armLen = 9, clampY = 20, rodH = 34 } = {}) {
  const group = new THREE.Group();
  const iron = new THREE.MeshPhysicalMaterial({ color: "#1b1e21", roughness: 0.5, clearcoat: 0.25, envMapIntensity: 0.8 });
  const steel = new THREE.MeshPhysicalMaterial({ color: "#c7ccd1", metalness: 1, roughness: 0.3, envMapIntensity: 1.3 });
  const base = new THREE.Mesh(new RoundedBoxGeometry(9.5, 1.3, 17, 3, 0.4), iron);
  base.position.set(-3.6, 0.65, 0);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, rodH, 24), steel);
  rod.position.set(-3.6, 1.3 + rodH / 2, 0);
  const boss = new THREE.Mesh(new RoundedBoxGeometry(2.2, 2.4, 2.4, 2, 0.3), steel);
  boss.position.set(-3.6, clampY, 0);
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 16), iron);
  screw.rotation.x = Math.PI / 2; screw.position.set(-3.6, clampY, 1.7);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, armLen + 3.6, 20), steel);
  arm.rotation.z = Math.PI / 2; arm.position.set(-3.6 + (armLen + 3.6) / 2, clampY, 0);
  const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.17, 12, 28), steel);
  jaw.rotation.x = Math.PI / 2; jaw.position.set(armLen, clampY, 0);
  const cork = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.14, 10, 24), new THREE.MeshStandardMaterial({ color: "#b8895a", roughness: 0.9 }));
  cork.rotation.x = Math.PI / 2; cork.position.set(armLen, clampY, 0);
  group.add(base, rod, boss, screw, arm, jaw, cork);
  group.traverse((o) => { if (o.isMesh) o.userData.kind = "stand"; });
  return { group };
}

// ---------- thermometer ----------
function scaleTexture(min, max, step = 2) {
  const W = 128, Hh = 2048;
  return canvasTexture(W, Hh, (c, w, h) => {
    c.fillStyle = "#f7f6f1"; c.fillRect(0, 0, w, h);
    c.fillStyle = "#15191c"; c.strokeStyle = "#15191c"; c.textAlign = "left"; c.textBaseline = "middle";
    const yOf = (T) => h * (1 - (T - min) / (max - min));
    for (let T = Math.ceil(min / step) * step; T <= max; T += step) {
      const ten = T % 10 === 0, five = T % 5 === 0, y = yOf(T);
      c.lineWidth = ten ? 4 : 2.5;
      c.beginPath(); c.moveTo(w * 0.62, y); c.lineTo(w * (ten ? 0.9 : five ? 0.8 : 0.73), y); c.stroke();
      if (T % 20 === 0) { c.font = "700 21px Inter, system-ui, sans-serif"; c.fillText(String(T), 6, y); }
    }
    c.font = "700 18px Inter, system-ui, sans-serif"; c.save(); c.translate(w * 0.5, 22); c.fillText("°C", -24, 0); c.restore();
  }, { aniso: 8 });
}

export function makeThermometer(engine, { min = -30, max = 150, scaleLen = 19, bulbR = 0.42, step = 2 } = {}) {
  const group = new THREE.Group();
  const bulbH = 1.7, base = bulbH - 0.1, topY = base + 1.0 + scaleLen + 1.1;   // scale starts 1 cm above the bulb's neck
  const scaleBase = base + 1.0;
  const pts = [[0, 0.02], ...arcPts(0, bulbR + 0.02, bulbR, -90, 0, 6).slice(1), [bulbR, bulbH - 0.35], [0.27, bulbH + 0.2], [0.27, topY - 0.3], ...arcPts(0, topY - 0.3, 0.27, 0, 90, 6)];
  const gl = new THREE.Mesh(lathe(pts, 32), glassMaterial(engine, { base: 0.05, rim: 0.55, power: 2, env: 2.0 }));
  gl.renderOrder = 4;
  // enamel back with the printed scale, behind the stem (as on a real lab thermometer)
  const enamel = new THREE.Mesh(new THREE.BoxGeometry(0.95, scaleLen + 2.4, 0.06), new THREE.MeshStandardMaterial({ color: "#f7f6f1", roughness: 0.45 }));
  enamel.position.set(0, scaleBase - 0.6 + (scaleLen + 2.4) / 2, -0.3);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.95, scaleLen), new THREE.MeshStandardMaterial({ map: scaleTexture(min, max, step), roughness: 0.45 }));
  strip.position.set(0, scaleBase + scaleLen / 2, -0.268);
  const liquidMat = new THREE.MeshPhysicalMaterial({ color: "#d3202b", roughness: 0.18, clearcoat: 1, emissive: new THREE.Color("#7a0710"), emissiveIntensity: 0.45 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(bulbR * 0.8, 20, 14), liquidMat);
  bulb.position.y = bulbR + 0.04;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 1, 12), liquidMat);   // the thread, scaled in Y
  neck.geometry.translate(0, 0.5, 0);
  neck.position.set(0, bulbR + 0.04, 0);
  const cap = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.07, 10, 24), new THREE.MeshPhysicalMaterial({ color: "#2a2f33", roughness: 0.5 }));
  cap.rotation.x = Math.PI / 2; cap.position.y = topY - 0.45;
  group.add(enamel, strip, bulb, neck, gl, cap);
  group.traverse((o) => { if (o.isMesh) o.userData.kind = "thermometer"; });
  const scaleY = (T) => scaleBase + ((clamp(T, min - 4, max + 2) - min) / (max - min)) * scaleLen;
  const obj = { group, scaleY, min, max, scaleLen, bulbY: bulbR + 0.04, topY, liquidMat };
  obj.setTemp = (T) => { neck.scale.y = Math.max(0.01, scaleY(T) - (bulbR + 0.04)); obj.T = T; };
  obj.setTemp(20);
  return obj;
}

// ---------- stir bar ----------
export function makeStirBar({ len = 3.0, r = 0.42 } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({ color: "#f5f6f6", roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const bar = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - 2 * r, 6, 18), mat);
  cap.rotation.z = Math.PI / 2;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.5, 18), new THREE.MeshStandardMaterial({ color: "#e9ecee", roughness: 0.5 }));
  band.rotation.z = Math.PI / 2;
  bar.add(cap, band);
  bar.userData.kind = "stirbar"; cap.userData.kind = "stirbar"; band.userData.kind = "stirbar";
  const obj = { mesh: bar, spin: 0, r, update(dt) { bar.rotation.y += obj.spin * dt; } };
  return obj;
}

// ---------- cold bath ----------
export function makeColdBath(engine, { dishR = 8.2, dishH = 6.6, innerR = 3.6, level = 3.9 } = {}) {
  const group = new THREE.Group();
  const wall = 0.22, fl = 0.4;
  const pts = [[0, fl], ...arcPts(dishR - 0.7 - wall, fl + 0.7, 0.7, -90, 0, 6), [dishR - wall, dishH - 0.3], ...arcPts(dishR - wall / 2, dishH - 0.15, wall / 2 + 0.06, 180, 0, 8), [dishR + 0.02, dishH - 0.5], [dishR, 0.9], ...arcPts(dishR - 0.9, 0.9, 0.9, 0, -90, 8), [0, 0]];
  const dish = new THREE.Mesh(lathe(pts, 72), glassMaterial(engine));
  dish.renderOrder = 4; dish.userData.kind = "bath";
  group.add(dish);
  // brine: translucent blue annulus between the sample vessel and the dish wall, with a small meniscus at the surface
  const rIn = innerR, rOut = dishR - wall - 0.02;
  const bp = [[rIn, fl + 0.02], [rOut - 0.5, fl + 0.02], ...arcPts(rOut - 0.5, fl + 0.5, 0.5, -90, 0, 5), [rOut, level - 0.2], [rOut - 0.05, level], [rIn + 0.05, level], [rIn, level + 0.05]];
  const brine = new THREE.Mesh(lathe(bp, 64), glassMaterial(engine, { base: 0.22, rim: 0.3, power: 2, tint: "#8fc4de", env: 1.2, double: true }));
  brine.renderOrder = 5; brine.userData.kind = "bath";
  group.add(brine);
  // crushed ice chunks and salt crystals (opaque, instanced)
  const cr = mulberry(33);
  const g = new THREE.IcosahedronGeometry(1, 2);
  const gp = g.attributes.position, v3 = new THREE.Vector3();
  for (let i = 0; i < gp.count; i++) {   // rounded, lumpy chunk: smooth low-frequency bumps, flattened a little
    v3.fromBufferAttribute(gp, i);
    const k = 1 + 0.16 * Math.sin(v3.x * 3.1 + 1.3) * Math.cos(v3.y * 2.7) + 0.12 * Math.sin(v3.z * 3.7 + v3.x * 2.1);
    gp.setXYZ(i, v3.x * k, v3.y * k * 0.78, v3.z * k);
  }
  g.computeVertexNormals();
  const chunkMat = iceMaterial(); chunkMat.roughness = 0.5; chunkMat.clearcoat = 0.25; chunkMat.bumpScale = 0.9;
  const chunks = new THREE.InstancedMesh(g, chunkMat, 230);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  let c = 0;
  while (c < 230) {
    const a = cr() * TAU, rr = rIn + 0.35 + Math.pow(cr(), 0.7) * (rOut - rIn - 0.7), y = fl + 0.3 + cr() * (level - fl + 0.2);
    const sc = 0.22 + Math.pow(cr(), 1.6) * 0.5;
    p.set(Math.cos(a) * rr, Math.min(y, level + 0.05), Math.sin(a) * rr);
    q.setFromEuler(e.set(cr() * TAU, cr() * TAU, cr() * TAU)); s.set(sc * 1.15, sc * 0.85, sc);
    m.compose(p, q, s); chunks.setMatrixAt(c++, m);
  }
  chunks.frustumCulled = false; chunks.userData.kind = "bath";
  group.add(chunks);
  const salt = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: "#fbfbfb", roughness: 0.35 }), 120);
  c = 0;
  while (c < 120) {
    const a = cr() * TAU, rr = rIn + 0.2 + Math.sqrt(cr()) * (rOut - rIn - 0.4);
    p.set(Math.cos(a) * rr, level + 0.04 + cr() * 0.1, Math.sin(a) * rr); q.setFromEuler(e.set(cr() * 3, cr() * 3, cr() * 3)); s.setScalar(0.07 + cr() * 0.09);
    m.compose(p, q, s); salt.setMatrixAt(c++, m);
  }
  salt.userData.kind = "bath"; salt.frustumCulled = false;
  group.add(salt);
  return { group, floorY: fl, level, dish };
}

// ---------- sealed syringe ----------
export function makeSyringe(engine, { Ri = 3.35, H = 24, wall = 0.18, floor = 0.35 } = {}) {
  const Ro = Ri + wall;
  const pts = [[0, floor], ...arcPts(Ri - 0.3, floor + 0.3, 0.3, -90, 0, 5), [Ri, H - 0.3], ...arcPts(Ri + wall / 2, H - 0.12, wall / 2 + 0.05, 180, 0, 6), [Ro + 0.04, H - 0.4], [Ro, H - 0.9], [Ro, 0.5], ...arcPts(Ro - 0.5, 0.5, 0.5, 0, -90, 6), [0, 0]];
  const group = new THREE.Group();
  const glass = new THREE.Mesh(lathe(pts, 72), glassMaterial(engine));
  glass.renderOrder = 4; glass.userData.kind = "syringe";
  group.add(glass);
  // flange and a printed volume scale (cm³ marks every 2 cm of travel are purely a ruler, not the real volume: see the level text)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(Ro + 0.45, 0.28, 12, 56), new THREE.MeshPhysicalMaterial({ color: "#f1f2f3", roughness: 0.4, clearcoat: 0.6 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = H - 0.35; rim.userData.kind = "syringe";
  group.add(rim);
  const rubber = new THREE.MeshPhysicalMaterial({ color: "#16191b", roughness: 0.55, clearcoat: 0.2 });
  const plunger = new THREE.Group();
  const piston = new THREE.Mesh(new THREE.CylinderGeometry(Ri - 0.03, Ri - 0.03, 1.1, 56), rubber);
  piston.position.y = 0.55;
  for (const y of [0.15, 0.95]) { const sealRing = new THREE.Mesh(new THREE.TorusGeometry(Ri - 0.03, 0.12, 8, 56), rubber); sealRing.rotation.x = Math.PI / 2; sealRing.position.y = y; plunger.add(sealRing); }
  const steel = new THREE.MeshPhysicalMaterial({ color: "#c7ccd1", metalness: 1, roughness: 0.3, envMapIntensity: 1.3 });
  const boreX = 0;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 12, 20), steel);
  rod.position.set(1.4, 7.1, 1.0);
  const thumb = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.35, 32), new THREE.MeshPhysicalMaterial({ color: "#dfe3e6", roughness: 0.4 }));
  thumb.position.set(1.4, 13.2, 1.0);
  const grommet = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.14, 10, 20), rubber);
  grommet.rotation.x = Math.PI / 2; grommet.position.set(boreX, 1.1, 0);
  plunger.add(piston, rod, thumb, grommet);
  plunger.traverse((o) => { if (o.isMesh) o.userData.kind = "syringe"; });
  group.add(plunger);
  const obj = { group, glass, plunger, Ri, Ro, H, floorY: floor, rimY: H, boreX };
  obj.setPlunger = (y) => { plunger.position.y = y; };
  obj.setPlunger(floor + 1);
  return obj;
}

// ---------- stopwatch ----------
export function makeTimer() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(8, 2.2, 5.2, 3, 0.55), new THREE.MeshPhysicalMaterial({ color: "#23272b", roughness: 0.4, clearcoat: 0.5 }));
  body.position.y = 1.1; body.userData.kind = "timer";
  const cv = document.createElement("canvas"); cv.width = 320; cv.height = 128;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.6), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.rotation.x = -Math.PI / 2 + 0.0; screen.position.set(0, 2.22, 0); screen.userData.kind = "timer";
  group.add(body, screen);
  const obj = { group };
  obj.setText = (s, sub = "") => {
    if (obj._s === s + sub) return;
    obj._s = s + sub;
    const c = cv.getContext("2d");
    c.fillStyle = "#c9d6c2"; c.fillRect(0, 0, 320, 128);
    c.fillStyle = "#1c241a"; c.font = "700 74px ui-monospace, Menlo, Consolas, monospace"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(s, 160, 56);
    c.font = "600 22px ui-monospace, Menlo, monospace"; c.fillText(sub, 160, 108);
    tex.needsUpdate = true;
  };
  obj.setText("00:00.0");
  return obj;
}
