// Text, data and pure geometry for the particle-scale Density level (densityParticles.js). No DOM, no three.js:
// tested by tests/densityParticles.test.mjs.
//
// Every number of particles and every mass below is COMPUTED from real data, never typed in:
//   particles per nm³  n = ρ × 10⁻²¹ cm³/nm³ × N_A / M        (ρ in g/cm³ = g per cm³, M in g/mol, N_A = 6.02214076 × 10²³ /mol)
//   mass of one particle  m = M / N_A                          (in zeptograms: 1 zg = 10⁻²¹ g)
//   density from the picture  ρ = (particles in the cube × m) / V_cube
// A handy coincidence: 1 nm³ = 10⁻²¹ cm³, so "zg per nm³" is exactly "g per cm³". Year 7 sees that as: number × mass ÷ volume.
// Worked example, water (ρ = 0.998 g/cm³, M = 18.015 g/mol): n = 0.998 × 10⁻²¹ × 6.022 × 10²³ / 18.015 = 33.36 molecules/nm³;
// in the 8 nm³ cube that is 266.9 → 267 molecules, each 0.02992 zg → 7.99 zg → 7.99 / 8 = 0.998 g/cm³.
// Every value that differs by year is { y7: "...", ext: "..." } (lens.pick chooses). Australian spelling.

import { SOLIDS, LIQUIDS, SOURCES as DENSITY_SOURCES } from "./densityModel.js";

// ---------- constants ----------
export const NA = 6.02214076e23;            // 1/mol (SI 2019 exact value)
export const U_G = 1.66053907e-24;          // g per atomic mass unit (CODATA 2018)
export const ATOMIC = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, Al: 26.982, Pb: 207.2 };   // IUPAC standard atomic weights
const molar = (f) => Object.entries(f).reduce((a, [e, n]) => a + ATOMIC[e] * n, 0);

export const CUBE_NM = 2;                    // each cube is 2 nm × 2 nm × 2 nm
export const CUBE_A = CUBE_NM * 10;          // = 20 Å (1 world unit = 1 Å)
export const V_CUBE = CUBE_NM ** 3;          // 8 nm³

// ---------- the six substances ----------
// rho: g/cm³ from the shared density model (densityModel.js) so the lab and the particle view always agree.
export const SUBSTANCES = [
  { key: "water", name: "Water", formula: "H₂O", particle: "water molecule", plural: "water molecules", M: molar({ H: 2, O: 1 }), rho: LIQUIDS.water.rho, state: "liquid", src: "crc" },
  { key: "ice", name: "Ice", formula: "H₂O", particle: "water molecule", plural: "water molecules", M: molar({ H: 2, O: 1 }), rho: SOLIDS.ice.rho, state: "solid", src: "usgs" },
  { key: "oil", name: "Vegetable oil", formula: "C₅₇H₁₀₄O₆ (triolein)", particle: "oil molecule", plural: "oil molecules", M: molar({ C: 57, H: 104, O: 6 }), rho: LIQUIDS.oil.rho, state: "liquid", src: "etb" },
  { key: "aluminium", name: "Aluminium", formula: "Al", particle: "aluminium atom", plural: "aluminium atoms", M: ATOMIC.Al, rho: SOLIDS.aluminium.rho, state: "solid", src: "crc" },
  { key: "lead", name: "Lead", formula: "Pb", particle: "lead atom", plural: "lead atoms", M: ATOMIC.Pb, rho: SOLIDS.lead.rho, state: "solid", src: "crc", side: 4 * 4.95 },   // side: 4 × 4 × 4 unit cells (19.8 Å): a rigid fcc block cannot hold the data count in exactly 20 Å, so this cube is 1 % narrower
  { key: "air", name: "Air", formula: "N₂, O₂ …", particle: "air molecule", plural: "air molecules", M: 28.96, rho: 0.001204, state: "gas", src: "air" },
];
export const SUB = Object.fromEntries(SUBSTANCES.map((s) => [s.key, s]));
export const SUB_KEYS = SUBSTANCES.map((s) => s.key);

/** Particles per nm³ from density and molar mass. */
export const perNm3 = (rho, M) => (rho * 1e-21 * NA) / M;
/** Mass of one particle in zeptograms (10⁻²¹ g). */
export const massZg = (M) => (M / NA) * 1e21;

/**
 * Everything the readout shows for one substance in the cube.
 * `count` is the number of particles used for the arithmetic: the rounded count that is drawn (air: the expected 0.2).
 */
export function cubeStats(sub, V0) {
  const s = typeof sub === "string" ? SUB[sub] : sub;
  const V = V0 ?? ((s.side ?? CUBE_A) ** 3) / 1000;
  const n = perNm3(s.rho, s.M);
  const expected = n * V;
  const drawn = s.key === "air" ? null : Math.round(expected);
  const count = s.key === "air" ? expected : drawn;
  const m = massZg(s.M);
  const massCube = count * m;
  const w = SUB.water, nw = perNm3(w.rho, w.M), mw = massZg(w.M);
  return {
    key: s.key, name: s.name, side: s.side ?? CUBE_A, n, expected, drawn, count, massEach: m, massCube, volume: V,
    rhoPicture: massCube / V,             // g/cm³ (zg per nm³)
    rhoData: s.rho,
    // against water: "x times as many particles, each y times as heavy, so z times the density"
    countRatio: n / nw, massRatio: m / mw, rhoRatio: (n / nw) * (m / mw),
    // for an almost-empty gas cube
    volumePerParticle: 1 / n,             // nm³ you need on average to find one
  };
}

export const AIR_BOX_A = 80;                                          // Å: the periodic box the air molecules fly around in
export const AIR_BOX_N = Math.round(perNm3(SUB.air.rho, SUB.air.M) * (AIR_BOX_A / 10) ** 3);   // 13 molecules in 512 nm³
export const airExpectedInCube = () => (AIR_BOX_N * CUBE_A ** 3) / AIR_BOX_A ** 3;               // ≈ 0.2

/** Mass of the air in a room, kg: ρ × V. A 8 m × 8 m × 3 m classroom: 192 m³ → about 231 kg. */
export const roomAirKg = (m3) => SUB.air.rho * 1000 * m3;           // g/cm³ → kg/m³ is ×1000

// ---------- crystal lattices (the drawn arrangements; the test checks they give the data-book density) ----------
export const LATTICES = {
  ice: { a: 4.52, c: 7.37, perCell: 4, name: "ice Ih (hexagonal)" },
  aluminium: { a: 4.05, perCell: 4, name: "face-centred cubic" },
  lead: { a: 4.95, perCell: 4, name: "face-centred cubic" },
};
export const cellVolumeA3 = (k) => (k === "ice" ? (Math.sqrt(3) / 2) * LATTICES.ice.a ** 2 * LATTICES.ice.c : LATTICES[k].a ** 3);
/** Density (g/cm³) of a perfect lattice: atoms per cell × mass of one / volume of one cell. */
export const latticeDensity = (k) => (LATTICES[k].perCell * SUB[k].M * U_G) / (cellVolumeA3(k) * 1e-24);
/** Nearest-neighbour distance, Å (the atoms in metals touch their nearest neighbours; drawn radius = half of this). */
export const nearestNeighbour = (k) => (k === "ice" ? 2.76 : LATTICES[k].a / Math.SQRT2);

// ---------- pure geometry (seeded, so the picture is the same every time) ----------
export const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/**
 * Fill a cube (side S, centred on the origin) from a lattice. The lattice offset is chosen so that the number of sites inside is
 * as close as possible to `target` (the data-derived count), then any extras at the faces are dropped.
 * Returns { pts: [[x,y,z]…], nbr (ice only: unit vectors to the 4 neighbours, for orientation) }.
 */
export function fillLattice(key, S = CUBE_A, target, seed = 7) {
  const rnd = mulberry(seed);
  const L = LATTICES[key];
  let v1, v2, v3, motif;
  if (key === "ice") {
    v1 = [L.a, 0, 0]; v2 = [-L.a / 2, (L.a * Math.sqrt(3)) / 2, 0]; v3 = [0, 0, L.c];
    motif = [[1 / 3, 2 / 3, 1 / 16], [2 / 3, 1 / 3, 9 / 16], [2 / 3, 1 / 3, 15 / 16], [1 / 3, 2 / 3, 7 / 16]];   // Wyckoff 4f, z = 1/16
  } else {
    v1 = [L.a, 0, 0]; v2 = [0, L.a, 0]; v3 = [0, 0, L.a];
    motif = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
  }
  const R = Math.ceil((S / 2 + 6) / Math.min(L.a, L.c || L.a)) + 2;
  const all = (off) => {
    const pts = [];
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (let k = -R; k <= R; k++) for (const f of motif) {
      const a = i + f[0], b = j + f[1], c = k + f[2];
      pts.push([a * v1[0] + b * v2[0] + c * v3[0] + off[0], a * v1[1] + b * v2[1] + c * v3[1] + off[1], a * v1[2] + b * v2[2] + c * v3[2] + off[2]]);
    }
    return pts;
  };
  const half = S / 2;
  const inside = (p) => Math.abs(p[0]) <= half && Math.abs(p[1]) <= half && Math.abs(p[2]) <= half;
  const cell = key === "ice" ? [L.a, L.a, L.c] : [L.a, L.a, L.a];
  let best = null, bestCost = 1e9;
  for (let t = 0; t < 4000; t++) {
    const off = [(rnd() - 0.5) * cell[0], (rnd() - 0.5) * cell[1], (rnd() - 0.5) * cell[2]];
    const n = all(off).filter(inside).length;
    const cost = Math.abs(n - target) + (n < target ? 0.5 : 0);
    if (cost < bestCost) { bestCost = cost; best = off; }
    if (cost === 0) break;
  }
  const full = all(best);
  let pts = full.filter(inside);
  pts.sort((p, q) => Math.max(Math.abs(q[0]), Math.abs(q[1]), Math.abs(q[2])) - Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2])));
  if (pts.length > target) pts = pts.slice(pts.length - target);

  let nbr = null;
  if (key === "ice") {
    const ctx = full.filter((p) => Math.abs(p[0]) <= half + 6 && Math.abs(p[1]) <= half + 6 && Math.abs(p[2]) <= half + 6);
    nbr = pts.map((p) => {
      const out = [];
      for (const q of ctx) {
        const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
        if (d > 0.1 && d < 3.2) out.push([(q[0] - p[0]) / d, (q[1] - p[1]) / d, (q[2] - p[2]) / d]);
      }
      return out;
    });
  }
  return { pts, nbr };
}

/** n points in a cube of side S with no two closer than minDist (random sequential addition). */
export function packLiquid(n, S = CUBE_A, minDist = 2.3, margin = 0.9, seed = 11) {
  const rnd = mulberry(seed);
  const pts = [];
  const h = S / 2 - margin, d2 = minDist * minDist;
  let tries = 0;
  while (pts.length < n && tries < n * 4000) {
    tries++;
    const p = [(rnd() * 2 - 1) * h, (rnd() * 2 - 1) * h, (rnd() * 2 - 1) * h];
    let ok = true;
    for (const q of pts) { const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2]; if (dx * dx + dy * dy + dz * dz < d2) { ok = false; break; } }
    if (ok) pts.push(p);
  }
  return pts;
}

/**
 * Vegetable-oil molecules (triolein, C₅₇H₁₀₄O₆): a glycerol backbone of three carbons, each carrying an ester oxygen and a tail of
 * 18 carbons (the first has a C=O oxygen). That is 3 + 3 × (1 + 18 + 1) = 63 atoms apart from hydrogen (hydrogens are not drawn).
 * Tails are grown as a freely rotating chain (bond 1.5 Å, bond angle about 112°) that stays inside the cube and keeps its distance
 * from every other atom, so the tails coil up the way real chains do. The real molecule has one cis kink per tail: not drawn.
 * Returns [{ atoms: [{p:[x,y,z], el:"C"|"O"}], bonds: [[i,j]…] }].
 */
export function growOil(count, S = CUBE_A, seed = 5) {
  const rnd = mulberry(seed);
  const half = S / 2 - 0.8, BOND = 1.5, ANG = (68 * Math.PI) / 180, MIN2 = 2.15 * 2.15;
  const mols = [];
  const all = () => mols.flatMap((m) => m.atoms.map((a) => a.p));
  const unitRand = () => { for (;;) { const v = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1]; const l = Math.hypot(...v); if (l > 0.1 && l < 1) return v.map((x) => x / l); } };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
  // next direction: tilted by ANG from `prev` (so the bond angle is 112°) at a random azimuth
  const turn = (prev) => {
    const r = unitRand(); let u = cross(prev, r); if (Math.hypot(...u) < 1e-3) u = cross(prev, [1, 0, 0]); u = norm(u);
    const w = cross(prev, u), az = rnd() * 2 * Math.PI, c = Math.cos(ANG), s = Math.sin(ANG);
    return norm(prev.map((p, i) => p * c + s * (u[i] * Math.cos(az) + w[i] * Math.sin(az))));
  };
  const ok = (p, mine, skip) => {
    if (Math.abs(p[0]) > half || Math.abs(p[1]) > half || Math.abs(p[2]) > half) return false;
    for (const q of others) { const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2]; if (dx * dx + dy * dy + dz * dz < MIN2) return false; }
    for (let i = 0; i < mine.length; i++) { if (i === skip) continue; const q = mine[i].p; const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2]; if (dx * dx + dy * dy + dz * dz < MIN2) return false; }
    return true;
  };
  let others = [];
  const build = () => {
    const atoms = [], bonds = [];
    const add = (p, el, from) => { atoms.push({ p, el }); if (from != null) bonds.push([from, atoms.length - 1]); return atoms.length - 1; };
    const step = (from, dirPrev, len = BOND) => {
      for (let t = 0; t < 40; t++) {
        const d = dirPrev ? turn(dirPrev) : unitRand(), q = atoms[from].p;
        const p = [q[0] + d[0] * len, q[1] + d[1] * len, q[2] + d[2] * len];
        if (ok(p, atoms, from)) return { d, p };
      }
      return null;
    };
    // glycerol: three carbons in a row
    const p0 = [(rnd() * 2 - 1) * half, (rnd() * 2 - 1) * half, (rnd() * 2 - 1) * half];
    if (!ok(p0, atoms, -1)) return null;
    const g0 = add(p0, "C", null);
    const s1 = step(g0, null); if (!s1) return null;
    const g1 = add(s1.p, "C", g0);
    const s2 = step(g1, s1.d); if (!s2) return null;
    const g2 = add(s2.p, "C", g1);
    for (const g of [g0, g1, g2]) {
      // ester oxygen off the glycerol carbon, then the tail
      let s = step(g, null); if (!s) return null;
      let prev = add(s.p, "O", g), dir = s.d;
      for (let k = 1; k <= 18; k++) {
        s = step(prev, dir); if (!s) return null;
        const c = add(s.p, "C", prev);
        if (k === 1) {                       // the carbonyl oxygen on the first carbon of the tail
          const o = step(c, s.d, 1.25); if (!o) return null;
          add(o.p, "O", c);
        }
        prev = c; dir = s.d;
      }
    }
    return { atoms, bonds };
  };
  let guard = 0;
  while (mols.length < count && guard++ < 4000) {
    others = all();
    const m = build();
    if (m) mols.push(m);
  }
  return mols;
}

// ---------- the water slab for the surface-tension view ----------
export const SLAB = { W: 64, D: 12, H: 32 };             // Å: width (x), depth (z), height below the surface (y from −H to 0)
/** Liquid water number density in molecules per Å³ (from the data-book density, 0.998 g/cm³ → 33.4 per nm³). */
export const N_LIQ = perNm3(SUB.water.rho, SUB.water.M) / 1000;
/** Molecules in the slab and their home positions: random packing, periodic sideways (x and z), surface at y = 0. */
export function buildSlab({ W, D, H } = SLAB, minDist = 2.3, seed = 3) {
  const rnd = mulberry(seed);
  const n = Math.round(N_LIQ * W * D * H);
  const xs = [], ys = [], zs = [];
  const d2 = minDist * minDist;
  let tries = 0;
  while (xs.length < n && tries < n * 6000) {
    tries++;
    const x = (rnd() - 0.5) * W, y = -rnd() * H, z = (rnd() - 0.5) * D;
    let ok = true;
    for (let i = 0; i < xs.length; i++) {
      let dx = Math.abs(x - xs[i]); dx = Math.min(dx, W - dx);
      if (dx > minDist) continue;
      let dz = Math.abs(z - zs[i]); dz = Math.min(dz, D - dz);
      const dy = y - ys[i];
      if (dx * dx + dy * dy + dz * dz < d2) { ok = false; break; }
    }
    if (ok) { xs.push(x); ys.push(y); zs.push(z); }
  }
  return { n: xs.length, target: n, xs, ys, zs, W, D, H };
}
/** Neighbour count within rc of molecule i (sideways periodic). */
export function neighbours(slab, i, rc = 5.0) {
  const out = [], { xs, ys, zs, W, D } = slab;
  for (let j = 0; j < slab.n; j++) {
    if (j === i) continue;
    let dx = xs[j] - xs[i]; dx -= W * Math.round(dx / W);
    let dz = zs[j] - zs[i]; dz -= D * Math.round(dz / D);
    const dy = ys[j] - ys[i], d = Math.hypot(dx, dy, dz);
    if (d < rc) out.push({ j, dx, dy, dz, d });
  }
  return out;
}

/**
 * Time-averaged inward pull on a molecule at `depth` Å below a flat surface, in "unit pulls" (one unit = the pull of one neighbour,
 * every neighbour within rc pulling equally). Integrating the pull of a uniform liquid of density rho over the part of the sphere of
 * radius rc that is below the surface gives  F = π ρ [ (rc³ − d³)/3 − d² (rc − d) ]  for d < rc, and 0 deeper down: inside the liquid
 * the pulls from all sides cancel. (At any one instant the pulls never cancel exactly: that is thermal jostling; this is the average.)
 */
export function netPull(depth, rho = N_LIQ, rc = 5.0) {
  const d = Math.max(0, depth);
  if (d >= rc) return 0;
  return Math.PI * rho * ((rc ** 3 - d ** 3) / 3 - d * d * (rc - d));
}

// ---------- surface tension data and the paper-clip check (4.2.1) ----------
export const G = 9.81;                                 // m/s²
export const SURF = {
  water: 72.8,                                         // mN/m at 20 °C (CRC)
  ethanol: 22,                                         // mN/m at 20 °C (CRC)
  detergent: 28,                                       // mN/m: typical dishwashing-liquid solution (varies by brand, 25–35)
};
export const CLIP = { dia: 1.0, rho: SOLIDS.steel.rho * 1000 };   // wire diameter mm (typical), steel density kg/m³ (from the data book 7.85 g/cm³)
/** Weight of the clip wire per metre of length, mN/m:  ρ g π r². */
export const clipWeight = (dia = CLIP.dia, rho = CLIP.rho) => rho * G * Math.PI * (dia / 2000) ** 2 * 1000;
/** Most upward force the surface can give per metre of wire (ideal limit: both edges pulling straight up), mN/m. */
export const maxSupport = (gamma) => 2 * gamma;
/** weight / support: below 1 the surface can hold the clip, 1 or more it can't. */
export const supportRatio = (gamma, w = clipWeight()) => w / maxSupport(gamma);
export const clipFloats = (gamma, w = clipWeight()) => supportRatio(gamma, w) < 1;
/** The surface tension below which the clip sinks, mN/m (= w / 2). */
export const criticalGamma = (w = clipWeight()) => w / 2;
/**
 * Surface tension against detergent coverage c (0 = clean water, 1 = surface full of detergent). It falls steeply at first and then
 * levels off, the way measured curves do. The shape is illustrative; the two ends (72.8 and ≈ 28 mN/m) are data.
 */
export const gammaAt = (c, g0 = SURF.water, g1 = SURF.detergent) => g0 - (g0 - g1) * (1 - (1 - Math.min(1, Math.max(0, c))) ** 3);
/** Coverage at which the clip sinks. */
export const criticalCoverage = (g0 = SURF.water, g1 = SURF.detergent, w = clipWeight()) => {
  const f = (g0 - criticalGamma(w)) / (g0 - g1);
  return f >= 1 ? 1.0001 : 1 - Math.cbrt(1 - f);
};
export const DETERGENT_SATURATION = Math.round((SLAB.W * SLAB.D) / 45);   // molecules that fill this slab's surface: 64 Å × 12 Å = 7.7 nm² at about 0.45 nm² each → 17
export const DETERGENT_PER_DROP = 4;
export const LIQUID_CHOICES = [
  { key: "water", name: "Water", gamma: SURF.water },
  { key: "ethanol", name: "Ethanol", gamma: SURF.ethanol },
  { key: "soapy", name: "Water with dishwashing liquid", gamma: SURF.detergent },
];

// ---------- formatting helpers ----------
export const fmtVol = (v) => (Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2));
const f0 = (x) => Math.round(x).toLocaleString("en-AU");
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const f2 = (x) => (Math.round(x * 100) / 100).toFixed(2);
export const fmtN = (x) => (x >= 100 ? f0(x) : x >= 10 ? f1(x) : x >= 1 ? f2(x) : x >= 0.1 ? x.toFixed(2) : x.toFixed(3));
export const fmtRho = (r) => (r < 0.01 ? r.toFixed(4) : r < 10 ? r.toFixed(r < 1 ? 3 : 2) : r.toFixed(2));
export const fmtZg = (x) => (x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x >= 0.1 ? x.toFixed(3) : x >= 0.01 ? x.toFixed(4) : x.toFixed(5));
export const pick = (v, band) => (v == null ? "" : typeof v === "object" ? (v[band] ?? v.y7 ?? "") : v);

// ---------- sources ----------
export const SOURCES = [
  { what: "Densities used for the particle counts (g/cm³ at about 20 °C): water 0.998, ice 0.917, vegetable oil 0.92 (typical; real oils range 0.91–0.93), aluminium 2.70, lead 11.34", ref: "Same values as the Density lab (CRC Handbook; USGS Water Science School; Engineering ToolBox)", url: DENSITY_SOURCES[0].url },
  { what: "Air: 1.204 kg/m³ at 20 °C and 101.325 kPa, average molar mass 28.96 g/mol (78 % N₂, 21 % O₂, 1 % Ar and others)", ref: "CRC Handbook of Chemistry and Physics, 'Properties of air'; the ideal-gas check n = P/kT = 0.0250 molecules per nm³ agrees", url: "https://hbcp.chemnetbase.com/" },
  { what: "Avogadro constant 6.02214076 × 10²³ per mole and atomic mass unit 1.66053907 × 10⁻²⁴ g", ref: "SI 2019 (exact N_A); CODATA 2018 recommended values", url: "https://physics.nist.gov/cuu/Constants/" },
  { what: "Molar masses (g/mol): H 1.008, C 12.011, N 14.007, O 15.999, Al 26.982, Pb 207.2", ref: "IUPAC Commission on Isotopic Abundances and Atomic Weights (standard atomic weights)", url: "https://ciaaw.org/atomic-weights.htm" },
  { what: "Crystal structures: aluminium and lead are face-centred cubic with a = 4.05 Å and 4.95 Å (4 atoms per cell); ice Ih is hexagonal with a = 4.52 Å, c = 7.37 Å (4 molecules per cell). Each reproduces the data-book density to within 0.5 % (see the test)", ref: "CRC Handbook, 'Crystal structures and lattice parameters of the elements'; Petrenko & Whitworth, Physics of Ice (OUP, 1999)", url: "https://global.oup.com/academic/product/physics-of-ice-9780198518945" },
  { what: "Vegetable oil is a mixture of triglycerides. Triolein (C₅₇H₁₀₄O₆, M = 885.4 g/mol) stands in for them: olive oil is mostly this molecule, and other oils have similar masses (about 870–890). Real tails are slightly different lengths", ref: "PubChem, 'Triolein' (CID 5497163); Gunstone, The Chemistry of Oils and Fats (Blackwell, 2004)", url: "https://pubchem.ncbi.nlm.nih.gov/compound/Triolein" },
  { what: "Surface tension at 20 °C: water 72.8 mN/m, ethanol about 22 mN/m (water's is unusually high; most liquids are 15–35 mN/m)", ref: "CRC Handbook of Chemistry and Physics, 'Surface tension of common liquids'", url: "https://hbcp.chemnetbase.com/" },
  { what: "Dishwashing-liquid solutions give about 25–35 mN/m (28 used here; it varies by brand and strength). Pure sodium dodecyl sulfate levels off near 38 mN/m. A full surface holds one detergent molecule per 0.4–0.5 nm²", ref: "Rosen & Kunjappu, Surfactants and Interfacial Phenomena, 4th ed. (Wiley, 2012); Mukerjee & Mysels, NSRDS-NBS 36 (1971)", url: "https://doi.org/10.1002/9781118228920" },
  { what: "Steel density 7.85 g/cm³ (so the clip is nearly 8 times denser than water). A typical paper clip is wire about 1 mm across", ref: "Engineering ToolBox: densities of solids; measured wire gauge of a standard No. 1 clip", url: "https://www.engineeringtoolbox.com/density-solids-d_1265.html" },
  { what: "Water striders (Gerridae) stand on water: about 10 mg each, on legs covered in waxy hairs that the water cannot wet", ref: "Hu, Chan, Bush, 'The hydrodynamics of water strider locomotion', Nature 424 (2003)", url: "https://doi.org/10.1038/nature01793" },
];

// ---------- the per-substance explanations ----------
const why = {
  water: {
    y7: "These are touching, jostling water molecules with no fixed places. Squeezed together like this, a cube this size holds about 33 in every cubic nanometre. This is the benchmark the others are compared with.",
    ext: "Liquid water: about 33.4 molecules per nm³, each separated from its neighbours by roughly one molecule diameter. Each molecule makes about 3.4 hydrogen bonds on average, which keep them close but not locked in place.",
  },
  ice: {
    y7: "The very same water molecules, each with exactly the same mass. In ice they are locked into an open pattern with gaps, so fewer fit in the cube. Same molecules, fewer of them, lower density, and that is why ice floats.",
    ext: "Ice Ih: every molecule is held by four hydrogen bonds in a tetrahedral arrangement, which makes an open lattice of hexagonal rings. Melting collapses some of that openness, so liquid water is about 9 % denser than ice (the opposite of most substances).",
  },
  oil: {
    y7: "Oil molecules are long, floppy chains. Each one is about 49 times heavier than a water molecule, but they are so big and tangled that only a little more than half of one fits in each cubic nanometre. Fewer particles, each much heavier, adds up to a little less than water, so oil floats on it.",
    ext: "Triglyceride molecules (M ≈ 885) are nearly 50 times the mass of H₂O, but their volume is also large: about 1.6 nm³ per molecule against 0.03 nm³ for water, so the density is similar and a little lower. The tails coil and slide past each other, which is why oil is viscous.",
  },
  aluminium: {
    y7: "Aluminium atoms sit in a regular, tightly packed pattern, with about 60 atoms in every cubic nanometre, nearly twice as many as water. Each atom is only 1.5 times heavier than a water molecule, but there are so many that the total is 2.7 times as much.",
    ext: "A face-centred cubic metal: each atom touches 12 neighbours (the closest packing possible for spheres). 4 atoms per 4.05 Å cell gives 60.2 per nm³. Metal atoms are packed far more tightly than molecules, which have to fit awkward shapes.",
  },
  lead: {
    y7: "Each lead atom is about 7.7 times heavier than an aluminium atom, and it is not 7.7 times bigger: its atom is only a little wider. Lead is packed less tightly (33 atoms per cubic nanometre, aluminium 60) but each one is so much heavier that lead is about 4 times as dense as aluminium. Heavy particles do raise density, and so does packing.",
    ext: "Pb: 207.2 u against 27.0 u, but the radius is only about 22 % larger (175 pm against 143 pm), so the spacing is larger and the atoms per nm³ fall to 33. Density ratio = (33.0 / 60.3) × (207.2 / 27.0) = 0.547 × 7.68 = 4.2.",
  },
  air: {
    y7: "Air is made of molecules too (mostly nitrogen, N₂, and oxygen, O₂), and each has mass. But they are so far apart that this cube holds only 0.2 of one on average, which means it is usually empty. Air is about 800 times less dense than water, but it is not nothing: a classroom holds over 200 kg of it.",
    ext: "An ideal gas at 101.3 kPa and 293 K has n = P/kT = 0.0250 molecules per nm³: a molecule on average for every 40 nm³ (a cube 3.4 nm along), about 12 molecule diameters apart. Each is moving at about 470 m/s, so molecules fly through the cube constantly; at any instant it holds 0 of them about 82 % of the time (Poisson: e^-0.2).",
  },
};
export const whyText = (key, band) => pick(why[key], band);

// ---------- the narrative ----------
const fmtRatio = (x) => (x >= 10 ? x.toFixed(0) : x >= 1 ? x.toFixed(1) : x >= 0.1 ? x.toFixed(2) : x.toFixed(3));

/** The worked sum for one substance, as HTML lines for the panel. */
export function arithmetic(key, band) {
  const s = SUB[key], c = cubeStats(key), ext = band === "ext";
  const rows = [];
  if (key === "air") {
    rows.push(`<p><strong>${fmtN(c.count)}</strong> air molecules on average in the cube (so mostly <strong>0</strong>) × <strong>${fmtZg(c.massEach)} zg</strong> each = <strong>${fmtZg(c.massCube)} zg</strong>.</p>`);
    rows.push(`<p>${fmtZg(c.massCube)} zg ÷ ${fmtVol(c.volume)} nm³ = <strong>${fmtRho(c.rhoPicture)} g/cm³</strong>, matching the data-book value of ${fmtRho(c.rhoData)} (1.204 kg/m³).</p>`);
  } else {
    rows.push(`<p><strong>${f0(c.drawn)}</strong> ${s.plural} in the cube × <strong>${fmtZg(c.massEach)} zg</strong> each = <strong>${fmtZg(c.massCube)} zg</strong>.</p>`);
    rows.push(`<p>${fmtZg(c.massCube)} zg ÷ ${fmtVol(c.volume)} nm³ = <strong>${fmtRho(c.rhoPicture)} g/cm³</strong>, matching the data-book value of ${fmtRho(c.rhoData)} g/cm³.</p>`);
  }
  if (key !== "water") {
    const w = `${fmtRatio(c.countRatio)}× as many particles`, h = `${fmtRatio(c.massRatio)}× as heavy each`;
    rows.push(`<p class="hint">Against water: ${w} × ${h} = <strong>${fmtRatio(c.rhoRatio)}× the density</strong>.</p>`);
  }
  if (ext) {
    rows.push(`<p class="hint">Where the count comes from: n = ρ N<sub>A</sub> / M = ${fmtRho(c.rhoData)} g/cm³ × 10⁻²¹ cm³/nm³ × 6.022 × 10²³ /mol ÷ ${f2(s.M)} g/mol = <strong>${fmtN(c.n)} per nm³</strong>. One particle weighs M / N<sub>A</sub> = ${fmtZg(c.massEach)} zg (1 zg = 10⁻²¹ g, the mass of ${f0(s.M)} u).</p>`);
  }
  return rows.join("");
}

/**
 * Narrative for the "Why densities differ" view.
 * c: { sel: key|null, airNow: number of air molecules in the cube this instant, airSeen: boolean }
 */
export function narrativeCubes(c, band) {
  const out = [];
  const w = cubeStats("water"), ice = cubeStats("ice"), oil = cubeStats("oil"), al = cubeStats("aluminium"), pb = cubeStats("lead"), air = cubeStats("air");
  if (!c.sel) {
    out.push(`<p>Six cubes of the same size (each <strong>2 nm</strong> along, about 35,000 times narrower than a human hair) show what each material is made of. <strong>Density is how much mass fits in a certain volume</strong>, and the picture shows the two things that decide it: <strong>how many particles</strong> are packed in, and <strong>how heavy each particle is</strong>.</p>`);
    out.push(`<p>Click a cube to see its count and the sum. Notice that heavier particles do not always mean a denser material: ice and water have identical molecules, and oil molecules are about ${f0(oil.massRatio)} times heavier than water molecules, yet oil floats on water.</p>`);
    out.push(`<p>Right now the air cube holds <strong>${c.airNow}</strong> ${c.airNow === 1 ? "molecule" : "molecules"}; on average it holds ${fmtN(air.count)}.</p>`);
    return out.join("");
  }
  const s = SUB[c.sel];
  out.push(`<p><strong>${s.name}</strong> (${s.formula}). ${whyText(c.sel, band)}</p>`);
  out.push(arithmetic(c.sel, band));
  if (c.sel === "air") out.push(`<p>Right now the cube holds <strong>${c.airNow}</strong> ${c.airNow === 1 ? "molecule" : "molecules"}. Molecules are flying through all the time: wait and watch for one. One cubic metre of air has a mass of ${f2(SUB.air.rho * 1000)} kg, so the air in an 8 m × 8 m × 3 m classroom is about <strong>${f0(roomAirKg(192))} kg</strong>.</p>`);
  if (c.sel === "ice") out.push(`<p>${f1((1 - ice.countRatio) * 100)}% fewer molecules than water in the same space, each exactly the same mass, so ice is ${f1((1 - ice.rhoRatio) * 100)}% less dense and floats with about ${f0(ice.rhoRatio * 100)}% under the surface.</p>`);
  if (c.sel === "oil") out.push(`<p>Each oil molecule has ${f0(oil.massRatio)}× the mass of a water molecule, but there are only ${f2(oil.countRatio)}× as many in the same space. ${f1(oil.massRatio)} × ${oil.countRatio.toFixed(4)} ≈ ${f2(oil.rhoRatio)}, so oil is about ${f2(oil.rhoRatio)} times as dense as water.</p>`);
  if (c.sel === "lead") out.push(`<p>Lead atoms are ${f1(pb.massEach / al.massEach)}× heavier than aluminium atoms and ${f2(pb.n / al.n)}× as crowded, giving ${f1(pb.rhoData / al.rhoData)}× the density.</p>`);
  return out.join("");
}

// ---------- surface tension narrative ----------
/**
 * c: { coverage 0..1, gamma, nDet (detergent molecules at the surface), clip: "floating"|"sinking"|"sunk", dimple (Å), ratio (weight / support),
 *      sel: null | { depth, pull, surface (bool), cutoff } }
 */
export function narrativeSurface(c, band) {
  const ext = band === "ext";
  const out = [];
  const w = clipWeight();
  if (c.nDet === 0 && c.clip === "floating") {
    out.push(`<p><strong>Clean water, surface tension ${f1(c.gamma)} mN/m.</strong> Water molecules attract each other. A molecule <strong>inside</strong> is pulled in every direction by neighbours all around it, so the pulls cancel. A molecule <strong>at the top</strong> has neighbours only beside and below it, so it is pulled <strong>sideways and inward</strong>. All the surface molecules pulled this way make the surface tight, like a stretched skin, but it is made of the same water molecules, not a different substance.</p>`);
    out.push(`<p>The steel clip is <strong>${f1(SUB.water.rho > 0 ? SOLIDS.steel.rho / SUB.water.rho : 0)} times denser than water</strong>, yet it floats: in a simplified model the surface can hold at most ${f1(maxSupport(c.gamma))} mN/m of weight, and the clip needs only ${f1(w)} mN/m, so it should float if placed gently. It dents the surface instead of breaking through (${f1(c.dimple)} Å deep here).</p>`);
  } else if (c.clip === "floating") {
    out.push(`<p><strong>Detergent on the surface: tension ${f1(c.gamma)} mN/m</strong> (clean water 72.8). ${f0(c.nDet)} detergent molecules have lined up with their <strong>water-loving heads in the water and oily tails sticking up</strong> into the air. Water molecules cannot pull on the tails the way they pull on each other, so the surface is looser. The clip needs ${f1(w)} mN/m; in the simplified model the surface can now give up to ${f1(maxSupport(c.gamma))} mN/m, so the dent is deeper (${f1(c.dimple)} Å) and getting close to the limit.</p>`);
  } else if (c.clip === "sinking") {
    out.push(`<p><strong>The clip is sinking.</strong> ${c.pushed ? "You pushed it below the surface; once the clip is under the water the surface can no longer hold it, and it is denser than water, so it sinks." : `With ${f0(c.nDet)} detergent molecules on the surface the tension is down to ${f1(c.gamma)} mN/m, and the most it can hold is ${f1(maxSupport(c.gamma))} mN/m. The clip weighs ${f1(w)} mN/m, so the surface can no longer carry it.`}</p>`);
  } else {
    out.push(`<p><strong>The clip has sunk to the bottom.</strong> The steel is denser than water (7.85 against 1.00 g/cm³), so as soon as the skin cannot hold it, it goes down like any other dense object. Press "Reset" to try again.</p>`);
  }
  if (c.sel) {
    if (c.sel.surface) {
      out.push(`<p><strong>The selected molecule is in the surface layer.</strong> There is nothing above it to pull upwards, so the sum of the <strong>attractions</strong> is <strong>${f1(c.sel.pull)} units inward</strong> (the thick arrow: pull from neighbours, attractions only; one unit is the pull of one neighbour)${c.coverage > 0 ? ". Detergent on the surface has weakened it" : ""}. The molecule does not actually speed inward: when molecules are squeezed together they also push apart, and that balances the pull. What is left along the surface is surface tension.${ext ? " In a liquid the repulsive forces and the pressure gradient balance the cohesive pull, so the net force on a molecule is zero on average; the imbalance shows up as a tension (force per length) acting along the surface." : ""}</p>`);
    } else {
      out.push(`<p><strong>The selected molecule is inside the water</strong> (${f1(c.sel.depth)} Å below the surface). Neighbours pull from all sides, and averaged over time the attractions cancel: the net pull is ${f1(c.sel.pull)}.</p>`);
    }
  }
  if (ext) out.push(`<p>Surface tension γ is force per length along the surface (mN/m), equal to the energy per area (mJ/m²) needed to make more surface. In a simplified model a wire of weight W per length can be held by at most 2γ (one edge each side, the ideal limit): here W = ρ g π r² = ${f1(w)} mN/m, so the clip should float, if placed gently, while γ > W/2 = ${f1(criticalGamma())} mN/m. Real floating also depends on the contact angle, the shape of the dent and a little buoyancy. The measured value for water is ${SURF.water} mN/m, and for ethanol about ${SURF.ethanol} mN/m.</p>`);
  return out.join("");
}

// ---------- missions ----------
/** S: { cubes: { sel: Set of cube keys picked, airSeen }, st: { surfacePicked, insidePicked, sank, ethanolTried, pushed } } */
export function missionList() {
  return [
    { id: "ice", text: { y7: "Click the <strong>water</strong> cube and then the <strong>ice</strong> cube. The molecules are identical. Why does ice have a lower density?", ext: "Click the <strong>water</strong> and <strong>ice</strong> cubes. The molecules are identical; calculate the percentage fewer molecules in ice and check it against the density ratio." },
      check: (S) => S.cubes.picked.has("water") && S.cubes.picked.has("ice") },
    { id: "oil", text: { y7: "Click the <strong>oil</strong> cube. Its molecules are far heavier than water's, yet it floats. How can that be?", ext: "Click the <strong>oil</strong> cube and find the density ratio from (count ratio) × (mass ratio)." },
      check: (S) => S.cubes.picked.has("oil") },
    { id: "air", text: { y7: "Click the <strong>air</strong> cube and wait for an air molecule to fly through it. Air is mostly empty space, but is it nothing?", ext: "Watch the air cube until a molecule passes through, then read the expected count and explain why the cube is empty most of the time." },
      check: (S) => S.cubes.airSeen && S.cubes.picked.has("air") },
    { id: "pull", text: { y7: "Open the <strong>Surface tension</strong> view and click a molecule at the <strong>surface</strong> and one <strong>deep inside</strong>. Compare the thick arrows.", ext: "Click a surface molecule and one deep inside. Explain the net force on each, and why the effect disappears below about 5 Å." },
      check: (S) => S.st.surfacePicked && S.st.insidePicked },
    { id: "sink", text: { y7: "Add drops of detergent until the <strong>paper clip sinks</strong>. What is the detergent doing to the surface?", ext: "Add detergent until the clip sinks and note the coverage and tension at which it falls. Compare with the calculated limit W/2." },
      check: (S) => S.st.sank },
    { id: "ethanol", band: "ext", text: { y7: "", ext: "Use the <strong>Would the clip float?</strong> check on ethanol. Show the working, ethanol's 22 mN/m against the clip's weight per length." },
      check: (S) => S.st.ethanolTried },
  ];
}

// ---------- quiz ----------
export function quizList(band) {
  const oil = cubeStats("oil"), pb = cubeStats("lead"), al = cubeStats("aluminium");
  const q = [
    { q: `A vegetable oil molecule is about ${f0(oil.massRatio)} times heavier than a water molecule, yet oil floats on water. Why?`,
      options: ["Oil molecules are lighter than they look", "There are far fewer oil molecules in the same space", "Oil is made of different atoms that float", "Oil molecules are filled with air"], answer: 1,
      why: `Density depends on both the mass of each particle and how many fit in a given space. Oil molecules are long and tangled, so only ${fmtN(oil.n)} fit in each cubic nanometre against ${fmtN(cubeStats("water").n)} for water: ${f1(oil.massRatio)} × ${oil.countRatio.toFixed(4)} ≈ ${f2(oil.rhoRatio)}, a little less than water.` },
    { q: "Ice and liquid water are made of exactly the same molecules. Why is ice less dense?",
      options: ["Ice molecules are lighter", "Ice molecules are smaller", "In ice the molecules are locked in an open pattern, so fewer fit in the same space", "Ice has air bubbles in every molecule"], answer: 2,
      why: "Each H₂O molecule has the same mass in both. In ice they are held in an open, hexagonal pattern with gaps, so about 8 % fewer molecules fit into the same space. The same mass per particle but fewer particles gives a lower density." },
    { q: "Does air have mass?",
      options: ["No, air is nothing", "Yes, air molecules have mass, but they are far apart so air is not dense", "Only when it is moving", "Only if you pump it into a container"], answer: 1,
      why: `Air is made of molecules (N₂, O₂ and others), each with mass about ${fmtZg(cubeStats("air").massEach)} zg. There just aren't many in a given space: one cubic metre has a mass of ${f2(SUB.air.rho * 1000)} kg, and the air in a classroom is over 200 kg.` },
    { q: "The 'skin' on the surface of water that holds up a paper clip is…",
      options: ["A thin film of a different substance", "The same water molecules, pulled sideways and inward by their neighbours", "A layer of air trapped on the water", "A layer of dust that sits on water"], answer: 1,
      why: "There is no separate skin. Surface molecules have neighbours only beside and below them, so they are pulled toward each other and into the water, making the surface behave like a stretched sheet. It is made of ordinary water molecules." },
    { q: `A steel paper clip floats on water. A student says "that's because it is light". What is wrong with that explanation?`,
      options: ["Nothing: it is lighter than water", "The clip is much denser than water (7.85 against 1.00 g/cm³); the surface tension holds it up", "Paper clips contain air", "The clip is hollow"], answer: 1,
      why: "Steel is almost 8 times denser than water, so a clip pushed below the surface sinks like a stone. It floats only because the surface molecules pull together and hold up the weight of the clip. Add detergent, which loosens that pull, and it sinks." },
    { band: "ext", q: `Lead atoms are ${f1(pb.massEach / al.massEach)} times heavier than aluminium atoms, yet lead is only ${f1(pb.rhoData / al.rhoData)} times as dense. Why not ${f1(pb.massEach / al.massEach)} times?`,
      options: ["Lead atoms are lighter than expected", "There are fewer lead atoms in the same space (about 33 per nm³ against 60), because lead atoms are larger and sit further apart", "Lead is a liquid", "Density does not depend on atoms"], answer: 1,
      why: `Density = (atoms per nm³) × (mass per atom). Lead: ${fmtN(pb.n)} × 207.2 u, aluminium: ${fmtN(al.n)} × 27.0 u. The ratio is ${f2(pb.n / al.n)} × ${f2(pb.massEach / al.massEach)} = ${f2(pb.rhoRatio / al.rhoRatio)}.` },
  ];
  return q.filter((x) => !x.band || band === "ext");
}

// ---------- cards ----------
export function mixups(band) {
  const ext = band === "ext";
  return [
    ["Heavier particles always make a denser material.", `Density depends on the particle mass and on how many fit in the same space. Water and ice have identical molecules, but ice is less dense because fewer fit. Oil molecules are about ${f0(cubeStats("oil").massRatio)} times heavier than water molecules, but oil is less dense because they are so big and tangled.`],
    ["Dense materials are made of bigger particles.", `Not much. Lead atoms are ${f1(cubeStats("lead").massEach / cubeStats("aluminium").massEach)} times heavier than aluminium atoms but only about 20 % wider.${ext ? " Mass rises quickly with atomic number because of the extra protons and neutrons in the nucleus, while atomic radius barely changes down a group." : ""}`],
    ["Air has no mass.", `Air is molecules, and they have mass. A cubic metre of air is ${f2(SUB.air.rho * 1000)} kg, and the air in a classroom is over 200 kg. It is just spread very thin.`],
    ["Surface tension is a skin made of a different substance.", "It is ordinary water molecules, pulled to their neighbours. The surface only behaves like a skin because the surface molecules have no neighbours above them and are pulled sideways and inward."],
    ["The paper clip floats because it is light.", `A clip is made of steel, about ${f1(SOLIDS.steel.rho / SUB.water.rho)} times denser than water. Push it under and it sinks. It floats on the surface only because surface tension holds it up.`],
    ["Only water has surface tension.", `Every liquid has it. Ethanol's is about ${SURF.ethanol} mN/m, less than a third of water's ${SURF.water} mN/m. Water's is unusually high because of its hydrogen bonds.`],
  ];
}

export function honesty(band) {
  const items = [
    "Particles are drawn as <strong>spheres</strong>. Colours are conventions (red = oxygen, white = hydrogen, grey = carbon, silver = aluminium); atoms have no colour. Hydrogen atoms in the oil are left out to keep the chains readable.",
    "<strong>Cube size and counts are rounded.</strong> Each cube is 2 nm along (8 nm³); the lead cube is 4 × 4 × 4 unit cells, 1 % narrower, because a rigid lattice cannot hold the data count in exactly 2 nm. Only particle centres inside the cube are counted and drawn. The numbers of particles come from the data-book density and molar mass, then are rounded to a whole number to draw. Real samples also have gaps, defects and thermal fluctuation that this picture does not show.",
    "<strong>Oil is simplified.</strong> Real vegetable oil is a mixture of similar molecules. One typical molecule (triolein) stands in for all of them, with tails coiled at random and with its kinks left out.",
    "<strong>Motion is slowed down enormously.</strong> Real molecules in air move at about 470 m/s; here an air molecule crosses the cube in a couple of seconds. Water and oil are drawn jostling slightly, metals and ice vibrating about fixed positions, but the wiggles are exaggerated so you can see them.",
    "<strong>The air cube</strong> is a window onto a larger box of air with about 13 molecules in a box 8 nm across, moving freely. A molecule is shown only while it is inside the cube, and they do not bump into each other here (real air molecules collide billions of times a second).",
    "<strong>Surface tension.</strong> The water slab is a thin slice of liquid, about 6 nm across, with sideways ends that join up. The pulls are drawn as <em>equal</em> attractions between neighbours within 5 Å; real intermolecular forces vary with distance and direction. The thick arrow is the average over time, since at one instant the pulls never cancel exactly. How much the detergent weakens the pull follows a plausible curve rather than a measured one.",
    "<strong>The paper clip is not to scale.</strong> A real clip wire is about 1 mm across, millions of times wider than a water molecule. The clip is shown at a size that fits the slab, using a simplified model (weight per length against the pull of the surface), not the correct size. The support limit used (2γ) is an ideal upper bound; whether a real clip floats also depends on how it is placed, the contact angle, the shape of the dent and a little buoyancy.",
    "<strong>Detergent molecules</strong> are drawn with a short tail (real ones have 12 or more carbon atoms), and the way they arrive at the surface and the number needed to fill it are approximate.",
  ];
  if (band === "ext") items.push("Air at 20 °C is treated as an ideal gas; the 13 molecules in the box give 0.203 per cube against the exact 0.200. Surface tension also changes with temperature (about −0.15 mN/m per °C for water).");
  return items;
}

export const canvasLabel = (mode) => (mode === "tension"
  ? "Interactive 3D view of a slab of water molecules with a steel paper clip resting on its surface. Click a molecule to see the pulls on it."
  : "Interactive 3D view of six equal-size cubes holding the particles of water, ice, vegetable oil, aluminium, lead and air. Click a cube to see its count and density.");

export const SURFACE_INTRO = {
  y7: "Water molecules attract each other. Inside the water the pulls cancel. At the surface they don't, so the surface molecules are pulled sideways and inward, which makes the surface act like a tight skin.",
  ext: "Surface molecules lose roughly half their neighbours, so each has higher energy than an interior molecule. The liquid minimises its surface area, and the work needed to enlarge it is the surface tension.",
};

export const STRIDER_NOTE = {
  y7: "Real-world link: water striders stand on ponds without sinking. Their legs are coated in waxy hairs that water cannot wet, so surface tension holds them up. Each weighs about 10 mg.",
  ext: "Water striders (about 10 mg) stand on four of their six waxy legs. Each leg dimples the surface; the vertical force from the surface tension around each leg is ≈ γ × (contact line length) ≈ 72.8 mN/m × a few mm, comfortably more than their weight of ≈ 0.1 mN.",
};
