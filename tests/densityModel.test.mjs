// node tests/densityModel.test.mjs
import assert from "node:assert/strict";
import { SOLIDS, LIQUIDS, density, floatTest, makeSample, measure, percentError, settleColumn } from "../assets/js/world/levels/densityModel.js";

assert.equal(density(54, 20), 2.7, "54 g / 20 cm³ = 2.7 g/cm³ (aluminium)");
assert.equal(density(10, 0), null);

// heavier doesn't mean it sinks: a big pine block is heavier than a small steel bolt but floats
const bigPine = makeSample("pine", 8), smallBolt = makeSample("steel", 0.25);
assert.ok(bigPine.trueM > smallBolt.trueM, `big pine ${bigPine.trueM.toFixed(1)} g heavier than bolt ${smallBolt.trueM.toFixed(1)} g`);
assert.equal(floatTest(SOLIDS.pine.rho, LIQUIDS.water.rho).result, "floats");
assert.equal(floatTest(SOLIDS.steel.rho, LIQUIDS.water.rho).result, "sinks");

// cutting a piece in half doesn't change its density
for (const k of Object.keys(SOLIDS)) {
  const a = makeSample(k, 1), b = makeSample(k, 0.5);
  assert.ok(Math.abs(a.trueM / a.trueV - b.trueM / b.trueV) < 1e-9, `${k}: density independent of size`);
}

// ice floats with ~92 % under water; in ethanol it sinks
const ice = floatTest(SOLIDS.ice.rho, LIQUIDS.water.rho);
assert.equal(ice.result, "floats"); assert.ok(Math.abs(ice.submerged - 0.919) < 0.002);
assert.equal(floatTest(SOLIDS.ice.rho, LIQUIDS.ethanol.rho).result, "sinks");
// HDPE floats in water, PET sinks (how recycling plants separate them)
assert.equal(floatTest(SOLIDS.hdpe.rho, LIQUIDS.water.rho).result, "floats");
assert.equal(floatTest(SOLIDS.pet.rho, LIQUIDS.water.rho).result, "sinks");

// measurements: within a few % of the data-book value with school instruments
for (const k of Object.keys(SOLIDS)) {
  const s = makeSample(k, 1);
  const r = measure(s);
  const err = percentError(r.rho, SOLIDS[k].rho);
  assert.ok(err < 8, `${k} measured ${r.rho.toFixed(2)} vs ${SOLIDS[k].rho} (${err.toFixed(1)} %)`);
  if (SOLIDS[k].kind === "irregular") assert.equal(r.method, "displacement");
}

// density column: honey at the bottom, oil above water, methylated spirits mixes into the water
const col = settleColumn(["oil", "water", "honey", "ethanol", "dish"]);
assert.deepEqual(col.map((l) => l.keys[0]), ["honey", "dish", "water", "oil"]);
assert.ok(col.find((l) => l.keys.includes("ethanol")).mixed, "ethanol mixes with water");
assert.ok(col.find((l) => l.keys[0] === "honey").slowMix);
console.log("all densityModel tests passed");
