// States of matter, particle scale: ice, liquid water and water vapour as individual H₂O molecules.
// Driven by the shared heating model (statesModel.js): phase fractions and temperature come ONLY from the model.
//   * With a parent (the apparatus level) the model is read from engine.stack.at(-2).inst.model and advanced here,
//     because the parent's update() is not called while this level is on top (see "Parent contract" below).
//   * Opened on its own (?start=particles) the level makes its own model and shows a small control set.
//
// What the picture does (all molecules are the same size and shape in every state):
//   ICE     molecules sit on the sites of an ice-Ih lattice (a = 4.52 Å, c = 7.37 Å) and vibrate about them.
//           Orientations follow the ice rules (each molecule's two H point at two of its four neighbours).
//   LIQUID  hard spheres 2.9 Å apart (33.4 molecules / nm³) that tumble and slide; a soft "surface" keeps them below
//           the level their number implies (so volume is conserved and the level stays flat when tilted).
//   GAS     free flight in straight lines with elastic collisions, far apart.
//   Counts per state follow the model fractions; molecules cross the boundary one at a time (melting from the lower
//   edge of the ice, boiling from anywhere in the liquid, evaporation from the surface, condensing onto the surface).
//
// Units: 1 unit = 1 Å (metersPerUnit = 1e-10), so the scale bar reads in nm.
//
// Parent contract (for states.js): expose `inst.model`. Optionally `inst.advance(dt)` (steps the model with the
// parent's own time-speed, and may do nothing while the parent's clock is stopped), or numeric `inst.speed` (time-speed
// multiplier, default 40) and boolean `inst.running` (false = clock stopped). Without any of these this level steps the
// model by dt × 40 itself.
import * as THREE from "three";
import * as K from "../../kit.js";
import { glass, softDot, physical } from "../materials.js";
import { createStatesModel, WATER, vapourPressure } from "./statesModel.js";
import * as TXT from "./statesParticlesContent.js";

// ---------- geometry of the box (Å) ----------
const W = 39, D = 17, H = 46;          // inner width (x), depth (z), height (y)
const R = 1.45;                         // half-width of a molecule's envelope (wall clearance)
const DCOL = 2.9;                       // centre-to-centre distance of touching molecules
const N = 256;                          // molecules drawn (8 × 2 × 2 ice cells × 8)
const OH = 0.9572, HOH = (104.52 * Math.PI) / 180;
const RO = 0.86, RH = 0.46;              // drawn sphere radii (smaller than the true electron clouds so the shape reads)
const N_LIQ = 0.0334;                   // liquid water, molecules per Å³ (0.998 g/cm³)
const SIG0 = 7.0;                       // drawn speed per axis at 293.15 K, Å/s (real: 368 m/s)
const REAL_PER_DISP = TXT.sigmaReal(20) / SIG0;   // real m/s per drawn Å/s
const SLOW = REAL_PER_DISP * 1e10;      // how many times slower than real (≈ 5 × 10¹¹)
const A_ICE = 0.2;                      // drawn rms vibration per axis at 273 K, Å (real ≈ 0.1 at −10 °C: drawn about twice, so the order stays obvious)
const OM_ICE = SIG0 / A_ICE;            // vibration angular frequency so rms speed matches the other states
const CS = 3.7;                         // grid cell (≥ link distance)
const GX = Math.ceil((W + 4) / CS), GY = Math.ceil((H + 16) / CS), GZ = Math.ceil((D + 4) / CS);
const ST_ICE = 0, ST_LIQ = 1, ST_GAS = 2, ST_GONE = 3, ST_FRZ = 4;
const F_COND = 1, F_INB = 2, F_RET = 4, F_UP = 8;
const PIV = 14;                         // tilt pivot height
const MAXLINK = 900;

const rnd = Math.random;
const randn = () => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * rnd()); };
const chi3 = () => { const a = randn(), b = randn(), c = randn(); return Math.sqrt(a * a + b * b + c * c); };

// ---------- ice lattice ----------
function buildLattice() {
  const a = 4.52, c = 7.37, s3 = Math.sqrt(3);
  const cols = [];
  const Wx = 8 * a, Hy = 2 * a * s3;
  for (let i = -20; i <= 20; i++) for (let j = -10; j <= 10; j++) {
    for (const [f1, f2, type] of [[1 / 3, 2 / 3, 0], [2 / 3, 1 / 3, 1]]) {
      const x = (i + f1) * a - (j + f2) * a * 0.5, y = (j + f2) * a * s3 * 0.5;   // a1 = (a, 0), a2 = (−a/2, a√3/2): 120° hexagonal cell
      if (x >= -1e-6 && x < Wx - 1e-6 && y >= -1e-6 && y < Hy - 1e-6) cols.push([x, y, type]);
    }
  }
  const pts = [];                       // [x, y(vertical), z(depth)] ; c-axis runs along z so the front view shows the hexagonal rings
  const zA = [1 / 16, 7 / 16], zB = [9 / 16, 15 / 16];
  for (const [x, y, type] of cols) for (let k = 0; k < 2; k++) for (const f of type === 0 ? zA : zB) pts.push([x, y, (f + k) * c]);
  let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9, mny = 1e9;
  for (const p of pts) { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mnz = Math.min(mnz, p[2]); mxz = Math.max(mxz, p[2]); mny = Math.min(mny, p[1]); }
  const n = pts.length;
  const sx = new Float32Array(n), sy = new Float32Array(n), sz = new Float32Array(n);
  pts.forEach((p, i) => { sx[i] = p[0] - (mnx + mxx) / 2; sy[i] = p[1] - mny + R + 0.35; sz[i] = p[2] - (mnz + mxz) / 2; });
  const nbr = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const d = Math.hypot(sx[i] - sx[j], sy[i] - sy[j], sz[i] - sz[j]);
    if (d < 3.3) { nbr[i].push(j); nbr[j].push(i); }
  }
  return { n, sx, sy, sz, nbr };
}

/** Ice rules: orient every molecule so its two hydrogens point at two of its four neighbours (one H per bond). */
function iceOrientations(L) {
  const { n, sx, sy, sz, nbr } = L;
  const donors = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n; i++) for (const j of nbr[i]) if (i < j) (rnd() < 0.5 ? donors[i].add(j) : donors[j].add(i));
  const accepted = (s) => { let k = 0; for (const m of nbr[s]) if (donors[m].has(s)) k++; return k; };
  for (let pass = 0; pass < 400; pass++) {
    let bad = 0;
    for (let s = 0; s < n; s++) {
      while (donors[s].size > 2) { const arr = [...donors[s]]; const d = arr[(rnd() * arr.length) | 0]; donors[s].delete(d); donors[d].add(s); bad++; }
      let acc = accepted(s);
      while (acc > 2) { const arr = nbr[s].filter((m) => donors[m].has(s)); const m = arr[(rnd() * arr.length) | 0]; donors[m].delete(s); donors[s].add(m); acc--; bad++; }
    }
    if (!bad) break;
  }
  const q = new Float32Array(n * 4);
  const u1 = new THREE.Vector3(), u2 = new THREE.Vector3(), t = new THREE.Vector3(), bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
  const mat = new THREE.Matrix4(), qq = new THREE.Quaternion();
  const unit = (out, s, m) => out.set(sx[m] - sx[s], sy[m] - sy[s], sz[m] - sz[s]).normalize();
  for (let s = 0; s < n; s++) {
    const dn = [...donors[s]];
    for (let i = dn.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [dn[i], dn[j]] = [dn[j], dn[i]]; }
    const free = (avoid, ref) => {         // a direction away from all neighbours (boundary molecules)
      let best = null, bs = 1e9;
      for (let k = 0; k < 60; k++) {
        t.set(randn(), randn(), randn()).normalize();
        let m = -1; for (const nb of nbr[s]) { m = Math.max(m, t.dot(unit(by, s, nb))); }
        let sc = m; if (ref) sc += 2.5 * Math.abs(t.dot(ref) + 0.25);
        if (sc < bs) { bs = sc; best = t.clone(); }
      }
      return best;
    };
    if (dn.length >= 1) unit(u1, s, dn[0]); else u1.copy(free(null, null));
    if (dn.length >= 2) unit(u2, s, dn[1]); else u2.copy(free(null, u1));
    bx.copy(u2).sub(u1).normalize(); by.copy(u1).add(u2).normalize(); bz.crossVectors(bx, by).normalize();
    bx.crossVectors(by, bz).normalize();
    mat.makeBasis(bx, by, bz); qq.setFromRotationMatrix(mat);
    q[s * 4] = qq.x; q[s * 4 + 1] = qq.y; q[s * 4 + 2] = qq.z; q[s * 4 + 3] = qq.w;
  }
  return q;
}

// ---------- the level ----------
export function create(engine) {
  const lens = engine.lens;
  const L = (v) => lens.pick(v);
  let level = null;
  let frameTall = false;
  const FOV = 13;
  let prevFov = null;
  const restoreFov = () => { if (prevFov != null) { engine.camera.fov = prevFov; engine.camera.updateProjectionMatrix(); prevFov = null; } };
  const reduced = engine.reducedMotion;

  // ----- lattice and molecule state -----
  const lat = buildLattice();
  const iceQ = iceOrientations(lat);
  const NS = lat.n;                                     // 256 sites = 256 molecules
  const sortedDesc = Array.from({ length: NS }, (_, i) => i).sort((a, b) => lat.sy[b] - lat.sy[a]);
  const siteMol = new Int16Array(NS).fill(-1);
  const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
  const vx = new Float32Array(N), vy = new Float32Array(N), vz = new Float32Array(N);
  const qx = new Float32Array(N), qy = new Float32Array(N), qz = new Float32Array(N), qw = new Float32Array(N).fill(1);
  const wx = new Float32Array(N), wy = new Float32Array(N), wz = new Float32Array(N);
  const st = new Uint8Array(N).fill(ST_GONE);
  const site = new Int16Array(N).fill(-1);
  const flag = new Uint8Array(N);
  const timer = new Float32Array(N), rtimer = new Float32Array(N);
  const spf = new Float32Array(N);
  const off = new Float32Array(N * 3);                  // vibration offset left over from a molecule joining the lattice
  const ph = new Float32Array(N * 7), fr = new Float32Array(N * 2);
  const lax = new Float32Array(N * 3);                  // libration axes
  const sp = new Float32Array(N);                       // smoothed drawn speed (Å/s)
  const lastX = new Float32Array(N), lastY = new Float32Array(N), lastZ = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 7; k++) ph[i * 7 + k] = rnd() * 6.2832;
    fr[i * 2] = 0.8 + 0.45 * rnd(); fr[i * 2 + 1] = 1.7 + 0.6 * rnd();
    const a = randn(), b = randn(), c = randn(), l = Math.hypot(a, b, c) || 1;
    lax[i * 3] = a / l; lax[i * 3 + 1] = b / l; lax[i * 3 + 2] = c / l;
    spf[i] = chi3();
    qw[i] = 1;
  }
  const hidden = new Uint8Array(N).fill(0);

  // ----- scene -----
  const root = new THREE.Group();
  root.userData.isParticles = true;
  const tilt = new THREE.Group(); tilt.position.set(0, PIV, 0);
  const box = new THREE.Group(); box.position.set(0, -PIV, 0);
  tilt.add(box); root.add(tilt);

  const geoO = new THREE.SphereGeometry(RO, 28, 20), geoH = new THREE.SphereGeometry(RH, 20, 14);
  const matO = physical("#ffffff", { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.15, sheenColor: new THREE.Color("#ff9a8f") });
  const matH = physical("#ffffff", { roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.3 });
  const meshO = new THREE.InstancedMesh(geoO, matO, N);
  const meshH = new THREE.InstancedMesh(geoH, matH, N * 2);
  const colO = new THREE.Color(), colH = new THREE.Color();
  for (let i = 0; i < N; i++) {
    colO.set("#d3231a").offsetHSL((rnd() - 0.5) * 0.012, 0, (rnd() - 0.5) * 0.05);
    meshO.setColorAt(i, colO);
    colH.set("#f6f8fc").offsetHSL(0, 0, (rnd() - 0.5) * 0.03);
    meshH.setColorAt(i * 2, colH); meshH.setColorAt(i * 2 + 1, colH);
  }
  for (const m of [meshO, meshH]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); box.add(m); }
  const proxy = new THREE.InstancedMesh(new THREE.SphereGeometry(1.6, 8, 6), new THREE.MeshBasicMaterial({ visible: false }), N);
  proxy.frustumCulled = false; proxy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  proxy.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 20, 0), 120);
  box.add(proxy);

  // attraction links (hydrogen bonds): thin additive cylinders, drawn over the spheres so they read as a diagram layer
  const linkMat = new THREE.MeshBasicMaterial({ color: "#9bebff", transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  const links = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.055, 1, 5, 1, true), linkMat, MAXLINK);
  links.frustumCulled = false; links.count = 0; links.renderOrder = 6; links.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  links.userData.keepMaterial = false;
  box.add(links);

  // container: floor slab, glass panes, edges, piston
  const paneMat = glass("#d6ecff", { rim: "#bfe6ff", rimPower: 2.6, rimStrength: 0.55, minAlpha: 0.015, maxAlpha: 0.42, side: THREE.DoubleSide });
  const paneGeo = [new THREE.PlaneGeometry(W, H), new THREE.PlaneGeometry(D, H)];
  const addPane = (g, x, y, z, ry) => { const m = new THREE.Mesh(g, paneMat); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 4; box.add(m); return m; };
  addPane(paneGeo[0], 0, H / 2, -D / 2, 0); addPane(paneGeo[0], 0, H / 2, D / 2, 0);
  addPane(paneGeo[1], -W / 2, H / 2, 0, Math.PI / 2); addPane(paneGeo[1], W / 2, H / 2, 0, Math.PI / 2);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 3, 2.2, D + 3), physical("#bcd0de", { roughness: 0.18, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 }));
  floor.position.set(0, -1.1, 0); box.add(floor);
  const edgeMat = new THREE.LineBasicMaterial({ color: "#cfe9ff", transparent: true, opacity: 0.5 });
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)), edgeMat);
  edges.position.set(0, H / 2, 0); box.add(edges);
  const piston = new THREE.Group(); piston.visible = false; box.add(piston);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 1.6, D + 1.4), physical("#cfe0ee", { roughness: 0.12, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.8 }));
  plate.position.y = 0.8; piston.add(plate);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 40, 18), physical("#aeb9c4", { metalness: 0.85, roughness: 0.3, clearcoat: 0.4 }));
  rod.position.y = 21.6; piston.add(rod);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 1.6, 24), physical("#8795a3", { metalness: 0.8, roughness: 0.35 }));
  knob.position.y = 42.2; piston.add(knob);

  // selection halo and trail
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: "#ffe28a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1, depthTest: false }));
  halo.scale.setScalar(9); halo.visible = false; halo.renderOrder = 7; box.add(halo);
  const TRAIL = 90;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: "#ffe28a", transparent: true, opacity: 0.8, depthTest: false }));
  trail.frustumCulled = false; trail.renderOrder = 7; box.add(trail);
  let trailN = 0, trailT = 0;

  // ----- model plumbing -----
  let ownModel = null;
  const own = { power: 0, speed: 40 };
  function parentInst() {
    const i = engine.stack.findIndex((s) => s.inst === level);
    const p = i > 0 ? engine.stack[i - 1].inst : (i < 0 ? engine.stack.at(-1)?.inst : null);
    return p && p.model ? p : null;
  }
  function getModel() {
    const p = parentInst();
    if (p) return p.model;
    return (ownModel ||= createStatesModel({ mass: 100, T0: -20 }));
  }
  let model = getModel();
  let hasParent = !!parentInst();

  // ----- physics state -----
  let tt = 0;                              // animation time (s), advances with sim dt
  let Lq = 0, Lt = 0;                      // liquid surface level along "up" (smoothed, target)
  let tiltAng = 0, tiltTarget = 0;         // radians
  let gdx = 0, gdy = -1;                   // gravity unit vector in the box frame
  let plateH = H, plateTarget = H;
  let squeezeS = 0;
  let sel = -1;
  let lastMass0 = -1, lastT = 0, lastContainer = model.container;
  let budget = 0, cosT = 4;
  let cS = 0, cL = 0, cG = 0, cGfree = 0, cIn = 0, topSolid = 0;
  const raw = { s: 0, l: 0, g: 0 };
  const st_ = { followIce: 0, meltN: 0, boilN: 0, followStates: new Set(), gasSqueezed: false, condensedSqueezed: false, tiltLiquid: 0, liqMin: 1e9, liqMax: -1e9, liqSpan: 0 };
  const pairs = new Int16Array(4800);
  let nPairs = 0;
  const head = new Int32Array(GX * GY * GZ), nxt = new Int32Array(N), cellOf = new Int32Array(N);
  const Hb = new Float32Array(N * 6);      // world (box-frame) positions of both hydrogens
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qI = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _zero = new THREE.Vector3(0, 0, 0), _up = new THREE.Vector3(0, 1, 0);
  const HA = new THREE.Vector3(-Math.sin(HOH / 2) * OH, Math.cos(HOH / 2) * OH, 0), HB = new THREE.Vector3(Math.sin(HOH / 2) * OH, Math.cos(HOH / 2) * OH, 0);

  const rawTargets = () => {
    const m = model, mass0 = m.solid + m.liquid + m.gas + m.escaped, k = N / Math.max(1e-9, mass0);
    raw.s = m.solid * k; raw.l = m.liquid * k; raw.g = m.container === "sealed" ? m.gas * k : 0;
    return mass0;
  };
  const Tk = () => Math.max(60, model.T + 273.15);
  const sigma = () => SIG0 * Math.sqrt(Tk() / 293.15) * (reduced ? 0.5 : 1);
  const uOf = (x, y) => -(x * gdx + y * gdy);

  // ----- liquid level for a given molecule count (area below the "up" level in the x–y section) -----
  const poly = new Float64Array(24), poly2 = new Float64Array(24);
  const RECT = [-W / 2, 0, W / 2, 0, W / 2, H, -W / 2, H];
  function areaBelow(Lv) {
    let n = 4; for (let i = 0; i < 8; i++) poly[i] = RECT[i];
    let cur = poly, oth = poly2;
    // clip against u <= Lv  (u = -(x gdx + y gdy))
    let m = 0;
    for (let i = 0; i < n; i++) {
      const ax = cur[i * 2], ay = cur[i * 2 + 1], bx = cur[((i + 1) % n) * 2], by = cur[((i + 1) % n) * 2 + 1];
      const ua = uOf(ax, ay) - Lv, ub = uOf(bx, by) - Lv;
      if (ua <= 0) { oth[m * 2] = ax; oth[m * 2 + 1] = ay; m++; }
      if ((ua <= 0) !== (ub <= 0)) { const t = ua / (ua - ub); oth[m * 2] = ax + (bx - ax) * t; oth[m * 2 + 1] = ay + (by - ay) * t; m++; }
    }
    let a = 0;
    for (let i = 0; i < m; i++) { const j = (i + 1) % m; a += oth[i * 2] * oth[j * 2 + 1] - oth[j * 2] * oth[i * 2 + 1]; }
    return Math.abs(a) / 2;
  }
  function levelFor(count) {
    if (count <= 0) return -2;
    const target = count / (N_LIQ * D);
    let lo = -Math.max(W, H) * 2, hi = Math.max(W, H) * 2;
    for (let it = 0; it < 26; it++) { const mid = (lo + hi) / 2; if (areaBelow(mid) < target) lo = mid; else hi = mid; }
    return Math.max((lo + hi) / 2, count > 0 ? 3.6 : -2);
  }

  // ----- grid / collisions -----
  const cellIdx = (x, y, z) => {
    let cx = Math.floor((x + W / 2 + 2) / CS), cy = Math.floor((y + 2) / CS), cz = Math.floor((z + D / 2 + 2) / CS);
    cx = cx < 0 ? 0 : cx >= GX ? GX - 1 : cx; cy = cy < 0 ? 0 : cy >= GY ? GY - 1 : cy; cz = cz < 0 ? 0 : cz >= GZ ? GZ - 1 : cz;
    return (cz * GY + cy) * GX + cx;
  };
  function collide(posOnly) {
    head.fill(-1);
    for (let i = 0; i < N; i++) {
      if (st[i] === ST_GONE) continue;
      const c = cellIdx(px[i], py[i], pz[i]); cellOf[i] = c; nxt[i] = head[c]; head[c] = i;
    }
    nPairs = 0;
    const DC2 = DCOL * DCOL, LK2 = 3.7 * 3.7;
    for (let i = 0; i < N; i++) {
      if (st[i] === ST_GONE) continue;
      const c = cellOf[i], cx = c % GX, cy = ((c / GX) | 0) % GY, cz = (c / (GX * GY)) | 0;
      for (let dz = -1; dz <= 1; dz++) { const z2 = cz + dz; if (z2 < 0 || z2 >= GZ) continue;
        for (let dy = -1; dy <= 1; dy++) { const y2 = cy + dy; if (y2 < 0 || y2 >= GY) continue;
          for (let dx = -1; dx <= 1; dx++) { const x2 = cx + dx; if (x2 < 0 || x2 >= GX) continue;
            let j = head[(z2 * GY + y2) * GX + x2];
            while (j >= 0) {
              if (j > i) {
                let ddx = px[i] - px[j], ddy = py[i] - py[j], ddz = pz[i] - pz[j];
                const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
                if (d2 < LK2) {
                  if (nPairs < 2400 && st[i] !== ST_GAS && st[j] !== ST_GAS) { pairs[nPairs * 2] = i; pairs[nPairs * 2 + 1] = j; nPairs++; }
                  if (d2 < DC2) resolve(i, j, ddx, ddy, ddz, d2, posOnly);
                }
              }
              j = nxt[j];
            }
          } } }
    }
  }
  function resolve(i, j, dx, dy, dz, d2, posOnly) {
    const si = st[i], sj = st[j];
    if (si === ST_ICE && sj === ST_ICE) return;
    let d = Math.sqrt(d2);
    if (d < 1e-4) { dx = rnd() - 0.5; dy = rnd() - 0.5; dz = rnd() - 0.5; d = Math.hypot(dx, dy, dz) || 1; }
    const nx = dx / d, ny = dy / d, nz = dz / d, ov = DCOL - d;
    if (si === ST_ICE) {
      px[j] -= nx * ov; py[j] -= ny * ov; pz[j] -= nz * ov;
      if (!posOnly) { const vn = vx[j] * nx + vy[j] * ny + vz[j] * nz; if (vn > 0) { vx[j] -= 2 * vn * nx; vy[j] -= 2 * vn * ny; vz[j] -= 2 * vn * nz; } }
    } else if (sj === ST_ICE) {
      px[i] += nx * ov; py[i] += ny * ov; pz[i] += nz * ov;
      if (!posOnly) { const vn = vx[i] * nx + vy[i] * ny + vz[i] * nz; if (vn < 0) { vx[i] -= 2 * vn * nx; vy[i] -= 2 * vn * ny; vz[i] -= 2 * vn * nz; } }
    } else {
      const h = ov / 2;
      px[i] += nx * h; py[i] += ny * h; pz[i] += nz * h; px[j] -= nx * h; py[j] -= ny * h; pz[j] -= nz * h;
      if (!posOnly) {
        const vn = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny + (vz[i] - vz[j]) * nz;
        if (vn < 0) { vx[i] -= vn * nx; vy[i] -= vn * ny; vz[i] -= vn * nz; vx[j] += vn * nx; vy[j] += vn * ny; vz[j] += vn * nz; }
      }
    }
  }

  // ----- placing molecules -----
  function siteXYZ(s, out) { out.set(lat.sx[s], lat.sy[s], lat.sz[s]); return out; }
  function setOrientFromSite(i, s) { qx[i] = iceQ[s * 4]; qy[i] = iceQ[s * 4 + 1]; qz[i] = iceQ[s * 4 + 2]; qw[i] = iceQ[s * 4 + 3]; }
  function randomQuat(i) { _q.set(randn(), randn(), randn(), randn()).normalize(); qx[i] = _q.x; qy[i] = _q.y; qz[i] = _q.z; qw[i] = _q.w; }
  function thermalV(i, mult = 1) {
    const g = sigma() * spf[i] * mult, a = randn(), b = randn(), c = randn(), l = Math.hypot(a, b, c) || 1;
    vx[i] = (a / l) * g; vy[i] = (b / l) * g; vz[i] = (c / l) * g;
  }
  function tumble(i) { const s = 4.2 * Math.sqrt(Tk() / 293.15); wx[i] = randn() * s; wy[i] = randn() * s; wz[i] = randn() * s; }

  function syncInstant() {
    const mass0 = rawTargets();
    lastMass0 = mass0; lastT = model.t; lastContainer = model.container;
    const sealed = model.container === "sealed";
    let tS = Math.round(raw.s), tL = Math.round(raw.l), tG = sealed ? Math.round(raw.g) : 0;
    if (tS + tL + tG > N) tL = N - tS - tG;
    siteMol.fill(-1);
    st.fill(ST_GONE); flag.fill(0); site.fill(-1);
    let k = 0;
    for (let n = 0; n < tS; n++, k++) {
      const s = sortedDesc[n]; siteMol[s] = k; st[k] = ST_ICE; site[k] = s;
      px[k] = lat.sx[s]; py[k] = lat.sy[s]; pz[k] = lat.sz[s]; setOrientFromSite(k, s);
    }
    cL = tL; Lq = Lt = levelFor(tL);
    const first = k;
    for (let n = 0; n < tL; n++, k++) {
      st[k] = ST_LIQ;
      for (let tries = 0; tries < 40; tries++) {
        px[k] = (rnd() - 0.5) * (W - 2 * R); pz[k] = (rnd() - 0.5) * (D - 2 * R); py[k] = R + rnd() * Math.max(0.2, Lq - R);
        if (uOf(px[k], py[k]) <= Lq) break;
      }
      randomQuat(k); thermalV(k); tumble(k);
    }
    for (let n = 0; n < tG; n++, k++) {
      st[k] = ST_GAS;
      px[k] = (rnd() - 0.5) * (W - 2 * R); pz[k] = (rnd() - 0.5) * (D - 2 * R); py[k] = Math.max(Lq + 3, R) + rnd() * (H - Math.max(Lq + 3, R) - R);
      randomQuat(k); thermalV(k); tumble(k);
    }
    for (let it = 0; it < 40; it++) { collide(true); wallsAll(); }
    for (let i = 0; i < N; i++) { lastX[i] = px[i]; lastY[i] = py[i]; lastZ[i] = pz[i]; sp[i] = 0; }
    sel = -1; trailN = 0;
    budget = 0;
  }

  // ----- walls -----
  const topY = () => (plateOn() ? plateH : (model.container === "sealed" ? H : 1e9));
  const plateOn = () => model.container === "sealed" || squeezeS > 0.004;
  function wallsAll() {
    const top = topY();
    for (let i = 0; i < N; i++) {
      const s = st[i]; if (s === ST_ICE || s === ST_GONE) continue;
      wall(i, top);
    }
  }
  function wall(i, top) {
    const x0 = -W / 2 + R, x1 = W / 2 - R, z0 = -D / 2 + R, z1 = D / 2 - R;
    if (py[i] < H - 1) {
      if (px[i] < x0) { px[i] = x0; vx[i] = Math.abs(vx[i]); } else if (px[i] > x1) { px[i] = x1; vx[i] = -Math.abs(vx[i]); }
      if (pz[i] < z0) { pz[i] = z0; vz[i] = Math.abs(vz[i]); } else if (pz[i] > z1) { pz[i] = z1; vz[i] = -Math.abs(vz[i]); }
    }
    if (py[i] < R) { py[i] = R; vy[i] = Math.abs(vy[i]); }
    if (top < 1e8 && py[i] > top - R) { py[i] = top - R; vy[i] = -Math.abs(vy[i]); }
  }

  // ----- state changes -----
  const _a = new THREE.Vector3();
  function meltOne() {
    let best = -1, bs = -1e9;
    for (let s = 0; s < NS; s++) {
      if (siteMol[s] < 0 || st[siteMol[s]] !== ST_ICE) continue;
      let vac = lat.sy[s] < R + 1.0 ? 1.6 : 0;
      for (const m of lat.nbr[s]) if (siteMol[m] < 0 || st[siteMol[m]] !== ST_ICE) vac++;
      const sc = vac + rnd() * 0.9 - lat.sy[s] * 0.01;
      if (sc > bs) { bs = sc; best = s; }
    }
    if (best < 0) return false;
    const i = siteMol[best]; siteMol[best] = -1; site[i] = -1; st[i] = ST_LIQ; flag[i] = 0;
    thermalV(i); tumble(i); st_.meltN++; cS--; cL++;
    return true;
  }
  function freezeOne() {
    let best = -1, bs = -1e9;
    for (let s = 0; s < NS; s++) {
      if (siteMol[s] >= 0) continue;
      let occ = 0; for (const m of lat.nbr[s]) if (siteMol[m] >= 0) occ++;
      const sc = occ + rnd() * 0.9 + (lat.sy[s] / 18) * 0.35;
      if (sc > bs) { bs = sc; best = s; }
    }
    if (best < 0) return false;
    siteXYZ(best, _a);
    let bi = -1, bd = 1e12;
    for (let pass = 0; pass < 2 && bi < 0; pass++) {       // liquid first, then a vapour molecule that evaporated earlier
      for (let i = 0; i < N; i++) {
        if (pass === 0 ? st[i] !== ST_LIQ : (st[i] !== ST_GAS || (flag[i] & F_INB))) continue;
        const d = (px[i] - _a.x) ** 2 + (py[i] - _a.y) ** 2 + (pz[i] - _a.z) ** 2;
        if (d < bd) { bd = d; bi = i; }
      }
    }
    if (bi < 0) {                                           // everything is in the lattice but one that left the open beaker: it comes back
      for (let i = 0; i < N; i++) if (st[i] === ST_GONE) { bi = i; break; }
      if (bi < 0) return false;
      px[bi] = _a.x; py[bi] = H + 2; pz[bi] = _a.z; randomQuat(bi); vx[bi] = vy[bi] = vz[bi] = 0;
    }
    if (st[bi] === ST_LIQ) cL--; else if (st[bi] === ST_GAS && !(flag[bi] & F_COND)) cGfree--;
    st[bi] = ST_FRZ; site[bi] = best; siteMol[best] = bi; flag[bi] = 0; cS++;
    return true;
  }
  let lastLaunched = -1;
  function evapOne(boil) {
    let best = -1, bs = -1e9;
    for (let i = 0; i < N; i++) {
      if (st[i] !== ST_LIQ) continue;
      const sc = boil ? rnd() : uOf(px[i], py[i]) + sp[i] * 0.08 + rnd() * 0.6;
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best < 0) return false;
    launch(best, boil);
    lastLaunched = best; cL--; cGfree++;
    if (boil) st_.boilN++;
    return true;
  }
  function launch(i, boil) {
    st[i] = ST_GAS; flag[i] = F_UP; timer[i] = boil ? 0.9 : 0.35;
    spf[i] = Math.max(spf[i], 1.7);
    thermalV(i, 1.05);
    const sp0 = Math.hypot(vx[i], vy[i], vz[i]);
    vx[i] = vx[i] * 0.4 - gdx * sp0 * 0.9; vy[i] = vy[i] * 0.4 - gdy * sp0 * 0.9; vz[i] *= 0.4;
    tumble(i);
  }
  function condenseOne() {
    let best = -1, bu = 1e9;
    for (let i = 0; i < N; i++) {
      if (st[i] !== ST_GAS || (flag[i] & (F_COND | F_UP))) continue;
      const u = uOf(px[i], py[i]);
      if (u < bu) { bu = u; best = i; }
    }
    if (best < 0) return false;
    flag[best] |= F_COND; cGfree--;
    return true;
  }
  function inboundOne() {
    let g = -1;
    for (let i = 0; i < N; i++) if (st[i] === ST_GONE) { g = i; break; }
    if (g < 0) return false;
    st[g] = ST_GAS; flag[g] = F_INB;
    px[g] = (rnd() - 0.5) * (W - 3); pz[g] = (rnd() - 0.5) * (D - 3); py[g] = H + 3 + rnd() * 2;
    thermalV(g); vy[g] = -Math.abs(vy[g]) - 4; randomQuat(g); tumble(g);
    return true;
  }
  function reconcile(dt) {
    budget = Math.min(8, budget + dt * 110);
    const sealed = model.container === "sealed", boiling = model.phaseChange === "boiling";
    let guard = 0;
    while (budget >= 1 && guard++ < 12) {
      let did = false;
      const dS = cS - raw.s;
      if (dS > 0.75) did = meltOne();
      else if (dS < -0.75 && cL > 0) did = freezeOne();
      if (!did && sealed) {
        const dG = cGfree - raw.g;
        if (dG > 0.75) did = condenseOne();
        else if (dG < -0.75 && cL > 0) did = evapOne(boiling);
      }
      if (!did && !sealed) {
        const dL = cL - raw.l, thr = raw.l < 3 ? 0.6 : 1.5;
        if (dL > thr) did = evapOne(boiling);
        else if (dL < -thr) did = inboundOne();
      }
      if (!did) break;
      budget -= 1;
    }
    // a few of the fastest surface molecules escape even below boiling (evaporation), and some come back
    if (cL > 12 && model.liquid > 0 && model.T > 0.5 && model.T < WATER.bp - 1.5) {
      cosT -= dt;
      if (cosT <= 0) {
        const lam = 0.05 + 1.3 * vapourPressure(model.T) / vapourPressure(100);
        cosT = -Math.log(1 - rnd() * 0.999) / lam;
        if (evapOne(false) && rnd() < 0.55) { flag[lastLaunched] |= F_RET; rtimer[lastLaunched] = 1.2 + 2.5 * rnd(); }
      }
    }
  }

  // ----- per-frame physics -----
  function step(dt) {
    tt += dt;
    const sig = sigma(), Tkv = Tk();
    const Aice = A_ICE * Math.sqrt(Tkv / 273.15) * (reduced ? 0.5 : 1);
    const lib = 0.07 * Math.sqrt(Tkv / 273.15);
    const sealed = model.container === "sealed", top = topY(), open = !plateOn() && !sealed;
    const kExp = Math.exp(-dt / 0.2);
    const gG = 12;
    cS = cL = cG = cGfree = cIn = 0; topSolid = 0;
    for (let i = 0; i < N; i++) {
      const s = st[i];
      if (s === ST_GONE) continue;
      cIn++;
      if (s === ST_ICE || s === ST_FRZ) { cS++; }
      if (s === ST_LIQ) cL++;
      if (s === ST_GAS) { cG++; if (!(flag[i] & (F_COND | F_INB))) cGfree++; }
    }
    // liquid surface level
    Lt = levelFor(cL);
    Lq += (Lt - Lq) * Math.min(1, dt * 8);
    const kl = 260;
    for (let i = 0; i < N; i++) {
      const s = st[i];
      if (s === ST_GONE) continue;
      if (s === ST_ICE) {
        const o = i * 7, f = i * 2, ss = site[i];
        const w1 = OM_ICE * fr[f], w2 = OM_ICE * fr[f + 1];
        const k = Aice / 0.884;
        off[i * 3] *= kExp; off[i * 3 + 1] *= kExp; off[i * 3 + 2] *= kExp;
        px[i] = lat.sx[ss] + k * (Math.sin(w1 * tt + ph[o]) + 0.75 * Math.sin(w2 * tt + ph[o + 3])) + off[i * 3];
        py[i] = lat.sy[ss] + k * (Math.sin(w1 * tt + ph[o + 1]) + 0.75 * Math.sin(w2 * tt + ph[o + 4])) + off[i * 3 + 1];
        pz[i] = lat.sz[ss] + k * (Math.sin(w1 * tt + ph[o + 2]) + 0.75 * Math.sin(w2 * tt + ph[o + 5])) + off[i * 3 + 2];
        // libration: a small rocking of the molecule about its ice orientation
        const ang = lib * Math.sin(OM_ICE * 0.9 * fr[f] * tt + ph[o + 6]);
        _q.set(iceQ[ss * 4], iceQ[ss * 4 + 1], iceQ[ss * 4 + 2], iceQ[ss * 4 + 3]);
        _v.set(lax[i * 3], lax[i * 3 + 1], lax[i * 3 + 2]);
        _q2.setFromAxisAngle(_v, ang); _q.premultiply(_q2);
        qx[i] = _q.x; qy[i] = _q.y; qz[i] = _q.z; qw[i] = _q.w;
        continue;
      }
      if (s === ST_FRZ) {
        const ss = site[i];
        const dx = lat.sx[ss] - px[i], dy = lat.sy[ss] - py[i], dz = lat.sz[ss] - pz[i], d = Math.hypot(dx, dy, dz);
        if (d < 0.5) {
          st[i] = ST_ICE; off[i * 3] = px[i] - lat.sx[ss]; off[i * 3 + 1] = py[i] - lat.sy[ss]; off[i * 3 + 2] = pz[i] - lat.sz[ss];
          continue;
        }
        const spd = Math.min(d * 5 + 4, 22) * dt / d;
        px[i] += dx * spd; py[i] += dy * spd; pz[i] += dz * spd;
        _q.set(qx[i], qy[i], qz[i], qw[i]); _q2.set(iceQ[ss * 4], iceQ[ss * 4 + 1], iceQ[ss * 4 + 2], iceQ[ss * 4 + 3]);
        _q.slerp(_q2, 1 - Math.exp(-dt * 4)); qx[i] = _q.x; qy[i] = _q.y; qz[i] = _q.z; qw[i] = _q.w;
        continue;
      }
      // free molecules
      if (rnd() < dt / 0.5) spf[i] = chi3();
      if (s === ST_LIQ) {
        vx[i] += gdx * gG * dt; vy[i] += gdy * gG * dt;
        const u = uOf(px[i], py[i]);
        if (u > Lq) { const a = kl * (u - Lq) * dt; vx[i] += gdx * a; vy[i] += gdy * a; }
        // Langevin kicks and relaxation of the speed towards this molecule's share of the thermal energy
        vx[i] += randn() * sig * 1.2 * Math.sqrt(dt); vy[i] += randn() * sig * 1.2 * Math.sqrt(dt); vz[i] += randn() * sig * 1.2 * Math.sqrt(dt);
        const v = Math.hypot(vx[i], vy[i], vz[i]) || 1e-6, tgt = sig * spf[i], nv = v + (tgt - v) * (1 - Math.exp(-dt / 0.28));
        const sc = nv / v; vx[i] *= sc; vy[i] *= sc; vz[i] *= sc;
        // orientation: random walk of the spin
        const wmax = 6.5 * Math.sqrt(Tkv / 293.15);
        wx[i] += randn() * 9 * Math.sqrt(dt); wy[i] += randn() * 9 * Math.sqrt(dt); wz[i] += randn() * 9 * Math.sqrt(dt);
        const wl = Math.hypot(wx[i], wy[i], wz[i]); if (wl > wmax) { const k = wmax / wl; wx[i] *= k; wy[i] *= k; wz[i] *= k; }
      } else {   // gas
        const f = flag[i];
        if (f & F_UP) { timer[i] -= dt; vx[i] -= gdx * 38 * dt; vy[i] -= gdy * 38 * dt; if (timer[i] <= 0) flag[i] &= ~F_UP; }
        if (f & F_COND) { vx[i] += gdx * 40 * dt; vy[i] += gdy * 40 * dt; }
        else if (f & F_RET) { rtimer[i] -= dt; if (rtimer[i] <= 0) flag[i] = (flag[i] & ~F_RET) | F_COND; }
        if (!(f & (F_UP | F_COND | F_INB))) {
          const u = uOf(px[i], py[i]);
          if (u < Lq + 0.5 && Lq > 0) { const a = 70 * (Lq + 0.5 - u) * dt; vx[i] -= gdx * a; vy[i] -= gdy * a; }
        }
        if (open && py[i] > H - 3 && !(f & F_INB)) vy[i] += 16 * dt;
        const v = Math.hypot(vx[i], vy[i], vz[i]) || 1e-6, tgt = sig * spf[i];
        if (!(f & (F_COND | F_UP))) { const nv = v + (tgt - v) * (1 - Math.exp(-dt / 3)); const sc = nv / v; vx[i] *= sc; vy[i] *= sc; vz[i] *= sc; }
      }
      px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
      // spin
      const wl = Math.hypot(wx[i], wy[i], wz[i]);
      if (wl > 1e-5) {
        _v.set(wx[i] / wl, wy[i] / wl, wz[i] / wl); _q2.setFromAxisAngle(_v, wl * dt);
        _q.set(qx[i], qy[i], qz[i], qw[i]).premultiply(_q2).normalize();
        qx[i] = _q.x; qy[i] = _q.y; qz[i] = _q.z; qw[i] = _q.w;
      }
    }
    collide(false);
    for (let i = 0; i < N; i++) {
      const s = st[i];
      if (s === ST_LIQ || s === ST_GAS || s === ST_FRZ) {
        wall(i, top);
        if (s === ST_GAS) {
          const f = flag[i];
          if (py[i] > H + 9 && !(f & F_INB)) { st[i] = ST_GONE; flag[i] = 0; if (sel === i) sel = -1; continue; }
          if ((f & (F_COND | F_INB)) && !(f & F_UP) && uOf(px[i], py[i]) <= Lq + 1.2) {
            st[i] = ST_LIQ; flag[i] = 0; thermalV(i, 0.7); tumble(i); st_.condN = (st_.condN || 0) + 1;
          }
          if ((f & F_INB) && py[i] < H - 2) flag[i] = (f & ~F_INB) | F_COND;
        }
      }
    }
    reconcile(dt);
    // top of the condensed matter (for the piston stop)
    topSolid = 0;
    for (let i = 0; i < N; i++) { const s = st[i]; if (s === ST_ICE || s === ST_LIQ || s === ST_FRZ) { const y = uOf(px[i], py[i]); if (y > topSolid) topSolid = y; } }
    // speeds (smoothed) for the selected molecule readout and the trail
    if (sel >= 0 && dt > 0) {
      const d = Math.hypot(px[sel] - lastX[sel], py[sel] - lastY[sel], pz[sel] - lastZ[sel]) / dt;
      sp[sel] += (d - sp[sel]) * Math.min(1, dt * 6);
    }
    for (let i = 0; i < N; i++) {
      if (st[i] === ST_LIQ || st[i] === ST_GAS) sp[i] = Math.hypot(vx[i], vy[i], vz[i]);
      lastX[i] = px[i]; lastY[i] = py[i]; lastZ[i] = pz[i];
    }
  }

  // ----- rendering of molecules -----
  function writeMolecules() {
    for (let i = 0; i < N; i++) {
      if (st[i] === ST_GONE) {
        if (!hidden[i]) { hidden[i] = 1; _m.makeScale(0, 0, 0); meshO.setMatrixAt(i, _m); meshH.setMatrixAt(i * 2, _m); meshH.setMatrixAt(i * 2 + 1, _m); proxy.setMatrixAt(i, _m); }
        continue;
      }
      hidden[i] = 0;
      _q.set(qx[i], qy[i], qz[i], qw[i]);
      _v.copy(HA).applyQuaternion(_q); const h1x = px[i] + _v.x, h1y = py[i] + _v.y, h1z = pz[i] + _v.z;
      _v.copy(HB).applyQuaternion(_q); const h2x = px[i] + _v.x, h2y = py[i] + _v.y, h2z = pz[i] + _v.z;
      Hb[i * 6] = h1x; Hb[i * 6 + 1] = h1y; Hb[i * 6 + 2] = h1z; Hb[i * 6 + 3] = h2x; Hb[i * 6 + 4] = h2y; Hb[i * 6 + 5] = h2z;
      _m.makeTranslation(px[i], py[i], pz[i]); meshO.setMatrixAt(i, _m); proxy.setMatrixAt(i, _m);
      _m.makeTranslation(h1x, h1y, h1z); meshH.setMatrixAt(i * 2, _m);
      _m.makeTranslation(h2x, h2y, h2z); meshH.setMatrixAt(i * 2 + 1, _m);
    }
    meshO.instanceMatrix.needsUpdate = true; meshH.instanceMatrix.needsUpdate = true; proxy.instanceMatrix.needsUpdate = true;
  }
  let showLinks = true;
  function writeLinks() {
    let n = 0;
    if (showLinks) {
      for (let p = 0; p < nPairs && n < MAXLINK; p++) {
        const a0 = pairs[p * 2], b0 = pairs[p * 2 + 1];
        for (let side = 0; side < 2; side++) {
          const a = side ? b0 : a0, b = side ? a0 : b0;
          for (let h = 0; h < 2 && n < MAXLINK; h++) {
            const hx = Hb[a * 6 + h * 3], hy = Hb[a * 6 + h * 3 + 1], hz = Hb[a * 6 + h * 3 + 2];
            const rx = px[b] - hx, ry = py[b] - hy, rz = pz[b] - hz, l2 = rx * rx + ry * ry + rz * rz;
            if (l2 > 6.0 || l2 < 1.0) continue;
            const ox = hx - px[a], oy = hy - py[a], oz = hz - pz[a], l = Math.sqrt(l2);
            const cos = (ox * rx + oy * ry + oz * rz) / (OH * l);
            if (cos < 0.55) continue;
            _v.set(rx / l, ry / l, rz / l);
            _q.setFromUnitVectors(_up, _v);
            _m.compose(_v2.set(hx + rx * 0.5, hy + ry * 0.5, hz + rz * 0.5), _q, _v3.set(1, l, 1));
            links.setMatrixAt(n++, _m);
          }
        }
      }
    }
    links.count = n; links.instanceMatrix.needsUpdate = true;
    linkCount = n;
  }
  let linkCount = 0;

  // ----- panel, chips, labels -----
  const panel = document.createElement("div"); panel.style.display = "contents";
  const overlay = document.createElement("div"); overlay.style.display = "contents";
  const labelLayer = document.createElement("div"); labelLayer.style.display = "contents";
  if (!document.getElementById("pt-css")) {
    const css = document.createElement("style"); css.id = "pt-css";
    css.textContent = "@media (max-width: 700px) { .pt-chip .w { display: none; } .pt-chip { font-size: 0.74rem; } }";
    document.head.appendChild(css);
  }
  const chipState = K.chip(overlay), chipStateEl = overlay.lastChild;
  const chipSpeed = K.chip(overlay);
  const chipSel = K.chip(overlay), chipSelEl = overlay.lastChild;
  for (const c of overlay.children) c.classList.add("pt-chip");
  chipSelEl.style.display = "none";
  const done = new Set();
  const W_ = {};                           // widgets rebuilt with the panel
  let uiT = 0, explT = 0;
  let missionItems = [], missionFill = null;

  const mkLabel = (cls, html) => { const el = engine.label(html || "", cls); labelLayer.appendChild(el); return el; };
  const lblIce = mkLabel("org"), lblLiq = mkLabel("org"), lblGas = mkLabel("org"), lblTop = mkLabel("org"), lblSize = mkLabel("org");
  const labels = [lblIce, lblLiq, lblGas, lblTop, lblSize];
  const setHTML = (el, h) => { if (el._h !== h) { el.innerHTML = h; el._h = h; } };

  const _lp = new THREE.Vector3(), _cx = new Float32Array(10), _cy = new Float32Array(10), _cw = new Float32Array(10), _ch = new Float32Array(10);
  let _cn = 0;
  function chipFloor() { const ov = engine.overlay; return ov && ov.firstChild && engine.w < 700 ? ov.offsetTop + ov.offsetHeight + 14 : -1e9; }
  function placeLabel(el, v, dx, dy, minY) {
    _lp.copy(v).project(engine.camera);
    if (_lp.z > 1 || _lp.z < -1) { el.style.display = "none"; return; }
    el.style.display = "";
    let x = (_lp.x * 0.5 + 0.5) * engine.w + dx, y = (-_lp.y * 0.5 + 0.5) * engine.h + dy;
    const w = el.offsetWidth || 100, h = el.offsetHeight || 22;
    if (minY > -1e8) {
      x = Math.min(engine.w - w / 2 - 6, Math.max(w / 2 + 6, x));
      if (y - h / 2 < minY) y = minY + h / 2;
      for (let pass = 0; pass < 3; pass++) for (let i = 0; i < _cn; i++) if (Math.abs(x - _cx[i]) < (w + _cw[i]) / 2 + 6 && Math.abs(y - _cy[i]) < (h + _ch[i]) / 2 + 3) y = _cy[i] + (h + _ch[i]) / 2 + 3;
    }
    if (_cn < 10) { _cx[_cn] = x; _cy[_cn] = y; _cw[_cn] = w; _ch[_cn++] = h; }
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
  const lw = new THREE.Vector3();
  function updateLabels(narrow) {
    const floorY = chipFloor(); _cn = 0;
    box.updateWorldMatrix(true, false);
    // region centroids (box frame)
    let ni = 0, nl = 0, ng = 0, yi = 0, yl = 0, yg = 0;
    for (let i = 0; i < N; i++) {
      const s = st[i];
      if (s === ST_ICE || s === ST_FRZ) { ni++; yi += py[i]; } else if (s === ST_LIQ) { nl++; yl += py[i]; } else if (s === ST_GAS) { ng++; yg += py[i]; }
    }
    const show = (el, n, y, html, xoff, minN = 6) => {
      if (n < minN) { el.style.display = "none"; return; }
      setHTML(el, html);
      lw.set(W / 2 + xoff, y / n, 0); box.localToWorld(lw);
      placeLabel(el, lw, narrow ? -4 : 4, 0, floorY);
    };
    const sealed = model.container === "sealed";
    const ex = narrow ? -4 : 6;
    show(lblIce, ni, yi, `Solid (ice)<small>vibrating about fixed positions</small>`, ex);
    show(lblLiq, nl, yl, `Liquid<small>touching, sliding past each other</small>`, ex);
    show(lblGas, ng, Math.max(yg, ng * (Lq + 14)), `Gas<small>far apart, flying freely</small>`, ex, 4);
    const piston_ = plateOn();
    setHTML(lblTop, piston_ ? `Piston<small>${sealed ? "sealed: nothing can escape" : "pushed in for the squeeze test"}</small>` : `Open to the air<small>vapour can escape</small>`);
    lw.set(W / 2 + ex, piston_ ? plateH + 1 : H, 0); box.localToWorld(lw);
    placeLabel(lblTop, lw, narrow ? -4 : 4, 0, floorY);
    setHTML(lblSize, `One water molecule<small>about 0.28 nm across, in every state</small>`);
    lw.set(-W / 2 + 12, H - 3, D / 2); box.localToWorld(lw);
    placeLabel(lblSize, lw, 0, narrow ? 24 : 12, floorY);
  }

  // ----- the build of the panel -----
  const wordFor = (s) => (s === ST_ICE ? "solid (ice)" : s === ST_FRZ ? "joining the ice" : s === ST_LIQ ? "liquid" : "gas");
  const stateWord = (s) => (s === ST_ICE || s === ST_FRZ ? "solid" : s === ST_LIQ ? "liquid" : "gas");
  const unitsId = () => "p" + Math.random().toString(36).slice(2, 7);

  function buildPanel() {
    panel.replaceChildren();
    const about = K.card(panel, "What you are looking at");
    about.insertAdjacentHTML("beforeend", `<p>A thin slice through the water in the beaker, magnified tens of millions of times. Each <strong>red ball with two white bumps</strong> is one water molecule (H₂O): one oxygen and two hydrogens. The thin dotted lines are the attractions between neighbouring molecules.</p><p class="hint">Click a molecule to follow it. Drag to look around; scroll to zoom. The molecules never change size.</p>`);
    const vr = K.buttonRow(about);
    const fly = (dir) => { const v = level.view, t = v.target; engine.fly(t, t.clone().addScaledVector(dir.normalize(), v.distance), 0.9); };
    K.button(vr, "View down the channels", () => fly(new THREE.Vector3(0, 0, 1)));
    K.button(vr, "Angled view", () => fly(new THREE.Vector3(0.45, 0.3, 1)));
    about.insertAdjacentHTML("beforeend", `<p class="hint">Looking along the ice crystal's long axis you see the open <strong>hexagonal rings</strong>. Water takes up more room as ice than as liquid because of these gaps, so ice floats.</p>`);
    W_.showLinks = K.checkbox(about, L({ y7: "Show attractions between molecules (dotted lines)", ext: "Show hydrogen bonds (intermolecular attractions)" }), showLinks, (v) => { showLinks = v; });

    const explain = K.card(panel, "What's happening", "explain");
    W_.explain = document.createElement("div"); explain.appendChild(W_.explain);

    // controls
    const ctl = K.card(panel, hasParent ? "Heating" : "Heat and cool");
    W_.ctl = ctl;
    if (hasParent) {
      ctl.insertAdjacentHTML("beforeend", `<p>The hotplate, cold bath and time speed are controlled in the beaker. The temperature and amounts of ice, liquid and gas here come straight from that beaker.</p>`);
      const r = K.buttonRow(ctl);
      K.button(r, "↑ Back to the beaker", () => engine.up(), { kind: "primary" });
      W_.ownCtl = null;
    } else {
      const m = model;
      W_.power = K.slider(ctl, { label: "Hotplate power", min: 0, max: 250, step: 5, value: own.power, unit: " W", onInput: (v) => { own.power = v; model.power = v; } });
      W_.bath = K.checkbox(ctl, "Cold bath (−15 °C)", m.bath != null, (v) => { model.bath = v ? -15 : null; });
      W_.speed = K.segmented(ctl, [{ value: 10, label: "10×" }, { value: 40, label: "40×" }, { value: 120, label: "120×" }], own.speed, (v) => { own.speed = v; });
      ctl.insertAdjacentHTML("beforeend", `<p class="hint">Time speed: how many simulated seconds pass each second.</p>`);
      W_.container = K.segmented(ctl, [{ value: "open", label: "Open beaker" }, { value: "sealed", label: "Sealed syringe" }], m.container, (v) => { model.reset({ container: v, T0: -20 }); own.power = 0; W_.power.value = 0; model.power = 0; });
      const r = K.buttonRow(ctl);
      const start = (label, o) => K.button(r, label, () => { model.reset(o); model.power = own.power; W_.container.set(model.container); });
      start("Start: ice −20 °C", { T0: -20 });
      start("Start: water 20 °C", { T0: 20 });
      start("Start: steam 110 °C", { container: "sealed", T0: 110 });
    }

    // selected molecule
    W_.selCard = K.card(panel, "Selected molecule"); W_.selCard.style.display = sel >= 0 ? "" : "none";
    W_.selBody = document.createElement("div"); W_.selCard.appendChild(W_.selBody);

    // test the state (4.1.4)
    const test = K.card(panel, "Test the state");
    test.insertAdjacentHTML("beforeend", `<p>Properties of solids, liquids and gases come from how the particles are arranged. Try these on whatever is in the box now.</p>`);
    test.insertAdjacentHTML("beforeend", `<p class="hint">This is an illustrative test of the gaps between particles at constant temperature. It is separate from the heating model: it does not change the temperature or the amounts of each state. In real life, squeezing steam at 100 °C would turn some of it back into water.</p>`);
    W_.squeeze = K.slider(test, { label: "Squeeze with the piston", min: 0, max: 100, step: 1, value: Math.round(squeezeS * 100), unit: " %", onInput: (v) => { squeezeS = v / 100; } });
    W_.tilt = K.slider(test, { label: "Tilt the container", min: 0, max: 60, step: 1, value: Math.round(tiltTarget * 180 / Math.PI), unit: "°", onInput: (v) => { tiltTarget = v * Math.PI / 180; } });
    const rr = K.buttonRow(test);
    K.button(rr, "Reset test", () => { squeezeS = 0; tiltTarget = 0; W_.squeeze.value = 0; W_.tilt.value = 0; });
    W_.testOut = document.createElement("div"); W_.testOut.className = "now"; W_.testOut.style.cssText = "border-top:1px solid var(--panel-border);padding-top:8px;margin-top:8px;font-size:0.86rem"; test.appendChild(W_.testOut);

    buildMissions();
    K.quiz(panel, TXT.quizList(lens.band));
    buildCompare();

    const mix = K.card(panel, "Common mix-ups");
    mix.insertAdjacentHTML("beforeend", `<ul class="cmp-list" style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px;font-size:.84rem;color:var(--ink-dim)">${TXT.mixups(lens.band).map(([a, b]) => `<li><b style="color:var(--t-warn)">“${a}”</b><br>${b}</li>`).join("")}</ul>`);

    const hon = K.card(panel, "What is simplified here");
    hon.insertAdjacentHTML("beforeend", `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:.82rem;color:var(--ink-dim)">${TXT.honesty(lens.band).map((t) => `<li>${t}</li>`).join("")}</ul>`);

    const src = K.card(panel, "Data and sources");
    src.insertAdjacentHTML("beforeend", `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:.78rem;color:var(--ink-dim)">${TXT.SOURCES.map((s) => `<li>${s.what}. <span style="color:var(--ink-faint)">${s.ref}</span>${s.url ? ` <a href="${s.url}" target="_blank" rel="noopener" style="color:var(--accent)">link</a>` : ""}</li>`).join("")}</ul>`);

    uiT = 0; explT = 0;
  }

  function buildCompare() {
    const c = K.card(panel, "Compare substances");
    c.insertAdjacentHTML("beforeend", `<p>${L(TXT.COMPARE_INTRO)}</p>`);
    const id = unitsId();
    const sliderRow = document.createElement("div");
    c.appendChild(sliderRow);
    let T = 20;
    const body = document.createElement("div");
    const draw = () => {
      body.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:.8rem"><tbody>${TXT.SUBSTANCES.map((s) => {
        const state = TXT.stateAt(s, T), col = state === "solid" ? "#93c5fd" : state === "liquid" ? "#4fd1c5" : "#fbbf24";
        return `<tr style="border-top:1px solid var(--panel-border)"><td style="padding:6px 6px 6px 0;vertical-align:top"><b style="color:var(--ink)">${s.name}</b> <span style="color:var(--ink-faint)">${s.formula}</span><br><span style="color:var(--ink-faint);font-size:.74rem">${L(s.kind)}</span></td><td style="padding:6px 0;text-align:right;white-space:nowrap;vertical-align:top;font-variant-numeric:tabular-nums"><span style="color:${col};font-weight:700">${state}</span><br><span style="color:var(--ink-dim)">melts ${TXT.fmtT(s.mp)} °C<br>boils ${TXT.fmtT(s.bp)} °C</span></td></tr>`;
      }).join("")}</tbody></table>`;
    };
    const sl = K.slider(sliderRow, { label: "Temperature", min: -250, max: 3000, step: 1, value: T, unit: " °C", format: (v) => `${TXT.fmtT(v)} °C`, onInput: (v) => { T = v; draw(); } });
    const rr = K.buttonRow(c);
    K.button(rr, "Room (20 °C)", () => { T = 20; sl.value = 20; draw(); });
    K.button(rr, "Oven (250 °C)", () => { T = 250; sl.value = 250; draw(); });
    K.button(rr, "Lava (1200 °C)", () => { T = 1200; sl.value = 1200; draw(); });
    c.appendChild(body); draw();
    c.insertAdjacentHTML("beforeend", `<p class="hint">Values at normal air pressure. Sources: ${TXT.SUBSTANCES.map((s) => `<a href="${s.url}" target="_blank" rel="noopener" style="color:var(--accent)">${s.name}</a> (${s.src})`).join("; ")}.</p>`);
  }

  function buildMissions() {
    const c = K.card(panel, "Missions", "missions");
    const ol = document.createElement("ol");
    const list = TXT.missionList().filter((m) => !m.band || lens.atLeast(m.band));
    missionItems = list.map((m) => {
      const li = document.createElement("li"); li.innerHTML = L(m.text);
      if (done.has(m.id)) li.classList.add("done");
      ol.appendChild(li); return { m, li };
    });
    c.appendChild(ol);
    const bar = document.createElement("div"); bar.className = "progress"; bar.innerHTML = "<div></div>"; c.appendChild(bar);
    missionFill = bar.firstChild;
    updateMissions();
  }
  const MS = { st: st_ };
  function updateMissions() {
    let n = 0;
    for (const it of missionItems) {
      if (!done.has(it.m.id)) {
        let ok = false;
        try { ok = lens.band === "ext" && it.m.checkExt ? it.m.checkExt(MS) : it.m.check(MS); } catch { ok = false; }
        if (ok) { done.add(it.m.id); it.li.classList.add("done"); engine.toast?.(`🎯 Mission complete: ${it.li.textContent.slice(0, 80)}`, 3200); }
      }
      if (done.has(it.m.id)) n++;
    }
    if (missionFill) missionFill.style.width = `${(n / Math.max(1, missionItems.length)) * 100}%`;
  }

  // ----- UI refresh (a few times a second) -----
  function counts() {
    let ice = 0, liq = 0, gas = 0;
    for (let i = 0; i < N; i++) { const s = st[i]; if (s === ST_ICE || s === ST_FRZ) ice++; else if (s === ST_LIQ) liq++; else if (s === ST_GAS) gas++; }
    return { ice, liq, gas, inView: ice + liq + gas };
  }
  function drawnSep() {
    const c = counts(); if (!c.gas) return 2;
    const vol = W * D * Math.min(plateOn() ? plateH : H, H);
    return Math.cbrt(vol / c.gas) / DCOL;
  }
  function refreshUI() {
    const m = model, c = counts(), f = m.fractions();
    const parts = [];
    if (f.solid > 0.001) parts.push(`ice ${(f.solid * 100).toFixed(0)}%`);
    if (f.liquid > 0.001) parts.push(`liquid ${(f.liquid * 100).toFixed(0)}%`);
    if (f.gas > 0.001) parts.push(`gas ${(f.gas * 100).toFixed(0)}%`);
    const min = Math.floor(m.t / 60), sec = Math.floor(m.t % 60);
    chipState(`<b>${TXT.fmtT(m.T)} °C</b> · ${parts.length ? parts.join(" · ") : "empty"}${m.phaseChange ? ` · <b>${m.phaseChange}</b>` : ""} <span style="color:var(--ink-faint)">· ${min}:${String(sec).padStart(2, "0")}</span>`);
    const v = TXT.meanSpeedReal(m.T);
    chipSpeed(`Average speed <b>${Math.round(v)} m/s</b> <span class="w" style="color:var(--ink-faint)">(real; drawn ${TXT.sci(SLOW, 0)}× slower)</span>`);
    if (sel >= 0 && st[sel] !== ST_GONE) {
      chipSelEl.style.display = "";
      chipSel(`Selected: <b>${wordFor(st[sel])}</b> molecule · speed <b>${Math.round(sp[sel] * REAL_PER_DISP)} m/s</b> <span class="w" style="color:var(--ink-faint)">(real equivalent)</span>`);
    } else chipSelEl.style.display = "none";
    // selected card
    if (W_.selCard) {
      W_.selCard.style.display = sel >= 0 && st[sel] !== ST_GONE ? "" : "none";
      if (sel >= 0 && st[sel] !== ST_GONE) {
        const s = st[sel];
        const how = s === ST_ICE ? `It is <strong>vibrating about a fixed place</strong> in the ice lattice and has been for as long as it has been solid. Its trail (yellow) stays in a tiny patch.`
          : s === ST_FRZ ? `It is settling into a place in the lattice as the water freezes.`
          : s === ST_LIQ ? `It is <strong>touching its neighbours</strong> and tumbling past them. The yellow trail wanders slowly because it keeps bumping into other molecules.`
          : `It is <strong>flying freely</strong> between collisions, in straight lines. Nothing else is touching it.`;
        const html = `<p>Water molecule (H₂O), ${wordFor(s)}.</p><p>${how}</p><p>Size: <b>about 0.28 nm across</b>, the same as in every other state. Speed now: <b>${Math.round(sp[sel] * REAL_PER_DISP)} m/s</b> (real equivalent); the average for all molecules is ${Math.round(v)} m/s at ${TXT.fmtT(m.T)} °C.${lens.band === "ext" ? ` Speeds vary widely from molecule to molecule (Maxwell–Boltzmann); the average goes as √T in kelvin.` : ""}</p>`;
        if (W_.selBody._h !== html) { W_.selBody.innerHTML = html; W_.selBody._h = html; }
      }
    }
    // test text
    if (W_.testOut) {
      const dens = c.gas > 0 ? 1 : 0;
      const volPct = (plateOn() ? plateH : H) / H * 100;
      const html = TXT.testText({ nIce: c.ice, nLiq: c.liq, nGas: c.gas, nIn: c.inView, volPct, tilt: tiltTarget * 180 / Math.PI, pressRel: H / Math.max(1, plateH), squeezing: squeezeS > 0.04 }, lens.band);
      if (W_.testOut._h !== html) { W_.testOut.innerHTML = html; W_.testOut._h = html; }
    }
  }
  function refreshExplain() {
    const m = model, c = counts();
    const mass0 = Math.max(1e-9, m.solid + m.liquid + m.gas + m.escaped);   // molecules shown are in proportion to the original mass; escaped vapour has left the box
    const html = TXT.narrative({
      T: m.T, N, fs: m.solid / mass0, fl: m.liquid / mass0, fg: m.gas / mass0, phaseChange: m.phaseChange, heatIn: m.heatIn, heatLoss: m.heatLoss, latentRate: m.latentRate,
      evapRate: m.evapRate, solidG: m.solid, liquidG: m.liquid, gasG: m.gas, escapedG: m.escaped, sealed: m.container === "sealed", drawnSep: drawnSep(),
    }, lens.band);
    if (W_.explain && W_.explain._h !== html) { W_.explain.innerHTML = html; W_.explain._h = html; }
  }

  // ----- stats for missions -----
  function updateStats(dt) {
    const c = counts(), inV = Math.max(1, c.inView);
    if (sel >= 0 && st[sel] === ST_ICE) st_.followIce += dt;
    if (c.gas / inV > 0.5 && plateOn() && plateH / H <= 0.5 && squeezeS > 0.04) st_.gasSqueezed = true;
    if ((c.ice + c.liq) / inV > 0.6 && squeezeS > 0.85) st_.condensedSqueezed = true;
    if (c.liq / inV > 0.5) st_.tiltLiquid = Math.max(st_.tiltLiquid, tiltAng * 180 / Math.PI);
    if (c.liq / inV > 0.9) { st_.liqMin = Math.min(st_.liqMin, model.T); st_.liqMax = Math.max(st_.liqMax, model.T); st_.liqSpan = st_.liqMax - st_.liqMin; }
  }

  // ----- selection -----
  function selectMol(i) {
    if (i !== sel) st_.followIce = 0;
    sel = i; trailN = 0; trailT = 0;
    if (i >= 0) st_.followStates.add(stateWord(st[i]));
  }

  function driveModel(dt) {
    const p = parentInst();
    if (p) {
      model = p.model;
      if (typeof p.advance === "function") p.advance(dt);
      else if (p.running !== false) model.step(dt * (typeof p.speed === "number" ? p.speed : 40));
      if (!hasParent) { hasParent = true; buildPanel(); }
    } else {
      model = ownModel || (ownModel = createStatesModel({ mass: 100, T0: -20 }));
      model.power = own.power;
      model.step(dt * own.speed);
    }
  }

  // ----- level object -----
  level = {
    title: "Water particles",
    topics: ["states-of-matter", "particle-theory"],
    root,
    pickables: [proxy],
    metersPerUnit: 1e-10,
    get view() {
      const a = engine.camera.aspect, tf = Math.tan(THREE.MathUtils.degToRad(engine.camera.fov / 2));
      // compact framing (ice, liquid, a little vapour) fills the stage; tall framing shows the whole box when it is mostly gas
      const tall = frameTall, span = tall ? 56 : 34, ty = tall ? 19 : 11;
      const d = Math.max(span / (2 * tf), (W + 6) / (2 * tf * a));
      return { target: new THREE.Vector3(0, ty, 0), distance: d, dir: new THREE.Vector3(0.03, 0.05, 1) };
    },
    minDistance: 40, maxDistance: 800, near: 4, far: 4000,
    enablePan: true,
    env: { bg: ["#1d4468", "#0a2338", "#2a6592"], fog: ["#0b2a42", 0.0012], exposure: 1.12, bloom: [0.22, 0.5, 0.9], aperture: 0.0004 },
    clay: { groundY: -2.4, groundR: 30, shadow: 60, freq: 0.5, amount: 0.5 },
    _debug() { return { raw: { ...raw }, cS, cL, cG, cGfree, budget, Lq, Lt, model: { s: model.solid, l: model.liquid, g: model.gas, e: model.escaped, T: model.T, t: model.t, pc: model.phaseChange, c: model.container }, counts: counts() }; },
    info(obj) { return obj === proxy ? { title: "Water molecule (H₂O): click to follow it" } : null; },
    onClick(e, hit) {
      if (hit && hit.object === proxy && hit.instanceId != null && st[hit.instanceId] !== ST_GONE) {
        selectMol(hit.instanceId);
        engine.select({ title: "Water molecule", kind: "molecule" });
        return true;
      }
      selectMol(-1);
      return false;
    },
    onSelect(info) { if (!info) sel = -1; refreshUI(); },
    onLens() { buildPanel(); },
    mountPanel(el) {
      // a narrow field of view (nearly orthographic) keeps the layers of the crystal lined up, so the rings read
      if (prevFov == null) { prevFov = engine.camera.fov; engine.camera.fov = FOV; engine.camera.updateProjectionMatrix(); }
      model = getModel();
      const had = hasParent; hasParent = !!parentInst();
      if (had !== hasParent || !panel.childNodes.length) buildPanel();
      el.appendChild(panel);
      engine.overlay.appendChild(overlay);
      engine.labelLayer.appendChild(labelLayer);
      engine.canvas?.setAttribute("aria-label", TXT.canvasLabel());
      lastMass0 = -1;                       // resync with the model on the next frame
    },
    unmountPanel() { overlay.remove(); labelLayer.remove(); restoreFov(); },
    onResume() { lastMass0 = -1; },
    dispose() { overlay.remove(); labelLayer.remove(); panel.remove(); restoreFov(); },
    update(dt, t, rdt = dt) {
      // keep the model going (the parent's update() is not called while this level is on top)
      if (dt > 0) driveModel(Math.min(dt, 0.05)); else model = parentInst()?.model || ownModel || model;
      const mass0 = rawTargets();
      if (lastMass0 < 0 || Math.abs(mass0 - lastMass0) > 0.005 * Math.max(1, lastMass0) || model.t < lastT - 0.5 || model.container !== lastContainer) {
        syncInstant();
        if (hasParent === false && W_.container) W_.container.set(model.container);
      }
      lastT = model.t;
      // animated tilt and piston (real time, so they move even when paused)
      tiltAng += (tiltTarget - tiltAng) * Math.min(1, rdt * 4);
      tilt.rotation.z = tiltAng;
      gdx = -Math.sin(tiltAng); gdy = -Math.cos(tiltAng);
      const maxP = H, minP = Math.min(maxP - 4, Math.max(6, topSolid + 2.4 + cGfree / (N_LIQ * W * D)));
      plateTarget = maxP - squeezeS * (maxP - minP);
      const dp = plateTarget - plateH, mv = 40 * rdt;
      plateH += Math.abs(dp) < mv ? dp : Math.sign(dp) * mv;
      const pOn = plateOn();
      piston.visible = pOn; piston.position.y = plateH;
      links.visible = showLinks;
      {
        const tallNow = model.fractions().gas > (frameTall ? 0.12 : 0.3);
        if (tallNow !== frameTall) {
          frameTall = tallNow;
          if (!engine.userMoved && !engine.busy && engine.current === level) {
            const v = level.view; engine.fly(v.target, v.target.clone().addScaledVector(v.dir.clone().normalize(), v.distance), 1.0).then(() => { engine.userMoved = false; });
          }
        }
      }
      const sdt = Math.min(dt, 1 / 30);
      if (sdt > 0) {
        step(sdt);
        // trail
        trailT += sdt;
        if (sel >= 0 && st[sel] !== ST_GONE && trailT > 0.05) {
          trailT = 0;
          if (trailN >= TRAIL) { trailPos.copyWithin(0, 3); trailN = TRAIL - 1; }
          trailPos[trailN * 3] = px[sel]; trailPos[trailN * 3 + 1] = py[sel]; trailPos[trailN * 3 + 2] = pz[sel]; trailN++;
          trailGeo.attributes.position.needsUpdate = true; trailGeo.setDrawRange(0, trailN);
        }
      }
      writeMolecules();
      writeLinks();
      if (sel >= 0 && st[sel] !== ST_GONE) { halo.visible = true; halo.position.set(px[sel], py[sel], pz[sel]); trail.visible = true; }
      else { halo.visible = false; trail.visible = false; if (sel >= 0) selectMol(-1); }
      if (sdt > 0) updateStats(sdt);
      updateLabels(engine.camera.aspect < 0.9);
      uiT -= rdt; explT -= rdt;
      if (uiT <= 0) { uiT = 0.2; refreshUI(); updateMissions(); }
      if (explT <= 0) { explT = 0.5; refreshExplain(); }
    },
  };
  syncInstant();
  return level;
}
