// Text and data for the particle-scale States of matter level (statesParticles.js).
// Every value that differs by year is { y7: "...", ext: "..." } (lens.pick chooses). Australian spelling.
// Numbers in the narrative come from the shared heating model (statesModel.js) and from the particle view's own counts;
// nothing here is decided by a switch position.

import { WATER } from "./statesModel.js";

// ---------- constants shared with the 3D view ----------
export const KB = 1.380649e-23;                    // J/K
export const M_H2O = 18.015 * 1.66053907e-27;      // kg per molecule
export const P_ATM = 101325;                       // Pa

/** Real mean molecular speed, m/s, from kinetic theory: sqrt(8kT / (π m)). Applies to molecular motion in any state. */
export function meanSpeedReal(Tc) { return Math.sqrt((8 * KB * (Tc + 273.15)) / (Math.PI * M_H2O)); }
/** Real root-mean-square speed along one axis, m/s: sqrt(kT / m). */
export function sigmaReal(Tc) { return Math.sqrt((KB * (Tc + 273.15)) / M_H2O); }
/** Typical centre-to-centre spacing of molecules in an ideal gas at 1 atm, in molecule diameters (0.28 nm). */
export function gasSpacingRatio(Tc) { const n = P_ATM / (KB * (Tc + 273.15)); return Math.pow(1 / n, 1 / 3) / 0.28e-9; }

const minus = (s) => String(s).replace("-", "−");
export const fmtT = (T) => minus(T.toFixed(1));
const f0 = (x) => Math.round(x).toLocaleString("en-AU");
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
export const sci = (x, d = 1) => { const e = Math.floor(Math.log10(x)); const m = x / Math.pow(10, e); const sup = String(e).replace(/-/g, "⁻").replace(/[0-9]/g, (c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c]); return `${m.toFixed(d)} × 10${sup}`; };
const pick = (v, band) => (v == null ? "" : typeof v === "object" ? (v[band] ?? v.y7 ?? "") : v);

// ---------- sources ----------
export const SOURCES = [
  { what: "Water molecule geometry: O–H bond length 0.9572 Å, H–O–H angle 104.52° (gas phase)", ref: "CRC Handbook of Chemistry and Physics, 'Structure of free molecules in the gas phase'; NIST Computational Chemistry Comparison and Benchmark Database", url: "https://cccbdb.nist.gov/" },
  { what: "Ordinary ice (ice Ih): hexagonal lattice a = 4.52 Å, c = 7.37 Å, nearest O···O distance 2.76 Å, each molecule bonded to 4 neighbours", ref: "Petrenko & Whitworth, Physics of Ice (Oxford University Press, 1999)", url: "https://global.oup.com/academic/product/physics-of-ice-9780198518945" },
  { what: "Densities: ice 0.917 g/cm³ (0 °C), liquid water 0.998 g/cm³ (20 °C); about 33 molecules per nm³ in the liquid and 30.6 per nm³ in ice (calculated from these)", ref: "CRC Handbook of Chemistry and Physics, 'Properties of ice and supercooled water' and 'Density of water'", url: "https://hbcp.chemnetbase.com/" },
  { what: "Average molecular speed from kinetic theory, v = √(8kT/πm) (about 590 m/s for water at 20 °C), and gas spacing from n = P/kT at 101.3 kPa", ref: "Standard kinetic theory; Boltzmann constant k = 1.380649 × 10⁻²³ J/K (SI 2019 exact value)", url: "https://physics.nist.gov/cgi-bin/cuu/Value?k" },
  { what: "Compressibility of liquid water about 4.6 × 10⁻¹⁰ per pascal (0.005 % per atmosphere)", ref: "CRC Handbook of Chemistry and Physics, 'Properties of water'; IAPWS-95", url: "https://www.iapws.org/relguide/IAPWS95-2018.pdf" },
  ...WATER.sources,
];

// ---------- compare substances (4.1.4) ----------
export const SUBSTANCES = [
  { id: "o2", name: "Oxygen", formula: "O₂", mp: -218.8, bp: -183.0,
    kind: { y7: "small molecules, very weak attractions between them", ext: "O₂ molecules held only by weak dispersion forces (intermolecular)" },
    src: "RSC Periodic Table, 'Oxygen' (54.36 K and 90.20 K); CRC Handbook", url: "https://periodic-table.rsc.org/element/8/oxygen" },
  { id: "eth", name: "Ethanol", formula: "C₂H₅OH", mp: -114.1, bp: 78.4,
    kind: { y7: "molecules with moderately strong attractions between them", ext: "molecules held by hydrogen bonds (O–H) plus dispersion forces" },
    src: "PubChem, 'Ethanol' (CID 702); CRC Handbook", url: "https://pubchem.ncbi.nlm.nih.gov/compound/Ethanol" },
  { id: "h2o", name: "Water", formula: "H₂O", mp: 0, bp: 100,
    kind: { y7: "molecules with strong attractions between them", ext: "molecules held by a network of hydrogen bonds (each molecule can make up to 4)" },
    src: "CRC Handbook (melting point 0.00 °C, boiling point 99.97 °C at 101.325 kPa); PubChem 'Water' (CID 962)", url: "https://pubchem.ncbi.nlm.nih.gov/compound/Water" },
  { id: "nacl", name: "Sodium chloride (salt)", formula: "NaCl", mp: 801, bp: 1465,
    kind: { y7: "not molecules: a giant lattice of ions held by very strong attractions", ext: "giant ionic lattice: strong electrostatic attractions between Na⁺ and Cl⁻ ions (ionic bonds)" },
    src: "CRC Handbook, 'Physical constants of inorganic compounds'; PubChem 'Sodium chloride' (CID 5234)", url: "https://pubchem.ncbi.nlm.nih.gov/compound/Sodium-chloride" },
  { id: "fe", name: "Iron", formula: "Fe", mp: 1538, bp: 2862,
    kind: { y7: "not molecules: a giant lattice of atoms held by very strong attractions", ext: "giant metallic lattice: positive ions in a sea of shared electrons (metallic bonding)" },
    src: "RSC Periodic Table, 'Iron' (1811 K and 3134 K); PubChem 'Iron' (CID 23925); CRC Handbook", url: "https://periodic-table.rsc.org/element/26/iron" },
];

export function stateAt(sub, Tc) { return Tc < sub.mp ? "solid" : Tc < sub.bp ? "liquid" : "gas"; }

// ---------- narrative ----------
/**
 * c: { T, N, fs, fl, fg (fractions of the original mass: molecule counts), rs, rl, rg (fractions of the mass still in the sample: which state), sawBoil, phaseChange, heatIn, heatLoss, latentRate, evapRate, solidG, liquidG, gasG, escapedG,
 *      sealed, drawnSep }
 */
export function narrative(c, band) {
  const ext = band === "ext";
  const T = fmtT(c.T), v = f0(meanSpeedReal(c.T)), Tk = c.T + 273.15;
  const mass = c.solidG + c.liquidG + c.gasG;
  const fr = (n) => `${f0(n)} of ${f0(c.N)}`;
  const out = [];
  // counts and cases come from the model's fractions (the 3D view follows them a moment later)
  const nI = Math.round(c.fs * c.N), nL = Math.round(c.fl * c.N), nG = Math.round(c.fg * c.N), nIn = nI + nL + nG;
  const power = c.heatIn > 0.5 ? `The hotplate is putting in ${f0(c.heatIn)} W. ` : "";

  if (mass < 0.05) {
    out.push(`<p><strong>The container is empty.</strong> ${c.sawBoil ? "All the water has boiled away" : "All the water has evaporated"} and left the beaker as water vapour. Press Reset to start again.</p>`);
    return out.join("");
  }

  if (c.phaseChange === "melting") {
    out.push(`<p><strong>Melting at ${T} °C.</strong> ${power}The temperature is <strong>not rising</strong>, yet energy keeps flowing in. It is not making the molecules faster. It is <strong>pulling molecules out of their fixed places</strong> in the lattice, so they can slide. About ${fr(nL)} molecules are free so far, and ${c.solidG.toFixed(1)} g of ice is left.</p>`);
    out.push(`<p>Watch the lower edge of the ice: a molecule breaks free, joins the liquid and slides away. The molecules stay <strong>whole</strong> (still H₂O) and the <strong>same size</strong>.</p>`);
    if (ext) out.push(`<p>Average kinetic energy depends on temperature, and the temperature is constant, so it is unchanged (about ${v} m/s on average). The energy goes into <strong>potential energy</strong>: overcoming the attractions between molecules (hydrogen bonds). The model puts ${f0(Math.abs(c.latentRate))} W into this, at ${WATER.Lf} J for every gram melted (latent heat of fusion). The O–H bonds <em>inside</em> each molecule (covalent) stay intact.</p>`);
    return out.join("");
  }
  if (c.phaseChange === "freezing") {
    out.push(`<p><strong>Freezing at ${T} °C.</strong> Heat is leaving the water faster than it comes in, but the temperature <strong>stays flat</strong>. As molecules settle into the lattice they give out energy (the attractions pull them in), and that keeps the temperature steady. ${fr(nI)} molecules are in the ice lattice now.</p>`);
    if (ext) out.push(`<p>Molecules joining the lattice lose potential energy; that ${f0(Math.abs(c.latentRate))} W is released to the surroundings (${WATER.Lf} J per gram frozen). Their average kinetic energy is unchanged.</p>`);
    return out.join("");
  }
  if (c.phaseChange === "boiling") {
    out.push(`<p><strong>Boiling at ${T} °C.</strong> ${power}The temperature has <strong>stopped rising</strong>. The energy is separating molecules completely, so they fly off as a gas (water vapour). Unlike evaporation, molecules leave from <strong>all through the liquid</strong>, forming bubbles of vapour. ${c.sealed ? `${fr(nG)} molecules are now gas and stay in the box.` : `The vapour escapes from the open beaker; ${c.liquidG.toFixed(1)} g of liquid is left.`}</p>`);
    out.push(`<p>The bubbles are <strong>water vapour</strong>, not air: they are the same H₂O molecules, just far apart and moving freely.</p>`);
    if (ext) out.push(`<p>Separating molecules to infinity needs far more energy than loosening them in the solid: ${WATER.Lv} J per gram (latent heat of vaporisation) against ${WATER.Lf} J per gram for melting, about ${(WATER.Lv / WATER.Lf).toFixed(1)} times more. Right now ${f0(Math.abs(c.latentRate))} W is going in, mostly as potential energy (about 170 J of each gram's 2257 J pushes back the atmosphere as the vapour expands). Average kinetic energy still matches ${T} °C.</p>`);
    return out.join("");
  }
  if (c.phaseChange === "condensing") {
    out.push(`<p><strong>Condensing at ${T} °C.</strong> Gas molecules are being pulled together and sticking as liquid. Their average speed does not change, because the temperature does not. ${fr(nG)} molecules are still gas. The energy they give out keeps the temperature steady.</p>`);
    return out.join("");
  }

  const allIce = c.rs > 0.995;
  const allLiq = c.rl > 0.995;
  const mostlyGas = c.rg > 0.5;

  if (allIce) {
    out.push(`<p><strong>Ice at ${T} °C.</strong> Every one of the ${f0(c.N)} molecules shown is locked into a regular, open pattern (a lattice). Each one only <strong>vibrates about its fixed position</strong>; none wander off. ${power}${c.heatIn > 0.5 ? "As the temperature rises the vibrations get bigger." : "Heat the ice and the vibrations will get bigger."}</p>`);
    out.push(`<p>The ice is an <em>open</em> lattice with gaps, and that is why ice is less dense than liquid water and floats.</p>`);
    if (ext) out.push(`<p>At ${Tk.toFixed(0)} K the average speed of molecular motion is about ${v} m/s (∝ √T in kelvin). Because the kelvin temperature changes only a little between −20 °C and 0 °C (253 K to 273 K), the vibrations grow by only about ${((Math.sqrt(273.15 / 253.15) - 1) * 100).toFixed(0)} % over that whole range. Each molecule is held by up to four hydrogen bonds to its neighbours (intermolecular attractions).</p>`);
    return out.join("");
  }
  if (mostlyGas) {
    out.push(`<p><strong>${c.sealed ? "Steam (water vapour)" : "Water vapour"} at ${T} °C.</strong> The molecules are <strong>far apart</strong> and fly in straight lines until they hit a wall or another molecule. Each molecule is still exactly the same size and shape as it was in the ice. Average speed: about ${v} m/s.</p>`);
    out.push(`<p>Real steam at 100 °C and normal pressure has molecules about ${gasSpacingRatio(c.T).toFixed(0)} molecule-widths apart. Here they are drawn only about ${c.drawnSep.toFixed(1)} apart so they fit on screen.</p>`);
    if (ext) out.push(`<p>Almost no attraction acts between gas molecules, so their energy is almost all kinetic. At the same temperature every molecule has the same average kinetic energy as in the liquid; the gas is not faster, it just isn't held in place. ${c.T > 100.5 ? `Heated above 100 °C the sealed gas now warms (about ${WATER.cGas} J/g/°C).` : ""}</p>`);
    return out.join("");
  }
  if (allLiq) {
    const evap = !c.sealed && c.evapRate > 0 && c.T < 99
      ? ` A few of the fastest molecules at the surface can escape even below boiling (<strong>evaporation</strong>); the model has about ${f1(c.evapRate * 3600)} g leaving per simulated hour at this temperature.`
      : "";
    out.push(`<p><strong>Liquid water at ${T} °C.</strong> ${power}The molecules are <strong>touching</strong>, as close as in ice, but they are <strong>not in fixed positions</strong>: they tumble and slide past each other, which is why a liquid flows. Average speed: about ${v} m/s.${evap}</p>`);
    out.push(`<p>Warm the water and the molecules move faster. They do <strong>not</strong> get bigger.</p>`);
    if (ext) out.push(`<p>The attractions between molecules (hydrogen bonds) keep breaking and re-forming within picoseconds, so the liquid has less order than ice. Average speed ∝ √T: from 20 °C to 100 °C it rises by ${((Math.sqrt(373.15 / 293.15) - 1) * 100).toFixed(0)} % only.</p>`);
    return out.join("");
  }
  // mixtures without a change in progress
  const parts = [];
  if (nI) parts.push(`${fr(nI)} in the ice lattice`);
  if (nL) parts.push(`${fr(nL)} in the liquid`);
  if (nG) parts.push(`${fr(nG)} as gas`);
  out.push(`<p><strong>Mixed states at ${T} °C:</strong> ${parts.join(", ")}. ${c.rs > 0.005 && c.rl > 0.005 ? "No state change is in progress at this instant." : ""}</p>`);
  if (ext && nI && nL) out.push(`<p>Ice and water coexist at 0 °C. Add energy and the ice melts; remove it and the water freezes. The temperature stays at 0 °C until one of them has gone.</p>`);
  return out.join("");
}

// ---------- the "Test the state" card ----------
/** c: { nIce, nLiq, nGas, nIn, volPct, tilt, pressRel, squeezing } */
export function testText(c, band) {
  const ext = band === "ext";
  const solid = c.nIce / Math.max(1, c.nIn), liquid = c.nLiq / Math.max(1, c.nIn), gas = c.nGas / Math.max(1, c.nIn);
  const lines = [];
  if (c.squeezing) {
    if (gas > 0.5) lines.push(`<b>Squeeze:</b> the gas now takes up <b>${c.volPct.toFixed(0)}%</b> of its volume. It squashed easily because most of the space was <b>empty gaps</b>. The molecules did not shrink; they just got closer.${ext ? ` Same temperature, so pressure ∝ 1 / volume (Boyle's law): about ×${c.pressRel.toFixed(1)} now.` : ""}`);
    else if (solid + liquid > 0.5) lines.push(`<b>Squeeze:</b> the piston has stopped. A ${solid > liquid ? "solid" : "liquid"} <b>can't be squeezed</b> into less space because its molecules are already touching.${ext ? " Water shrinks by only about 0.005 % for each extra atmosphere of pressure." : ""}`);
  } else {
    lines.push(`Push the piston down and watch the gaps between molecules.`);
  }
  if (c.tilt > 8) {
    if (liquid > 0.4) lines.push(`<b>Tilt:</b> the liquid <b>flowed to the lowest side</b> and its surface stayed level. It changed shape but kept the same volume, because the molecules slid past each other without moving apart.`);
    else if (solid > 0.4) lines.push(`<b>Tilt:</b> the solid <b>kept its shape</b>. Its molecules stay in fixed positions, so a solid cannot flow.`);
    else if (gas > 0.4) lines.push(`<b>Tilt:</b> the gas <b>still fills the whole box</b>. Gas molecules spread out into all the space they can reach.`);
  } else lines.push(`Tilt the container and see which states flow and which keep their shape.`);
  return lines.map((l) => `<p>${l}</p>`).join("");
}

// ---------- the selected-molecule card ----------
export const STATE_WORD = { 0: "solid (ice)", 4: "joining the ice", 1: "liquid", 2: "gas" };

// ---------- missions ----------
/** S: { st: stats object, model, counts } ; text uses {y7, ext}. */
export function missionList() {
  return [
    { id: "follow", text: { y7: "Click a molecule in the <strong>ice</strong> and follow it for 8 seconds. Does it ever leave its place?", ext: "Click a molecule in the <strong>ice</strong> and follow it for 8 seconds. It vibrates about a fixed lattice site; how far does it get from it?" },
      check: (S) => S.st.followIce >= 8 },
    { id: "melt", text: { y7: "Heat the ice until it <strong>melts</strong> and watch molecules break out of the lattice. What does the thermometer do while this happens?", ext: "Melt the ice and watch the lattice break up. Explain why the temperature stays at 0 °C: where is the energy going?" },
      check: (S) => S.st.meltN >= 25 },
    { id: "size", text: { y7: "Click a molecule in <strong>two different states</strong> (for example ice and liquid). Is it the same size and shape each time?", ext: "Click molecules in <strong>all three states</strong> (you need a sealed container to make gas). Confirm size and shape never change." },
      check: (S) => S.st.followStates.size >= 2, checkExt: (S) => S.st.followStates.size >= 3 },
    { id: "boil", text: { y7: "Make the water <strong>boil</strong> and watch molecules leave the liquid as a gas. Where do they leave from?", ext: "Make the water <strong>boil</strong>. Molecules escape from all through the liquid, not just the surface. Why does that need so much more energy than melting?" },
      check: (S) => S.st.boilN >= 20 },
    { id: "squeeze", text: { y7: "<strong>Squeeze test:</strong> push the piston on a gas until it takes up half its space or less, then try it on a liquid or solid.", ext: "<strong>Squeeze test:</strong> compress a gas to half its volume (pressure doubles at constant temperature), then try a liquid or solid and compare." },
      check: (S) => S.st.gasSqueezed && S.st.condensedSqueezed },
    { id: "tilt", text: { y7: "<strong>Tilt test:</strong> tilt the container by 30° or more with liquid in it. What stays the same: the level, the volume or the shape?", ext: "<strong>Tilt test:</strong> tilt the container with liquid in it. Explain the result in terms of molecules sliding but staying in contact." },
      check: (S) => S.st.tiltLiquid >= 30 },
    { id: "speed", band: "ext", text: { y7: "", ext: "Warm liquid water by at least <strong>50 °C</strong> and read the average speed chip. By what percentage did it rise? (Predict it from √T in kelvin.)" },
      check: (S) => S.st.liqSpan >= 50 },
  ];
}

// ---------- quiz ----------
export function quizList(band) {
  const q = [
    { q: "Ice is warmed from −20 °C to 0 °C. What happens to its water molecules?",
      options: ["They get bigger", "They vibrate more strongly about their fixed positions", "They start sliding past each other", "They split into hydrogen and oxygen"], answer: 1,
      why: "Warmer means more energy of motion. In a solid the molecules cannot leave their places, so they vibrate harder. They don't change size, they don't slide yet, and they stay whole molecules." },
    { q: "In this model of steam, what is between the water molecules?",
      options: ["Air", "Nothing (empty space)", "Tiny bubbles of water", "More water"], answer: 1,
      why: "Between the particles there is empty space. (Real steam in a room is mixed with air molecules, but the gaps in a pure sample of water vapour are empty.)" },
    { q: "Which statement about the particles in a solid is correct?",
      options: ["They don't move at all", "They vibrate about fixed positions", "They slide past each other", "They bounce around the whole container"], answer: 1,
      why: "Solid particles are held in place but they are never still: they vibrate. Only at absolute zero (−273.15 °C) would the vibrations nearly stop." },
    { q: "How does the size of one water molecule in steam compare with one in ice?",
      options: ["Bigger in steam, because gas expands", "Smaller in steam", "The same size", "It depends on the temperature"], answer: 2,
      why: "Matter expands because the particles get further apart, not because the particles get bigger. A water molecule is about 0.28 nm across in every state." },
    { q: "Ice melts into liquid water. What happens to each H₂O molecule?",
      options: ["It splits into hydrogen and oxygen atoms", "It stays a whole H₂O molecule but is no longer held in a fixed position", "It shrinks", "It turns into a different substance"], answer: 1,
      why: "Melting is a physical change. The molecules stay whole; only their arrangement changes, from a fixed lattice to touching-and-sliding." },
    { q: "You press a piston on a syringe of air and on a syringe of water. Which is easier to squash, and why?",
      options: ["The water, because it is lighter", "The air, because most of its volume is empty gaps", "Both are the same", "The air, because its particles are softer"], answer: 1,
      why: "Gas particles are far apart, so there is a lot of empty space to squeeze out. Liquid particles are already touching, so the volume barely changes." },
    { band: "ext", q: "How much faster is the average speed of water molecules at 100 °C than at 20 °C?",
      options: ["About 5 times", "About 13 % faster", "About 3.7 times", "The same, because it is still H₂O"], answer: 1,
      why: "Average speed is proportional to √T in kelvin: √(373 / 293) ≈ 1.13. Doubling the Celsius temperature does not double the speed." },
    { band: "ext", q: "Why do oxygen (−183 °C) and water (100 °C) have such different boiling points?",
      options: ["Water molecules are heavier", "Water's molecules attract each other far more strongly (hydrogen bonds), so more energy is needed to separate them", "The O–H bonds inside water molecules are stronger than the O=O bond", "Oxygen is a gas at 20 °C, so it has no attractions at all"], answer: 1,
      why: "Boiling separates molecules from each other; it does not break the bonds inside them. Hydrogen bonds between water molecules are much stronger than the weak forces between O₂ molecules." },
  ];
  return q.filter((x) => !x.band || (band === "ext"));
}

// ---------- cards ----------
export function mixups(band) {
  const ext = band === "ext";
  return [
    ["Particles expand when heated.", "A water molecule stays the same size (about 0.28 nm) in ice, liquid and gas. Heating makes them move or vibrate more, and the spaces between them can grow. Click one in each state and compare." + (ext ? " Thermal expansion is the average spacing growing, not the particles swelling." : "")],
    ["There is air between the particles.", "Between the water molecules is empty space, nothing at all. Air is made of its own particles (nitrogen and oxygen) and they are not part of this picture."],
    ["Particles in a solid don't move.", "They vibrate all the time about fixed positions. Follow a molecule in the ice to see it." + (ext ? " The vibrations are bigger at a higher temperature (∝ √T in kelvin)." : "")],
    ["Gas particles are bigger.", "Gas molecules are the same size as in the liquid. They only look like they take up more room because they are far apart (in real steam about 13 molecule-widths apart)."],
    ["When ice melts, the molecules break apart into atoms.", "The H₂O molecules stay whole. Melting only loosens the attractions <em>between</em> molecules." + (ext ? " The covalent O–H bonds inside a molecule (about 460 kJ/mol each) are far stronger than the hydrogen bonds between molecules (about 20 kJ/mol). Melting and boiling break only the weak ones." : "")],
    ["The particles themselves are solid, liquid or gas.", "'Solid', 'liquid' and 'gas' describe how a huge number of particles are <em>arranged and moving</em>. One molecule is not 'melted' or 'frozen'; it is the same H₂O in every state."],
  ];
}

export function honesty(band) {
  const items = [
    "Molecules are drawn as <strong>spheres</strong>: red = oxygen, white = hydrogen. These colours are a convention; atoms have no colour. The O–H length and the 104.5° angle are to scale, but the atoms are drawn smaller than their true electron clouds so you can see the shape.",
    "<strong>Gas spacing is compressed.</strong> Real steam at 100 °C and normal pressure has molecules about 13 molecule-widths apart. To fit on screen they are drawn only about two apart. Gas is far more spread out than this picture suggests.",
    "This is a <strong>thin slice</strong> of a 3D sample, about 4 nm across. The few hundred molecules shown stand for the whole sample; a 100 g sample contains about 3 × 10²⁴ of them.",
    "<strong>Motion is slowed down</strong> by about 500 billion times. Real water molecules move at roughly 590 m/s (about 2100 km/h) at room temperature and collide billions of times each second. The speeds on screen keep the right ratios between temperatures.",
    "Ice is drawn as an ice Ih lattice (a small, idealised piece with no defects), and its vibrations are drawn about twice their real size so you can see them. The liquid is a simple model of touching spheres: it shows <em>touching and sliding</em>, but not the exact structure of real liquid water.",
    "The dotted <strong>attraction links</strong> are drawn where a hydrogen atom points at the oxygen of a neighbour. In real water these bonds are constantly breaking and re-forming; they are not solid sticks.",
    "How many molecules are in each state comes from the heating model. <strong>Where</strong> each molecule is and which one changes state next is illustrative.",
  ];
  if (band === "ext") items.push("Only translational and vibrational motion is shown. Real molecules also rotate (shown as slow tumbling) and the O–H bonds stretch and bend, which store energy too; this is part of why water's specific heat capacity is large (4.18 J/g/°C).");
  return items;
}

/** Substance names for the compare card heading text. */
export const COMPARE_INTRO = {
  y7: "Different substances melt and boil at different temperatures. The stronger the attractions between the particles, the more energy is needed to pull them apart, so the higher the melting and boiling points. Drag the slider to see which state each substance is in.",
  ext: "The stronger the forces between particles (weak intermolecular forces < hydrogen bonds < ionic and metallic bonds), the more energy is needed to separate them, so the higher the melting and boiling points. Drag the slider to see each state. Note that salt and iron are not made of separate molecules.",
};

export function canvasLabel() { return "Interactive 3D view of water molecules: ice lattice, liquid and gas. Click a molecule to follow it."; }

export { pick };
