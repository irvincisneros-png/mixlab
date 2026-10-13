// States of matter station: the heating/cooling model for a sample of water.
// Energy-based (enthalpy) model, so the temperature stays flat while the state changes: energy goes into
// separating particles (latent heat), not into making them move faster. No DOM, no three.js; tested by
// tests/statesModel.test.mjs.
//
// Data (water at 1 atm), sources in WATER.sources:
//   specific heat capacity  ice 2.09 J/(g·°C) near 0 °C, liquid 4.18 J/(g·°C), steam 2.08 J/(g·°C) near 100 °C
//   latent heat of fusion 334 J/g (at 0 °C), of vaporisation 2257 J/g (at 100 °C)
//   melting point 0 °C, boiling point 100 °C at 101.325 kPa
// Teaching simplifications (stated on the page): heat capacities are constant within each state; the sample is
// stirred (one temperature throughout); no supercooling or superheating; heat loss is Newton's law with one
// coefficient; evaporation below boiling uses a simple vapour-pressure scaling.

export const WATER = {
  name: "water",
  mp: 0, bp: 100,
  cSolid: 2.09, cLiquid: 4.18, cGas: 2.08,   // J/(g·°C)
  Lf: 334, Lv: 2257,                          // J/g
  sources: [
    { what: "Specific heat of ice and liquid water, latent heats", ref: "Engineering ToolBox, 'Water – Heat of Vaporization' and 'Ice – Thermal Properties'; CRC Handbook of Chemistry and Physics (97th ed.), 6-5 and 6-12", url: "https://www.engineeringtoolbox.com/water-properties-d_1508.html" },
    { what: "Specific heat of steam at 100 °C, 1 atm", ref: "NIST Chemistry WebBook, SRD 69: Thermophysical properties of water (isobaric, 101.325 kPa)", url: "https://webbook.nist.gov/chemistry/fluid/" },
    { what: "Saturation vapour pressure of water (Buck equation)", ref: "Buck, A. L. (1981), J. Appl. Meteorol. 20, 1527–1532", url: "https://doi.org/10.1175/1520-0450(1981)020%3C1527:NEFCVP%3E2.0.CO;2" },
  ],
};

/** Saturation vapour pressure of water over liquid, kPa (Buck 1981; good from 0 to 100 °C). */
export function vapourPressure(T) {
  return 0.61121 * Math.exp((18.678 - T / 234.5) * (T / (257.14 + T)));
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * opts:
 *   mass       g of water (default 200)
 *   T0         starting temperature °C (default -20)
 *   container  "open" (beaker: vapour escapes, so steam can't be heated above 100 °C) or "sealed"
 *              (a sealed syringe at constant atmospheric pressure: the steam stays and can be heated further)
 *   room       surroundings temperature °C (default 22)
 *   loss       heat-loss coefficient W/°C to the surroundings (default 0.35, a 250 mL beaker in still air)
 */
export function createStatesModel(opts = {}) {
  const S = WATER;
  const m = {
    sub: S,
    container: opts.container || "open",
    room: opts.room ?? 22,
    loss: opts.loss ?? 0.35,
    power: 0,          // W delivered by the hotplate (0 to ~250); cooling comes from the surroundings or the cold bath
    bath: null,        // null = air at room temperature; a number = sample sits in a cold bath at that °C
    bathLoss: 3.0,     // W/°C when in the stirred cold bath (much better contact than air)
    t: 0,              // simulated seconds
    // state: total mass and enthalpy H (J) measured from ice at 0 °C, per the current masses
    solid: 0, liquid: 0, gas: 0,   // g in each state
    T: 0,
    escaped: 0,        // g of vapour that has left an open beaker
    // flows over the last step (W): positive = into the sample
    heatIn: 0, heatLoss: 0, latentRate: 0, evapRate: 0,
    boiled: false,      // true once this run has boiled (cleared by reset)
    phaseChange: null,  // "melting" | "freezing" | "boiling" | "condensing" | null
    history: [],        // [{ t, T }] sampled every `sampleEvery` simulated seconds
    sampleEvery: 10,
  };
  let nextSample = 0;

  function setState(mass, T) {
    m.T = T;
    m.solid = m.liquid = m.gas = 0;
    if (T < S.mp) m.solid = mass;
    else if (T < S.bp || m.container === "open") { m.liquid = mass; m.T = Math.min(T, S.bp); }
    else m.gas = mass;
    m.escaped = 0;
  }

  /** Enthalpy (J) relative to all-ice at the melting point. */
  function enthalpy() {
    const mass = m.solid + m.liquid + m.gas;
    const hotWater = S.Lf + S.cLiquid * (S.bp - S.mp);          // J/g for liquid at the boiling point
    if (m.liquid === 0 && m.gas === 0) return mass * S.cSolid * (m.T - S.mp);              // ice
    if (m.solid > 0) return m.liquid * S.Lf;                                                // ice + water at 0 °C
    if (m.liquid === 0) return mass * (hotWater + S.Lv + S.cGas * (m.T - S.bp));           // steam
    if (m.gas > 0) return mass * hotWater + m.gas * S.Lv;                                   // water + steam at 100 °C
    return mass * (S.Lf + S.cLiquid * (m.T - S.mp));                                        // water
  }

  /** Set temperature and state masses from enthalpy H (J) for a total mass. */
  function fromEnthalpy(H, mass) {
    const meltEnd = mass * S.Lf;
    const boilStart = meltEnd + mass * S.cLiquid * (S.bp - S.mp);
    const boilEnd = boilStart + mass * S.Lv;
    m.solid = m.liquid = m.gas = 0;
    if (H < 0) { m.solid = mass; m.T = S.mp + H / (mass * S.cSolid); }
    else if (H < meltEnd) { m.liquid = H / S.Lf; m.solid = mass - m.liquid; m.T = S.mp; }
    else if (H < boilStart) { m.liquid = mass; m.T = S.mp + (H - meltEnd) / (mass * S.cLiquid); }
    else if (H < boilEnd) { m.gas = (H - boilStart) / S.Lv; m.liquid = mass - m.gas; m.T = S.bp; }
    else { m.gas = mass; m.T = S.bp + (H - boilEnd) / (mass * S.cGas); }
  }

  m.reset = (o = {}) => {
    if (o.container) m.container = o.container;
    if (o.bath !== undefined) m.bath = o.bath;
    m.t = 0; m.history = []; nextSample = 0;
    m.heatIn = m.heatLoss = m.latentRate = m.evapRate = 0; m.phaseChange = null; m.boiled = false;
    setState(o.mass ?? opts.mass ?? 200, o.T0 ?? opts.T0 ?? -20);
    m.sample(true);
  };

  m.sample = (force = false) => {
    if (force || m.t >= nextSample) {
      m.history.push({ t: m.t, T: m.T });
      if (m.history.length > 2000) m.history.splice(0, m.history.length - 2000);
      nextSample = m.t + m.sampleEvery;
    }
  };

  /** Advance by dt simulated seconds (sub-stepped internally for stability). */
  m.step = (dt) => {
    if (dt <= 0) return;
    // sub-step: at most 2 s, and well under the sample's thermal time constant (m·c/k) so small samples stay stable
    const mass0 = m.solid + m.liquid + m.gas;
    const k0 = Math.max(m.loss, m.bath != null ? m.bathLoss : 0, 1e-6);
    const tau = (mass0 * Math.min(S.cSolid, S.cGas)) / k0;
    const n = Math.min(20000, Math.max(1, Math.ceil(dt / Math.min(2, Math.max(1e-3, 0.2 * tau)))));
    const h = dt / n;
    const prev = { solid: m.solid, gas: m.gas + m.escaped };
    let evap = 0;
    for (let i = 0; i < n; i++) {
      const mass = m.solid + m.liquid + m.gas;
      if (mass <= 1e-3) { m.escaped += mass; m.liquid = m.solid = m.gas = 0; m.T = m.bath ?? m.room; m.t += h * (n - i); break; }   // dried out: the clock keeps running
      const surround = m.bath ?? m.room;
      const k = m.bath != null ? m.bathLoss : m.loss;
      const qIn = m.power;
      const qLoss = k * (m.T - surround);           // W out of the sample
      let H = enthalpy() + (qIn - qLoss) * h;
      // open beaker: liquid below boiling slowly evaporates from the surface (energy Lv per gram leaves with it)
      let dmEvap = 0;
      if (m.container === "open" && m.liquid > 0 && m.T < S.bp) {
        // ~0.4 g per 10 min at 22 °C for a 250 mL beaker, scaling with vapour pressure (teaching-scale)
        dmEvap = Math.min(m.liquid, 0.00065 * (vapourPressure(m.T) / vapourPressure(22)) * h);
        // the escaping grams take their own enthalpy, and the energy to evaporate them (latent heat at this
        // temperature, ≈ 2501 − 2.36·T J/g) comes from the water left behind: evaporation cools
        H -= dmEvap * (S.Lf + S.cLiquid * (m.T - S.mp) + (2501 - 2.36 * m.T));
      }
      if (dmEvap >= m.liquid - 1e-9 && m.solid + m.gas <= 1e-9) { m.escaped += mass; m.solid = m.liquid = m.gas = 0; m.t += h * (n - i); break; }
      const newMass = mass - dmEvap;
      m.escaped += dmEvap; evap += dmEvap;
      fromEnthalpy(H, newMass);
      // open beaker: steam made by boiling escapes at once (and takes its latent heat with it)
      if (m.container === "open" && m.gas > 0) {
        if (m.liquid <= 1e-6 && m.solid <= 1e-6) { m.escaped += m.gas; m.gas = 0; m.T = S.bp; }
        else { m.escaped += m.gas; m.gas = 0; }
      }
      m.t += h;
      m.heatIn = qIn; m.heatLoss = qLoss;
    }
    // phase-change flags and rates (g/s) from what actually changed this step
    const dSolid = (m.solid - prev.solid) / dt;            // + freezing, − melting
    const dGas = (m.gas + m.escaped - prev.gas) / dt;      // + boiling/evaporating, − condensing
    const boil = dGas - evap / dt;
    m.evapRate = evap / dt;
    // a change is "happening" only while both states are still present at the end of the step (a step that finishes
    // melting reports no change, so the narrative doesn't say "melting" above 0 °C)
    const meltZone = m.solid > 0 && m.liquid > 0;
    const boilZone = m.T >= S.bp - 1e-9 && m.liquid > 0 && (m.gas > 0 || (m.container === "open" && boil > 1e-5));
    m.phaseChange = meltZone && dSolid < -1e-5 ? "melting" : meltZone && dSolid > 1e-5 ? "freezing"
      : boilZone && boil > 1e-5 ? "boiling" : boilZone && boil < -1e-5 ? "condensing" : null;
    if (m.phaseChange === "boiling") m.boiled = true;     // has this run boiled at all (survives level changes)
    m.latentRate = dSolid < 0 ? -dSolid * S.Lf : dSolid > 0 ? -dSolid * S.Lf : boil * S.Lv;   // W going into (+) or out of (−) bonds
    m.sample();
  };

  /** What the particles are doing, for the 3D and the narrative. Fractions sum to 1 (0 if the beaker is empty). */
  m.fractions = () => {
    const mass = m.solid + m.liquid + m.gas;
    return mass > 0 ? { solid: m.solid / mass, liquid: m.liquid / mass, gas: m.gas / mass, mass } : { solid: 0, liquid: 0, gas: 0, mass: 0 };
  };

  /** Name of the current state(s) in plain words. */
  m.stateName = () => {
    const f = m.fractions();
    if (!f.mass) return "empty";
    const parts = [];
    if (f.solid > 0.001) parts.push("solid");
    if (f.liquid > 0.001) parts.push("liquid");
    if (f.gas > 0.001) parts.push("gas");
    return parts.join(" + ");
  };

  m.reset();
  return m;
}
