// Lens-aware text, body geometry maths and column layout for the Density lab (Y7 4.2.1–4.2.3).
// Pure (no DOM, no three.js). Every number comes from densityModel.js (typical values, cited) or is computed from it.
// Bands: "y7" (core) and "ext" (Extension). Australian spelling.
import { SOLIDS, LIQUIDS, SOURCES as MODEL_SOURCES, floatTest, settleColumn, percentError } from "./densityModel.js";

export const P = (v, band) => (v != null && typeof v === "object" && !Array.isArray(v) ? v[band] ?? v.y7 : v);
export const MINUS = "−";
export const f1 = (x) => x.toFixed(1);
export const f2 = (x) => x.toFixed(2);
export const g2 = (x) => x.toFixed(2);
const pct = (x) => `${Math.round(x * 100)} %`;
const short = (n) => n.replace(/ \(.*\)/, "");
const nameLo = (n) => short(n).replace(/^([A-Z])([a-z])/, (m, a, b) => a.toLowerCase() + b);

// ---------- the shared constants ----------
export const CYL_START = 50;          // mL in the measuring cylinder before the sample goes in
export const POUR_ML = 50;            // each liquid poured into the column
export const COLUMN_PIECE = 0.2;      // size of the small pieces dropped in the column (so they fit the tube)
export const TANK_LIQUIDS = ["water", "salt", "oil", "ethanol"];
export const COLUMN_ORDER = ["honey", "syrup", "dish", "salt", "water", "oil", "ethanol"];

// ---------- body geometry: shapes with exact volume (cm). Used for display AND for how deep a floating piece sits ----------
const ASPECT = { hdpe: 0.85, pet: 0.8, granite: 0.72, lead: 1.3 };   // ellipsoid half-height ÷ half-width for the irregular lumps
const STOPPER0 = { R1: 1.05, R2: 1.45, h: 2.4 };
const BOLT0 = { rs: 0.8, rh: 1.386, hh: 1.0 };                       // M16 bolt, 24 mm across the flats
BOLT0.L = (12 - 1.5 * Math.sqrt(3) * BOLT0.rh ** 2 * BOLT0.hh) / (Math.PI * BOLT0.rs ** 2);

/** Geometry parameters for a sample (cm). The volume is exactly sample.trueV. */
export function bodyParams(sample) {
  const V = sample.trueV;
  switch (sample.shape) {
    case "box": return { type: "box", l: sample.dims[0], w: sample.dims[1], h: sample.dims[2], V, H: sample.dims[2] };
    case "cylinder": return { type: "cyl", r: sample.dims[0], L: sample.dims[1], V, H: 2 * sample.dims[0] };       // lies on its side
    case "stopper": {
      const s = Math.cbrt(V / (Math.PI * STOPPER0.h / 3 * (STOPPER0.R1 ** 2 + STOPPER0.R1 * STOPPER0.R2 + STOPPER0.R2 ** 2)) );
      return { type: "cone", R1: STOPPER0.R1 * s, R2: STOPPER0.R2 * s, h: STOPPER0.h * s, V, H: STOPPER0.h * s };
    }
    case "bolt": {
      const s = Math.cbrt(V / 12);
      return { type: "bolt", rs: BOLT0.rs * s, L: BOLT0.L * s, rh: BOLT0.rh * s, hh: BOLT0.hh * s, V, H: 1.732 * BOLT0.rh * s };
    }
    default: {   // lump
      const asp = ASPECT[sample.key] ?? 0.8;
      const a = Math.cbrt((3 * V) / (4 * Math.PI * asp));
      return { type: "ell", a, hh: asp * a, V, H: 2 * asp * a };
    }
  }
}

/** Volume (cm³) of the body below a horizontal plane d cm above its lowest point. */
export function vBelow(b, d) {
  d = Math.max(0, Math.min(b.H, d));
  switch (b.type) {
    case "box": return b.l * b.w * d;
    case "cyl": {
      const r = b.r, y = Math.min(d, 2 * r);
      const seg = r * r * Math.acos((r - y) / r) - (r - y) * Math.sqrt(Math.max(0, 2 * r * y - y * y));
      return b.L * seg;
    }
    case "ell": return Math.PI * b.a ** 2 * (d - ((d - b.hh) ** 3 + b.hh ** 3) / (3 * b.hh ** 2));
    case "cone": {
      const dr = b.R2 - b.R1, rd = b.R1 + (dr * d) / b.h;
      return Math.abs(dr) < 1e-9 ? Math.PI * b.R1 ** 2 * d : (Math.PI * b.h * (rd ** 3 - b.R1 ** 3)) / (3 * dr);
    }
    default: return b.V * (d / b.H);
  }
}
/** Depth (cm) of the body that is below the surface when a fraction f of its volume is submerged. */
export function draught(b, f) {
  if (f >= 1) return b.H;
  if (f <= 0) return 0;
  let lo = 0, hi = b.H;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (vBelow(b, m) < f * b.V) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---------- density column ----------
/**
 * Layers for the poured liquids, bottom first, with volumes and heights in a tube of the given cross-section area.
 * Each pour is POUR_ML. A water-based mix that includes methylated spirits shrinks by 3.5 % (see settleColumn).
 * layer: { id, keys, rho, vol, h, mixed, slowMix }
 */
export function columnLayers(keys, area) {
  return settleColumn(keys).map((L) => {
    const shrink = L.keys.includes("ethanol") && L.keys.length > 1 ? 0.965 : 1;
    const vol = L.keys.length * POUR_ML * shrink;
    return { ...L, id: L.keys.length > 1 || L.keys.some((k) => ["water", "salt", "ethanol"].includes(k)) ? "thin" : L.keys[0], vol, h: vol / area };
  });
}

/**
 * Where a piece of density rho settles in a column. layers: bottom first, each { rho }.
 * -> { mode: "bottom" } | { mode: "top", k, f } (floats on the top layer, fraction f under)
 *  | { mode: "between", k, f } (at the boundary above layer k; a fraction f of it is in the lower layer)
 */
export function restInColumn(layers, rho) {
  if (!layers.length) return { mode: "empty" };
  if (rho > layers[0].rho) return { mode: "bottom", k: 0, f: 1 };
  let k = 0;
  while (k + 1 < layers.length && layers[k + 1].rho > rho) k++;
  if (k === layers.length - 1) return { mode: "top", k, f: rho / layers[k].rho };
  const lo = layers[k].rho, hi = layers[k + 1].rho;
  return { mode: "between", k, f: (rho - hi) / (lo - hi) };
}

// ---------- measurement helpers ----------
/** ±uncertainty of a measured density (g/cm³) from the instrument resolution: ruler ±0.05 cm per length, cylinder ±1 mL, balance ±0.005 g. */
export function densityUncertainty(sample, meas) {
  const dm = 0.005 / Math.max(meas.mass, 0.01);
  let dV;
  if (meas.method === "ruler") {
    const d = meas.dims;
    dV = sample.shape === "box" ? 0.05 * (1 / d[0] + 1 / d[1] + 1 / d[2]) : 0.05 * (2 / d[0] + 1 / d[1]);
  } else dV = 1 / Math.max(meas.volume, 1);
  return meas.rho * (dm + dV);
}
/** How the measured density compares with the data book. */
export function compareBook(key, meas, sample) {
  const book = SOLIDS[key], u = densityUncertainty(sample, meas);
  const err = percentError(meas.rho, book.rho);
  const lo = book.range[0], hi = book.range[1];
  const inRange = meas.rho >= lo - 1e-9 && meas.rho <= hi + 1e-9;
  const overlaps = meas.rho + u >= lo && meas.rho - u <= hi;
  return { book, u, err, inRange, overlaps };
}

// ---------- parts: hover and the Selected card ----------
export const PARTS = {
  balance: { name: "Electronic balance", text: { y7: "Measures <b>mass</b> in grams, to the nearest 0.01 g. Press <b>TARE</b> to set the display to zero (with the pan empty, or with a weighing boat on it). A balance shows mass, not volume: a big, light pine block and a small steel bolt can read the same.", ext: "A top-pan balance measures the force on the pan and displays the equivalent <b>mass</b> (g). Resolution 0.01 g, so a 12.00 g reading is uncertain by about ±0.005 g (0.04 %). Taring subtracts a stored offset: always tare with the pan empty, or the offset hides the true mass." } },
  tare: { name: "TARE button", text: { y7: "Sets the display to zero. Do it <b>with the pan empty</b>. If you tare with the sample on the pan, the balance forgets its mass.", ext: "Stores the current load as the zero offset. Taring with the sample on the pan and then removing it makes the display read negative (the stored offset)." } },
  cylinder: { name: "100 mL measuring cylinder", text: { y7: "Measures the volume of a liquid, and (by <b>displacement</b>) the volume of an irregular solid. Read at <b>eye level</b>, at the <b>bottom of the curved surface</b> (the meniscus). 1 mL = 1 cm³. This one reads to the nearest 1 mL.", ext: "Volume by displacement: V(solid) = reading after − reading before. Each reading is ±0.5 mL, so the difference is about ±1 mL: for a 12 cm³ solid that is ±8 %, the main limit on the density you can find. The meniscus is curved because water clings to the glass; read the bottom of it, at eye level, to avoid parallax." } },
  ruler: { name: "Ruler", text: { y7: "Reads length to the nearest millimetre (0.1 cm). For a block, volume = length × width × height. For a cylinder, volume = π × radius² × length.", ext: "±0.05 cm on each length (half a millimetre), so for a 3 × 2 × 2 cm block the relative uncertainty of the volume is about 1.7 % + 2.5 % + 2.5 % ≈ 7 %. The smallest sides matter most." } },
  tray: { name: "Sample tray", text: { y7: "Eleven samples. Click one (or use the buttons) to take it to the balance. Densities are <b>typical values</b>: real wood, plastic and oil vary a little from sample to sample.", ext: "Typical densities at about 20 °C from the cited data books. Woods, plastics, oils and honey vary with source, moisture and temperature, which is why a range is shown." } },
  sample: { name: "The sample", text: { y7: "The piece you are testing. Use the <b>Size</b> slider: a bigger piece has more mass <b>and</b> more volume, so the same density.", ext: "Density is intensive: ρ doesn't depend on how much material there is. Mass and volume are extensive and double together." } },
  tank: { name: "Float-or-sink tank", text: { y7: "A tank of liquid. An object <b>floats</b> if it is <b>less dense</b> than the liquid and <b>sinks</b> if it is <b>more dense</b>. Double-click to zoom in to the particles.", ext: "Archimedes: upthrust = weight of liquid displaced. A floater displaces its own weight, so the fraction submerged = ρ(object) ÷ ρ(liquid). Double-click to zoom in to the particles." }, portal: true },
  column: { name: "Density column", text: { y7: "Liquids that don't mix settle in layers: the <b>densest at the bottom</b>. Pour them in any order and watch them sort. Double-click to zoom in to the particles.", ext: "Poured gently, immiscible or slowly-mixing liquids settle in order of density. Miscible liquids (water, salt water, methylated spirits) mix to one layer of density = total mass ÷ total volume (with a small volume contraction for ethanol–water). Double-click to zoom in to the particles." }, portal: true },
  pourer: { name: "Pouring beaker", text: { y7: "Each liquid is poured gently, 50 mL at a time, down the side of the tube.", ext: "A gentle pour limits mixing, so honey, syrup and dish liquid (which dissolve in water only slowly) stay in layers for now (they blur over time)." } },
  bench: { name: "Bench top", text: { y7: "A matte epoxy-resin bench top, the kind used in school labs.", ext: "Epoxy resin worktops resist acids, solvents and heat." } },
};

// ---------- narrative ----------
const rhoTxt = (r) => { let t = r.toFixed(3); while (t.endsWith("0") && t.split(".")[1].length > 2) t = t.slice(0, -1); return t; };
const fmtRho = (r) => f2(r);

/**
 * "What's happening". S: { sample: {key,name,size,m,V,kind,shape}|null, loc, tare, massRead, haveMass, haveVol, meas, tank: {liquid, predicted, result},
 * column: { keys, layers, pieces[] } } . Returns an array of HTML paragraphs.
 */
export function narrative(S, band) {
  const ext = band === "ext";
  const out = [];
  const s = S.sample;
  if (!s) {
    out.push(P({ y7: `Pick a sample from the tray. Weigh it, find its volume, then work out its <b>density</b> (ρ = m ÷ V). Then see whether it floats or sinks.`, ext: `Pick a sample from the tray. Find m and V, then ρ = m ÷ V, and test the prediction ρ(object) &lt; ρ(liquid) ⇒ floats.` }, band));
  } else {
    const mat = SOLIDS[s.key];
    const head = `<b>${s.name}</b>${Math.abs(s.size - 1) > 0.01 ? ` (size ×${s.size.toFixed(1)})` : ""}`;
    if (!S.haveMass && !S.haveVol) out.push(`${head} is ready on the bench. Next: put it on the balance${s.kind === "regular" ? " and measure it with the ruler" : " and lower it into the measuring cylinder"}.`);
    else {
      const bits = [];
      if (S.haveMass) bits.push(S.tare && Math.abs(S.tare) > 0.004 ? `The balance reads <b>${g2(S.massRead)} g</b> but it was zeroed with something on the pan: <b>remove the sample, press TARE with the pan empty</b>, and weigh again.` : `On the balance: <b>${g2(S.meas.mass)} g</b> of ${nameLo(s.name)}.`);
      if (S.haveVol) bits.push(s.kind === "regular"
        ? (s.shape === "box" ? `The ruler gives <b>${f1(S.meas.dims[0])} × ${f1(S.meas.dims[1])} × ${f1(S.meas.dims[2])} cm</b>, so V = length × width × height = <b>${f1(S.meas.volume)} cm³</b>.`
          : `The ruler gives a radius of <b>${f1(S.meas.dims[0])} cm</b> and a length of <b>${f1(S.meas.dims[1])} cm</b>, so V = π × ${f1(S.meas.dims[0])}² × ${f1(S.meas.dims[1])} = <b>${f1(S.meas.volume)} cm³</b>.`)
        : `The water rose from <b>${S.meas.before} mL</b> to <b>${S.meas.after} mL</b>, so the solid's volume is ${S.meas.after} − ${S.meas.before} = <b>${S.meas.volume} mL = ${S.meas.volume} cm³</b> (1 mL = 1 cm³).`);
      out.push(`${head}: ${bits.join(" ")}`);
    }
    if (S.haveMass && S.haveVol && (!S.tare || Math.abs(S.tare) < 0.004)) {
      const c = S.cmp;
      let t = `<b>ρ = m ÷ V = ${g2(S.meas.mass)} g ÷ ${s.kind === "regular" ? f1(S.meas.volume) : S.meas.volume} cm³ = ${fmtRho(S.meas.rho)} g/cm³</b>. The data book gives about ${fmtRho(c.book.rho)} g/cm³ (typical range ${rhoTxt(c.book.range[0])} to ${rhoTxt(c.book.range[1])}), so you are <b>${c.err.toFixed(1)} %</b> away${c.inRange ? " and <b>inside the typical range</b>: real pieces of this material differ a little from the data-book value" : c.overlaps ? ", just outside the typical range but within the instrument uncertainty" : ", outside the typical range"}.`;
      if (c.err > 5) t += ` The instruments only read to ${S.meas.method === "ruler" ? "1 mm" : "1 mL"}, and a ${s.kind === "regular" ? "short" : "small"} object makes that a big fraction of the answer: your result could be off by about ±${fmtRho(c.u)} g/cm³.`;
      else if (ext) t += ` Instrument resolution alone limits it to about ±${fmtRho(c.u)} g/cm³.`;
      out.push(t);
      if (ext) out.push(`In SI units that is ${Math.round(S.meas.rho * 1000)} kg/m³. A bigger piece has a bigger m <i>and</i> V, so ρ stays the same: record two sizes and the points fall on one straight line through the origin, with slope ρ.`);
      if (s.key === "granite" || s.key === "aluminium") out.push(`Granite and aluminium both come out near 2.7 g/cm³, so density alone <b>cannot identify a material</b>: scientists use it together with other properties (hardness, colour, magnetism, how it conducts heat).`);
    }
  }

  // the tank: prediction, then the result
  const T = S.tank;
  if (s && S.haveMass && S.haveVol && S.cmp && !T.result) {
    const lq = LIQUIDS[T.liquid];
    const ft = floatTest(S.meas.rho, lq.rho);
    out.push(`<i>Prediction:</i> your measured density (${fmtRho(S.meas.rho)}) is ${ft.result === "floats" ? "<b>less than</b>" : ft.result === "sinks" ? "<b>more than</b>" : "<b>almost the same as</b>"} ${nameLo(lq.name)} (${rhoTxt(lq.rho)} g/cm³). Predict what will happen in the tank, then drop it in to test.`);
  }
  if (T.result) {
    const r = T.result, lq = LIQUIDS[r.liquid], m = r.m, ms = SOLIDS[r.key];
    const verb = r.result === "floats" ? (r.close ? "only just floats" : "floats") : r.result === "sinks" ? (r.close ? "only just sinks" : "sinks") : "is neutrally buoyant (an exact match)";
    let t = `In ${nameLo(lq.name)} (${rhoTxt(lq.rho)} g/cm³) the ${nameLo(ms.name)} (${rhoTxt(r.rho ?? ms.rho)} g/cm³) <b>${verb}</b>`;
    if (r.result === "floats") t += `: it is less dense than the liquid, so about <b>${pct(r.submerged)}</b> of it is under the surface (${rhoTxt(r.rho ?? ms.rho)} ÷ ${rhoTxt(lq.rho)} = ${r.submerged.toFixed(2)}).`;
    else if (r.result === "sinks") t += `: it is denser than the liquid.`;
    else t += `: its density exactly matches the liquid's, so the upward push of the liquid balances its weight at any depth.`;
    if (r.close && r.result !== "suspended") t += ` The two densities are within 1 % of each other, so it only just ${r.result === "floats" ? "floats" : "sinks"}: tiny differences in temperature, trapped air bubbles or how it is put in can change the result.`;
    if (T.predicted) t += ` ${T.predicted === r.result ? "✓ Your prediction was right." : `✗ You predicted that it ${T.predicted === "floats" ? "floats" : "sinks"}.`}`;
    out.push(t);
    // heavy things float, light things sink: compare with steel of the same mass
    if (r.result === "floats" && m > 2) out.push(`This ${nameLo(ms.name)} has a mass of <b>${g2(m)} g</b>, yet it floats: the same mass of steel is only <b>${f1(m / SOLIDS.steel.rho)} cm³</b>, packed into a much smaller volume, and steel sinks. It is <b>density</b>, not mass or size, that decides.`);
    if (r.result === "sinks" && m < 40) out.push(`This ${nameLo(ms.name)} has a mass of only <b>${g2(m)} g</b>, yet it sinks. A small, light object can sink, and a big, heavy one can float: it depends on the <b>density</b>.`);
    if (ext && r.result === "floats") out.push(`Archimedes: it floats when the upthrust (the weight of liquid displaced, ρ(liquid) × V(submerged) × g) equals its weight. So V(submerged) ÷ V = ρ(object) ÷ ρ(liquid) = ${r.submerged.toFixed(3)}. An object has no less weight when it floats: the liquid pushes up with an equal force.`);
  }

  // the column
  const C = S.column;
  if (C.layers.length) {
    const top = [...C.layers].reverse();
    const names = (L) => L.keys.map((k) => LIQUIDS[k].name.replace(/ \(.*\)/, "").toLowerCase()).join(" + ");
    let t = `<b>Density column</b>, from the top: ${top.map((L) => `${names(L)} (${rhoTxt(L.rho)})`).join(", ")}. The denser liquid is always underneath, as long as the liquids are poured gently, densest first.`;
    out.push(t);
    const mixed = C.layers.find((L) => L.mixed);
    if (mixed) {
      const hasEt = mixed.keys.includes("ethanol");
      out.push(`${hasEt ? "Methylated spirits mixes with water" : "Water and salt water mix"} instead of layering. The mixed layer has a density of ${rhoTxt(mixed.rho)} g/cm³${hasEt ? `: more than the spirits (${rhoTxt(LIQUIDS.ethanol.rho)}) and less than the water (${rhoTxt(LIQUIDS.water.rho)})` : ""}. ${ext && hasEt ? `ρ(mix) = total mass ÷ total volume = (${mixed.keys.map((k) => rhoTxt(LIQUIDS[k].rho)).join(" + ")}) g ÷ (${mixed.keys.length} cm³ × 0.965) = ${rhoTxt(mixed.rho)} g/cm³, using 1 cm³ of each and a volume shrink of about 3.5 % (CRC). ` : ""}`.trim());
    }
    const slow = C.layers.filter((L) => L.slowMix).map(names);
    if (slow.length) out.push(`${slow.join(", ").replace(/^./, (c) => c.toUpperCase())} ${slow.length > 1 ? "do" : "does"} dissolve in water, but only slowly, so a gently poured layer stays put for now. Over time the layers blur into each other.`);
    for (const p of C.pieces) {
      const rho = p.rho ?? SOLIDS[p.key].rho;
      const r = p.rest;
      const nm = nameLo(SOLIDS[p.key].name);
      const lay = (k) => names(C.layers[k]);
      if (r.mode === "empty" || (r.mode === "between" && (!C.layers[r.k] || !C.layers[r.k + 1])) || (r.mode === "top" && !C.layers[r.k])) continue;
      if (r.mode === "bottom") out.push(`The ${nm} (${rhoTxt(rho)}) is denser than every layer, so it sinks to the bottom.`);
      else if (r.mode === "top") out.push(`The ${nm} (${rhoTxt(rho)}) is less dense than every layer, so it floats on the top (${pct(r.f)} under the surface).`);
      else out.push(`The ${nm} (${rhoTxt(rho)}) sinks through ${lay(r.k + 1)} (${rhoTxt(C.layers[r.k + 1].rho)}) because it is denser, but floats on ${lay(r.k)} (${rhoTxt(C.layers[r.k].rho)}) because it is less dense, so it rests at the boundary between them.`);
    }
  } else if (S.focusColumn) out.push(`The column is empty. Pour a liquid in: try honey, then water, then oil. Then add a different order and see what changes (and what doesn't).`);
  return out;
}

export function predictLine(pred, result) {
  const w = { floats: "floats", sinks: "sinks", suspended: "hangs in the middle" };
  return pred === result ? `✓ You predicted it ${w[pred]}, and it does.` : `✗ You predicted it ${w[pred]}, but it ${w[result]}.`;
}

// ---------- missions ----------
// tr (tracker) from density.js: { rows: [...{key,size,kind,err,m,V}], drops: [{key,liquid,result,m,submerged}], colMax, colMix }
export const MISSIONS = [
  { text: "Find the density of a <b>regular</b> object: weigh it, measure it with the ruler, then <b>Record</b> the result.", check: (tr) => tr.rows.some((r) => r.kind === "regular") },
  { text: "Find the density of an <b>irregular</b> object by <b>displacement</b>: lower it into the measuring cylinder and <b>Record</b> the result.", check: (tr) => tr.rows.some((r) => r.kind === "irregular") },
  { text: "Get within <b>5 %</b> of the data-book value for <b>three different materials</b>.", check: (tr) => new Set(tr.rows.filter((r) => r.err <= 5).map((r) => r.key)).size >= 3 },
  { text: "Show that <b>heavier does not mean sinks</b>: float something with a bigger mass than something that sinks (try the ice cube and a small PET piece).", check: (tr) => tr.drops.some((a) => a.result === "floats" && tr.drops.some((b) => b.result === "sinks" && a.m > b.m + 0.5)) },
  { text: "Float the <b>ice cube</b> in water and then in salt water. Notice how much of it sits under the surface in each.", check: (tr) => tr.drops.some((d) => d.key === "ice" && d.liquid === "water" && d.result === "floats") && tr.drops.some((d) => d.key === "ice" && d.liquid === "salt" && d.result === "floats") },
  { text: "Build a column with <b>four separate layers</b> (try honey, dish liquid, water and oil).", check: (tr) => tr.colMax >= 4 },
  { band: "ext", text: "Pour water and methylated spirits. Use the numbers to explain why the mixed layer is <b>denser than the spirits</b> but <b>lighter than water</b>.", check: (tr) => tr.colMix },
];

// ---------- quiz ----------
export const QUIZ = [
  { q: "A big pine block has a mass of 32 g. A small steel bolt has a mass of 24 g. Which one sinks in water?",
    options: ["The pine block, because it is heavier", "The steel bolt, because steel is denser than water", "Both sink", "Neither: they are both heavy"],
    answer: 1, why: "Mass doesn't decide it. Pine has a density of about 0.5 g/cm³ (less than water, 1.0), so it floats however big it is. Steel is about 7.9 g/cm³, so even a small bolt sinks." },
  { q: "You cut a rock in half. What happens to the density of each half?",
    options: ["It halves", "It doubles", "It stays the same", "It depends on how you cut it"],
    answer: 2, why: "Each half has half the mass and half the volume, so ρ = m ÷ V is the same. Use the Size slider and record two sizes to see this on the graph." },
  { q: "An ice cube (0.917 g/cm³) is put in vegetable oil (about 0.92 g/cm³). What happens?",
    options: ["It sinks quickly", "It floats high out of the oil", "It only just floats, almost completely under the surface (about 99.7 % under)", "It floats with half of it above the surface"],
    answer: 2, why: "Fraction under = 0.917 ÷ 0.92 ≈ 0.997. The densities are so close that tiny differences in temperature, trapped air bubbles or how it is put in can change the result. Density decides, not \"1 g/mL\"." },
  { q: "Granite and aluminium both measure about 2.7 g/cm³. What does that tell you?",
    options: ["They are the same material", "Density alone can't identify a material", "One of the measurements is wrong", "They have the same mass"],
    answer: 1, why: "Different materials can have the same density. Density is a useful clue, but scientists check other properties too." },
  { q: "A floating ship has a lot of weight. Why doesn't it sink?",
    options: ["Floating objects have no weight", "Air is lighter than water, so the air pushes the ship up", "The ship's hollow shape means its <b>average</b> density (steel plus the air inside) is less than water's", "The water is pushing it up from below with extra force"],
    answer: 2, why: "A ship still has weight. Its steel hull encloses a huge volume of air, so the average density of the whole ship is less than water's. The air doesn't lift it; it just lowers the average density." },
  { q: "You pour honey (1.42 g/cm³), water (1.00) and vegetable oil (0.92) into a tall tube, one after the other, gently. What order do they end up in, from the bottom?",
    options: ["Oil, water, honey", "Honey, water, oil", "Water, honey, oil", "Any order: it depends only on who pours"],
    answer: 1, why: "Poured gently, the densest liquid ends up on the bottom and oil (which doesn't mix with water) on top. A rough pour mixes the water-based liquids, and over time honey and water slowly blend." },
  { band: "ext", q: "Ice has a density of 0.917 g/cm³ and sea water 1.025 g/cm³. About what fraction of an iceberg in the sea is under the surface?",
    options: ["About 50 %", "About 90 %", "About 10 %", "All of it"],
    answer: 1, why: "Fraction submerged = ρ(ice) ÷ ρ(sea water) = 0.917 ÷ 1.025 = 0.895, about 90 %." },
  { band: "ext", q: "A 12.0 cm³ metal sample is found by displacement using a cylinder that reads to 1 mL. Roughly how uncertain is the volume?",
    options: ["About ±0.01 %", "About ±1 %", "About ±8 %", "About ±50 %"],
    answer: 2, why: "Each reading is ±0.5 mL, so the difference is about ±1 mL, and 1 ÷ 12 ≈ 8 %. A larger sample, or a narrower cylinder, gives a smaller percentage uncertainty." },
];

// ---------- common mix-ups ----------
export const MIXUPS = [
  { myth: "\"Heavier objects sink\" (or \"big things sink\").", truth: { y7: "It's <b>density</b>, not mass or size. A big pine block floats and a small steel bolt sinks. Float the ice cube (mass 22 g at size 2.0) and sink a small PET piece (mass 8 g at size 0.5).", ext: "Floating depends on ρ(object) vs ρ(liquid), not on m or V alone. A 22 g ice cube floats and an 8 g piece of PET sinks." } },
  { myth: "\"Density changes when you cut it in half.\"", truth: { y7: "It doesn't. Half the mass, half the volume, same ρ. Use the Size slider and Record two sizes of the same material.", ext: "Density is an intensive property. m and V are extensive. The m–V points for one material lie on a straight line through the origin with slope ρ." } },
  { myth: "\"Floating objects have no weight.\"", truth: { y7: "A floating object still has weight. The liquid pushes up on it with an equal force, so it doesn't move. The balance shows the mass of the pine block even though it floats.", ext: "Floating is equilibrium: weight (down) = upthrust (up) = weight of the liquid displaced." } },
  { myth: "\"Air makes things float.\"", truth: { y7: "Air only helps by lowering the <b>average</b> density of an object, like the air-filled hull of a ship. It isn't a force pushing the object up.", ext: "A steel ship displaces a volume of water whose weight equals the ship's weight. The enclosed air reduces the average density of the whole ship below water's." } },
  { myth: "\"1 g/mL means it sinks in water.\"", truth: { y7: "Water at 20 °C is 0.998 g/mL. An object at 1.000 is only a hair denser, so it only just sinks. Try the ice cube in vegetable oil (0.917 vs 0.92): it only just floats, about 99.7 % under.", ext: "Within 1 % the result is sensitive to temperature, trapped air bubbles and how the object is put in. Only an exact match is neutrally buoyant." } },
  { myth: "\"Density tells you what a material is.\"", truth: { y7: "It's a clue, not a fingerprint. Granite and aluminium are both about 2.7 g/cm³, and real samples vary. Try measuring them both.", ext: "Densities overlap, and real samples vary (porosity, moisture, impurities). Identification needs several properties." } },
];

// ---------- data & sources ----------
export const SIMPLIFICATIONS = [
  "Densities are <b>typical values</b> at about 20 °C. Real woods, plastics, oils and honey vary from sample to sample; the range is shown on every result.",
  "Water at 20 °C is 0.998 g/mL (not exactly 1). An object at 1.000 g/cm³ is within 0.005 of it and counts as neutrally buoyant, not as sinking.",
  "Instruments read only to their resolution: balance 0.01 g, ruler 1 mm, measuring cylinder 1 mL. There are no slips (parallax, drips, bubbles), so your errors come from that resolution only.",
  "Irregular solids are found by displacement. HDPE floats, so it is held under with a thin wire; the volume found is the same.",
  "Floating depth uses Archimedes' rule with each piece's own shape, upright (cylinders lie on their sides). It ignores surface tension and tipping.",
  "The column is built from equal 50 mL pours, poured gently. Water, salt water and methylated spirits mix completely into one layer (ρ = total mass ÷ total volume; 3.5 % volume shrink when ethanol is present, exact only for a 50:50 mix).",
  "Honey, golden syrup and dishwashing liquid also dissolve in water, but so slowly that gently poured layers last for a while. The blur you see between them is only a hint of that; the slow blending over time is not simulated. If one is poured onto a less dense water-based liquid it partly mixes on the way down (a cloudy band).",
  "Pieces dropped in the column are small pieces (about 2.4 cm³) of the sample so they fit the tube. Density doesn't depend on size.",
  "The measuring cylinder is a wide-form cylinder (38 mm bore) so that pieces up to 14 cm³ fit without being deformed, so irregular samples are limited to size ×1.2 (the page says so).",
];
export const SOURCES = MODEL_SOURCES.map((s) => ({ what: ({ crc: "Elements, water and ethanol", etb: "Typical densities of solids, liquids and woods", usgs: "Ice and sea water" })[s.id] || "Data", ref: s.ref, url: s.url }));
export const DATA_ROWS = [
  ["Water at 20 °C", "0.998 g/mL (CRC)"],
  ["Ice", "0.917 g/cm³ (USGS); floats about 92 % under"],
  ["Sea water", "≈ 1.025 g/cm³ (USGS)"],
  ["Balance", "reads to 0.01 g"],
  ["Ruler", "reads to 1 mm (0.1 cm)"],
  ["Measuring cylinder", "reads to 1 mL (1 mL = 1 cm³)"],
];
export function dataBookRows() {
  const rows = [];
  for (const [k, s] of Object.entries(SOLIDS)) rows.push([s.name, `${s.rho} (${s.range[0] === s.range[1] ? "typical" : `${s.range[0]} to ${s.range[1]}`})`, SOURCES.find((q) => q.url && MODEL_SOURCES.find((m) => m.id === s.src && m.url === q.url))?.what || ""]);
  for (const [k, l] of Object.entries(LIQUIDS)) rows.push([l.name, `${l.rho} (${l.range[0] === l.range[1] ? "typical" : `${l.range[0]} to ${l.range[1]}`})`, ""]);
  return rows;
}
