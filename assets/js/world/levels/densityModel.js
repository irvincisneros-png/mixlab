// Density station: materials, liquids, measurement and floating. No DOM, no three.js; tested by tests/densityModel.test.mjs.
// Densities in g/cm³ (= g/mL) at about 20 °C. Real materials vary (woods, plastics, oils, honey); the value used is a
// typical one and the page says so. Sources in SOURCES.

export const SOURCES = [
  { id: "crc", ref: "CRC Handbook of Chemistry and Physics (97th ed.): densities of elements, water, ethanol", url: "https://hbcp.chemnetbase.com/" },
  { id: "etb", ref: "Engineering ToolBox: densities of solids, liquids and woods (typical values)", url: "https://www.engineeringtoolbox.com/density-solids-d_1265.html" },
  { id: "usgs", ref: "USGS Water Science School: water density (ice 0.917 g/cm³; seawater ≈ 1.025 g/cm³)", url: "https://www.usgs.gov/special-topics/water-science-school/science/water-density" },
];

// solids the student can test. `kind`: how its volume is measured — "regular" (ruler: l × w × h or a cylinder) or
// "irregular" (displacement in a measuring cylinder). `range` = typical spread, shown on the page.
export const SOLIDS = {
  pine:      { name: "Pine block", rho: 0.50, range: [0.35, 0.60], kind: "regular", shape: "box", src: "etb", color: "#d9b47c" },
  ice:       { name: "Ice cube", rho: 0.917, range: [0.916, 0.918], kind: "regular", shape: "box", src: "usgs", color: "#dff3ff" },
  candle:    { name: "Candle wax (paraffin)", rho: 0.90, range: [0.88, 0.93], kind: "regular", shape: "cylinder", src: "etb", color: "#f4efe2" },
  hdpe:      { name: "HDPE plastic (milk bottle)", rho: 0.95, range: [0.94, 0.97], kind: "irregular", shape: "lump", src: "etb", color: "#f0f0ea" },
  pet:       { name: "PET plastic (drink bottle)", rho: 1.38, range: [1.33, 1.40], kind: "irregular", shape: "lump", src: "etb", color: "#9fd8d0" },
  rubber:    { name: "Rubber stopper", rho: 1.30, range: [1.10, 1.50], kind: "irregular", shape: "stopper", src: "etb", color: "#6b2f2a" },
  aluminium: { name: "Aluminium block", rho: 2.70, range: [2.70, 2.70], kind: "regular", shape: "box", src: "crc", color: "#c9ced6" },
  granite:   { name: "Granite pebble", rho: 2.70, range: [2.60, 2.80], kind: "irregular", shape: "lump", src: "etb", color: "#8c8580" },
  steel:     { name: "Steel bolt", rho: 7.85, range: [7.75, 8.05], kind: "irregular", shape: "bolt", src: "etb", color: "#9aa2ab" },
  copper:    { name: "Copper cylinder", rho: 8.96, range: [8.96, 8.96], kind: "regular", shape: "cylinder", src: "crc", color: "#c8794b" },
  lead:      { name: "Lead fishing sinker", rho: 11.34, range: [11.34, 11.34], kind: "irregular", shape: "lump", src: "crc", color: "#6f7378" },
};

// liquids for the density column (layer order is by density; miscible pairs mix instead of layering)
export const LIQUIDS = {
  honey:   { name: "Honey", rho: 1.42, range: [1.38, 1.45], color: "#d38b12", group: "water", src: "etb" },
  syrup:   { name: "Golden syrup", rho: 1.43, range: [1.40, 1.45], color: "#c77a1e", group: "water", src: "etb" },
  dish:    { name: "Dishwashing liquid", rho: 1.03, range: [1.01, 1.06], color: "#3fbf6a", group: "water", src: "etb" },
  salt:    { name: "Salt water (sea water)", rho: 1.025, range: [1.02, 1.03], color: "#bfe3ef", group: "water", src: "usgs" },
  water:   { name: "Water", rho: 0.998, range: [0.998, 0.998], color: "#cfe9ff", group: "water", src: "crc" },
  oil:     { name: "Vegetable oil", rho: 0.92, range: [0.91, 0.93], color: "#e8c54a", group: "oil", src: "etb" },
  ethanol: { name: "Methylated spirits (ethanol)", rho: 0.79, range: [0.789, 0.80], color: "#c9b8f0", group: "water", src: "crc" },
};

/** ρ = m / V. Returns g/cm³ (or null if V is 0). */
export const density = (m, V) => (V > 0 ? m / V : null);

/**
 * Float or sink in a liquid. Objects whose density is within `tie` of the liquid's are "suspended" (neutral).
 * Floating fraction submerged = ρ_object / ρ_liquid (Archimedes: weight = weight of liquid displaced).
 */
export function floatTest(rhoObject, rhoLiquid, tie = 0.005) {
  const r = rhoObject / rhoLiquid;
  if (Math.abs(r - 1) <= tie) return { result: "suspended", submerged: 1 };
  if (r < 1) return { result: "floats", submerged: r };
  return { result: "sinks", submerged: 1 };
}

/**
 * A measured sample of a solid. Mass and volume come from the object's true density plus realistic instrument
 * resolution: balance to 0.01 g, ruler to 1 mm (0.1 cm) on each side, measuring cylinder to 1 mL.
 * size: scale factor (bigger or smaller piece of the same material: density doesn't change).
 */
export function makeSample(key, size = 1, seed = 1) {
  const s = SOLIDS[key];
  // true dimensions (cm) for a size-1 piece
  const base = { box: [3, 2, 2], cylinder: [1.5, 3], lump: [3.2], stopper: [3.0], bolt: [2.4] }[s.shape];
  let V;
  let dims = null;
  if (s.shape === "box") { dims = base.map((d) => d * Math.cbrt(size)); V = dims[0] * dims[1] * dims[2]; }
  else if (s.shape === "cylinder") { const k = Math.cbrt(size); dims = [base[0] * k, base[1] * k]; V = Math.PI * dims[0] ** 2 * dims[1]; }
  else { V = 12 * size; }      // irregular: 12 cm³ at size 1 (a 100 mL cylinder reads to 1 mL, so ±4 %)
  const m = s.rho * V;
  return { key, name: s.name, kind: s.kind, shape: s.shape, dims, trueV: V, trueM: m, rho: s.rho, seed };
}

const round = (v, step) => Math.round(v / step) * step;

/** What the instruments read. */
export function measure(sample, cylinderStart = 50) {
  const mass = round(sample.trueM, 0.01);
  if (sample.kind === "regular" && sample.dims) {
    const d = sample.dims.map((x) => round(x, 0.1));
    const V = sample.shape === "box" ? d[0] * d[1] * d[2] : Math.PI * d[0] ** 2 * d[1];
    return { mass, method: "ruler", dims: d, volume: V, rho: density(mass, V) };
  }
  const before = cylinderStart;
  const after = round(before + sample.trueV, 1);
  const V = after - before;
  return { mass, method: "displacement", before, after, volume: V, rho: density(mass, V) };
}

/** Percentage difference from the data-book value. */
export const percentError = (measured, accepted) => (100 * Math.abs(measured - accepted)) / accepted;

/**
 * Equal volumes of liquids poured gently into a column settle into layers by density, bottom first.
 * Thin water-based liquids (water, salt water, methylated spirits) are miscible: they mix into one layer whose
 * density is total mass / total volume. Ethanol and water shrink by about 3.5 % in volume when mixed 50:50
 * (CRC ethanol–water density tables), so that's applied when both are present; other ratios are approximate.
 * Honey, golden syrup and dishwashing liquid also dissolve in water, but only slowly: poured gently they form
 * layers that blur over hours (`slowMix`). Oil doesn't mix with water at all.
 */
export const MISCIBLE = new Set(["water", "salt", "ethanol"]);
export const SLOW_MIX = new Set(["honey", "syrup", "dish"]);
export function settleColumn(keys) {
  const layers = [];
  let thin = null;
  for (const k of keys) {
    const L = LIQUIDS[k];
    if (MISCIBLE.has(k)) {
      if (thin) {
        thin.keys.push(k); thin.mixed = true;
        const mass = thin.keys.reduce((a, q) => a + LIQUIDS[q].rho, 0);       // equal volumes of 1 unit each
        const shrink = thin.keys.includes("ethanol") ? 0.965 : 1;
        thin.rho = mass / (thin.keys.length * shrink);
        continue;
      }
      thin = { keys: [k], rho: L.rho, mixed: false, slowMix: false };
      layers.push(thin);
    } else layers.push({ keys: [k], rho: L.rho, mixed: false, slowMix: SLOW_MIX.has(k) });
  }
  return layers.sort((a, b) => b.rho - a.rho);
}
