// node tests/statesModel.test.mjs
import assert from "node:assert/strict";
import { createStatesModel, WATER, vapourPressure } from "../assets/js/world/levels/statesModel.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

// 1. Sealed syringe, no losses: plateau durations match latent heats exactly
{
  const m = createStatesModel({ mass: 100, T0: -20, container: "sealed", loss: 0 });
  m.power = 100;
  const times = {};
  let last = m.T;
  for (let i = 0; i < 40000; i++) {
    m.step(1);
    if (!times.meltStart && m.T >= 0 && m.solid > 0 && m.liquid > 0) times.meltStart = m.t;
    if (times.meltStart && !times.meltEnd && m.solid === 0) times.meltEnd = m.t;
    if (!times.boilStart && m.gas > 0) times.boilStart = m.t;
    if (times.boilStart && !times.boilEnd && m.liquid === 0) times.boilEnd = m.t;
    assert.ok(m.T >= last - 1e-9, "temperature never falls while heating with no losses");
    last = m.T;
    if (m.T > 120) break;
  }
  near(times.meltStart, 100 * 2.09 * 20 / 100, 2, "ice warms -20→0 in m·c·ΔT/P");
  near(times.meltEnd - times.meltStart, 100 * WATER.Lf / 100, 2, "melting takes m·Lf/P");
  near(times.boilStart - times.meltEnd, 100 * 4.18 * 100 / 100, 2, "water warms 0→100 in m·c·ΔT/P");
  near(times.boilEnd - times.boilStart, 100 * WATER.Lv / 100, 2, "boiling takes m·Lv/P");
  const ratio = (times.boilEnd - times.boilStart) / (times.meltEnd - times.meltStart);
  near(ratio, 6.76, 0.05, "boiling plateau ≈ 6.8× the melting plateau");
  console.log("ok sealed heating curve", times);
}

// 2. Temperature is flat while melting and boiling (latent heat)
{
  const m = createStatesModel({ mass: 50, T0: 0, container: "sealed", loss: 0 });
  m.reset({ T0: -0.01 });
  m.power = 80;
  m.step(5);
  assert.equal(m.phaseChange, "melting");
  const T1 = m.T; m.step(30); assert.equal(m.T, T1, "flat at 0 °C while melting");
  assert.equal(m.T, 0);
  console.log("ok flat melting");
}

// 3. Open beaker: never exceeds 100 °C, mass boils away, then empty
{
  const m = createStatesModel({ mass: 20, T0: 90, container: "open" });
  m.power = 200;
  let maxT = 0;
  for (let i = 0; i < 5000; i++) { m.step(1); maxT = Math.max(maxT, m.T); }
  assert.ok(maxT <= 100 + 1e-9, "open beaker water can't go above 100 °C");
  assert.equal(m.fractions().mass, 0, "boils dry");
  near(m.escaped, 20, 1e-6, "all the water left as vapour");
  console.log("ok open beaker boils dry");
}

// 4. Cooling in a cold bath freezes at 0 °C with a flat section; Newton cooling in air approaches room temp
{
  const m = createStatesModel({ mass: 100, T0: 20, container: "sealed" });
  m.bath = -15;
  let sawFreezing = false;
  for (let i = 0; i < 20000; i++) { m.step(1); if (m.phaseChange === "freezing") { sawFreezing = true; if (m.liquid > 0) assert.equal(m.T, 0, "flat at 0 °C while freezing"); } }
  assert.ok(sawFreezing, "freezes");
  near(m.T, -15, 0.5, "ends near the bath temperature");
  const a = createStatesModel({ mass: 100, T0: 80, container: "sealed" });
  for (let i = 0; i < 40000; i++) a.step(1);
  near(a.T, 22, 0.5, "cools to room temperature in air");
  console.log("ok cooling");
}

// 5. Evaporation below boiling: small, faster when warmer, and it cools the water slightly
{
  const cold = createStatesModel({ mass: 200, T0: 22, container: "open" });
  const warm = createStatesModel({ mass: 200, T0: 60, container: "open", loss: 0 });
  for (let i = 0; i < 600; i++) { cold.step(1); warm.step(1); }
  assert.ok(cold.escaped > 0.1 && cold.escaped < 2, `room-temperature evaporation is small (${cold.escaped.toFixed(2)} g / 10 min)`);
  assert.ok(warm.escaped > cold.escaped * 5, "warmer water evaporates much faster");
  assert.ok(warm.T < 60, "evaporation cools the water");
  near(vapourPressure(100), 101.3, 0.5, "Buck gives ~101 kPa at 100 °C");
  console.log("ok evaporation", cold.escaped.toFixed(2), warm.escaped.toFixed(2));
}

// 6. Energy conservation (sealed, no loss): heat in = enthalpy change
{
  const m = createStatesModel({ mass: 75, T0: -10, container: "sealed", loss: 0 });
  m.power = 150;
  for (let i = 0; i < 3000; i++) m.step(0.7);
  const E = 150 * m.t;
  const expected = 75 * (2.09 * 10 + 334 + 418 + 2257) + 75 * 2.08 * (m.T - 100);
  near(E, expected, 1, "energy conserved");
  console.log("ok energy");
}


// 7. Edge cases: tiny samples stay finite and stable; drying out empties cleanly; reset clears diagnostics
{
  const a = createStatesModel({ mass: 0.1, T0: 20, container: "sealed" }); a.bath = -15;
  for (let i = 0; i < 50; i++) a.step(2);
  assert.ok(Number.isFinite(a.T) && Math.abs(a.T + 15) < 1, `0.1 g in the bath settles at −15 °C (${a.T})`);
  const b = createStatesModel({ mass: 0.001, T0: 22 });
  for (let i = 0; i < 50; i++) b.step(2);
  assert.ok(Number.isFinite(b.T), "empty beaker temperature is finite");
  assert.equal(b.fractions().mass, 0);
  const c = createStatesModel({ mass: 100, T0: 20, container: "sealed" }); c.bath = -15;
  for (let i = 0; i < 500; i++) c.step(1);
  assert.equal(c.phaseChange, "freezing");
  c.reset({ T0: -20 });
  assert.equal(c.phaseChange, null); assert.equal(c.latentRate, 0);
  // the step that finishes melting doesn't report melting above 0 °C
  const d = createStatesModel({ mass: 10, T0: -0.01, container: "sealed", loss: 0 }); d.power = 200;
  for (let i = 0; i < 200; i++) { d.step(1); if (d.T > 0) assert.notEqual(d.phaseChange, "melting"); }
  console.log("ok edge cases");
}
{
  const m = createStatesModel({ mass: 5, T0: 99, container: "open" }); m.power = 250;
  for (let i = 0; i < 200; i++) m.step(1);
  assert.equal(m.fractions().mass, 0); near(m.t, 200, 1e-6, "clock keeps running after drying out");
  console.log("ok clock after drying");
}
console.log("all statesModel tests passed");
