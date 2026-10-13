// Density at the particle scale (Year 7 4.2.1–4.2.3). Two views, switched in the panel:
//
//   "cubes"    Six cubes of the same size (2 nm × 2 nm × 2 nm = 8 nm³) holding water, ice, vegetable oil, aluminium, lead and air.
//              The number of particles in each is COMPUTED from the data-book density and molar mass (densityParticlesContent.js, tested),
//              so density = particles × mass of one ÷ volume can be read straight off the picture.
//   "tension"  A slab of liquid water with its surface at the top, a steel paper clip resting on it and detergent to add. A selected molecule
//              shows the pulls from its neighbours: they cancel inside and do not at the surface. Surface tension and the clip's weight come
//              from the tested model in the content file.
//
// Units: 1 world unit = 1 Å (metersPerUnit = 1e-10), so the scale bar reads in nm.
// Particles are drawn with InstancedMeshes (one per kind, all written every frame); there is no physics engine here, only seeded
// arrangements (lattices, random packing, grown chains) with slow, small motion, and the honesty card says so.
import * as THREE from "three";
import * as K from "../../kit.js";
import { glass, softDot, physical } from "../materials.js";
import * as T from "./densityParticlesContent.js";

const S = T.CUBE_A, HS = S / 2;
const OH = 0.9572, HOH = (104.52 * Math.PI) / 180;
const RO = 0.86, RH = 0.46;                                   // drawn radii (smaller than the true electron clouds so the shape reads)
const { W: SW, D: SD, H: SH } = T.SLAB;
const RC = 6.5;                                                  // drawn clip radius in Å (not to scale: see the honesty card)
const LAMBDA = 7;                                              // how far below the surface a dimple is felt, Å
const SIGMA = 6;                                               // half-width of the dimple, Å
const A0 = 10;                                                  // dimple depth when weight = support, Å
const SAT = T.DETERGENT_SATURATION;
const COL = {
  O: "#d3231a", H: "#f6f8fc", C: "#868c96", Al: "#cfd6df", Pb: "#7e8795", N: "#3a5bd9", head: "#14b8a6", tail: "#f2b53a",
  steel: "#aab3be", arrow: "#aef0ff", net: "#ffd34d",
};
const HA = new THREE.Vector3(-Math.sin(HOH / 2) * OH, Math.cos(HOH / 2) * OH, 0), HB = new THREE.Vector3(Math.sin(HOH / 2) * OH, Math.cos(HOH / 2) * OH, 0);
const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const TAU = Math.PI * 2;

export function create(engine) {
  const lens = engine.lens;
  const L = (v) => lens.pick(v);
  let level = null;
  let mode = "cubes";
  let sel = null;                                              // selected cube key
  let selMol = -1;                                             // selected water molecule (tension view)
  let clock = 0;                                               // animation clock, advances with sim dt
  const rnd = T.mulberry(2026);
  const randn = () => { let u = 0; while (u === 0) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rnd()); };
  const randQ = (q) => { const u1 = rnd(), u2 = rnd(), u3 = rnd(), a = Math.sqrt(1 - u1), b = Math.sqrt(u1); return q.set(a * Math.sin(TAU * u2), a * Math.cos(TAU * u2), b * Math.sin(TAU * u3), b * Math.cos(TAU * u3)); };

  // ---------- shared scratch ----------
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _qI = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

  // ---------- materials and geometry ----------
  const geoBig = new THREE.SphereGeometry(1, 20, 14), geoSmall = new THREE.SphereGeometry(1, 12, 8);
  const matBall = physical("#ffffff", { roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.15, sheenColor: new THREE.Color("#ff9a8f") });
  const matH = physical("#ffffff", { roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.3 });
  const matMetal = physical("#ffffff", { roughness: 0.26, metalness: 0.92, clearcoat: 0.35, clearcoatRoughness: 0.2, sheen: 0, envMapIntensity: 1.9 });
  const matBond = physical("#ffffff", { roughness: 0.4, clearcoat: 0.6, sheen: 0 });
  function pool(geo, mat, cap, parent, color = "#ffffff") {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0;
    m.setColorAt(0, new THREE.Color(color));
    parent.add(m);
    return m;
  }
  const bondGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const coneGeo = new THREE.ConeGeometry(1, 1, 10);
  const col = new THREE.Color();
  const setCol = (mesh, i, hex, jitter = 0.03) => { col.set(hex); if (jitter) col.offsetHSL((rnd() - 0.5) * 0.01, 0, (rnd() - 0.5) * jitter); mesh.setColorAt(i, col); };
  function put(mesh, i, x, y, z, r) { _p.set(x, y, z); _s.set(r, r, r); _m.compose(_p, _qI, _s); mesh.setMatrixAt(i, _m); }
  function putBond(mesh, i, ax, ay, az, bx, by, bz, r) {
    _a.set(ax, ay, az); _b.set(bx, by, bz); _v.subVectors(_b, _a);
    const len = _v.length();
    if (len < 1e-5) { _s.set(0, 0, 0); _m.compose(_a, _qI, _s); mesh.setMatrixAt(i, _m); return; }
    _q.setFromUnitVectors(UP, _v.multiplyScalar(1 / len));
    _p.addVectors(_a, _b).multiplyScalar(0.5); _s.set(r, len, r);
    _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
  }
  const flush = (...ms) => { for (const m of ms) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } };
  const flushM = (...ms) => { for (const m of ms) m.instanceMatrix.needsUpdate = true; };

  const root = new THREE.Group();
  root.userData.isParticles = true;
  const gCubes = new THREE.Group(), gSlab = new THREE.Group();
  root.add(gCubes, gSlab);

  // =====================================================================================================================
  //  VIEW 1: SIX CUBES
  // =====================================================================================================================
  const stats = Object.fromEntries(T.SUB_KEYS.map((k) => [k, T.cubeStats(k)]));
  const poolO1 = pool(geoBig, matBall, 900, gCubes), poolH1 = pool(geoSmall, matH, 1100, gCubes), poolM1 = pool(geoBig, matMetal, 760, gCubes), poolB1 = pool(bondGeo, matBond, 340, gCubes);
  let nO1 = 0, nH1 = 0, nM1 = 0, nB1 = 0;
  const cubes = [];
  const cubeProxies = [];
  const edgeMat = (hex) => new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0.5 });
  const TINT = { water: "#6fb8ff", ice: "#bfe9ff", oil: "#f0c24a", aluminium: "#d5dde8", lead: "#8d97a6", air: "#cfe9ff" };
  const boxGeo = new THREE.BoxGeometry(S, S, S), boxEdges = new THREE.EdgesGeometry(boxGeo);
  const plinthGeo = new THREE.BoxGeometry(S + 5, 1.4, S + 5);
  const plinthMat = physical("#1b2a3a", { roughness: 0.18, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0 });

  function orientIce(nbrs) {                                   // two of the four neighbour directions become the O–H directions
    const idx = [0, 1, 2, 3].sort(() => rnd() - 0.5);
    const u1 = new THREE.Vector3(...nbrs[idx[0]]), u2 = new THREE.Vector3(...nbrs[idx[1]]);
    const bx = u2.clone().sub(u1).normalize(), by = u1.clone().add(u2).normalize(), bz = new THREE.Vector3().crossVectors(bx, by).normalize();
    bx.crossVectors(by, bz).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(bx, by, bz));
  }

  for (const k of T.SUB_KEYS) {
    const st = stats[k], c = { key: k, st, cx: 0, cy: 0, cz: 0, lift: 0, liftT: 0 };
    // glass cube, edges, plinth
    const g = new THREE.Group(); gCubes.add(g); c.group = g;
    const glassMesh = new THREE.Mesh(boxGeo, glass(TINT[k], { rim: TINT[k], rimPower: 2.4, rimStrength: 0.45, minAlpha: k === "oil" ? 0.07 : 0.025, maxAlpha: 0.32, side: THREE.DoubleSide }));
    glassMesh.renderOrder = 4; g.add(glassMesh);
    c.edges = new THREE.LineSegments(boxEdges, edgeMat("#cfe9ff")); g.add(c.edges);
    const plinth = new THREE.Mesh(plinthGeo, plinthMat); plinth.position.y = -HS - 0.75; g.add(plinth);
    const proxy = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ visible: false })); proxy.userData.cubeKey = k; g.add(proxy); cubeProxies.push(proxy);
    c.proxy = proxy;
    for (const o of [glassMesh, c.edges, proxy]) o.scale.setScalar(st.side / S);        // lead: 4 unit cells = 19.8 Å, drawn at that size so the box matches the sum
    cubes.push(c);

    if (k === "water") {
      const pts = T.packLiquid(st.drawn, S, 2.3, 0.9, 11);
      c.n = pts.length; c.home = pts; c.o = nO1; c.h = nH1; nO1 += c.n; nH1 += 2 * c.n;
      c.q0 = pts.map(() => randQ(new THREE.Quaternion())); c.ax = pts.map(() => new THREE.Vector3(randn(), randn(), randn()).normalize());
      c.ph = pts.map(() => Array.from({ length: 7 }, () => rnd() * TAU)); c.amp = 0.55; c.rot = 0.55; c.freq = 1.0;
      for (let i = 0; i < c.n; i++) { setCol(poolO1, c.o + i, COL.O, 0.05); setCol(poolH1, c.h + 2 * i, COL.H); setCol(poolH1, c.h + 2 * i + 1, COL.H); }
    } else if (k === "ice") {
      const f = T.fillLattice("ice", st.side, st.drawn, 7);
      c.n = f.pts.length; c.home = f.pts; c.o = nO1; c.h = nH1; nO1 += c.n; nH1 += 2 * c.n;
      c.q0 = f.nbr.map((nb) => orientIce(nb)); c.ax = f.pts.map(() => new THREE.Vector3(randn(), randn(), randn()).normalize());
      c.ph = f.pts.map(() => Array.from({ length: 7 }, () => rnd() * TAU)); c.amp = 0.17; c.rot = 0.1; c.freq = 2.2;
      for (let i = 0; i < c.n; i++) { setCol(poolO1, c.o + i, COL.O, 0.05); setCol(poolH1, c.h + 2 * i, COL.H); setCol(poolH1, c.h + 2 * i + 1, COL.H); }
    } else if (k === "aluminium" || k === "lead") {
      const f = T.fillLattice(k, st.side, st.drawn, k === "lead" ? 13 : 9);
      c.n = f.pts.length; c.home = f.pts; c.m = nM1; nM1 += c.n;
      c.ph = f.pts.map(() => Array.from({ length: 3 }, () => rnd() * TAU));
      c.amp = k === "lead" ? 0.1 : 0.13; c.freq = k === "lead" ? 1.6 : 2.1;
      c.r = T.nearestNeighbour(k) / 2 * 0.97;
      for (let i = 0; i < c.n; i++) setCol(poolM1, c.m + i, k === "lead" ? COL.Pb : COL.Al, 0.08);
    } else if (k === "oil") {
      const mols = T.growOil(st.drawn, S, 5);
      c.mols = mols; c.o = nO1; c.b = nB1; c.beads = []; c.bonds = [];
      for (const m of mols) {
        const base = c.beads.length;
        for (const a of m.atoms) c.beads.push({ p: a.p, el: a.el, mol: c.mols.indexOf(m), ph: [rnd() * TAU, rnd() * TAU, rnd() * TAU] });
        for (const [i, j] of m.bonds) c.bonds.push([base + i, base + j]);
      }
      c.n = c.beads.length; nO1 += c.n; nB1 += c.bonds.length;
      c.mph = mols.map(() => Array.from({ length: 6 }, () => rnd() * TAU));
      const OILTINT = ["#767b87", "#98874c", "#667790", "#876d63", "#6a8174"];       // slightly different greys so each chain reads as one molecule
      c.beads.forEach((b, i) => setCol(poolO1, c.o + i, b.el === "O" ? COL.O : OILTINT[b.mol % OILTINT.length], 0.05));
      c.bonds.forEach(([a], i) => setCol(poolB1, c.b + i, OILTINT[c.beads[a].mol % OILTINT.length], 0));
    } else if (k === "air") {
      c.n = T.AIR_BOX_N; c.o = nO1; nO1 += 2 * c.n;
      c.pos = []; c.vel = []; c.spin = []; c.ang = []; c.kind = [];
      const B = T.AIR_BOX_A;
      for (let i = 0; i < c.n; i++) {
        c.pos.push([(rnd() - 0.5) * B, (rnd() - 0.5) * B, (rnd() - 0.5) * B]);
        c.vel.push([randn() * 7.5, randn() * 7.5, randn() * 7.5]);
        c.spin.push(new THREE.Vector3(randn(), randn(), randn()).normalize()); c.ang.push(rnd() * TAU);
        c.kind.push(i < Math.round(c.n * 78 / 99) ? "N" : "O");
        const hex = c.kind[i] === "N" ? COL.N : COL.O;
        setCol(poolO1, c.o + 2 * i, hex, 0.04); setCol(poolO1, c.o + 2 * i + 1, hex, 0.04);
      }
      c.seen = 0;
    }
  }
  poolO1.count = nO1; poolH1.count = nH1; poolM1.count = nM1; poolB1.count = nB1;
  flush(poolO1, poolH1, poolM1, poolB1);
  const cubeOf = Object.fromEntries(cubes.map((c) => [c.key, c]));
  let airNow = 0, airSeen = false;

  function layoutCubes() {
    const portrait = engine.camera.aspect < 0.9;
    const cols = portrait ? 2 : 3, rows = portrait ? 3 : 2, G = 13, gy = portrait ? 11 : 17;
    cubes.forEach((c, i) => {
      const cc = i % cols, rr = (i / cols) | 0;
      c.tx = (cc - (cols - 1) / 2) * (S + G);
      c.ty = ((rows - 1) / 2 - rr) * (S + gy);
      c.tz = 0;
    });
    return { cols, rows, G, gy, portrait };
  }

  // ----- per-frame writes, cubes -----
  const rotH = (q, out, v) => out.copy(v).applyQuaternion(q);
  function writeMolecules(c, t) {
    const { home, q0, ax, ph, amp, rot, freq } = c;
    for (let i = 0; i < c.n; i++) {
      const p = ph[i], h = home[i];
      const x = c.cx + h[0] + amp * Math.sin(freq * t * 1.0 + p[0]) * 0.6 + amp * Math.sin(freq * t * 1.7 + p[1]) * 0.4;
      const y = c.cy + h[1] + amp * Math.sin(freq * t * 1.3 + p[2]) * 0.6 + amp * Math.sin(freq * t * 2.1 + p[3]) * 0.4;
      const z = c.cz + h[2] + amp * Math.sin(freq * t * 0.9 + p[4]) * 0.6 + amp * Math.sin(freq * t * 1.9 + p[5]) * 0.4;
      _q2.setFromAxisAngle(ax[i], rot * Math.sin(freq * t * 1.1 + p[6]));
      _q.copy(_q2).multiply(q0[i]);
      put(poolO1, c.o + i, x, y, z, RO);
      rotH(_q, _v2, HA); put(poolH1, c.h + 2 * i, x + _v2.x, y + _v2.y, z + _v2.z, RH);
      rotH(_q, _v2, HB); put(poolH1, c.h + 2 * i + 1, x + _v2.x, y + _v2.y, z + _v2.z, RH);
    }
  }
  function writeMetal(c, t) {
    for (let i = 0; i < c.n; i++) {
      const h = c.home[i], p = c.ph[i];
      put(poolM1, c.m + i, c.cx + h[0] + c.amp * Math.sin(c.freq * t + p[0]), c.cy + h[1] + c.amp * Math.sin(c.freq * t * 1.2 + p[1]), c.cz + h[2] + c.amp * Math.sin(c.freq * t * 0.8 + p[2]), c.r);
    }
  }
  const oilPos = [];
  function writeOil(c, t) {
    const nm = c.mols.length, offs = [];
    for (let m = 0; m < nm; m++) { const p = c.mph[m]; offs.push([0.45 * Math.sin(0.7 * t + p[0]), 0.45 * Math.sin(0.9 * t + p[1]), 0.45 * Math.sin(0.6 * t + p[2])]); }
    for (let i = 0; i < c.n; i++) {
      const b = c.beads[i], o = offs[b.mol];
      const x = c.cx + b.p[0] + o[0] + 0.16 * Math.sin(1.9 * t + b.ph[0]), y = c.cy + b.p[1] + o[1] + 0.16 * Math.sin(2.3 * t + b.ph[1]), z = c.cz + b.p[2] + o[2] + 0.16 * Math.sin(1.7 * t + b.ph[2]);
      oilPos[i * 3] = x; oilPos[i * 3 + 1] = y; oilPos[i * 3 + 2] = z;
      put(poolO1, c.o + i, x, y, z, b.el === "O" ? 0.58 : 0.54);
    }
    for (let j = 0; j < c.bonds.length; j++) {
      const [a, b] = c.bonds[j];
      putBond(poolB1, c.b + j, oilPos[a * 3], oilPos[a * 3 + 1], oilPos[a * 3 + 2], oilPos[b * 3], oilPos[b * 3 + 1], oilPos[b * 3 + 2], 0.2);
    }
  }
  function writeAir(c, dt) {
    const B = T.AIR_BOX_A, Hb = B / 2;
    let inside = 0;
    for (let i = 0; i < c.n; i++) {
      const p = c.pos[i], v = c.vel[i];
      p[0] += v[0] * dt; p[1] += v[1] * dt; p[2] += v[2] * dt;
      for (let k = 0; k < 3; k++) { if (p[k] > Hb) p[k] -= B; else if (p[k] < -Hb) p[k] += B; }
      c.ang[i] += dt * 2.5;
      const inCube = Math.abs(p[0]) < HS && Math.abs(p[1]) < HS && Math.abs(p[2]) < HS;
      const edge = inCube ? Math.min(HS - Math.abs(p[0]), HS - Math.abs(p[1]), HS - Math.abs(p[2])) : 0;
      const sc = inCube ? smooth(edge / 1.5) : 0;
      if (inCube) inside++;
      const d = c.kind[i] === "N" ? 0.55 : 0.6, r = (c.kind[i] === "N" ? 0.78 : 0.74) * sc;
      _q.setFromAxisAngle(c.spin[i], c.ang[i]); _v2.set(1, 0, 0).applyQuaternion(_q);
      put(poolO1, c.o + 2 * i, c.cx + p[0] + _v2.x * d, c.cy + p[1] + _v2.y * d, c.cz + p[2] + _v2.z * d, r);
      put(poolO1, c.o + 2 * i + 1, c.cx + p[0] - _v2.x * d, c.cy + p[1] - _v2.y * d, c.cz + p[2] - _v2.z * d, r);
    }
    airNow = inside;
    if (inside > 0) airSeen = true;
  }
  function updateCubes(dt, t) {
    const lay = layoutCubes();
    for (const c of cubes) {
      c.liftT = sel === c.key ? 1.6 : 0;
      c.lift += (c.liftT - c.lift) * Math.min(1, dt * 7 + 0.02);
      c.cx += ((c.tx) - c.cx) * (c.init ? Math.min(1, dt * 6 + 0.02) : 1);
      c.cy += ((c.ty + c.lift) - c.cy) * (c.init ? Math.min(1, dt * 6 + 0.02) : 1);
      c.init = true; c.cz = 0;
      c.group.position.set(c.cx, c.cy, c.cz);
      c.edges.material.color.set(sel === c.key ? "#ffe28a" : "#cfe9ff"); c.edges.material.opacity = sel === c.key ? 0.95 : 0.5;
      if (c.key === "water" || c.key === "ice") writeMolecules(c, t);
      else if (c.key === "aluminium" || c.key === "lead") writeMetal(c, t);
      else if (c.key === "oil") writeOil(c, t);
      else if (c.key === "air") writeAir(c, dt);
    }
    flushM(poolO1, poolH1, poolM1, poolB1);
    return lay;
  }

  // =====================================================================================================================
  //  VIEW 2: SURFACE TENSION SLAB
  // =====================================================================================================================
  const slab = T.buildSlab();
  const NM = slab.n;
  const poolO2 = pool(geoBig, matBall, NM + SAT * 9 + 8, gSlab), poolH2 = pool(geoSmall, matH, NM * 2, gSlab), poolB2 = pool(bondGeo, matBond, SAT * 9 + 4, gSlab);
  const tintBox = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.01, SH, SD + 2), new THREE.MeshBasicMaterial({ color: "#2f86d6", transparent: true, opacity: 0.075, depthWrite: false }));
  tintBox.position.set(0, -SH / 2, 0); tintBox.renderOrder = 3; gSlab.add(tintBox);
  const slabEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(SW, SH, SD + 2)), edgeMat("#9bd4ff"));
  slabEdges.position.copy(tintBox.position); slabEdges.material.opacity = 0.22; gSlab.add(slabEdges);

  const mx = new Float32Array(NM), my = new Float32Array(NM), mz = new Float32Array(NM);       // current positions
  const mq0 = Array.from({ length: NM }, () => randQ(new THREE.Quaternion())), max_ = Array.from({ length: NM }, () => new THREE.Vector3(randn(), randn(), randn()).normalize());
  const mph = Array.from({ length: NM }, () => Array.from({ length: 7 }, () => rnd() * TAU));
  const depth0 = new Float32Array(NM);
  for (let i = 0; i < NM; i++) { depth0[i] = -slab.ys[i]; mx[i] = slab.xs[i]; my[i] = slab.ys[i]; mz[i] = slab.zs[i]; }
  let hiSurface = false;
  function paintWater() {
    for (let i = 0; i < NM; i++) {
      const surf = hiSurface && depth0[i] < 3.0;
      col.set(surf ? "#2fd0ff" : COL.O); if (!surf) col.offsetHSL((((i * 37) % 11) / 11 - 0.5) * 0.012, 0, (((i * 17) % 7) / 7 - 0.5) * 0.05);
      poolO2.setColorAt(i, col);
      col.set(surf ? "#e9fbff" : COL.H); poolH2.setColorAt(i * 2, col); poolH2.setColorAt(i * 2 + 1, col);
    }
    flush(poolO2, poolH2);
  }
  paintWater();
  poolO2.count = NM; poolH2.count = NM * 2;
  const proxy2 = new THREE.InstancedMesh(new THREE.SphereGeometry(1.7, 8, 6), new THREE.MeshBasicMaterial({ visible: false }), NM);
  proxy2.frustumCulled = false; proxy2.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  proxy2.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -SH / 2, 0), 120);
  gSlab.add(proxy2);

  // ----- the clip (steel wire, shown in cross-section; long axis along z) -----
  const steelTex = (draw) => { const cv = document.createElement("canvas"); cv.width = cv.height = 256; draw(cv.getContext("2d")); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const capTex = steelTex((c) => {                                   // polished cut end of the wire: bright centre, darker rim, a soft highlight
    let g = c.createRadialGradient(110, 100, 6, 128, 128, 128);
    g.addColorStop(0, "#c9d1da"); g.addColorStop(0.55, "#9aa4b0"); g.addColorStop(0.88, "#666f7b"); g.addColorStop(1, "#3f4650");
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
    g = c.createLinearGradient(30, 20, 220, 236); g.addColorStop(0, "rgba(255,255,255,0.4)"); g.addColorStop(0.4, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,0,0,0.3)");
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  });
  const sideTex = steelTex((c) => {                                  // brushed-steel bands around the wire
    const g = c.createLinearGradient(0, 0, 256, 0);
    [[0, "#4d555f"], [0.14, "#b9c2cc"], [0.26, "#e8edf2"], [0.42, "#7d8793"], [0.62, "#454c56"], [0.8, "#a3acb8"], [1, "#4d555f"]].forEach(([o, h]) => g.addColorStop(o, h));
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  });
  const steelMat = (map) => physical("#ffffff", { map, metalness: 0.5, roughness: 0.34, clearcoat: 0.25, clearcoatRoughness: 0.2, sheen: 0, envMapIntensity: 0.7 });
  const clip = new THREE.Mesh(new THREE.CylinderGeometry(RC, RC, SD + 4, 56, 1, true), steelMat(sideTex));          // (single materials: the clay style cannot swap material arrays)
  const capGeo = new THREE.CircleGeometry(RC, 56), capMat = steelMat(capTex);
  const capA = new THREE.Mesh(capGeo, capMat), capB = new THREE.Mesh(capGeo, capMat);
  capA.position.y = (SD + 4) / 2; capA.rotation.x = -Math.PI / 2; capB.position.y = -(SD + 4) / 2; capB.rotation.x = Math.PI / 2;
  const clipWire = new THREE.Group(); clipWire.add(clip, capA, capB); clipWire.rotation.x = Math.PI / 2;
  for (const o of [clip, capA, capB]) o.userData.isClip = true;
  const clipG = new THREE.Group(); clipG.add(clipWire); gSlab.add(clipG);
  const clipBlock = { state: "floating", y: RC, vy: 0, pushed: false, sank: false };

  // ----- detergent molecules -----
  const dets = [];                                                    // { x,z, slot y, t0, state:"arrive"|"there"|"leave", fade, start:[x,y,z], sq }
  const poolsDet = { o: NM, b: 0 };
  const TAILN = 8;
  const detQ = new THREE.Quaternion();
  const dropMesh = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 14), physical("#46d27c", { roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.85, sheen: 0 }));
  dropMesh.visible = false; dropMesh.renderOrder = 5; gSlab.add(dropMesh);
  const drop = { active: false, x: 0, y: 0, v: 0, fire: 0, n: 0 };
  for (let i = 0; i < SAT; i++) {
    const o = NM + i * (TAILN + 1);
    setCol(poolO2, o, COL.head, 0.02);
    for (let k = 0; k < TAILN; k++) setCol(poolO2, o + 1 + k, COL.tail, 0.04);
    for (let k = 0; k < TAILN; k++) setCol(poolB2, i * TAILN + k, "#d6c27a", 0);
  }
  flush(poolO2, poolB2);

  // ----- links and arrows -----
  const linkMat = new THREE.MeshBasicMaterial({ color: "#9bebff", transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
  const linkPairs = [];
  {
    const near = [];
    for (let i = 0; i < NM; i++) if (depth0[i] < 11) near.push(i);
    for (let a = 0; a < near.length; a++) for (let b = a + 1; b < near.length; b++) {
      const i = near[a], j = near[b];
      let dx = slab.xs[i] - slab.xs[j]; dx -= SW * Math.round(dx / SW);
      let dz = slab.zs[i] - slab.zs[j]; dz -= SD * Math.round(dz / SD);
      const dy = slab.ys[i] - slab.ys[j];
      if (dx * dx + dy * dy + dz * dz < 3.6 * 3.6 && Math.abs(dx) < SW / 2 - 4) linkPairs.push([i, j]);
    }
  }
  const links = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5, 1, true), linkMat, Math.max(1, linkPairs.length));
  links.frustumCulled = false; links.count = 0; links.renderOrder = 6; links.instanceMatrix.setUsage(THREE.DynamicDrawUsage); gSlab.add(links);
  const arrowMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.92, depthTest: false });
  const MAXA = 40;
  const shafts = pool(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), arrowMat, MAXA, gSlab), heads = pool(coneGeo, arrowMat, MAXA, gSlab);
  shafts.renderOrder = heads.renderOrder = 7;
  for (let i = 0; i < MAXA; i++) { col.set(COL.arrow); shafts.setColorAt(i, col); heads.setColorAt(i, col); }
  col.set(COL.net); shafts.setColorAt(MAXA - 1, col); heads.setColorAt(MAXA - 1, col);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: "#ffe28a", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 1, depthTest: false }));
  halo.scale.setScalar(8); halo.visible = false; halo.renderOrder = 7; gSlab.add(halo);

  // ----- slab state and model -----
  let showLinks = false, nDet = 0, coverage = 0, gamma = T.SURF.water, nbrCache = null, selInfo = null;
  const st2 = { surfacePicked: false, insidePicked: false, sank: false, pushed: false, ethanolTried: false };
  const w_clip = T.clipWeight();
  let Adim = 0;                                                        // smoothed dimple depth
  const hAt = (x) => -Adim * Math.exp(-(x * x) / (2 * SIGMA * SIGMA));
  const hSlope = (x) => hAt(x) * (-x / (SIGMA * SIGMA));

  function slotX() {
    const used = dets.filter((d) => d.state !== "leave").map((d) => [d.x, d.z]);
    for (let tries = 0; tries < 200; tries++) {
      const x = (Math.floor(rnd() * 15) - 7) * 4.2 + (rnd() - 0.5) * 0.8, z = (Math.floor(rnd() * 3) - 1) * 3.6 + (rnd() - 0.5) * 0.6;
      if (clipBlock.state === "floating" && Math.abs(x) < RC + 3.2) continue;
      if (Math.abs(x) > SW / 2 - 3) continue;
      if (used.some(([ux, uz]) => Math.hypot(ux - x, (uz - z) * 1.0) < 3.6)) continue;
      return [x, z];
    }
    return [(rnd() - 0.5) * (SW - 10), (rnd() - 0.5) * 6];
  }
  function addDrop() {
    if (drop.active || nDet >= SAT || dets.length >= SAT) return false;
    const n = Math.min(T.DETERGENT_PER_DROP, SAT - nDet);
    const [x] = slotX();
    drop.active = true; drop.x = x; drop.y = 24; drop.v = 0; drop.n = n;
    return true;
  }
  function spawnFromDrop() {
    for (let i = 0; i < drop.n; i++) {
      const [x, z] = slotX();
      const q = randQ(new THREE.Quaternion());
      dets.push({ x, z, t0: clock + 0.05 * i, state: "arrive", fade: 1, start: [drop.x + (rnd() - 0.5) * 4, -3 - rnd() * 7, (rnd() - 0.5) * 6], sq: q, ph: rnd() * TAU, tiltAx: new THREE.Vector3(rnd() - 0.5, 0, rnd() - 0.5).normalize(), tilt: (rnd() - 0.5) * 0.45, roll: rnd() * TAU, dur: 2.2 + rnd() * 0.8 });
    }
    nDet += drop.n; drop.active = false;
  }
  function resetSlab() {
    for (const d of dets) if (d.state !== "leave") { d.state = "leave"; d.tl = clock; }
    nDet = 0; drop.active = false; dropMesh.visible = false;
    clipBlock.state = "falling"; clipBlock.y = 17; clipBlock.vy = 0; clipBlock.pushed = false; clipBlock.sank = false;
    st2.pushed = false;
  }
  function pushClip() { if (clipBlock.state === "floating") { clipBlock.state = "falling"; clipBlock.pushed = true; clipBlock.vy = -26; st2.pushed = true; } }

  function updateSlab(dt, t) {
    const sdt = Math.min(dt, 1 / 20);
    // detergent presence → coverage → surface tension
    let presence = 0;
    for (const d of dets) {
      if (d.state === "arrive") { const e = smooth((clock - d.t0) / d.dur); d.e = e; if (e >= 1) d.state = "there"; }
      else if (d.state === "there") d.e = 1;
      if (d.state === "leave") d.fade = Math.max(0, 1 - (clock - d.tl) / 0.8);
      presence += d.state === "leave" ? 0 : (d.e || 0);
    }
    for (let i = dets.length - 1; i >= 0; i--) if (dets[i].state === "leave" && dets[i].fade <= 0) dets.splice(i, 1);
    coverage = clamp(presence / SAT, 0, 1);
    gamma = T.gammaAt(coverage);
    const ratio = w_clip / T.maxSupport(gamma);
    // the drop
    if (drop.active) {
      drop.v += 55 * sdt; drop.y -= drop.v * sdt;
      dropMesh.visible = true; dropMesh.position.set(drop.x, drop.y, 0);
      if (drop.y <= hAt(drop.x) + 1) { dropMesh.visible = false; spawnFromDrop(); }
    }
    // the clip
    const restBottom = -dimpleAFloating(ratio);
    if (clipBlock.state === "floating") {
      if (ratio >= 1) { clipBlock.state = "falling"; clipBlock.vy = -4; if (nDet > 0 && !clipBlock.pushed) { clipBlock.sank = true; st2.sank = true; } }
      else { const target = restBottom + RC + 0.25; clipBlock.y += (target - clipBlock.y) * Math.min(1, sdt * 5); clipBlock.vy = 0; }
    }
    if (clipBlock.state === "falling") {
      clipBlock.vy -= 38 * sdt; clipBlock.vy = Math.max(clipBlock.vy, -24);
      clipBlock.y += clipBlock.vy * sdt;
      const bottom = clipBlock.y - RC, floor = -SH + 1.2;
      if (bottom <= restBottom + 0.1 && ratio < 1 && !clipBlock.pushed && clipBlock.vy < 0) { clipBlock.state = "floating"; clipBlock.vy = 0; }
      else if (bottom <= floor) { clipBlock.y = floor + RC; clipBlock.state = "sunk"; clipBlock.vy = 0; }
    }
    // dimple: depends on where the clip is; closes up once the clip has gone down through the surface
    const bottom = clipBlock.y - RC;
    let target = 0;
    if (clipBlock.state === "floating") target = dimpleAFloating(ratio);
    else target = clamp(-bottom, 0, A0 * 1.15) * (1 - smooth((-bottom - A0 * 1.15) / 12));
    Adim += (target - Adim) * Math.min(1, sdt * 6 + (clipBlock.state === "floating" ? 0 : 0.2));
    clipG.position.set(0, clipBlock.y, 0);
    // molecules
    const cy = clipBlock.y, R2 = RC + 1.55;
    for (let i = 0; i < NM; i++) {
      const p = mph[i], x0 = slab.xs[i], y0 = slab.ys[i], z0 = slab.zs[i];
      const w = 0.5;
      let x = x0 + w * (0.6 * Math.sin(1.1 * t + p[0]) + 0.4 * Math.sin(1.9 * t + p[1]));
      let y = y0 + w * (0.6 * Math.sin(1.3 * t + p[2]) + 0.4 * Math.sin(2.1 * t + p[3]));
      const z = z0 + w * (0.6 * Math.sin(0.9 * t + p[4]) + 0.4 * Math.sin(1.7 * t + p[5]));
      y += hAt(x0) * Math.exp(-depth0[i] / LAMBDA);
      // keep clear of the clip (a cylinder along z)
      let dx = x - 0, dy = y - cy; const d2 = dx * dx + dy * dy;
      if (d2 < R2 * R2) { const d = Math.sqrt(d2) || 0.01; if (d < 0.01) { dx = 0; dy = 1; } const k = R2 / d; x = dx * k; y = cy + dy * k; }
      for (let k = 0; k < dets.length; k++) {
        const D = dets[k]; if (!D.pos) continue;
        const ex = x - D.pos[0], ey = y - D.pos[1], ez = z - D.pos[2], e2 = ex * ex + ey * ey + ez * ez;
        if (e2 < 6.3) { const e = Math.sqrt(e2) || 0.01, s = 2.5 / e; x = D.pos[0] + ex * s; y = D.pos[1] + ey * s; }
      }
      mx[i] = x; my[i] = y; mz[i] = z;
      _q2.setFromAxisAngle(max_[i], 0.55 * Math.sin(1.1 * t + p[6])); _q.copy(_q2).multiply(mq0[i]);
      put(poolO2, i, x, y, z, RO);
      _v2.copy(HA).applyQuaternion(_q); put(poolH2, 2 * i, x + _v2.x, y + _v2.y, z + _v2.z, RH);
      _v2.copy(HB).applyQuaternion(_q); put(poolH2, 2 * i + 1, x + _v2.x, y + _v2.y, z + _v2.z, RH);
      put(proxy2, i, x, y, z, 1);
    }
    // detergent molecules: head in the water, tail up in the air
    let nb = 0;
    for (let i = 0; i < SAT; i++) {
      const o = NM + i * (TAILN + 1), D = dets[i];
      if (!D) { for (let k = 0; k <= TAILN; k++) put(poolO2, o + k, 0, 0, 0, 0); for (let k = 0; k < TAILN; k++) putBond(poolB2, i * TAILN + k, 0, 0, 0, 0, 0, 0, 0); continue; }
      const e = D.state === "arrive" ? D.e : 1, ee = smooth(e);
      const sx = D.start[0], sy = D.start[1], sz = D.start[2];
      const tx = D.x, ty = hAt(D.x) - 0.3, tz = D.z;
      const wob = 1 - ee;
      D.pos = [sx + (tx - sx) * ee + 2.2 * wob * Math.sin(2.1 * clock + D.ph), sy + (ty - sy) * ee + 1.6 * wob * Math.sin(1.7 * clock + D.ph), sz + (tz - sz) * ee + 1.6 * wob * Math.cos(1.5 * clock + D.ph)];
      // orientation: random tumble → upright with a slight lean and sway
      _q.setFromAxisAngle(D.tiltAx, D.tilt + 0.08 * Math.sin(1.4 * clock + D.ph) - hSlope(D.x) * 0.9);
      _q2.setFromAxisAngle(UP, D.roll); _q.multiply(_q2);
      detQ.copy(D.sq).slerp(_q, ee);
      const sc = D.state === "leave" ? D.fade : 1;
      put(poolO2, o, D.pos[0], D.pos[1], D.pos[2], 1.55 * sc);
      let px = D.pos[0], py = D.pos[1], pz = D.pos[2];
      for (let k = 0; k < TAILN; k++) {
        _v2.set((k % 2 ? 0.5 : -0.5) + 0.12 * k * 0.4 * Math.sin(1.1 * clock + k + D.ph) * 0.3, 1.6 + k * 1.12, (k % 2 ? 0.25 : -0.25)).applyQuaternion(detQ);
        const bx = D.pos[0] + _v2.x * sc, by = D.pos[1] + _v2.y * sc, bz = D.pos[2] + _v2.z * sc;
        put(poolO2, o + 1 + k, bx, by, bz, 0.8 * sc);
        putBond(poolB2, i * TAILN + k, px, py, pz, bx, by, bz, 0.3 * sc);
        px = bx; py = by; pz = bz;
      }
    }
    for (let i = dets.length; i < SAT; i++) { /* slots beyond the active molecules stay hidden (written above) */ }
    poolB2.count = SAT * TAILN; poolO2.count = NM + SAT * (TAILN + 1);
    flushM(poolO2, poolH2, poolB2, proxy2);
    // links
    if (showLinks) {
      links.count = linkPairs.length;
      for (let k = 0; k < linkPairs.length; k++) {
        const [i, j] = linkPairs[k];
        let dxx = mx[j] - mx[i];
        if (Math.abs(dxx) > SW / 2) { putBond(links, k, 0, 0, 0, 0, 0, 0, 0); continue; }
        putBond(links, k, mx[i], my[i], mz[i], mx[j], my[j], mz[j], 0.07);
      }
      links.instanceMatrix.needsUpdate = true;
    } else links.count = 0;
    // selected molecule, neighbour arrows and net pull
    updateSelection();
    return { ratio };
  }
  function dimpleAFloating(ratio) { return A0 * clamp(ratio, 0, 1.15); }

  const arrowAt = (i, ax, ay, az, bx, by, bz, r) => {
    _a.set(ax, ay, az); _b.set(bx, by, bz); _v.subVectors(_b, _a);
    const len = _v.length(); if (len < 1e-4) { putBond(shafts, i, 0, 0, 0, 0, 0, 0, 0); put(heads, i, 0, 0, 0, 0); return; }
    _v.multiplyScalar(1 / len);
    const hl = Math.min(len * 0.45, r * 5), sl = len - hl;
    _q.setFromUnitVectors(UP, _v);
    _p.copy(_a).addScaledVector(_v, sl / 2); _s.set(r, sl, r); _m.compose(_p, _q, _s); shafts.setMatrixAt(i, _m);
    _p.copy(_a).addScaledVector(_v, sl + hl / 2); _s.set(r * 2.6, hl, r * 2.6); _m.compose(_p, _q, _s); heads.setMatrixAt(i, _m);
  };
  function updateSelection() {
    let n = 0;
    if (selMol >= 0 && gSlab.visible) {
      const i = selMol;
      const x = mx[i], y = my[i], z = mz[i];
      halo.visible = true; halo.position.set(x, y, z);
      if (!nbrCache || nbrCache.i !== i) nbrCache = { i, list: T.neighbours(slab, i, 4.8) };
      for (const nb of nbrCache.list) {
        if (n >= MAXA - 2) break;
        const inv = 1 / nb.d;
        arrowAt(n++, x + nb.dx * inv * 1.3, y + nb.dy * inv * 1.3, z + nb.dz * inv * 1.3, x + nb.dx * inv * 4.0, y + nb.dy * inv * 4.0, z + nb.dz * inv * 4.0, 0.11);
      }
      // net pull (averaged over time): −normal × pull(depth)
      const d0 = depth0[i], xh = slab.xs[i];
      const depth = Math.max(0, d0 + hAt(xh) * (1 - Math.exp(-d0 / LAMBDA)));
      const gfac = gamma / T.SURF.water;
      const pull = T.netPull(depth) * (depth < 3.0 ? gfac : gfac);
      const nx = -hSlope(xh), ny = 1, nl = Math.hypot(nx, ny);
      const len = Math.min(17, pull * 3.2);
      if (len > 0.4) arrowAt(MAXA - 1, x, y, z, x - (nx / nl) * len, y - (ny / nl) * len, z, 0.38); else { putBond(shafts, MAXA - 1, 0, 0, 0, 0, 0, 0, 0); put(heads, MAXA - 1, 0, 0, 0, 0); }
      selInfo = { depth, pull, surface: depth < 3.0 };
    } else { halo.visible = false; selInfo = null; putBond(shafts, MAXA - 1, 0, 0, 0, 0, 0, 0, 0); put(heads, MAXA - 1, 0, 0, 0, 0); }
    shafts.count = heads.count = MAXA;
    for (let k = n; k < MAXA - 1; k++) { putBond(shafts, k, 0, 0, 0, 0, 0, 0, 0); put(heads, k, 0, 0, 0, 0); }
    flushM(shafts, heads);
  }
  function selectMolecule(i) {
    selMol = i; nbrCache = null;
    if (i >= 0) {
      const d0 = depth0[i];
      if (d0 < 3.0) st2.surfacePicked = true; else if (d0 > 9) st2.insidePicked = true;
    }
  }
  function pickBy(surface) {
    const cands = [];
    for (let i = 0; i < NM; i++) {
      const d = depth0[i], x = slab.xs[i];
      if (Math.abs(x) < RC + 5 && surface) continue;
      if (surface ? d < 2.0 : (d > 12 && d < 22)) cands.push(i);
    }
    // choose one near the middle of the picture, in the front half so it is easy to see
    cands.sort((a, b) => (Math.abs(slab.xs[a]) + Math.abs(slab.zs[a]) * 2) - (Math.abs(slab.xs[b]) + Math.abs(slab.zs[b]) * 2));
    const pick = cands[(rnd() * Math.min(12, cands.length)) | 0];
    selectMolecule(pick);
    engine.select({ title: surface ? "Surface water molecule" : "Water molecule inside", kind: "molecule" });
  }

  // =====================================================================================================================
  //  UI
  // =====================================================================================================================
  const panel = document.createElement("div"); panel.style.display = "contents";
  const overlay = document.createElement("div"); overlay.style.display = "contents";
  const labelLayer = document.createElement("div"); labelLayer.style.display = "contents";
  if (!document.getElementById("pt-css")) {
    const css = document.createElement("style"); css.id = "pt-css";
    css.textContent = "@media (max-width: 700px) { .pt-chip .w { display: none; } .pt-chip { font-size: 0.74rem; } }";
    document.head.appendChild(css);
  }
  const chipA = K.chip(overlay), chipB = K.chip(overlay);
  for (const c of overlay.children) c.classList.add("pt-chip");
  const W_ = {};
  const done = new Set();
  let missionItems = [], missionFill = null, uiT = 0, explT = 0, prevMode = null;
  const MS = { cubes: { picked: new Set(), airSeen: false }, st: st2 };
  const mkLabel = (cls, html) => { const el = engine.label(html || "", cls); labelLayer.appendChild(el); return el; };
  const lblCube = Object.fromEntries(T.SUB_KEYS.map((k) => [k, mkLabel("org")]));
  const lblClip = mkLabel("org"), lblAir = mkLabel("org"), lblWater = mkLabel("org"), lblSel = mkLabel("org"), lblDet = mkLabel("org");
  const setHTML = (el, h) => { if (el._h !== h) { el.innerHTML = h; el._h = h; } };
  const _lp = new THREE.Vector3(), _cx = new Float32Array(16), _cy = new Float32Array(16), _cw = new Float32Array(16), _ch = new Float32Array(16);
  let _cn = 0;
  function chipFloor() { const ov = engine.overlay; return ov && ov.firstChild && engine.w < 700 ? ov.offsetTop + ov.offsetHeight + 14 : -1e9; }
  function placeLabel(el, v, dx, dy, minY) {
    _lp.copy(v).project(engine.camera);
    if (_lp.z > 1 || _lp.z < -1) { el.style.display = "none"; return; }
    el.style.display = "";
    let x = (_lp.x * 0.5 + 0.5) * engine.w + dx, y = (-_lp.y * 0.5 + 0.5) * engine.h + dy;
    const w = el.offsetWidth || 100, h = el.offsetHeight || 22;
    x = Math.min(engine.w - w / 2 - 6, Math.max(w / 2 + 6, x));
    if (minY > -1e8 && y - h / 2 < minY) y = minY + h / 2;
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < _cn; i++) if (Math.abs(x - _cx[i]) < (w + _cw[i]) / 2 + 6 && Math.abs(y - _cy[i]) < (h + _ch[i]) / 2 + 3) y = _cy[i] + (h + _ch[i]) / 2 + 3;
    if (_cn < 16) { _cx[_cn] = x; _cy[_cn] = y; _cw[_cn] = w; _ch[_cn++] = h; }
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
  const hide = (...els) => { for (const e of els) e.style.display = "none"; };
  function updateLabels() {
    const floorY = chipFloor(); _cn = 0;
    if (mode === "cubes") {
      hide(lblClip, lblAir, lblWater, lblSel, lblDet);
      for (const c of cubes) {
        const st = c.st, el = lblCube[c.key];
        const unit = c.key === "aluminium" || c.key === "lead" ? "atoms" : "molecules";
        const small = c.key === "air" ? `${T.fmtN(st.expected)} molecules on average` : `${st.drawn.toLocaleString("en-AU")} ${unit}${st.side !== S ? " · box 1% narrower (4 unit cells)" : ""}`;
        setHTML(el, `${T.SUB[c.key].name}<small>${small}</small>`);
        el.style.outline = sel === c.key ? "1px solid #ffe28a" : "";
        _p.set(c.cx, c.cy + HS + 3.2, c.cz);
        placeLabel(el, _p, 0, 0, floorY);
      }
    } else {
      for (const k of T.SUB_KEYS) hide(lblCube[k]);
      setHTML(lblClip, `Steel paper-clip wire, cut end<small>7.85 g/cm³; drawn far too small</small>`);
      _p.set(0, clipBlock.y + RC + 3, 0); placeLabel(lblClip, _p, 0, 0, floorY);
      if (engine.camera.aspect < 0.9) hide(lblAir, lblWater);
      else {
        setHTML(lblAir, `Air above<small>air molecules are not drawn</small>`);
        _p.set(-SW / 2 + 5, 17, 0); placeLabel(lblAir, _p, 14, 0, floorY);
        setHTML(lblWater, `Liquid water<small>about 33 molecules in every nm³</small>`);
        _p.set(-SW / 2, -SH - 3, SD / 2); placeLabel(lblWater, _p, 40, 6, floorY);
      }
      const d = dets.find((q) => q.state === "there");
      if (d && d.pos) { setHTML(lblDet, `Detergent molecule<small>head loves water, tail avoids it</small>`); _p.set(d.pos[0], d.pos[1] + 12, d.pos[2]); placeLabel(lblDet, _p, 0, 0, floorY); } else hide(lblDet);
      if (selMol >= 0 && selInfo) {
        setHTML(lblSel, selInfo.surface ? `Surface molecule<small>pull from neighbours (attractions only): ${selInfo.pull.toFixed(1)} units, inward</small>` : `Inside molecule<small>attractions cancel: ${selInfo.pull < 0.05 ? "0" : selInfo.pull.toFixed(1)}</small>`);
        _p.set(mx[selMol], my[selMol], mz[selMol]); placeLabel(lblSel, _p, 54, -24, floorY);
      } else hide(lblSel);
    }
  }

  // ----- panel -----
  const MODES = [{ value: "cubes", label: "Why densities differ" }, { value: "tension", label: "Surface tension" }];
  function switcher(parent) {
    W_.mode = K.segmented(parent, MODES, mode, (v) => setMode(v));
  }
  function buildPanel() {
    panel.replaceChildren();
    const about = K.card(panel, "What you are looking at");
    switcher(about);
    if (mode === "cubes") {
      about.insertAdjacentHTML("beforeend", `<p>Six cubes of the <strong>same size</strong>: 2 nm along, so each holds 8 cubic nanometres. Inside each is the real number of particles you would find in that much of the material. Red balls with two white bumps are water molecules (H₂O), grey chains are oil molecules, silver balls are metal atoms, and the blue and red pairs are the nitrogen and oxygen molecules of air.</p>`);
      about.insertAdjacentHTML("beforeend", `<p class="hint">Click a cube for its count and the sum. Drag to turn the view. The cube sizes and counts are rounded; see "What is simplified here".</p>`);
    } else {
      about.insertAdjacentHTML("beforeend", `<p>${L(T.SURFACE_INTRO)} Click any water molecule to see the pulls on it. A steel paper clip floats on the top; add detergent to see what changes.</p>`);
    }
    const explain = K.card(panel, "What's happening", "explain");
    W_.explain = document.createElement("div"); explain.appendChild(W_.explain);

    if (mode === "cubes") buildCubesPanel(); else buildTensionPanel();
    buildMissions();
    K.quiz(panel, T.quizList(lens.band));
    const mix = K.card(panel, "Common mix-ups");
    mix.insertAdjacentHTML("beforeend", `<ul class="cmp-list" style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:9px;font-size:.84rem;color:var(--ink-dim)">${T.mixups(lens.band).map(([a, b]) => `<li><b style="color:var(--t-warn)">${a}</b><br>${b}</li>`).join("")}</ul>`);
    const hon = K.card(panel, "What is simplified here");
    hon.insertAdjacentHTML("beforeend", `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:.82rem;color:var(--ink-dim)">${T.honesty(lens.band).map((t) => `<li>${t}</li>`).join("")}</ul>`);
    const src = K.card(panel, "Data and sources");
    src.insertAdjacentHTML("beforeend", `<ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:.78rem;color:var(--ink-dim)">${T.SOURCES.map((s) => `<li>${s.what}. <span style="color:var(--ink-faint)">${s.ref}</span>${s.url ? ` <a href="${s.url}" target="_blank" rel="noopener" style="color:var(--accent)">source</a>` : ""}</li>`).join("")}</ul>`);
    uiT = 0; explT = 0;
  }

  function buildCubesPanel() {
    const c = K.card(panel, "Same volume, different contents");
    const tbl = document.createElement("table");
    tbl.style.cssText = "width:100%;border-collapse:collapse;font-size:.78rem";
    tbl.innerHTML = `<thead><tr style="color:var(--ink-faint);text-align:left"><th style="padding:2px 4px 6px 0">Material</th><th style="padding:2px 4px 6px">Particles in cube</th><th style="padding:2px 4px 6px">× mass each (zg)</th><th style="padding:2px 0 6px 4px">= density (g/cm³)</th></tr></thead>`;
    const body = document.createElement("tbody"); tbl.appendChild(body);
    W_.rows = {};
    for (const k of T.SUB_KEYS) {
      const s = stats[k];
      const tr = document.createElement("tr");
      tr.style.cssText = "border-top:1px solid var(--panel-border);cursor:pointer";
      tr.tabIndex = 0; tr.setAttribute("role", "button");
      tr.innerHTML = `<td style="padding:6px 4px 6px 0"><b style="color:var(--ink)">${T.SUB[k].name}</b></td><td style="padding:6px 4px">${k === "air" ? T.fmtN(s.expected) + " (avg)" : s.drawn.toLocaleString("en-AU")}</td><td style="padding:6px 4px">${T.fmtZg(s.massEach)}</td><td style="padding:6px 0 6px 4px"><b style="color:var(--ink)">${T.fmtRho(s.rhoPicture)}</b></td>`;
      const go = () => { selectCube(k); engine.select({ title: T.SUB[k].name, kind: "cube" }); };
      tr.addEventListener("click", go); tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      body.appendChild(tr); W_.rows[k] = tr;
    }
    c.appendChild(tbl);
    c.insertAdjacentHTML("beforeend", `<p class="hint">1 zg (zeptogram) = 10⁻²¹ g, and 1 nm³ = 10⁻²¹ cm³, so <strong>zg per nm³ is the same number as g per cm³</strong>. Mass of the cube ÷ 8 nm³ gives the density. Data-book values: water 0.998, ice 0.917, oil 0.92, aluminium 2.70, lead 11.34, air 0.0012 g/cm³.</p>`);
    const b = K.buttonRow(c);
    K.button(b, "Compare with water", () => { W_.cmp = !W_.cmp; refreshCompare(); }, { toggle: true });
    W_.cmpOut = document.createElement("div"); W_.cmpOut.style.cssText = "font-size:.8rem;margin-top:6px"; c.appendChild(W_.cmpOut);
    refreshRows();
  }
  function refreshCompare() {
    if (!W_.cmpOut) return;
    W_.cmpOut.innerHTML = W_.cmp ? `<table style="width:100%;border-collapse:collapse;font-size:.76rem;color:var(--ink-dim)">${T.SUB_KEYS.filter((k) => k !== "water").map((k) => {
      const s = stats[k]; const f = (x) => (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x >= 0.1 ? x.toFixed(2) : x.toFixed(3));
      return `<tr style="border-top:1px solid var(--panel-border)"><td style="padding:4px 4px 4px 0"><b style="color:var(--ink)">${T.SUB[k].name}</b></td><td>${f(s.countRatio)}× as many</td><td>× ${f(s.massRatio)}× as heavy</td><td>= <b style="color:var(--ink)">${f(s.rhoRatio)}×</b> the density</td></tr>`;
    }).join("")}</table>` : "";
  }
  function refreshRows() {
    if (!W_.rows) return;
    for (const k of T.SUB_KEYS) W_.rows[k].style.background = sel === k ? "rgba(255,226,138,0.14)" : "";
  }
  function selectCube(k) {
    sel = k;
    if (k) MS.cubes.picked.add(k);
    refreshRows(); explT = 0;
  }

  function buildTensionPanel() {
    const c = K.card(panel, "Detergent and the paper clip");
    c.insertAdjacentHTML("beforeend", `<p>The clip is made of steel, almost 8 times denser than water, but it rests on the surface. Add drops of detergent and watch the surface tension fall.</p>`);
    const r1 = K.buttonRow(c);
    W_.addBtn = K.button(r1, "Add a drop of detergent", () => { addDrop(); explT = 0; }, { kind: "primary" });
    K.button(r1, "Push the clip under", () => { pushClip(); explT = 0; });
    K.button(r1, "Reset", () => { resetSlab(); explT = 0; });
    W_.meter = document.createElement("div"); W_.meter.style.cssText = "margin-top:10px"; c.appendChild(W_.meter);
    const r2 = K.buttonRow(c);
    K.button(r2, "Pick a surface molecule", () => pickBy(true));
    K.button(r2, "Pick one inside", () => pickBy(false));
    W_.hi = K.checkbox(c, "Colour the surface layer", hiSurface, (v) => { hiSurface = v; paintWater(); });
    W_.lk = K.checkbox(c, "Show attractions near the surface (dotted lines)", showLinks, (v) => { showLinks = v; });
    c.insertAdjacentHTML("beforeend", `<p class="hint">The cyan arrows show pulls from the molecule's neighbours (within about 5 Å). The thick yellow arrow is the pull from neighbours (attractions only), averaged over time. Repulsion and pressure balance it, so molecules do not rush inward; surface tension acts along the surface. Drag to turn the view.</p>`);

    const f = K.card(panel, "Would the clip float?");
    f.insertAdjacentHTML("beforeend", `<p>A surface can hold up to <strong>2 × its surface tension</strong> (in mN/m) for each metre of wire, one pull for each side of the wire, if everything is perfect. Pick a liquid and compare it with the clip's weight.</p>`);
    W_.liq = "water";
    K.segmented(f, T.LIQUID_CHOICES.map((l) => ({ value: l.key, label: l.name.replace("Water with dishwashing liquid", "Soapy water") })), W_.liq, (v) => { W_.liq = v; if (v === "ethanol") st2.ethanolTried = true; refreshFloat(); });
    W_.floatOut = document.createElement("div"); W_.floatOut.style.cssText = "margin-top:8px;font-size:.84rem"; f.appendChild(W_.floatOut);
    refreshFloat();

    const d = K.card(panel, "Surface tension data");
    d.insertAdjacentHTML("beforeend", `<table style="width:100%;border-collapse:collapse;font-size:.8rem"><tbody>
      <tr><td style="padding:5px 0"><b style="color:var(--ink)">Water</b> (20 °C)</td><td style="text-align:right">72.8 mN/m</td></tr>
      <tr style="border-top:1px solid var(--panel-border)"><td style="padding:5px 0"><b style="color:var(--ink)">Ethanol</b> (20 °C)</td><td style="text-align:right">about 22 mN/m</td></tr>
      <tr style="border-top:1px solid var(--panel-border)"><td style="padding:5px 0"><b style="color:var(--ink)">Dishwashing-liquid solution</b></td><td style="text-align:right">about 25–35 mN/m</td></tr></tbody></table>
      <p class="hint">Every liquid has surface tension; water's is unusually high. 1 mN/m is a pull of one thousandth of a newton along each metre of surface. Sources: CRC Handbook; see "Data and sources".</p>`);
    d.insertAdjacentHTML("beforeend", `<p>${L(T.STRIDER_NOTE)}</p>`);
  }
  function refreshFloat() {
    if (!W_.floatOut) return;
    const liq = T.LIQUID_CHOICES.find((q) => q.key === W_.liq) || T.LIQUID_CHOICES[0];
    const sup = T.maxSupport(liq.gamma), fl = T.clipFloats(liq.gamma), ratio = T.supportRatio(liq.gamma);
    W_.floatOut.innerHTML = `<p style="margin:0 0 4px">Clip: ρ g π r² = <b>${w_clip.toFixed(1)} mN/m</b> (1 mm steel wire).<br>${liq.name}: γ = ${liq.gamma} mN/m, so at most 2 × ${liq.gamma} = <b>${sup.toFixed(1)} mN/m</b> in this simplified model.</p>
      <p style="margin:0"><b style="color:${fl ? "var(--t-ok, #4ade80)" : "var(--t-warn, #fbbf24)"}">${fl ? "Should float if placed gently" : "Sinks"}</b> (${w_clip.toFixed(1)} ${fl ? "<" : ">"} ${sup.toFixed(1)}${lens.band === "ext" ? `, weight ÷ support = ${ratio.toFixed(2)}` : ""}). ${liq.key === "ethanol" ? "Ethanol's surface is much weaker, so the same clip goes down." : liq.key === "soapy" ? "Detergent halves the pull. The clip is now heavier than the surface can hold." : "Water's strong surface holds the clip with room to spare."}</p>`;
  }

  function buildMissions() {
    const c = K.card(panel, "Missions", "missions");
    const ol = document.createElement("ol");
    const list = T.missionList().filter((m) => !m.band || lens.atLeast(m.band));
    missionItems = list.map((m) => {
      const li = document.createElement("li"); li.innerHTML = `<span>${L(m.text)}</span>`;
      if (done.has(m.id)) li.classList.add("done");
      ol.appendChild(li); return { m, li };
    });
    c.appendChild(ol);
    const bar = document.createElement("div"); bar.className = "progress"; bar.innerHTML = "<div></div>"; c.appendChild(bar);
    missionFill = bar.firstChild;
    updateMissions();
  }
  function updateMissions() {
    let n = 0;
    MS.cubes.airSeen = airSeen;
    for (const it of missionItems) {
      if (!done.has(it.m.id)) {
        let ok = false;
        try { ok = it.m.check(MS); } catch { ok = false; }
        if (ok) { done.add(it.m.id); it.li.classList.add("done"); engine.toast?.(`🎯 Mission complete: ${it.li.textContent.slice(0, 80)}`, 3200); }
      }
      if (done.has(it.m.id)) n++;
    }
    if (missionFill) missionFill.style.width = `${(n / Math.max(1, missionItems.length)) * 100}%`;
  }

  function refreshUI() {
    if (mode === "cubes") {
      chipA(`Each cube: <b>2 nm × 2 nm × 2 nm = 8 nm³</b> <span class="w" style="color:var(--ink-faint)">· same volume</span>`);
      chipB(`Air cube right now: <b>${airNow}</b> ${airNow === 1 ? "molecule" : "molecules"} <span class="w" style="color:var(--ink-faint)">(average ${T.fmtN(stats.air.expected)})</span>`);
    } else {
      chipA(`Surface tension now: <b>${gamma.toFixed(1)} mN/m</b> <span class="w" style="color:var(--ink-faint)">· clean water 72.8</span>`);
      const word = clipBlock.state === "floating" ? "floating" : clipBlock.state === "sunk" ? "sunk" : "sinking";
      chipB(`Clip: <b>${word}</b> <span class="w" style="color:var(--ink-faint)">· weight ${w_clip.toFixed(1)}, support up to ${T.maxSupport(gamma).toFixed(1)} mN/m</span>`);
      if (W_.meter) {
        const pct = (gamma / T.SURF.water) * 100, crit = (T.criticalGamma() / T.SURF.water) * 100;
        const html = `<div style="font-size:.78rem;color:var(--ink-dim);margin-bottom:4px">Surface tension <b style="color:var(--ink)">${gamma.toFixed(1)} mN/m</b> · detergent molecules at the surface: <b style="color:var(--ink)">${nDet}</b> of ${SAT} that would fill it</div><div style="position:relative;height:10px;border-radius:5px;background:rgba(255,255,255,0.1);overflow:hidden"><div style="height:100%;width:${pct.toFixed(1)}%;background:linear-gradient(90deg,#38bdf8,#5eead4)"></div><div style="position:absolute;top:0;bottom:0;left:${crit.toFixed(1)}%;width:2px;background:#fbbf24"></div></div><div style="font-size:.7rem;color:var(--ink-faint);margin-top:3px">Gold line: the clip sinks below ${T.criticalGamma().toFixed(1)} mN/m (its weight ÷ 2).</div>`;
        if (W_.meter._h !== html) { W_.meter.innerHTML = html; W_.meter._h = html; }
      }
      if (W_.addBtn) W_.addBtn.disabled = drop.active || nDet >= SAT;
    }
    updateMissions();
  }
  function refreshExplain() {
    let html;
    if (mode === "cubes") html = T.narrativeCubes({ sel, airNow, airSeen }, lens.band);
    else {
      const ratio = w_clip / T.maxSupport(gamma);
      html = T.narrativeSurface({ coverage, gamma, nDet, clip: clipBlock.state === "floating" ? "floating" : clipBlock.state === "sunk" ? "sunk" : "sinking", pushed: clipBlock.pushed, dimple: Adim, ratio, sel: selInfo }, lens.band);
    }
    if (W_.explain && W_.explain._h !== html) { W_.explain.innerHTML = html; W_.explain._h = html; }
  }

  // ----- mode switching and camera -----
  function viewFor(m) {
    const a = engine.camera.aspect, tf = Math.tan(THREE.MathUtils.degToRad(engine.camera.fov / 2));
    if (m === "cubes") {
      const portrait = a < 0.9, cols = portrait ? 2 : 3, rows = portrait ? 3 : 2, G = 13, gy = portrait ? 11 : 17;
      const w = cols * S + (cols - 1) * G + 8, h0 = rows * S + (rows - 1) * gy + 12;
      const h = portrait ? h0 * 1.2 : h0;                      // portrait: leave room under the HUD chips at the top
      const d = Math.max(h / (2 * tf), w / (2 * tf * a)) + S * 0.6;
      return { target: new THREE.Vector3(0, 2 + (portrait ? 0.1 * 2 * d * tf : 0), 0), distance: d, dir: new THREE.Vector3(0.16, 0.2, 1) };
    }
    const w = SW + 12, h = 70;
    const d = Math.max(h / (2 * tf), w / (2 * tf * a)) + 6;
    return { target: new THREE.Vector3(0, -6 + (a < 0.9 ? 0.1 * 2 * d * tf : 0), 0), distance: d, dir: new THREE.Vector3(0.07, 0.07, 1) };
  }
  function setMode(m) {
    if (m === mode) return;
    mode = m;
    gCubes.visible = m === "cubes"; gSlab.visible = m === "tension";
    selMol = -1; nbrCache = null;
    if (W_.mode) W_.mode.set(m);
    buildPanel();
    engine.canvas?.setAttribute("aria-label", T.canvasLabel(m));
    engine.select(null);
    if (engine.current === level && !engine.busy) {
      const v = viewFor(m);
      engine.fly(v.target, v.target.clone().addScaledVector(v.dir.clone().normalize(), v.distance), 0.9).then(() => { engine.userMoved = false; });
    }
    uiT = 0; explT = 0;
  }
  gSlab.visible = false;

  level = {
    title: "Particles and density",
    topics: ["density", "surface-tension", "particle-theory"],
    root,
    get pickables() { return mode === "cubes" ? cubeProxies : [proxy2, clipG]; },
    metersPerUnit: 1e-10,
    get view() { return viewFor(mode); },
    minDistance: 30, maxDistance: 600, near: 3, far: 4000,
    enablePan: true,
    env: { bg: ["#1d4468", "#0a2338", "#2a6592"], fog: ["#0b2a42", 0.0006], exposure: 1.1, bloom: [0.2, 0.5, 0.9], aperture: 0.0003 },
    get clay() { return mode === "cubes" ? { groundY: -HS - 2.2 - ((engine.camera.aspect < 0.9) ? S + 11 : (S + 17) / 2), groundR: 70, shadow: 80, freq: 0.3, amount: 0.5 } : { groundY: -SH - 1, groundR: 60, shadow: 70, freq: 0.3, amount: 0.5 }; },
    _clip: clip,
    _debug() { return { mode, sel, selMol, airNow, gamma, nDet, coverage, clip: { ...clipBlock }, Adim, counts: { nO1, nH1, nM1, nB1, NM } }; },
    // hooks the tests / orchestrator can use
    _setMode: (m) => setMode(m), _selectCube: (k) => selectCube(k), _addDrop: () => addDrop(), _pushClip: () => pushClip(), _reset: () => resetSlab(), _pickBy: (s) => pickBy(s),
    info(obj) {
      if (obj?.userData?.cubeKey) { const k = obj.userData.cubeKey, s = stats[k]; return { title: `${T.SUB[k].name}: ${k === "air" ? "0.2 molecules on average" : s.drawn.toLocaleString("en-AU") + " particles"} in this cube<small>click for the sum</small>` }; }
      if (obj === proxy2) return { title: "Water molecule<small>click to see the pulls on it</small>" };
      if (obj?.userData?.isClip) return { title: "Steel paper-clip wire<small>shown far too small compared with the molecules</small>" };
      return null;
    },
    onClick(e, hit) {
      if (mode === "cubes") {
        const k = hit?.object?.userData?.cubeKey;
        if (k) { selectCube(k); engine.select({ title: T.SUB[k].name, kind: "cube" }); return true; }
        selectCube(null); return false;
      }
      if (hit && hit.object === proxy2 && hit.instanceId != null) { selectMolecule(hit.instanceId); engine.select({ title: "Water molecule", kind: "molecule" }); return true; }
      selectMolecule(-1); return false;
    },
    onSelect(info) { if (!info) { if (mode === "cubes") { sel = null; refreshRows(); } else { selMol = -1; } } },
    onLens() { buildPanel(); },
    mountPanel(el) {
      if (!panel.childNodes.length) buildPanel();
      el.appendChild(panel);
      engine.overlay.appendChild(overlay);
      engine.labelLayer.appendChild(labelLayer);
      engine.canvas?.setAttribute("aria-label", T.canvasLabel(mode));
    },
    unmountPanel() { overlay.remove(); labelLayer.remove(); },
    dispose() { overlay.remove(); labelLayer.remove(); panel.remove(); },
    update(dt, t, rdt = dt) {
      const sdt = Math.min(dt, 1 / 20);
      clock += sdt;
      if (mode === "cubes") updateCubes(sdt, clock); else updateSlab(sdt, clock);
      updateLabels();
      uiT -= rdt; explT -= rdt;
      if (uiT <= 0) { uiT = 0.2; refreshUI(); }
      if (explT <= 0) { explT = 0.5; refreshExplain(); }
    },
  };
  // first frame: put everything in place
  updateCubes(0, 0);
  buildPanel();
  return level;
}
