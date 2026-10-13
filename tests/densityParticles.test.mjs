// node tests/densityParticles.test.mjs
import assert from "node:assert/strict";
import {
  SUBSTANCES, SUB, cubeStats, perNm3, massZg, V_CUBE, CUBE_A, NA, latticeDensity, nearestNeighbour, fillLattice, packLiquid, growOil,
  AIR_BOX_N, airExpectedInCube, roomAirKg, buildSlab, neighbours, netPull, N_LIQ, SLAB, clipWeight, clipFloats, supportRatio, criticalGamma,
  criticalCoverage, gammaAt, SURF, maxSupport, quizList, missionList, narrativeCubes, narrativeSurface, arithmetic, mixups, honesty,
} from "../assets/js/world/levels/densityParticlesContent.js";
import { SOLIDS, LIQUIDS } from "../assets/js/world/levels/densityModel.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tol ${tol})`);

// ---- counts from real data: the numbers in the brief ----
near(cubeStats("water").n, 33.4, 0.1, "water molecules per nm³");
near(cubeStats("ice").n, 30.7, 0.1, "ice molecules per nm³");
near(cubeStats("aluminium").n, 60.3, 0.2, "aluminium atoms per nm³");
near(cubeStats("lead").n, 33.0, 0.1, "lead atoms per nm³");
near(cubeStats("air").n, 0.025, 0.0005, "air molecules per nm³");
near(cubeStats("oil").n, 0.626, 0.01, "oil molecules per nm³");

// worked example in the content comment: 267 water molecules, 0.0299 zg each
assert.equal(cubeStats("water").drawn, 267);
near(cubeStats("water").massEach, 0.02992, 0.0001, "water molecule mass, zg");
assert.equal(cubeStats("ice").drawn, 245);
assert.equal(cubeStats("oil").drawn, 5);
assert.equal(cubeStats("aluminium").drawn, 482);
assert.equal(cubeStats("lead").drawn, 264);

// ---- particle × mass ÷ volume reproduces the data-book density (within the rounding of the drawn count) ----
for (const s of SUBSTANCES) {
  const c = cubeStats(s.key);
  const err = Math.abs(c.rhoPicture - s.rho) / s.rho;
  assert.ok(err < 0.01, `${s.key}: picture density ${c.rhoPicture} vs data ${s.rho} (${(err * 100).toFixed(2)} %)`);
}
// the content's densities are the shared model's
assert.equal(SUB.water.rho, LIQUIDS.water.rho); assert.equal(SUB.ice.rho, SOLIDS.ice.rho); assert.equal(SUB.lead.rho, SOLIDS.lead.rho);
assert.equal(SUB.aluminium.rho, SOLIDS.aluminium.rho); assert.equal(SUB.oil.rho, LIQUIDS.oil.rho);

// ---- molar masses and particle masses ----
near(SUB.water.M, 18.015, 0.001, "H₂O molar mass");
near(SUB.oil.M, 885.45, 0.05, "triolein molar mass");
near(massZg(207.2) / massZg(26.982), 7.68, 0.01, "lead atom / aluminium atom mass");
near(cubeStats("oil").massRatio, 49.15, 0.05, "oil molecule / water molecule");
near(massZg(18.015), (18.015 * 1.66053907e-24 * 1e21), 1e-4, "M/N_A equals M × u");

// ---- the lesson of each cube ----
const w = cubeStats("water"), ice = cubeStats("ice"), oil = cubeStats("oil"), al = cubeStats("aluminium"), pb = cubeStats("lead"), air = cubeStats("air");
assert.equal(ice.massEach, w.massEach, "ice and water have identical molecules");
assert.ok(ice.n < w.n && ice.rhoPicture < w.rhoPicture, "ice has fewer molecules, so is less dense");
near(ice.countRatio, 0.919, 0.003, "ice has about 8 % fewer molecules than water");
assert.ok(oil.massEach > 40 * w.massEach && oil.rhoPicture < w.rhoPicture, "oil: far heavier molecules, still less dense (fewer)");
assert.ok(oil.n < 0.03 * w.n);
assert.ok(pb.massEach > 7 * al.massEach && pb.n < al.n, "lead: much heavier atoms, but fewer in the same space");
near(pb.rhoData / al.rhoData, (pb.n / al.n) * (pb.massEach / al.massEach), 0.2, "lead/aluminium density = count ratio × mass ratio");
assert.ok(air.expected > 0.15 && air.expected < 0.25, "air cube holds ~0.2 molecule");
assert.ok(air.massEach > 0, "air molecules have mass");
near(air.volumePerParticle, 40, 1, "an air molecule per 40 nm³");
near(roomAirKg(192), 231, 2, "classroom air in kg");

// air box: 13 molecules, expected 0.2 per cube
assert.equal(AIR_BOX_N, 13);
near(airExpectedInCube(), 0.2, 0.01, "air box expectation");

// ---- crystal lattices reproduce the data-book densities ----
near(latticeDensity("aluminium"), SOLIDS.aluminium.rho, 0.02, "fcc aluminium a = 4.05 Å");
near(latticeDensity("lead"), SOLIDS.lead.rho, 0.05, "fcc lead a = 4.95 Å");
near(latticeDensity("ice"), SOLIDS.ice.rho, 0.002, "ice Ih lattice");
near(nearestNeighbour("aluminium"), 2.86, 0.01, "Al nearest neighbour");

// ---- geometry fills the cube with exactly the data-derived count ----
for (const k of ["ice", "aluminium", "lead"]) {
  const t = cubeStats(k).drawn;
  const { pts, nbr } = fillLattice(k, CUBE_A, t);
  assert.equal(pts.length, t, `${k} lattice points = ${t}`);
  for (const p of pts) for (const x of p) assert.ok(Math.abs(x) <= CUBE_A / 2 + 2.6, `${k} site within a lattice spacing of the cube`);
  if (k === "ice") {
    assert.equal(nbr.length, pts.length);
    const four = nbr.filter((n) => n.length === 4).length;
    assert.ok(four === pts.length, `every ice molecule has 4 neighbours (${four}/${pts.length})`);
  }
  // atoms must not overlap
  const dmin = k === "ice" ? 2.7 : nearestNeighbour(k) - 0.01;
  let m = 1e9;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) m = Math.min(m, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]));
  assert.ok(m >= dmin, `${k} closest pair ${m.toFixed(2)} Å`);
}
{
  const t = cubeStats("water").drawn;
  const pts = packLiquid(t);
  assert.equal(pts.length, t, "liquid packing reaches 267 molecules");
}
{
  const mols = growOil(cubeStats("oil").drawn);
  assert.equal(mols.length, 5, "five oil molecules");
  for (const m of mols) {
    assert.equal(m.atoms.length, 63, "triolein: 57 C + 6 O heavy atoms");
    assert.equal(m.atoms.filter((a) => a.el === "C").length, 57);
    assert.equal(m.atoms.filter((a) => a.el === "O").length, 6);
    assert.equal(m.bonds.length, 62, "a tree of bonds");
    for (const [i, j] of m.bonds) { const a = m.atoms[i].p, b = m.atoms[j].p; const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); assert.ok(d > 1.1 && d < 1.6, `bond ${d}`); }
    for (const a of m.atoms) for (const x of a.p) assert.ok(Math.abs(x) <= CUBE_A / 2);
  }
}

// ---- surface tension: the slab ----
const slab = buildSlab();
near(slab.n / (SLAB.W * SLAB.D * SLAB.H), N_LIQ, 0.0005, "slab number density");
near(N_LIQ * 1000, 33.4, 0.1, "slab density in per nm³");
assert.equal(slab.n, slab.target, "packing reached the target count");
// a molecule in the middle has ~symmetric neighbours; one at the top has none above it
let topI = -1, midI = -1;
for (let i = 0; i < slab.n; i++) {
  if (slab.ys[i] > -1.0 && (topI < 0 || slab.ys[i] > slab.ys[topI])) topI = i;
  if (Math.abs(slab.ys[i] + SLAB.H / 2) < 1.2 && midI < 0) midI = i;
}
assert.ok(topI >= 0 && midI >= 0);
const nTop = neighbours(slab, topI), nMid = neighbours(slab, midI);
assert.ok(nTop.length < nMid.length, `surface molecule has fewer neighbours (${nTop.length}) than an interior one (${nMid.length})`);
assert.ok(nTop.every((n) => n.dy <= 1.0), "nothing above a surface molecule");
near(netPull(0), (Math.PI * N_LIQ * 125) / 3, 1e-9, "pull at the surface");
assert.equal(netPull(5), 0);
assert.equal(netPull(20), 0, "pulls cancel deep inside");
assert.ok(netPull(0) > netPull(1) && netPull(1) > netPull(3) && netPull(3) > netPull(4.9));
near(netPull(0), 4.37, 0.02, "unit pulls at the surface");

// ---- paper clip: weight per length vs surface tension ----
near(clipWeight(), 60.5, 0.1, "1 mm steel wire weighs 60.5 mN/m");
assert.ok(clipFloats(SURF.water), "clip floats on water (72.8 mN/m)");
assert.ok(!clipFloats(SURF.ethanol), "clip sinks on ethanol (≈ 22 mN/m)");
assert.ok(!clipFloats(SURF.detergent), "clip sinks on detergent solution");
near(supportRatio(SURF.water), 0.415, 0.005, "weight / support on water");
near(criticalGamma(), 30.2, 0.1, "clip sinks below 30.2 mN/m");
assert.equal(maxSupport(72.8), 145.6);
assert.equal(gammaAt(0), SURF.water);
assert.equal(gammaAt(1), SURF.detergent);
assert.ok(gammaAt(0.5) < gammaAt(0.25) && gammaAt(0.25) < gammaAt(0));
const cc = criticalCoverage();
assert.ok(cc > 0.5 && cc < 1, `critical coverage ${cc}`);
assert.ok(clipFloats(gammaAt(cc - 0.02)) && !clipFloats(gammaAt(cc + 0.02)), "the clip sinks at the critical coverage");
// steel is denser than water: the clip floats because of surface tension, not because it is light
assert.ok(SOLIDS.steel.rho > LIQUIDS.water.rho * 7);

// ---- content builds without throwing, in both bands ----
for (const band of ["y7", "ext"]) {
  for (const k of [null, ...SUBSTANCES.map((s) => s.key)]) assert.ok(narrativeCubes({ sel: k, airNow: 0 }, band).length > 50);
  for (const k of SUBSTANCES.map((s) => s.key)) assert.ok(arithmetic(k, band).includes("g/cm³"));
  const base = { coverage: 0, gamma: 72.8, nDet: 0, clip: "floating", dimple: 3.7, ratio: 0.41, pushed: false, sel: null };
  assert.ok(narrativeSurface(base, band).length > 50);
  assert.ok(narrativeSurface({ ...base, nDet: 8, coverage: 0.5, gamma: 40 }, band).includes("tension"));
  assert.ok(narrativeSurface({ ...base, clip: "sinking", nDet: 12 }, band).includes("sinking"));
  assert.ok(narrativeSurface({ ...base, clip: "sunk" }, band).includes("bottom"));
  assert.ok(narrativeSurface({ ...base, sel: { depth: 0, pull: 4.4, surface: true } }, band).length > 50);
  assert.ok(narrativeSurface({ ...base, sel: { depth: 12, pull: 0, surface: false } }, band).length > 50);
  assert.ok(quizList(band).length >= 5);
  assert.ok(mixups(band).length >= 5 && honesty(band).length >= 6);
}
assert.equal(quizList("y7").length, 5);
assert.ok(missionList().length >= 5);
for (const q of quizList("ext")) assert.ok(q.answer >= 0 && q.answer < q.options.length);
console.log("all densityParticles tests passed");
