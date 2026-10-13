// Builds content/revision.json for the MixLab revision quiz.
//   node tools/build-revision-bank.mjs [--blatant]
// Deterministic: same inputs give byte-identical output.
//
// Pipeline
//  1. Load the science-defender question bank (Years 7-10 MCQs) and keep ONLY the items on the allow list below
//     (states of matter, particle theory, density, surface tension, solutions, solubility, concentration,
//     pure substances and mixtures, separation, fractional distillation, water treatment, the water cycle).
//     Everything else is denied by omission.
//  2. Apply the science-check patches (items marked FIX) and add the hand-written items (AUTHORED) that fill gaps.
//     Items adapted from ../Year-7/solutions-mixtures/content.jsx are marked "content.jsx". Nothing from the errors
//     listed in docs/AUDIT-year7-page.md is imported.
//  3. Validate every item and drop near-identical stems.
//  4. Seeded shuffle, then rebalance so the correct answer sits in each position equally often.
//  5. Report the "longest option is the answer" bias.
//
// Bands: "y7" = Year 7 core; "ext" = needs Year 8-10 ideas (atoms, bonds, formulas, intermolecular forces, latent heat).
// first-nations is deliberately empty: no item has been sourced to AIATSIS / NSW Education yet.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const SRC = path.resolve(root, "../science-defender/js");
const OUT = path.join(root, "content/revision.json");
const SEED = 20261013;

const TOPICS = ["states-of-matter", "heating-curves", "particle-theory", "density", "surface-tension", "solutions", "solubility",
  "concentration", "pure-mixtures", "separation", "first-nations", "fractional-distillation", "water-treatment", "water-cycle"];
const [SM, HC, PT, DE, ST, SO, SL, CO, PM, SE, FN, FD, WT, WC] = TOPICS;

// ---------------------------------------------------------------- source bank
const win = {}; win.window = win; vm.createContext(win);
for (const y of [7, 8, 9, 10]) vm.runInContext(fs.readFileSync(path.join(SRC, `questions-y${y}.js`), "utf8"), win);
const bank = win.QUESTION_BANK;
const src = (key) => {
  const [y, t, i] = key.split(".");
  const it = bank[y]?.[t]?.[+i];
  if (!it) throw new Error(`missing source item ${key}`);
  return it;
};

// ---------------------------------------------------------------- allow list
// [sourceId, band, topics, patch?]   patch = { q?, key?, d?: [3 distractors], why? }   (FIX = science correction)
const KEEP = [
  // ---- states of matter, particles, changes of state
  ["7.solutions.0", "y7", [SM], { // FIX: source note said water is "unique" in having three states; many substances do
    why: "The three states of matter are solid, liquid and gas. Plasma is sometimes called a fourth state, but it is not part of Year 7." }],
  ["7.solutions.1", "y7", [SM, PT], { q: "Which state of matter has particles in a fixed, regular arrangement that can only vibrate about their positions?",
    why: "In a solid the particles are packed closely in a regular pattern and are held in place by strong attractions. They vibrate about fixed positions but cannot move from place to place." }],
  ["7.solutions.2", "y7", [SM, PT]],
  ["7.solutions.3", "y7", [SM, HC], { why: "Pure water melts (ice becomes liquid water) at 0 degrees Celsius at standard atmospheric pressure." }],
  ["7.solutions.4", "y7", [SM, HC], { why: "Pure water boils at 100 degrees Celsius at standard atmospheric pressure (sea level). It boils at a lower temperature at high altitude." }],
  ["7.solutions.5", "y7", [SM], { // FIX: evaporation and boiling are different (surface at any temperature vs whole liquid at the boiling point)
    why: "A liquid changing to a gas is called evaporation when it happens at the surface at any temperature, and boiling when bubbles of vapour form throughout the liquid at its boiling point. Both are changes from liquid to gas." }],
  ["7.solutions.6", "y7", [SM], { why: "Condensation is the change from gas to liquid. Energy is released to the surroundings as the particles slow down and come together." }],
  ["7.solutions.7", "y7", [SM], { why: "Sublimation is a solid changing directly to a gas without becoming a liquid first. Dry ice (solid carbon dioxide) does this at room temperature." }],
  ["7.solutions.8", "y7", [HC, PT], { // FIX: energy overcomes attractions, not "breaks" bonds; temperature = average kinetic energy
    key: "The energy goes into overcoming the attractions between particles, not into making them move faster",
    d: ["The Bunsen burner is switched off automatically during melting", "Water cannot absorb heat while it is changing state", "The particles stop moving while the solid melts"],
    why: "While a substance melts, the energy added is used to overcome the attractions holding the particles in place. It does not increase the average speed of the particles, so the temperature stays constant until the change of state is complete." }],
  ["7.solutions.9", "y7", [PT, SM], {
    key: "Gas particles move freely and attract each other only weakly; solid particles are held in fixed positions",
    d: ["Gas particles are smaller than solid particles, so they spread out to fill the space", "Gas particles are heavier than solid particles, so they sink to fill the container", "Solid particles are electrically charged but gas particles are not charged at all"],
    why: "In a gas the attractions between particles are very weak, so the particles move quickly in all directions and fill any container. In a solid, strong attractions hold particles in fixed positions, so a solid keeps its own shape." }],
  ["7.solutions.51", "y7", [SM, PT], { // FIX: not every particle escapes; it is the surface particles with enough energy
    key: "Surface particles with enough energy escape from the liquid as a gas",
    d: ["The particles are destroyed as the liquid disappears", "The particles slow down and join together into a solid", "The particles combine with oxygen from the air"],
    why: "Some particles at the surface of a liquid have enough energy to overcome the attractions to their neighbours and escape into the air as a gas. This is evaporation." }],
  ["7.solutions.55", "y7", [PT, SM], { why: "In a gas the particles are far apart, so the attractions between them are the weakest of the three states. That is why a gas spreads out to fill its container." }],
  ["9.materials.54", "ext", [PT, SM], { q: "Why do covalent molecular substances such as sugar or wax have lower melting points than ionic compounds such as salt?",
    key: "Only weak attractions between separate molecules need to be overcome",
    d: ["Their strong bonds inside each molecule are easily broken by heat", "They contain free electrons that carry heat away", "They are always made from lighter atoms"],
    why: "Covalent molecular substances have strong bonds within each molecule but only weak attractions between molecules. Little energy is needed to separate the molecules, so they melt at low temperatures. (Melting does not break the bonds inside the molecules.)" }],
  // ---- density
  ["7.solutions.10", "y7", [DE]],
  ["7.solutions.11", "y7", [DE], { q: "A block has a mass of 120 g and a volume of 40 cm³. What is its density?",
    key: "3 g/cm³", d: ["4800 g/cm³", "0.33 g/cm³", "80 g/cm³"], why: "Density = mass ÷ volume = 120 ÷ 40 = 3 g/cm³." }],
  ["7.solutions.12", "y7", [DE], { why: "Pure water has a density of about 1.0 g/mL (1000 kg/m³) at room temperature. A solid that is less dense than water floats in it." }],
  ["7.solutions.13", "y7", [DE], { why: "An object floats when its density is less than that of the liquid. Wood at 0.7 g/mL is less dense than water (1.0 g/mL), so it floats. (Some very dense woods, such as ebony, do sink.)" }],
  ["7.solutions.14", "y7", [DE]],
  ["7.solutions.15", "y7", [DE, SM, PT], { // FIX: say "more space between particles" in plain words
    key: "Ice is less dense than liquid water because its particles are held in an open pattern with more space between them",
    d: ["Ice is lighter in colour than water, so it floats", "Ice particles move faster than liquid water particles", "Ice has no mass, so gravity does not pull it down"],
    why: "When water freezes, its particles lock into an open, regular pattern that takes up more space than the liquid. The same mass fills a bigger volume, so ice (about 0.92 g/mL) is less dense than liquid water (1.00 g/mL) and floats." }],
  ["7.solutions.41", "y7", [DE], { key: "To avoid a parallax error caused by looking at the scale from an angle",
    d: ["To see the colour of the liquid more clearly", "To stop the cylinder from tipping over", "Because the scale is only printed on one side"],
    why: "Looking from above or below eye level makes the liquid level seem higher or lower than it really is. Read the bottom of the curved surface (the meniscus) with your eye level with it." }],
  ["7.solutions.49", "y7", [DE]],
  ["7.solutions.53", "y7", [DE], { q: "What decides whether an object floats or sinks in water?",
    key: "Its average density compared with the density of water (1.0 g/mL)",
    why: "An object floats if its average density is less than the density of the liquid, and sinks if it is greater. Size and mass alone do not decide it: a huge log floats while a tiny pebble sinks." }],
  // ---- surface tension
  ["7.solutions.16", "y7", [ST], { q: "What is surface tension?",
    key: "A thin, stretchy 'skin' on a liquid, because surface particles are pulled inwards by their neighbours",
    d: ["The temperature at which a liquid turns to a gas", "The force of the liquid pushing on the walls of its container", "The ability of a liquid to flow downhill"],
    why: "Particles at the surface of a liquid are pulled sideways and inwards by the particles around them, but not upwards. This makes the surface behave like a thin stretchy skin. All liquids have surface tension; water's is relatively high." }],
  // ---- solutions, solubility, concentration
  ["7.solutions.17", "y7", [SO], { key: "A mixture in which a solute is dissolved evenly through a solvent",
    d: ["Any mixture of two or more substances", "A liquid that has been purified by distillation", "A compound made of two elements"] }],
  ["7.solutions.18", "y7", [SO]],
  ["7.solutions.19", "y7", [SO, SL], { why: "A soluble substance can dissolve in a given solvent; an insoluble substance cannot. Salt and sugar are soluble in water; sand is insoluble." }],
  ["7.solutions.20", "y7", [SL, SO]],
  ["7.solutions.21", "y7", [CO, SL]],
  ["7.solutions.22", "y7", [SL]],
  ["7.solutions.23", "y7", [SL]],
  ["7.solutions.24", "y7", [SL, SM], { why: "Gases are less soluble in warmer water, so dissolved air comes out of solution as small bubbles on the pan before the water boils. The bubbles that rise through water that is truly boiling are water vapour." }],
  ["7.solutions.25", "y7", [CO, SL]],
  ["7.solutions.45", "y7", [CO, SL]],
  ["7.solutions.46", "y7", [CO]],
  ["7.solutions.50", "y7", [CO]],
  ["7.solutions.43", "ext", [SO, PT], { key: "Water particles attract the solute particles, pull them away from the solid and spread them evenly through the water",
    d: ["The solute particles break up into atoms that join with water atoms", "The solid melts to a liquid that then mixes with the water", "The solute particles shrink until they are too small to see"] }],
  ["10.reactions.10", "ext", [SO], { q: "What does the state symbol (aq) mean in a chemical equation?", why: "(aq) stands for 'aqueous': the substance is dissolved in water." }],
  ["8.change.15", "y7", [SO], { q: "Which of these is a physical change?", why: "Dissolving sugar in water is a physical change: no new substance forms and the sugar can be recovered by evaporating the water. Rusting, baking and burning make new substances." }],
  // ---- pure substances and mixtures
  ["8.periodic.0", "y7", [PM]],
  ["8.periodic.41", "y7", [PM], { q: "Which elements are combined in water, H₂O?", key: "Hydrogen and oxygen",
    d: ["Hydrogen and nitrogen", "Helium and oxygen", "Hydrogen and carbon"], why: "Water is a compound of hydrogen and oxygen. Its formula, H₂O, shows two hydrogen atoms and one oxygen atom in each molecule." }],
  ["8.periodic.44", "y7", [PM], { q: "What is an alloy?", key: "A mixture of a metal with one or more other elements, such as steel" }],
  ["8.periodic.45", "ext", [PM], { q: "What is steel, and why is it more useful than pure iron for building?",
    key: "An alloy of iron and a little carbon, which makes it much stronger than pure iron",
    d: ["Pure iron that has been polished, which makes it much lighter", "A compound of iron and oxygen that never rusts", "A mixture of copper and zinc, which makes it attractive"] }],
  ["8.periodic.58", "ext", [PM], { // FIX: stainless steel resists rust (does not "never" rust); mainly iron, chromium, carbon (and often nickel)
    q: "What is stainless steel, and why is it used for surgical instruments?",
    key: "An alloy of iron, chromium and often nickel that resists rusting",
    d: ["Pure iron that has been polished until it looks clean", "A compound of iron and oxygen that is very hard", "A mixture of iron and carbon that is very soft"],
    why: "Stainless steel is mostly iron with chromium (and usually nickel). The chromium forms a thin protective layer, so it resists rusting and is easy to keep clean." }],
  ["7.solutions.31", "y7", [PM], { key: "An element has one type of atom; a compound has two or more types of atom joined in a fixed ratio",
    d: ["An element has two types of atom; a compound has only one", "A compound can be separated by filtering; an element cannot", "They are the same; both are mixtures of different atoms"] }],
  ["7.solutions.32", "y7", [PM], { key: "A compound has its elements chemically joined in fixed ratios; a mixture's parts are not joined and keep their own properties",
    d: ["A compound has random proportions of its parts; a mixture always has fixed proportions", "A compound can be separated by filtration; a mixture can never be separated", "A mixture is always a liquid; a compound is always a solid"] }],
  ["7.solutions.33", "y7", [PM, SE], { key: "Yes, because each part keeps its own properties",
    d: ["No, it needs a chemical reaction to separate it", "No, mixtures cannot be separated at all", "Only if the mixture contains metals"] }],
  ["7.solutions.34", "y7", [PM], { key: "A mixture that looks the same throughout, such as salt water",
    d: ["A mixture with visibly different parts, such as a salad", "A mixture whose parts are in different states of matter", "A mixture that can only be separated by chemical reactions"] }],
  ["7.solutions.35", "y7", [PM], { key: "A mixture that is not the same throughout, so its parts can often be seen, such as soil",
    d: ["A mixture in which all the particles are the same size", "A mixture that dissolves completely in water", "A compound with changing proportions of each element"] }],
  ["7.solutions.52", "y7", [PM, SO], { q: "Which best describes filtered seawater?" }],
  ["9.materials.17", "ext", [PM], { q: "What is the formula of water, and what type of bonding holds its atoms together?" }],
  // ---- separation
  ["7.solutions.26", "y7", [SE], { why: "Filtration separates an insoluble solid (sand) from a liquid (water). The sand is too large to pass through the tiny pores in the filter paper, but the water passes through." }],
  ["7.solutions.27", "y7", [SE, SO], { q: "A student wants to recover the salt from salt water as solid crystals and does not need to keep the water. Which is the simplest technique?",
    key: "Evaporation", d: ["Filtration", "Magnetic separation", "Chromatography"], // FIX: distillation also works, so it is no longer a distractor
    why: "Evaporation drives off the water and leaves the salt behind as crystals. Filtration cannot work because the salt is dissolved. (Distillation would also leave the salt behind, and collects the water too.)" }],
  ["7.solutions.28", "y7", [SE], { key: "Particle size: the filter paper's tiny pores block large particles but let smaller ones through",
    d: ["Boiling point: the filter paper holds back the liquid with the higher boiling point", "Magnetism: the filter paper attracts magnetic particles", "Density: the filter paper holds back the denser liquid"] }],
  ["7.solutions.29", "y7", [SE]],
  ["7.solutions.30", "y7", [SE, FD], { // FIX: simple distillation collects a solvent from a solution; liquids with close boiling points need fractional distillation
    q: "What is distillation used for?",
    key: "Collecting a liquid, such as pure water, from a solution by boiling it and condensing the vapour",
    d: ["Separating an insoluble solid from a liquid", "Separating magnetic from non-magnetic materials", "Separating dyes by how far they travel up paper"],
    why: "In distillation a liquid is boiled, and its vapour is cooled in a condenser and collected as a liquid. It can collect pure water from salt water, because the salt stays behind. Liquids with boiling points close together need fractional distillation." }],
  ["7.solutions.36", "y7", [SE]],
  ["7.solutions.42", "y7", [SE, SO]],
  ["7.solutions.44", "y7", [SE], { key: "How well each dye dissolves in the solvent and how strongly it sticks to the paper",
    d: ["Differences in the boiling points of the dyes", "Differences in the magnetic properties of the dyes", "Differences in the sizes of the dye particles only"],
    why: "In paper chromatography the solvent carries the dyes up the paper. Dyes that dissolve well and stick weakly travel further; dyes that stick strongly travel less far. This separates them into spots." }],
  ["7.solutions.47", "y7", [SE, SO], { key: "The dissolved salt particles are tiny and pass through the filter paper along with the water",
    d: ["Salt is denser than the filter paper", "Salt reacts with the filter paper", "Filtration only works on gases"],
    why: "Dissolved particles are far smaller than the pores in filter paper, so they pass through with the water. Evaporation is needed to recover the salt." }],
  ["7.solutions.39", "y7", [FD, SE], { // FIX: air is also separated by fractional distillation (of liquid air), so the old "oxygen from nitrogen" distractor was not a safe wrong answer
    q: "What is fractional distillation used for in industry?",
    key: "Separating crude oil into petrol, diesel, kerosene and other fractions that have different boiling points",
    d: ["Removing salt from seawater to make drinking water", "Filtering solid particles out of drinking water", "Separating iron from other metals using a magnet"],
    why: "Crude oil is a mixture of many liquids. It is heated and its vapours rise up a fractionating tower, where each fraction condenses at a different height because of its different boiling point." }],
  ["9.materials.21", "ext", [FD]],
  ["9.materials.22", "ext", [FD, PT]],
  ["9.energy.55", "ext", [FD]],
  ["9.materials.47", "ext", [FD, PT]],
  // ---- water cycle
  ["7.solutions.48", "y7", [WC, SM], { q: "In the water cycle, what change of state happens when water vapour in the air forms a cloud?",
    key: "Condensation: water vapour cools and changes into tiny droplets of liquid water",
    d: ["Evaporation: liquid water changes into a gas", "Sublimation: a solid changes directly into a gas", "Melting: ice changes into liquid water"],
    why: "Water vapour in rising air cools and condenses into tiny liquid droplets, which make up a cloud. (At very low temperatures the droplets can freeze into ice crystals.)" }],
  ["7.solutions.54", "y7", [WC, SM]],
];

// ---------------------------------------------------------------- authored items
// [band, topics, q, key, [3 distractors], why]
const A = [
  // ---- states of matter / particle theory
  ["y7", [SM, PT], "Which state of matter has a fixed volume but takes the shape of its container?", "Liquid", ["Solid", "Gas", "All three states"],
    "A liquid's particles are close together, so its volume is fixed, but they can slide past each other, so it flows and takes the shape of its container."],
  ["y7", [SM, PT], "A gas is squashed into a smaller space by pushing in a syringe plunger. What happens to the gas particles?", "They move closer together, but each particle stays the same size",
    ["They shrink so that they take up less room", "They change into a liquid straight away", "They stop moving"],
    "Gases can be compressed because there is a lot of empty space between the particles. Squashing a gas reduces that space; the particles themselves do not change size."],
  ["y7", [PT], "What happens to the particles of a substance when it is heated?", "They move faster (they gain kinetic energy)", ["They get bigger", "They are created from the heat energy", "They stop vibrating"],
    "Heating gives particles more kinetic energy, so they move or vibrate faster. The particles do not get bigger. A substance usually expands because the particles spread further apart."],
  ["y7", [PT, SM], "Why does a gas push on the walls of its container?", "Its fast-moving particles keep colliding with the walls", ["Gas particles are heavier than the walls", "Gas particles stick to the walls", "Gas particles push upwards on each other"],
    "Gas particles move quickly in all directions. Each collision with a wall gives a tiny push, and billions of collisions every second add up to gas pressure."],
  ["y7", [PT], "A drop of food colouring spreads through a cup of still water without stirring. What is the best explanation?", "Water particles are always moving and bump the dye particles around",
    ["Dye particles are lighter than water, so they spread out", "Gravity pulls the dye sideways through the water", "The water particles stay still and pull the dye in"],
    "Particles in a liquid are in constant random motion. Collisions with moving water particles spread the dye through the water. This is called diffusion."],
  ["y7", [PT, SM], "Which statement about the particles in a liquid is correct?", "They are close together but can slide past one another",
    ["They are far apart and move freely in all directions", "They are in a fixed pattern and can only vibrate", "They are close together and do not move at all"],
    "Liquid particles touch their neighbours but are not locked in place, so a liquid can flow and be poured."],
  ["y7", [SM], "Steam touches a cold window and forms drops of water. What is this change of state called?", "Condensation", ["Evaporation", "Melting", "Sublimation"],
    "Water vapour (a gas) loses energy on the cold glass and changes to liquid water. A gas changing to a liquid is condensation."],
  ["y7", [SM], "A puddle slowly disappears on a warm day. Which change of state is mainly responsible?", "Evaporation", ["Condensation", "Sublimation", "Melting"],
    "The water at the surface of the puddle slowly changes to water vapour and mixes with the air. It does not need to reach 100 degrees Celsius."],
  ["y7", [SM], "Dry ice (solid carbon dioxide) changes straight to a gas at room temperature. What is this called?", "Sublimation", ["Melting", "Evaporation", "Condensation"],
    "A solid changing directly into a gas, with no liquid stage, is sublimation. The white fog around dry ice is tiny droplets of water formed when water vapour from the air is chilled; it is not the carbon dioxide gas, which is invisible."],
  ["y7", [SM], "Which change of state is the reverse of freezing?", "Melting", ["Condensation", "Sublimation", "Evaporation"],
    "Freezing changes a liquid to a solid, so the opposite change is melting, a solid becoming a liquid."],
  ["y7", [SM], "How is evaporation different from boiling?", "Evaporation happens at the surface at any temperature; boiling happens throughout the liquid at its boiling point",
    ["They are two names for the same process", "Evaporation only happens at exactly 100 degrees Celsius", "Boiling only happens at the surface of a liquid"],
    "Evaporation is a slow change at the surface of a liquid. Boiling is a rapid change in which bubbles of vapour form throughout the liquid at its boiling point."],
  ["y7", [SM, HC], "What are the bubbles made of that rise through a pot of boiling water?", "Water vapour (water in its gas state)", ["Air", "Hydrogen and oxygen gas", "Heat"],
    "Inside boiling water, liquid water is turning into water vapour, so the large bubbles are water vapour. Small bubbles that appear earlier, before boiling, are dissolved air coming out of solution."],
  ["y7", [SM], "What is the white 'cloud' seen above a boiling kettle?", "Tiny droplets of liquid water formed when water vapour cools",
    ["Water vapour, which is a white gas", "Hot air from the kettle", "Smoke from the heating element"],
    "Steam (water vapour) is an invisible gas. The white cloud forms a little way from the spout, where the vapour cools and condenses into tiny droplets of liquid water."],
  ["y7", [PT, SM], "A sealed, flexible bag of air is warmed. Why does the bag swell?", "The particles move faster and push harder on the walls of the bag",
    ["The particles get bigger as they are heated", "More air particles are created by the heat", "The particles become lighter and float to the top"],
    "Warm gas particles move faster, so they hit the walls harder and more often. The bag swells until the pressure inside equals the pressure outside. The particles do not change in size or number."],
  ["y7", [SM, PT], "Why can a liquid be poured but a solid cannot?", "Liquid particles can slide past each other, but solid particles are held in fixed positions",
    ["Liquid particles are smaller than solid particles", "Liquid particles are far apart from one another", "Solid particles are heavier than liquid particles"],
    "The particles of a liquid can move past each other, so a liquid flows. In a solid they are held in place, so a solid keeps its shape."],
  ["y7", [SM, PT], "Which statement is true of the particles in every state of matter?", "They are always in motion, either vibrating or moving around",
    ["They are always held in a fixed pattern", "They are always far apart", "They always touch their neighbours"],
    "In all three states the particles are moving. In solids they vibrate about fixed positions; in liquids and gases they move around."],
  // ---- heating curves
  ["y7", [HC, SM], "A solid is heated steadily and its temperature is recorded. What does a flat section on the graph show?", "The substance is changing state while energy is still being added",
    ["The heater has been switched off", "The substance has stopped taking in energy", "The substance has finished changing state"],
    "During a change of state the energy supplied goes into overcoming the attractions between particles, not into raising the temperature. Energy is still being absorbed, so the graph is flat."],
  ["y7", [HC], "Ice at −10 °C is heated steadily until it becomes water at 20 °C. How many flat sections does the temperature graph have?", "One, while the ice melts", ["None", "Two", "Three"],
    "A flat section appears only while a change of state is happening. Here the only change of state is melting, so there is one flat section (at 0 °C). The water never reaches its boiling point."],
  ["y7", [HC, SM], "Ice at −10 °C is heated steadily until the water boils. What is the correct order of the stages on the graph?", "Ice warms, ice melts (flat), water warms, water boils (flat)",
    ["Ice melts, ice warms, water boils, water warms", "Ice warms, water boils, ice melts, water warms", "Water warms, ice melts, water boils, ice warms"],
    "Temperature rises while the solid warms, stays flat at the melting point, rises while the liquid warms, then stays flat at the boiling point."],
  ["y7", [HC], "Pure water is boiling in an open pot at sea level. Why does the thermometer stay at 100 °C even though the burner keeps heating?", "The added energy is used to change liquid into gas, not to raise the temperature",
    ["The thermometer cannot read above 100 °C", "The water particles have stopped moving", "The burner stops supplying energy at 100 °C"],
    "At the boiling point the energy supplied overcomes the attractions between the liquid particles so they can escape as a gas. The temperature stays constant until the liquid has all turned to gas."],
  ["y7", [HC], "A pure liquid freezes at 80 °C. A student cools the liquid and records its temperature. Where is the flat section on the graph?", "At 80 °C, while the liquid freezes",
    ["At 0 °C", "At 100 °C", "There is no flat section when a liquid is cooled"],
    "A pure substance freezes at the same temperature at which it melts. While it freezes, energy is released but the temperature stays constant."],
  ["y7", [HC, PT], "On a heating curve, the temperature rises in the sloping sections. What is happening to the particles?", "They gain kinetic energy and move or vibrate faster",
    ["They are changing state", "They are being destroyed", "They are losing energy to the surroundings"],
    "The slope shows the temperature rising, so the average kinetic energy of the particles is increasing."],
  ["y7", [HC, PM], "Why is the melting point useful for identifying a pure substance?", "A pure substance melts at one specific temperature that can be compared with data tables",
    ["All pure substances melt at 0 °C", "The melting point changes every time it is measured", "Only mixtures have a melting point"],
    "Each pure substance has its own sharp melting point. A mixture usually melts over a range of temperatures, which shows that it is impure."],
  ["y7", [HC, SM], "What happens to energy when water vapour condenses to liquid water?", "Energy is released to the surroundings",
    ["Energy is absorbed from the surroundings", "Energy is created", "No energy is transferred"],
    "Condensing, freezing and deposition release energy. Melting, evaporating and sublimation absorb it. This is why steam can scald more than boiling water: it releases extra energy as it condenses on skin."],
  ["y7", [HC, PM], "Compared with a pure liquid, how does a mixture usually boil?", "Over a range of temperatures, instead of at one fixed temperature",
    ["At exactly the same temperature as the pure liquid", "It cannot be boiled", "At exactly 100 °C every time"],
    "A pure substance boils at one fixed temperature (at a given pressure). A mixture such as salt water boils over a range, which usually starts a little higher than the pure liquid's boiling point."],
  ["ext", [HC], "A heater supplies energy at a steady rate. Compared with melting a block of ice at 0 °C, boiling the same mass of water at 100 °C takes about",
    "seven times as long, because water needs much more energy to vaporise than ice needs to melt", ["the same time", "half the time", "twice as long"],
    "Melting ice needs about 334 J per gram (latent heat of fusion). Turning water to vapour needs about 2257 J per gram (latent heat of vaporisation), roughly 6.8 times more."],
  ["ext", [HC, PT], "During melting, the temperature stays constant even though energy is being added. What happens to the particles' energy?", "Their potential energy increases as the attractions are overcome, while their average kinetic energy stays the same",
    ["Their average kinetic energy increases while their potential energy stays the same", "Their kinetic energy and potential energy both stay the same", "The extra energy is destroyed"],
    "Temperature measures the average kinetic energy of the particles. The energy added during melting goes into increasing the potential energy stored in the arrangement of particles, as they move apart."],
  ["ext", [HC], "Water has a specific heat capacity of 4.18 J/g°C. How much energy raises the temperature of 50 g of water by 10 °C?", "2090 J", ["209 J", "418 J", "20 900 J"],
    "Energy = mass × specific heat capacity × temperature change = 50 × 4.18 × 10 = 2090 J."],
  ["ext", [HC], "The latent heat of fusion of ice is 334 J/g. How much energy is needed to melt 10 g of ice at 0 °C?", "3340 J", ["334 J", "33.4 J", "33 400 J"],
    "Energy = mass × latent heat = 10 × 334 = 3340 J. The temperature stays at 0 °C while the ice melts."],
  ["ext", [HC, SM], "Why can steam at 100 °C cause a worse burn than boiling water at 100 °C?", "Steam releases a large amount of energy as it condenses on the skin",
    ["Steam is much hotter than 100 °C", "Steam particles are heavier than water particles", "Steam sticks to the skin"],
    "Steam and boiling water are at the same temperature, but steam also releases about 2257 J per gram when it condenses into liquid, on top of the energy released as that water cools."],
  // ---- density
  ["y7", [DE], "A block has a mass of 50 g and a volume of 25 cm³. What is its density?", "2 g/cm³", ["0.5 g/cm³", "25 g/cm³", "1250 g/cm³"],
    "Density = mass ÷ volume = 50 ÷ 25 = 2 g/cm³."],
  ["y7", [DE], "A liquid has a density of 0.8 g/mL. What is the volume of 200 g of it?", "250 mL", ["160 mL", "0.004 mL", "400 mL"],
    "Volume = mass ÷ density = 200 ÷ 0.8 = 250 mL."],
  ["y7", [DE], "Cooking oil floats on top of water. What does this tell you?", "Oil is less dense than water", ["Oil has a smaller mass than the water", "Oil particles are heavier than water particles", "Oil is thicker than water so it cannot sink"],
    "A liquid floats on another liquid it does not mix with when it is less dense. A large amount of oil can have more mass than a small amount of water and still float."],
  ["y7", [DE], "A huge log floats but a tiny pebble sinks. What is the best explanation?", "The pebble is denser than water, but the log is less dense than water",
    ["The pebble is heavier than the log", "The log is bigger, so the water holds it up", "The pebble has no air inside it"],
    "Floating depends on density, not on mass or size. The log has more mass than the pebble, but its density is below that of water, while the pebble's density is above it."],
  ["y7", [DE], "A steel ship floats even though steel is denser than water. Why?", "The ship's overall (average) density, including the air inside it, is less than the density of water",
    ["Steel becomes lighter when it is in water", "The hull repels water particles", "Ships are so large that gravity pulls on them less"],
    "The hollow ship holds a lot of air, so its total mass is spread over a large volume. Its average density is less than that of water, so it floats."],
  ["y7", [DE], "A solid has a density of 2.7 g/cm³. Water has a density of 1.0 g/cm³ and mercury has 13.6 g/cm³. What happens when the solid is put in each liquid?", "It sinks in water and floats in mercury",
    ["It floats in both", "It sinks in both", "It floats in water and sinks in mercury"],
    "An object sinks in a liquid that is less dense than it is, and floats in a liquid that is denser than it is."],
  ["y7", [DE, PT], "Why does a hot air balloon rise?", "The hot air inside is less dense than the cooler air around it",
    ["The particles in hot air are lighter than those in cold air", "The particles in hot air shrink as they are heated", "The flame pushes the balloon upwards"],
    "Warm air spreads out, so some leaves the balloon and the air inside has less mass in the same volume. The balloon system is then less dense than the cooler air around it and rises."],
  ["y7", [DE, SM], "For most substances, what happens to the density when a liquid freezes to a solid?", "The density increases, because the particles pack more closely",
    ["The density decreases, because the particles move apart", "The density stays exactly the same", "The mass of the substance increases"],
    "Most solids are slightly denser than their liquids. Water is an important exception, because ice is less dense than liquid water."],
  ["y7", [DE], "A small piece of pure gold and a large gold bar are compared. Which property is the same for both?", "Density", ["Mass", "Volume", "Weight"],
    "Density is a property of the material, so it does not depend on how much of it you have."],
  ["y7", [DE], "A block measures 5.0 cm × 4.0 cm × 2.0 cm and has a mass of 108 g. What is its density?", "2.7 g/cm³", ["0.37 g/cm³", "27 g/cm³", "5.4 g/cm³"],
    "Volume = 5.0 × 4.0 × 2.0 = 40 cm³. Density = 108 ÷ 40 = 2.7 g/cm³, which is the density of aluminium."],
  ["ext", [DE, PT], "Liquid water is densest at about 4 °C. Why does it become less dense as it cools towards 0 °C?", "Hydrogen bonds start to hold the water molecules in an open arrangement",
    ["The water molecules start to shrink", "The water molecules stop moving", "Dissolved air leaves the water"],
    "As water cools below 4 °C its molecules begin to line up, held by hydrogen bonds, into the open pattern found in ice. This takes up more space, so the density falls."],
  // ---- surface tension
  ["y7", [ST], "Why can a water strider walk on the surface of a pond?", "Surface tension forms a stretchy skin that its light weight, spread over its long legs, does not break",
    ["Its legs are lighter than air", "Water is denser at the surface than below", "Its legs are filled with air so they float"],
    "The attractions between surface water particles make the surface behave like a thin elastic skin. The insect's weight is spread over its legs, so the skin is not broken."],
  ["y7", [ST], "Why can a paperclip be made to rest on top of water if it is placed on gently?", "Surface tension supports it", ["Steel is less dense than water", "Water repels all metals", "Gravity does not pull on small objects"],
    "The paperclip is denser than water, so it would normally sink. If it is placed gently, the surface 'skin' holds it up. If it breaks through the surface, it sinks."],
  ["y7", [ST], "Water forms small round beads on a waxy leaf. What is the best explanation?", "Water particles attract each other more than they attract the wax, so surface tension pulls a drop into a bead",
    ["Wax attracts water particles very strongly", "Gravity squeezes each drop into a ball", "Wax makes the water heavier"],
    "Surface tension pulls a drop into the rounded shape with the smallest surface. The wax does not attract the water strongly enough to spread it out."],
  ["y7", [ST], "What happens to the surface tension of water when detergent is added?", "It decreases", ["It increases", "It does not change", "It doubles"],
    "Detergent weakens the attractions between surface water particles. This lowers the surface tension, which is why soapy water spreads and wets surfaces better."],
  ["y7", [ST], "Pepper is sprinkled on water and a drop of detergent touches the centre. What happens to the pepper?", "It is pulled quickly to the edges of the dish",
    ["It sinks straight to the bottom", "It clumps together in the middle", "Nothing happens"],
    "The detergent lowers the surface tension where it touches. The stronger surface tension elsewhere pulls the surface, and the pepper floating on it, outwards."],
  ["y7", [ST], "What causes surface tension in a liquid?", "Particles at the surface are pulled inwards by the particles beside and below them",
    ["Particles at the surface are pushed up by the air", "Particles at the surface are heavier than the rest", "Particles at the surface stop moving"],
    "A surface particle has neighbours only below and beside it, so the net pull is inwards and sideways. This makes the surface tight, like a stretched skin."],
  ["y7", [ST], "Which statement about surface tension is correct?", "All liquids have surface tension, and water's is relatively high",
    ["Only water has surface tension", "Only liquids that float have surface tension", "Only hot liquids have surface tension"],
    "Surface tension happens in every liquid because of the attractions between its particles. Water's is higher than that of most common liquids."],
  ["y7", [ST], "What happens to the surface tension of water when it is heated?", "It decreases slightly", ["It increases a lot", "It does not change at all", "It becomes zero at 20 °C"],
    "As water warms its particles move faster and the attractions are weaker compared with their motion, so the surface tension falls a little. Hot soapy water cleans better, partly for this reason."],
  ["y7", [ST], "A glass can be filled slightly above its rim without spilling. What allows this?", "Surface tension holds the surface of the water in a dome",
    ["Air pressure pushes down on the water", "The water expands to fit the glass", "The glass is larger on the inside"],
    "The stretchy surface layer holds the water together in a rounded dome above the rim until the extra weight is too much."],
  ["ext", [ST, PT], "Why is the surface tension of water higher than that of most other liquids?", "Hydrogen bonds between water molecules are strong, so surface molecules are pulled inwards strongly",
    ["Water molecules are much heavier than other molecules", "Water molecules do not move", "Water has fewer molecules at its surface"],
    "Surface tension depends on the strength of the attractions between molecules. Water's hydrogen bonds are strong, so its surface 'skin' is strong."],
  // ---- solutions
  ["y7", [SO], "Which of these is a solution?", "Salt dissolved in water", ["Sand stirred into water", "Oil shaken with water", "Flour mixed with water"],
    "In a solution the solute is dissolved evenly, and you cannot see the separate parts. Sand, oil and flour stay as separate particles or droplets and settle or separate."],
  ["y7", [SO, SE], "A sugar solution is poured through filter paper. What goes through?", "Both the sugar and the water", ["Only the water", "Only the sugar", "Nothing"],
    "Dissolved sugar particles are tiny and pass through the filter paper with the water. Filtration only separates undissolved solids."],
  ["y7", [SO], "Copper sulfate crystals are dissolved in water. What is the water called?", "The solvent", ["The solute", "The solution", "The residue"],
    "The solvent is the substance that does the dissolving. The substance that dissolves is the solute, and the two together make the solution."],
  ["y7", [SO, PM], "Which of these is NOT a solution?", "Muddy water", ["Salty water", "Sugar dissolved in tea", "Soft drink with the lid on"],
    "Muddy water contains undissolved soil particles that slowly settle out, so it is a suspension. The other three are uniform mixtures of dissolved substances."],
  ["y7", [SO, PT], "Salt is stirred into water until it seems to disappear. What has happened to the salt?", "Its particles are spread out among the water particles and are still there",
    ["It has been destroyed", "It has turned into water", "Its particles have shrunk to nothing"],
    "When a solute dissolves, its particles separate and mix evenly with the solvent. No matter is lost, and you can recover the salt by evaporating the water."],
  ["y7", [SO], "10 g of salt is dissolved completely in 100 g of water. What is the mass of the salt solution?", "110 g", ["90 g", "100 g", "10 g"],
    "Mass is conserved when a solid dissolves: 100 g + 10 g = 110 g. The salt does not disappear."],
  ["y7", [SO, SL], "Why does stirring make sugar dissolve faster?", "It brings fresh water into contact with the sugar",
    ["It makes the sugar more soluble in water", "It makes the sugar particles smaller", "It heats the water a lot"],
    "Stirring moves the sugar-rich water away from the solid and replaces it with fresh solvent. It speeds up dissolving but does not change how much can dissolve."],
  ["y7", [SO, SL], "Which set-up would dissolve the sugar fastest?", "Warm water, powdered sugar and stirring",
    ["Cold water, a sugar cube and no stirring", "Cold water, powdered sugar and no stirring", "Warm water, a sugar cube and no stirring"],
    "Warm water, a larger surface area (powder) and stirring each speed up dissolving."],
  ["y7", [SO], "Oil and water form two separate layers when shaken together. Which word describes this?", "Immiscible: they do not mix", ["Miscible: they mix completely", "Saturated: they cannot hold more", "Dilute: they contain little solute"],
    "Liquids that do not mix are immiscible, and liquids that mix completely are miscible. Oil and water do not form a solution."],
  ["y7", [SO, SL], "Why does a bottle of soft drink fizz when you open it?", "Dissolved carbon dioxide comes out of solution when the pressure drops",
    ["The sugar reacts with the air", "The drink starts to boil", "The drink suddenly warms up"],
    "The gas is kept dissolved by high pressure inside the sealed bottle. Opening it lowers the pressure, so the gas is less soluble and escapes as bubbles."],
  ["ext", [SO, PT], "Why does salt (sodium chloride) dissolve in water but wax does not?", "Water molecules are attracted to the charged ions and pull them out of the salt crystal; wax has no such attraction",
    ["Wax is too dense to dissolve", "Salt particles are smaller than wax particles", "Wax melts before it can dissolve"],
    "Water molecules have slightly charged ends that attract the sodium and chloride ions and surround them. Wax molecules are not charged, so water does not attract them strongly enough."],
  ["ext", [SO, PT], "Why does sugar dissolve in water but not in cooking oil?", "Sugar and water molecules attract each other strongly, but oil molecules do not attract sugar molecules strongly",
    ["Oil molecules are much smaller than water molecules", "Sugar melts in water but not in oil", "Oil is less dense than water"],
    "A substance dissolves when its particles are attracted to the solvent particles as strongly as they are attracted to each other. This is often summarised as 'like dissolves like'."],
  // ---- solubility
  ["y7", [SL], "At 20 °C, 36 g of salt can dissolve in 100 g of water. A student stirs 20 g of salt into 100 g of water at 20 °C. The solution is", "unsaturated, because more salt could still dissolve",
    ["saturated, because the salt dissolved", "supersaturated, because it is clear", "insoluble, because it is a solid"],
    "The solution holds 20 g, which is less than the 36 g it could hold, so more salt can dissolve."],
  ["y7", [SL, CO], "At 20 °C, 36 g of salt can dissolve in 100 g of water. A student stirs 50 g of salt into 100 g of water at 20 °C. How much salt stays undissolved?", "About 14 g", ["0 g", "36 g", "50 g"],
    "Only 36 g can dissolve, so 50 − 36 = 14 g remains undissolved at the bottom, and the solution is saturated."],
  ["y7", [SL], "In what units is the solubility of a solid usually given?", "Grams of solute that dissolve in 100 g of water at a stated temperature",
    ["Degrees Celsius per gram of solute", "Grams of water needed to dissolve 100 g of solute", "Litres of solute per kilogram of water"],
    "Solubility is the maximum mass of solute that dissolves in 100 g of water at a certain temperature. The temperature must be stated because solubility changes with it."],
  ["y7", [SL, SE], "Potassium nitrate has a solubility of about 64 g per 100 g of water at 40 °C and about 32 g at 20 °C. A saturated solution with 100 g of water at 40 °C is cooled to 20 °C. About how much crystallises out?",
    "About 32 g", ["About 64 g", "About 96 g", "None, because it stays dissolved"],
    "The solution can now hold only 32 g, so 64 − 32 = 32 g of crystals form. This is how crystallisation by cooling works."],
  ["y7", [SL, SM], "Why does a can of soft drink go flat more quickly when it is warm?", "Gases are less soluble in warmer water, so carbon dioxide escapes faster",
    ["The sugar becomes less soluble in warm water", "The can expands and lets the gas out", "Carbon dioxide turns into a liquid"],
    "The solubility of a gas falls as the temperature rises, so warm drinks hold less dissolved carbon dioxide."],
  ["y7", [SL, WT], "Why can fish struggle to breathe in very warm water?", "Warm water holds less dissolved oxygen", ["Warm water has no oxygen in it at all", "Fish gills do not work below 30 °C", "Warm water is denser, so fish cannot swim"],
    "The solubility of gases such as oxygen decreases as water warms, so there is less dissolved oxygen available to the fish."],
  ["y7", [SL], "Which of these would dissolve in water?", "Sugar", ["Sand", "Cooking oil", "Plastic beads"],
    "Sugar is soluble in water. Sand and plastic are insoluble, and oil does not mix with water."],
  ["y7", [SL, SE], "A saturated salt solution at 60 °C is left to cool. Salt solubility decreases a little as it cools. What do you see?", "Some salt crystals form as the solution cools",
    ["Nothing at all happens", "The salt turns into water", "The water changes to ice"],
    "The cooled solution can hold less salt than before, so the extra dissolved salt comes out of solution as crystals. (For some solutes the effect is much bigger than for salt.)"],
  ["y7", [SL, CO], "How can you tell that a solution is saturated?", "Extra solute that is added stays undissolved however long you stir",
    ["It is coloured", "It has been boiled", "It contains a lot of water"],
    "A saturated solution holds as much solute as it can at that temperature, so any extra solute remains as a solid."],
  ["ext", [SL, CO, PT], "A saturated salt solution has some undissolved salt at the bottom. What is happening to the salt particles?", "Particles dissolve and come out of solution at the same rate",
    ["Nothing is happening because the particles have stopped moving", "Particles are only dissolving", "Particles are only crystallising"],
    "A saturated solution is in dynamic equilibrium. Salt particles leave the solid and enter the solution at the same rate as other particles leave the solution and join the solid, so the amounts stay constant."],
  // ---- concentration
  ["y7", [CO], "Which solution is more concentrated?", "20 g of salt in 100 mL of water", ["5 g of salt in 100 mL of water", "Both are the same, because both are salt water", "It cannot be told without the temperature"],
    "Concentration compares the amount of solute with the amount of solution. With the same volume, more solute means a more concentrated solution."],
  ["y7", [CO, SL], "Which statement is correct?", "A saturated solution of a substance that is hardly soluble can still be dilute",
    ["A saturated solution is always concentrated", "A dilute solution can never be saturated", "Saturated and concentrated mean the same thing"],
    "Dilute and concentrated describe how much solute there is in the solution; saturated means no more can dissolve. If a solute barely dissolves, even a saturated solution has little of it."],
  ["y7", [CO], "Water is added to a salt solution. What happens to the concentration?", "It decreases, because the same salt is spread through more water",
    ["It increases, because there is more liquid", "It stays the same, because the amount of salt is unchanged", "The solution becomes saturated"],
    "Adding solvent dilutes the solution. The amount of salt is the same, but each millilitre now has less of it."],
  ["y7", [CO], "A drink label says to mix one part cordial with four parts water. What happens if you use eight parts water instead?", "The drink is more dilute", ["The drink is more concentrated", "The drink becomes saturated", "The drink is unchanged"],
    "Using more water spreads the same amount of cordial through more liquid, so the drink is more dilute."],
  ["y7", [CO], "Some water evaporates from a salt solution and no salt is lost. What happens to the solution?", "It becomes more concentrated", ["It becomes more dilute", "Its concentration stays the same", "It turns into a pure substance"],
    "The amount of salt is the same but the amount of water is less, so each millilitre now holds more salt. Water evaporates and the solute stays behind."],
  ["y7", [CO], "Which is more dilute: 1 teaspoon of sugar in 1 cup of water, or 1 teaspoon of sugar in 10 cups of water?", "1 teaspoon in 10 cups", ["1 teaspoon in 1 cup", "They are equally dilute", "Neither is dilute"],
    "The same amount of sugar is spread through ten times as much water, so that solution is more dilute."],
  ["y7", [CO, SL], "When you click the metal disc in a sodium acetate hand warmer, it suddenly turns solid and warms up. What was inside before you clicked?", "A supersaturated solution",
    ["A dilute solution", "A saturated solution with crystals on the bottom", "Pure water"],
    "The liquid holds more dissolved sodium acetate than normal at that temperature. The click starts crystallisation, which releases energy as heat."],
  ["ext", [CO], "20 g of sugar is dissolved in water to make 100 g of solution. What is the concentration as a percentage by mass?", "20%", ["5%", "80%", "120%"],
    "Concentration (% by mass) = mass of solute ÷ mass of solution × 100 = 20 ÷ 100 × 100 = 20%."],
  ["ext", [CO], "10 g of salt is dissolved in water to make 500 mL of solution. What is the concentration in g/L?", "20 g/L", ["0.02 g/L", "50 g/L", "5000 g/L"],
    "500 mL is 0.5 L. Concentration = mass ÷ volume = 10 ÷ 0.5 = 20 g/L."],
  // ---- pure substances and mixtures
  ["y7", [PM], "Which of these is a pure substance?", "Distilled water", ["Seawater", "Air", "Milk"],
    "A pure substance has only one kind of particle. Distilled water is water only. Seawater, air and milk are mixtures."],
  ["y7", [PM], "Air is best described as", "a mixture of gases", ["an element", "a compound of nitrogen and oxygen", "a pure gas"],
    "Air contains nitrogen, oxygen, argon, carbon dioxide and other gases that are not chemically joined, so it is a mixture."],
  ["y7", [PM, SE], "Iron filings and sulfur powder are mixed. A magnet pulls the iron out. When the mixture is heated strongly, it forms a black solid that the magnet does not attract. What is the black solid?", "A compound, iron sulfide, which has new properties",
    ["A mixture of iron and sulfur", "An element, because it is one colour", "Iron that has changed colour"],
    "Heating made a chemical reaction. Iron sulfide is a new substance, so the iron can no longer be pulled out with a magnet."],
  ["y7", [PM], "Which of these is an element?", "Oxygen", ["Water", "Salt water", "Carbon dioxide"],
    "An element has only one kind of atom. Oxygen is an element. Water and carbon dioxide are compounds, and salt water is a mixture."],
  ["y7", [PM], "Which is a heterogeneous mixture?", "Orange juice with pulp", ["Sugar dissolved in tea", "Filtered salt solution", "Air in a sealed jar"],
    "The pulp can be seen as separate pieces, so orange juice with pulp is not uniform. The others look the same throughout."],
  ["y7", [PM, SO, WT], "A bottle of clean-looking water has been filtered. A student says it must be pure water. Why might this be wrong?", "It could still contain dissolved substances that filtering does not remove",
    ["Filtered water always contains sand", "Pure water is always cloudy", "Water cannot be filtered"],
    "Filtering removes undissolved solids only. Dissolved salts and gases pass through, so the water is still a solution (mixture). Distillation can produce much purer water."],
  ["ext", [PM], "The formula CO₂ tells you that one molecule of carbon dioxide contains", "one carbon atom and two oxygen atoms",
    ["one cobalt atom and two oxygen atoms", "two carbon atoms and one oxygen atom", "carbon mixed with oxygen"],
    "The number after an element symbol shows how many atoms of that element are in the molecule. Carbon dioxide is a compound, not a mixture."],
  ["ext", [PM], "Which of these is a molecule of an element?", "O₂", ["H₂O", "CO₂", "NaCl"],
    "An element molecule has only one kind of atom. O₂ is two oxygen atoms. H₂O and CO₂ are compounds, and NaCl is an ionic compound made of ions, not molecules."],
  ["ext", [PM], "Why is an alloy such as brass a mixture, not a compound?", "Its metals are mixed in varying proportions and do not form one substance with a fixed formula",
    ["It contains only one type of atom", "Its metals cannot be mixed", "It is always a liquid"],
    "Alloys can be made with different proportions of the metals, and their properties change with the proportions. A compound has a fixed ratio of elements."],
  // ---- separation
  ["y7", [SE], "Which technique separates the dyes in a black ink?", "Chromatography", ["Filtration", "Evaporation", "Magnetic separation"],
    "Dyes in the ink dissolve in the solvent and travel up the paper at different speeds. Chromatography separates them into spots."],
  ["y7", [SE], "Which technique would separate gravel from sand?", "Sieving", ["Evaporation", "Chromatography", "Distillation"],
    "A sieve has holes of a set size. Small sand grains fall through and the larger gravel is held back."],
  ["y7", [SE], "A solid has settled to the bottom of a beaker of water. Pouring off the liquid without disturbing the solid is called", "decanting",
    ["distilling", "condensing", "subliming"], "Decanting separates a liquid from a settled solid by pouring the liquid off. Filtering is more complete."],
  ["y7", [SE], "How does a centrifuge separate a mixture?", "It spins the mixture quickly so the denser parts move to the bottom",
    ["It heats the mixture until one part evaporates", "It passes the mixture through paper", "It uses a magnet to pick out iron"],
    "Spinning makes the denser parts settle to the bottom much faster than they would just standing. Centrifuges are used to separate blood cells from plasma."],
  ["y7", [SE, SL], "How can you grow large salt crystals from a salt solution?", "Evaporate some of the water, then let the hot solution cool and evaporate slowly",
    ["Boil it until all the water has gone very quickly", "Filter the solution through paper", "Freeze it in a freezer overnight"],
    "Heating removes some water and makes the solution more concentrated. Slow cooling and evaporation give the crystals time to grow."],
  ["y7", [SE], "In paper chromatography, why is the starting line drawn in pencil and not pen?", "Pencil lead does not dissolve in the solvent, but pen ink would run up the paper",
    ["Pencil marks are darker than pen marks", "Pens do not write on paper", "Pencil lead is magnetic"],
    "Pen ink contains dyes that would travel with the solvent and confuse the results. Pencil marks stay where they are."],
  ["y7", [SE], "In paper chromatography, why must the solvent level be below the starting line when the paper is set up?", "So the sample spots do not dissolve into the solvent in the container",
    ["So the paper does not get wet", "So the solvent does not evaporate", "So the dyes are heated"],
    "If the solvent covered the spots, the dyes would dissolve into the container rather than being carried up the paper."],
  ["y7", [SE], "Two inks make spots at the same height in one chromatography test. What can you conclude?", "They might contain the same dye, but more tests with other solvents are needed",
    ["They are definitely identical", "They are definitely different", "The solvent was too hot"],
    "Different dyes can travel the same distance in one solvent. Distance travelled depends on the solvent and paper as well as the dye, so it is not a unique fingerprint."],
  ["y7", [SE], "Which pairing of mixture and separation technique is correct?", "Iron filings and sand: magnet", ["Salt dissolved in water: filtration", "Dyes in black ink: sieving", "Sand and water: evaporation"],
    "Iron is magnetic and sand is not. Dissolved salt needs evaporation or distillation, ink dyes need chromatography, and sand in water can be filtered."],
  ["y7", [SE, FD], "In a distillation set-up, why is a condenser used?", "To cool the vapour so that it turns back into a liquid", ["To heat the mixture", "To filter out solids", "To stop the liquid from boiling"],
    "The vapour passes through a tube cooled by water, where it condenses and runs into the collecting flask."],
  ["y7", [SE, SO], "Salt water is boiled in a distillation set-up and the vapour is condensed and collected. What is left in the flask?", "The salt", ["Pure water", "Water vapour", "Nothing"],
    "Only the water evaporates. The salt stays in the flask and the collected liquid is nearly pure water."],
  ["ext", [SE], "A chromatogram has a dye spot 3 cm from the start line, and the solvent front has moved 6 cm. What is the Rf value?", "0.5", ["2.0", "0.3", "3.0"],
    "Rf = distance moved by the spot ÷ distance moved by the solvent front = 3 ÷ 6 = 0.5. Rf depends on the solvent and the paper."],
  // ---- fractional distillation
  ["y7", [FD, SE], "Ethanol boils at 78 °C and water at 100 °C. A mixture of the two is heated slowly. What does the vapour that first leaves contain mostly?", "Ethanol, because it has the lower boiling point",
    ["Water, because there is more of it", "Equal amounts of ethanol and water, always", "Neither, because both stay as liquids"],
    "The liquid with the lower boiling point evaporates more easily, so the first vapour is richer in ethanol. It is still not completely pure."],
  ["y7", [FD], "What is the extra part in fractional distillation that is not used in simple distillation?", "A fractionating column", ["A larger flask", "A filter funnel", "A magnet"],
    "The column lets the vapour condense and re-evaporate many times as it rises, which gives a much better separation of liquids with close boiling points."],
  ["y7", [FD], "Why is simple distillation not very good at separating ethanol from water?", "Their boiling points are fairly close, so some of both liquids evaporate",
    ["Ethanol does not boil", "Water does not evaporate", "They have the same boiling point"],
    "Because both liquids evaporate to some extent, the liquid collected is a mixture. Fractional distillation separates them much better. (Even so, a mixture of ethanol and water cannot be separated beyond about 96% ethanol by distillation.)"],
  ["y7", [FD], "Fractional distillation is best for separating", "liquids with different boiling points that are mixed together",
    ["an insoluble solid from a liquid", "a dissolved solid from water", "iron from sand"],
    "It uses the differences in boiling points to separate the liquids in a mixture, such as ethanol and water or the parts of crude oil."],
  ["y7", [FD], "In a fractionating column, the liquid with the lowest boiling point comes off", "near the top, where it is cooler",
    ["near the bottom, where it is hotter", "in the middle in every case", "at the same height as all the other liquids"],
    "The column is hottest at the bottom and cooler at the top. Vapour that boils at a lower temperature stays a gas until it reaches the cooler upper part."],
  ["y7", [FD], "A mixture of ethanol and water is heated and the thermometer in the distillation column stays near 78 °C. Which liquid is mostly boiling off?", "Ethanol", ["Water", "Both equally", "Neither"],
    "A reading near 78 °C matches the boiling point of ethanol. Once the ethanol has mostly gone the temperature rises towards the boiling point of water, 100 °C."],
  ["y7", [FD, SE], "Why would filtering not separate ethanol from water?", "Both liquids have tiny particles that pass through the filter paper together",
    ["Ethanol sticks to the filter paper", "Water cannot pass through filter paper", "Filter paper dissolves in ethanol"],
    "Filtration separates undissolved solids from liquids. Mixed liquids pass through the filter together, so a technique that uses boiling points is needed."],
  ["ext", [FD, SE], "Air can be cooled until it is a liquid and then separated by fractional distillation. Why does this work?", "Nitrogen, oxygen and argon have different boiling points",
    ["Nitrogen, oxygen and argon have different colours", "The gases are attracted to a magnet", "The gases are different sizes"],
    "When liquid air is warmed slowly, nitrogen (−196 °C) boils first, then argon (−186 °C), then oxygen (−183 °C). They can be collected separately."],
  // ---- water treatment
  ["y7", [WT], "What is the first step in a water treatment plant?", "Screening to remove large objects such as sticks and leaves", ["Adding chlorine", "Distilling the water", "Boiling the water"],
    "Water is first passed through screens that hold back large debris, so it does not block or damage the equipment in later steps."],
  ["y7", [WT], "What is coagulation (or flocculation) in water treatment?", "Chemicals are added so tiny particles clump into larger lumps called flocs",
    ["Chlorine is added to kill germs", "Water is filtered through sand", "Dissolved gases are removed"],
    "Tiny particles in the water are too small to settle. A coagulant makes them stick together into larger clumps that can settle or be filtered."],
  ["y7", [WT], "Why is water left to stand in a sedimentation tank?", "The clumps are denser than water, so they settle to the bottom", ["So the chlorine can evaporate", "So the water can cool down", "So dissolved salts settle out"],
    "The flocs are denser than water and slowly sink to the bottom as sludge, leaving clearer water above. Dissolved salts do not settle."],
  ["y7", [WT, SE], "What does the sand filter in a water treatment plant remove?", "Small suspended particles that did not settle", ["Dissolved salts", "Dissolved gases", "Dissolved fertiliser"],
    "The water passes through layers of sand and gravel that trap small solid particles. Dissolved substances pass straight through."],
  ["y7", [WT], "Why is chlorine added at the end of water treatment?", "To kill disease-causing microorganisms", ["To remove sand", "To make the water denser", "To remove dissolved salts"],
    "Disinfection with chlorine (or ultraviolet light or ozone) kills bacteria and other microbes that could make people sick. A small amount of chlorine left in the water keeps killing germs in the pipes."],
  ["y7", [WT, SE], "Which water pollutant can NOT be removed by filtration?", "Dissolved fertiliser (nitrate)", ["Sand and silt", "Leaves and sticks", "Soil particles"],
    "Dissolved nitrate particles are far smaller than the pores in a filter, so they pass through with the water."],
  ["y7", [WT], "What is the correct order of the main stages of water treatment?", "Screening, coagulation, sedimentation, filtration, disinfection",
    ["Disinfection, screening, sedimentation, filtration, coagulation", "Filtration, screening, coagulation, disinfection, sedimentation", "Sedimentation, screening, disinfection, coagulation, filtration"],
    "Large objects are removed first, then fine particles are clumped together, allowed to settle, filtered out and finally disinfected."],
  ["y7", [WT], "Why is untreated river water not safe to drink?", "It may contain microorganisms and pollutants that can make people sick", ["It contains no oxygen", "It is too pure", "It contains no particles"],
    "River water can carry bacteria, viruses, soil, chemicals and rubbish. Treatment removes them so the water is safe to drink."],
  ["y7", [WT], "How does boiling water make it safer to drink?", "The heat kills most disease-causing microorganisms", ["It removes dissolved salts", "It removes all chemicals", "It turns bacteria into minerals"],
    "Boiling kills most microorganisms. It does not remove chemical pollutants or dissolved salts, and the water has to cool before it can be drunk."],
  ["y7", [WT], "Activated carbon is sometimes used in water treatment. What can it remove?", "Some dissolved organic chemicals, and tastes and smells",
    ["Dissolved nitrate fertiliser", "Large sticks and leaves", "All dissolved salts"],
    "Activated carbon is very porous, so some dissolved organic chemicals stick to it. It does not remove dissolved nitrate or salt."],
  ["ext", [WT, SE], "In reverse osmosis desalination, how is salt removed from seawater?", "High pressure pushes water through a membrane that blocks the dissolved salt",
    ["Seawater is passed through filter paper", "Seawater is spun in a centrifuge", "A magnet pulls out the salt"],
    "The membrane has pores big enough for water molecules but too small for the dissolved ions, so mostly salt-free water passes through."],
  // ---- water cycle
  ["y7", [WC], "Which process in the water cycle is driven mostly by energy from the Sun?", "Evaporation of water from oceans and lakes", ["Precipitation", "Condensation", "Runoff"],
    "The Sun's energy heats surface water so that it evaporates. Precipitation and runoff are mainly driven by gravity."],
  ["y7", [WC, SM], "What happens to water vapour as it rises into cooler air?", "It condenses into tiny droplets and forms clouds", ["It freezes into rain", "It evaporates faster", "It changes into hydrogen and oxygen"],
    "Cooler air cannot hold as much water vapour, so the vapour condenses into tiny water droplets, which make up clouds."],
  ["y7", [WC], "What is precipitation?", "Water falling from clouds as rain, hail, sleet or snow", ["Water rising from lakes", "Water soaking into the ground", "Water vapour in the air"],
    "Precipitation is any form of water that falls from clouds to the ground."],
  ["y7", [WC], "What is transpiration?", "Plants releasing water vapour from their leaves", ["Water running down a hill", "Clouds forming over the sea", "Rain soaking into the soil"],
    "Plants take up water through their roots and release some as water vapour through tiny pores in their leaves. It adds water vapour to the air."],
  ["y7", [WC], "What is runoff?", "Water flowing over the land into streams, rivers and the sea", ["Water vapour rising into the air", "Water stored in clouds", "Water that evaporates from leaves"],
    "After rain, water that does not soak in flows downhill over the ground and collects in creeks and rivers."],
  ["y7", [WC], "Over a long time, what happens to the total amount of water on Earth?", "It stays about the same, as it moves between stores and changes state",
    ["It slowly gets used up", "It keeps increasing", "It is destroyed when it evaporates"],
    "Water is not created or destroyed in the water cycle. It moves between the ocean, air, land and living things, changing state along the way."],
  ["y7", [WC], "What is groundwater?", "Water stored underground in soil and rock", ["Water in clouds", "Water in the ocean", "Water vapour in the air"],
    "Some rain soaks into the ground and is stored in the spaces in soil and rock. It is part of the water cycle."],
  ["y7", [WC, SM], "Dew forms on grass on a cold morning. Which change of state has happened?", "Condensation of water vapour from the air", ["Evaporation of water from the grass", "Melting of ice", "Sublimation of frost"],
    "The cold grass cools the air next to it. Water vapour in the air condenses into tiny drops of liquid water."],
  ["y7", [WC], "Why does rain fall from a cloud?", "The droplets join together until they are heavy enough for gravity to pull them down",
    ["The Sun pushes the droplets down", "The droplets run out of energy and evaporate", "The wind has no effect on the cloud"],
    "Tiny cloud droplets collide and join into bigger drops. When the drops are heavy enough, gravity pulls them to the ground as rain."],
  ["y7", [WC, SE, SO], "The ocean is salty, but rain is fresh. Which is the best explanation?", "Only water evaporates, so the dissolved salts stay behind in the ocean",
    ["Rain washes all the salt out of the clouds", "Salt evaporates faster than water", "The Sun changes the salt into water"],
    "Evaporation is a bit like natural distillation: water changes to vapour, and the dissolved salt is left behind."],
  // ---- adapted from Year-7 content.jsx
  ["y7", [PM], "Which of the following is a compound?", "Water (H₂O)", ["Air", "Salt water", "Iron filings"],
    "Water is a compound because hydrogen and oxygen are chemically joined in a fixed ratio of 2 to 1. Air and salt water are mixtures, and iron is an element."],
  ["y7", [SE, SO], "Sand is separated from salt water by filtering. What is the filtrate?", "A salt solution (salt dissolved in water)", ["Sand only", "Sand and salt together", "Only pure water"],
    "The sand is insoluble and stays on the filter paper as the residue. The salt has dissolved, so the liquid that passes through is a salt solution."],
];

// ---------------------------------------------------------------- optional per-item option rewrites
// Applied by exact stem match, after the above, to remove a blatant "longest option is correct" tell.
const REWRITE = {
  "What is sublimation?": {"d": ["A liquid changing directly into a solid without cooling", "A gas turning into a liquid as it loses energy", "A liquid turning to a gas only at its boiling point"]},
  "Why does temperature remain constant during a change of state (for example, while ice is melting)?": {"key": "The energy goes into overcoming the attractions between particles, not into making them move faster", "d": ["The energy goes into making the particles smaller, not into making them move faster", "The energy is lost to the surroundings, so the particles cannot speed up", "The energy is stored inside the thermometer instead of heating the substance"]},
  "How do you measure the volume of an irregularly shaped object in the laboratory?": {"key": "Submerge it in water in a measuring cylinder and read how far the level rises", "d": ["Measure its length, width and height with a ruler and multiply them", "Weigh it on a balance and then divide the mass by the density of water", "Estimate its size by eye and compare it with a known object"]},
  "Why does ice float on liquid water?": {"key": "Ice is less dense, because its particles are in an open pattern with more space", "d": ["Ice is lighter in colour than liquid water, so it floats on top", "Ice particles are moving faster than the particles in liquid water", "Ice has no mass, so gravity does not pull it down at all"]},
  "Why must you read a measuring cylinder at eye level?": {"d": ["To see the colour of the liquid more clearly in the light", "To stop the measuring cylinder from tipping over on the bench", "Because the scale is only printed on one side of the glass"]},
  "What decides whether an object floats or sinks in water?": {"key": "Its average density compared with water's", "d": ["Its colour and how shiny it is", "Its mass, with heavier objects always sinking", "Its shape, since flat objects always float"]},
  "What is surface tension?": {"key": "A stretchy 'skin' on a liquid caused by surface particles being pulled inwards", "d": ["The temperature at which a liquid changes into a gas", "The force of a liquid pushing on the sides of its container", "The ability of a liquid to run downhill quickly"]},
  "What is a solution?": {"d": ["Any mixture of two or more different substances", "A liquid that has been purified by distillation", "A compound made when two elements join together"]},
  "What does 'soluble' mean?": {"d": ["A substance that melts easily when it is heated", "A substance that floats on the top of water", "A substance that reacts when acid is added"]},
  "What is a saturated solution?": {"key": "A solution that holds the maximum amount of dissolved solute at that temperature", "d": ["A solution that has been diluted with a lot of extra water", "A solution in which all of the solvent has evaporated", "A solution that has a strong colour from its solute"]},
  "Why do bubbles appear inside a saucepan before the water even reaches boiling point?": {"key": "Dissolved gases become less soluble as water warms and escape as bubbles", "d": ["A chemical reaction in the water is making oxygen gas", "The metal of the pan reacts with water to make gas", "Water molecules are splitting into hydrogen and oxygen"]},
  "What is a supersaturated solution?": {"key": "An unstable solution holding more dissolved solute than it normally could", "d": ["A very concentrated solution that is completely stable", "A solution that has been filtered to remove all of its impurities", "A solution made using two different solvents at once"]},
  "A solution is described as 'dilute'. What does this mean?": {"d": ["It contains the maximum possible amount of dissolved solute", "It has been heated so that more solute can dissolve", "It contains only the solvent and no solute at all"]},
  "What is an alloy?": {"d": ["A pure element with special properties, such as iron", "A compound formed when two non-metals react together", "A type of metalloid that conducts only a little heat"]},
  "What is the difference between an element and a compound?": {"key": "An element has one type of atom; a compound has two or more types joined together", "d": ["An element has two types of atom; a compound has only one type", "A compound can be separated by filtering but an element cannot be", "They mean the same thing, because both are mixtures of atoms"]},
  "What is the difference between a compound and a mixture?": {"key": "A compound has its elements joined in fixed ratios; a mixture's parts are not joined", "d": ["A compound has random amounts of each part; a mixture has fixed amounts", "A compound can be filtered apart, but a mixture cannot be separated", "A mixture is always a liquid, but a compound is always a solid"]},
  "What is a heterogeneous mixture?": {"d": ["A mixture in which all of the particles are exactly the same size", "A mixture that dissolves completely when it is added to water", "A compound in which the proportions of elements can vary"]},
  "What is distillation used for?": {"key": "Collecting a liquid, such as pure water, by boiling a solution and condensing the vapour", "d": ["Separating an insoluble solid from a liquid by passing it through paper", "Separating magnetic materials from non-magnetic materials using a magnet", "Separating dyes by how far they travel up a sheet of paper"]},
  "A mixture of sand, salt and water is to be separated. Which FIRST step would you use?": {"d": ["Evaporation, to boil the water away from the sand and salt first", "Distillation, to separate the sand from the salt", "Magnetic separation, to attract the salt out of the mixture"]},
  "What physical property is exploited when chromatography separates dyes in ink?": {"d": ["The boiling points of the dyes, which differ from dye to dye", "The magnetic properties of the dyes, which differ from dye to dye", "Only the size of the dye particles, with large ones travelling furthest"]},
  "Why can filtration NOT remove dissolved salt from salt water?": {"d": ["Salt is denser than the filter paper, so it sinks through the water", "Salt reacts with the filter paper and passes through as a gas", "Filtration only works on mixtures of gases and not of liquids"]},
  "What is fractional distillation used for in industry?": {"key": "Separating crude oil into fractions such as petrol and diesel", "d": ["Removing the salt from seawater to make drinking water", "Filtering solid particles out of town drinking water", "Pulling iron out of other metals using a magnet"]},
  "In the water cycle, what change of state happens when water vapour in the air forms a cloud?": {"d": ["Evaporation: liquid water changes into water vapour gas", "Sublimation: a solid changes directly into a gas", "Melting: solid ice changes into liquid water"], "key": "Condensation: water vapour cools into tiny droplets of liquid water"},
  "A gas is squashed into a smaller space by pushing in a syringe plunger. What happens to the gas particles?": {"d": ["They shrink, so that they take up less room", "They change into a liquid straight away", "They stop moving until the plunger is released"]},
  "Why does a gas push on the walls of its container?": {"d": ["Gas particles are heavier than the walls are", "Gas particles stick to the walls of the container", "Gas particles push upwards on one another"]},
  "How is evaporation different from boiling?": {"key": "Evaporation is at the surface at any temperature; boiling is throughout the liquid", "d": ["They are two different names for exactly the same process", "Evaporation can only happen when a liquid reaches 100 degrees Celsius", "Boiling only happens at the surface, while evaporation happens throughout"]},
  "What are the bubbles made of that rise through a pot of boiling water?": {"d": ["Air that was dissolved in the water", "Hydrogen and oxygen gases from the water splitting", "Heat energy from the burner trapped in the liquid"]},
  "What is the white 'cloud' seen above a boiling kettle?": {"d": ["Water vapour, which is a white gas you can see", "Hot air that is rising up from the kettle", "Smoke given off by the heating element"]},
  "A sealed, flexible bag of air is warmed. Why does the bag swell?": {"d": ["The particles get bigger as they are heated up", "More air particles are created by the heat", "The particles become lighter and float to the top"]},
  "Why can a liquid be poured but a solid cannot?": {"key": "Liquid particles slide past each other; solid particles are held in place", "d": ["Liquid particles are smaller than solid particles are", "Liquid particles are much further apart than solid particles", "Solid particles are heavier than liquid particles are"]},
  "Which statement is true of the particles in every state of matter?": {"d": ["They are always held in a fixed, regular pattern", "They are always spread far apart from one another", "They always stay in contact with all of their neighbours"]},
  "A solid is heated steadily and its temperature is recorded. What does a flat section on the graph show?": {"d": ["The heater has been switched off for a short time", "The substance has stopped absorbing any more energy", "The substance has finished changing state completely"]},
  "Ice at −10 °C is heated steadily until it becomes water at 20 °C. How many flat sections does the temperature graph have?": {"d": ["None, since the temperature always rises", "Two, one for melting and one for boiling", "Three, one for each state of matter"]},
  "Ice at −10 °C is heated steadily until the water boils. What is the correct order of the stages on the graph?": {"d": ["Ice melts (flat), ice warms, water boils (flat), water warms", "Ice warms, water boils (flat), ice melts (flat), water warms", "Water warms, ice melts (flat), water boils (flat), ice warms"]},
  "Pure water is boiling in an open pot at sea level. Why does the thermometer stay at 100 °C even though the burner keeps heating?": {"d": ["The thermometer is not able to read any temperature above 100 degrees", "The water particles have stopped moving around once boiling begins", "The burner cannot supply any more energy once the water is at 100 degrees"]},
  "Why is the melting point useful for identifying a pure substance?": {"key": "A pure substance melts at one specific temperature", "d": ["All pure substances melt at exactly 0 degrees Celsius", "The melting point changes each time it is measured", "Only mixtures are able to have a melting point"]},
  "A huge log floats but a tiny pebble sinks. What is the best explanation?": {"d": ["The pebble has more mass than the log has, so the pebble sinks", "The log is much bigger, so the water is able to hold it up", "The pebble has no air trapped inside it but the log is full of air"]},
  "A steel ship floats even though steel is denser than water. Why?": {"key": "The ship's average density, including the air inside it, is less than water's", "d": ["Steel becomes much lighter in weight once it is placed in water", "The hull of the ship repels water particles so that it stays on top", "Gravity pulls less strongly on large objects such as ships"]},
  "Why can a water strider walk on the surface of a pond?": {"key": "Surface tension holds up its light weight, spread over its long legs", "d": ["Its legs are lighter than air, so the insect cannot sink at all", "Water is denser at the surface of the pond than it is below it", "Its legs are filled with air, which makes them float like a boat"]},
  "Water forms small round beads on a waxy leaf. What is the best explanation?": {"key": "Water particles attract each other more than the wax, so the drop pulls into a bead", "d": ["Wax attracts water particles very strongly, so the drop is pulled together", "Gravity squeezes every drop on the leaf into the shape of a ball", "Wax makes the water heavier, so the drop forms a round bead"]},
  "Pepper is sprinkled on water and a drop of detergent touches the centre. What happens to the pepper?": {"d": ["It sinks straight to the bottom of the dish", "It gathers together in the middle of the dish", "It stays exactly where it was and nothing changes"]},
  "What causes surface tension in a liquid?": {"d": ["Particles at the surface are pushed upwards by the air above them", "Particles at the surface are heavier than the particles below them", "Particles at the surface stop moving and become solid"]},
  "Which statement about surface tension is correct?": {"d": ["Only water has surface tension, and no other liquid has any", "Only liquids that float on water have any surface tension", "Only hot liquids have surface tension, and cold liquids have none"]},
  "A glass can be filled slightly above its rim without spilling. What allows this?": {"d": ["Air pressure pushes down on the top of the water", "The water expands to fit the space above the rim", "The glass is actually bigger on the inside than outside"]},
  "A sugar solution is poured through filter paper. What goes through?": {"key": "Both the sugar and the water pass through", "d": ["Only the water, with the sugar left on the paper", "Only the sugar, with the water left on the paper", "Nothing, because the paper blocks both"]},
  "Salt is stirred into water until it seems to disappear. What has happened to the salt?": {"d": ["Its particles have been destroyed by the water particles", "Its particles have changed into extra water particles", "Its particles have shrunk until there is nothing left of them"]},
  "Why does a bottle of soft drink fizz when you open it?": {"d": ["The sugar in the drink reacts with the air outside", "The drink starts to boil as soon as it is opened", "The drink suddenly warms up and its gas expands"], "key": "Dissolved carbon dioxide leaves the drink when the pressure drops"},
  "At 20 °C, 36 g of salt can dissolve in 100 g of water. A student stirs 20 g of salt into 100 g of water at 20 °C. The solution is": {"d": ["saturated, because all of the salt dissolved", "supersaturated, because the liquid is clear", "insoluble, because salt is a solid to begin with"]},
  "In what units is the solubility of a solid usually given?": {"d": ["Degrees Celsius needed to dissolve one gram of solute", "Grams of water needed to dissolve 100 g of solute", "Litres of solute that dissolve in a kilogram of water"]},
  "Why does a can of soft drink go flat more quickly when it is warm?": {"d": ["The sugar becomes less soluble in warm drinks and stops it fizzing", "The can expands when it is warm and lets the gas out", "Carbon dioxide turns into a liquid as the drink warms up"]},
  "A saturated salt solution at 60 °C is left to cool. Salt solubility decreases a little as it cools. What do you see?": {"d": ["Nothing at all happens as the solution cools down", "The dissolved salt turns into more water", "The water in the solution changes into ice"]},
  "How can you tell that a solution is saturated?": {"d": ["It has a strong colour all the way through", "It has been boiled for several minutes", "It contains a very large amount of water"], "key": "Extra solute stays undissolved however long you stir"},
  "Which statement is correct?": {"d": ["A saturated solution is always a concentrated solution", "A dilute solution can never be a saturated solution", "Saturated and concentrated always mean the same thing"], "key": "A saturated solution of a barely soluble substance can still be dilute"},
  "Iron filings and sulfur powder are mixed. A magnet pulls the iron out. When the mixture is heated strongly, it forms a black solid that the magnet does not attract. What is the black solid?": {"d": ["A mixture of iron and sulfur that has been heated", "An element, because it is a single colour", "Iron that has changed colour but is otherwise the same"]},
  "A bottle of clean-looking water has been filtered. A student says it must be pure water. Why might this be wrong?": {"d": ["Filtered water always still contains some fine sand in it", "Pure water is always slightly cloudy or a little bit coloured", "Water cannot be filtered at all, so it can never be made cleaner"]},
  "How does a centrifuge separate a mixture?": {"d": ["It heats the mixture until one of the parts evaporates", "It passes the mixture slowly through a sheet of paper", "It uses a strong magnet to pick out the iron parts"]},
  "How can you grow large salt crystals from a salt solution?": {"key": "Evaporate some water, then let the solution cool slowly", "d": ["Boil it quickly until all of the water has gone", "Pour the solution through a sheet of filter paper", "Freeze the solution in a freezer overnight"]},
  "In paper chromatography, why is the starting line drawn in pencil and not pen?": {"key": "Pencil lead does not dissolve in the solvent, but pen ink does", "d": ["Pencil marks are always darker and easier to see than pen marks", "Pens are not able to write on chromatography paper", "Pencil lead is magnetic and so it stays still"]},
  "In paper chromatography, why must the solvent level be below the starting line when the paper is set up?": {"d": ["So the paper at the bottom does not get wet in the solvent", "So the solvent cannot evaporate out of the container", "So the dyes in the spots are warmed by the solvent"]},
  "Two inks make spots at the same height in one chromatography test. What can you conclude?": {"d": ["They are definitely the same ink, so no more tests are needed", "They definitely contain different dyes, whatever the solvent", "The solvent was too hot, so the test must be repeated"]},
  "In a distillation set-up, why is a condenser used?": {"d": ["To heat the mixture so that it boils faster", "To filter out the solids from the mixture", "To stop the liquid in the flask from boiling"]},
  "Why is simple distillation not very good at separating ethanol from water?": {"d": ["Ethanol does not boil, so it stays in the flask", "Water does not evaporate, so it stays in the flask", "They have exactly the same boiling point as each other"]},
  "Fractional distillation is best for separating": {"d": ["an insoluble solid from a liquid it is mixed with", "a dissolved solid from the water it is dissolved in", "magnetic iron filings from the sand around them"]},
  "Why would filtering not separate ethanol from water?": {"d": ["Ethanol sticks to the filter paper and blocks the pores", "Water is not able to pass through filter paper at all", "Filter paper dissolves completely when ethanol touches it"]},
  "What is the first step in a water treatment plant?": {"d": ["Adding chlorine to kill microorganisms in the water", "Distilling the water to remove everything in it", "Boiling all of the water in large tanks"]},
  "What is coagulation (or flocculation) in water treatment?": {"d": ["Chlorine is added to the water to kill germs", "Water is filtered through layers of sand and gravel", "Dissolved gases are removed from the water by heating"], "key": "Chemicals make tiny particles clump into larger lumps called flocs"},
  "Why is water left to stand in a sedimentation tank?": {"d": ["So that the chlorine can evaporate from the water", "So that the water has time to cool down", "So that the dissolved salts settle out of the water"]},
  "What does the sand filter in a water treatment plant remove?": {"d": ["Dissolved salts that are mixed into the water", "Dissolved gases such as oxygen and carbon dioxide", "Dissolved fertiliser, such as nitrate"]},
  "Why is chlorine added at the end of water treatment?": {"key": "To kill the disease-causing microorganisms in it", "d": ["To remove any sand that is left in the water", "To make the water denser and clearer", "To take out the salts that are dissolved"]},
  "Which water pollutant can NOT be removed by filtration?": {"key": "Dissolved fertiliser (nitrate) in the water", "d": ["Sand and silt from the river", "Leaves and sticks from the bank", "Soil particles washed off the land"]},
  "Why is untreated river water not safe to drink?": {"d": ["It contains no oxygen, so it cannot be used by people", "It is too pure, so it lacks what people need to stay healthy", "It contains no particles, so it has no taste at all"]},
  "How does boiling water make it safer to drink?": {"d": ["It removes the salts that are dissolved in the water", "It removes all chemicals from the water", "It changes the bacteria in the water into minerals"]},
  "Activated carbon is sometimes used in water treatment. What can it remove?": {"d": ["Dissolved nitrate fertiliser from farm runoff", "Large sticks and leaves that float", "All of the salts dissolved in the water"]},
  "Which process in the water cycle is driven mostly by energy from the Sun?": {"d": ["Precipitation, which is rain and snow falling", "Condensation, which is clouds forming", "Runoff, which is water flowing over the land"]},
  "What happens to water vapour as it rises into cooler air?": {"d": ["It freezes into rain before it reaches the ground", "It evaporates even faster as the air gets cooler", "It changes into hydrogen and oxygen gases"]},
  "What is precipitation?": {"d": ["Water vapour rising from lakes and the sea", "Water soaking down into the soil and rock", "Water vapour that is mixed into the air"]},
  "What is transpiration?": {"d": ["Water running down a hill into a creek", "Clouds forming over the sea in the morning", "Rain soaking down into the soil and rock"]},
  "What is runoff?": {"d": ["Water vapour rising up from the ocean into the air", "Water that is stored as tiny droplets in clouds", "Water vapour that is given off from the leaves of plants"]},
  "Over a long time, what happens to the total amount of water on Earth?": {"d": ["It slowly gets used up as people drink the water", "It keeps increasing as more rain falls each year", "It is destroyed each time that water evaporates"], "key": "It stays about the same, moving between stores and changing state"},
  "What is groundwater?": {"d": ["Water that is held in clouds in the sky", "Water that is found in the open ocean", "Water vapour that is mixed into the air"]},
  "Why does rain fall from a cloud?": {"key": "The droplets join up until gravity can pull them down", "d": ["The Sun's energy pushes the droplets downwards", "The droplets run out of energy and then evaporate", "The droplets freeze as they get close to the ground"]},
  "The ocean is salty, but rain is fresh. Which is the best explanation?": {"d": ["Rain washes all the salt out of the clouds as it falls", "Salt evaporates faster than water does, so it leaves", "The Sun changes the salt into water as it shines"]},
  "Sand is separated from salt water by filtering. What is the filtrate?": {"d": ["Sand only, collected from the filter paper", "Sand and salt mixed together", "Only pure water with nothing dissolved in it"]},
  "What does particle theory tell us happens when a solid solute dissolves in water?": {"key": "Water particles pull the solute particles away from the solid and spread them out", "d": ["The solute particles break into atoms that join with the water atoms", "The solid melts into a liquid that then mixes with the water", "The solute particles shrink until they are too small to see"]},
  "What does the state symbol (aq) mean in a chemical equation?": {"key": "The substance is dissolved in water as a solution", "d": ["The substance is a gas at room temperature", "The substance is a solid at room temperature", "The substance is a pure liquid"]},
  "What is steel, and why is it more useful than pure iron for building?": {"key": "An alloy of iron and a little carbon, which is stronger than pure iron", "d": ["Pure iron that has been polished, which makes it much lighter", "A compound of iron and oxygen that never rusts", "A mixture of copper and zinc, which makes it attractive"]},
  "Why does a shorter carbon-chain hydrocarbon fraction from crude oil condense near the TOP of the fractionating column?": {"key": "Shorter chains boil at lower temperatures, so they condense at the cooler top", "d": ["Shorter chains are denser, so they are pushed up to the top", "Shorter chains react with longer chains and float upwards", "Shorter chains have higher boiling points and so reach the top first"]},
  "A heater supplies energy at a steady rate. Compared with melting a block of ice at 0 °C, boiling the same mass of water at 100 °C takes about": {"q": "A heater supplies energy at a steady rate. Compared with melting a block of ice at 0 °C, boiling the same mass of water at 100 °C takes", "key": "about seven times as long, because vaporising needs far more energy than melting", "d": ["about the same time, because both are changes of state at a fixed temperature", "about half the time, because water is already a liquid", "about twice as long, because boiling happens at a higher temperature"]},
  "During melting, the temperature stays constant even though energy is being added. What happens to the particles' energy?": {"key": "Potential energy rises as attractions are overcome; average kinetic energy stays the same", "d": ["Average kinetic energy rises, while potential energy stays exactly the same", "Kinetic energy and potential energy both stay exactly the same", "The extra energy is destroyed as the substance melts"]},
  "Why can steam at 100 °C cause a worse burn than boiling water at 100 °C?": {"d": ["Steam is always much hotter than 100 degrees Celsius", "Steam particles are heavier than liquid water particles", "Steam sticks to the skin and cannot be wiped off"]},
  "Liquid water is densest at about 4 °C. Why does it become less dense as it cools towards 0 °C?": {"d": ["The water molecules start to shrink as they get colder", "The water molecules stop moving altogether before 0 degrees", "Dissolved air leaves the water as it gets colder"]},
  "Why is the surface tension of water higher than that of most other liquids?": {"key": "Strong hydrogen bonds between water molecules pull surface molecules inwards", "d": ["Water molecules are much heavier than the molecules of other liquids", "Water molecules do not move at all, even when warm", "Water has fewer molecules at its surface than other liquids"]},
  "Why does salt (sodium chloride) dissolve in water but wax does not?": {"key": "Water molecules attract the charged ions and pull them from the crystal", "d": ["Wax is too dense to be able to dissolve in water at all", "Salt particles are much smaller than the particles of wax are", "Wax melts before it has any chance to dissolve in the water"]},
  "Why does sugar dissolve in water but not in cooking oil?": {"key": "Sugar and water molecules attract each other, but oil does not attract sugar", "d": ["Oil molecules are much smaller than water molecules are, so sugar stays solid", "Sugar melts when it is put into water but not when put into oil", "Oil is less dense than water, so sugar cannot sink into it"]},
  "Why is an alloy such as brass a mixture, not a compound?": {"key": "Its metals are mixed in varying amounts, with no fixed formula", "d": ["It contains only one type of atom throughout", "Its metals are chemically joined in a fixed ratio", "It is always a liquid at room temperature"]},
  "In reverse osmosis desalination, how is salt removed from seawater?": {"d": ["Seawater is poured through ordinary filter paper in a big tank", "Seawater is spun quickly in a very large centrifuge", "A strong magnet pulls the salt out of the water"], "key": "High pressure forces water through a membrane that blocks the salt"},
};

// ---------------------------------------------------------------- build
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
const raw = [];
for (const [id, band, topics, p = {}] of KEEP) {
  const s = src(id);
  const keyText = p.key ?? s.o[s.a];
  const d = p.d ?? s.o.filter((_, i) => i !== s.a);
  raw.push({ srcId: id, band, topics, q: p.q ?? s.q, key: keyText, d, why: p.why ?? s.exp });
}
for (const [band, topics, q, key, d, why] of A) raw.push({ srcId: "authored", band, topics, q, key, d, why });
const used = new Set();
for (const r of raw) { const rw = REWRITE[r.q]; if (rw) { used.add(r.q); Object.assign(r, rw); } }
for (const q of Object.keys(REWRITE)) if (!used.has(q)) { console.error(`unmatched REWRITE: ${q}`); process.exit(1); }

// validate
const problems = [];
for (const r of raw) {
  const all = [r.key, ...r.d].map(norm);
  if (r.d.length !== 3) problems.push(`${r.srcId} "${r.q}": needs 3 distractors`);
  if (new Set(all).size !== 4) problems.push(`${r.srcId} "${r.q}": duplicate option`);
  if (!r.why || !String(r.why).trim()) problems.push(`${r.srcId} "${r.q}": missing why`);
  if (!["y7", "ext"].includes(r.band)) problems.push(`${r.srcId}: bad band`);
  for (const t of r.topics) if (!TOPICS.includes(t)) problems.push(`${r.srcId}: bad topic ${t}`);
}
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }

// dedupe near-identical stems
const words = (s) => new Set(norm(s).toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ").filter((w) => w.length > 2));
const jac = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size + b.size - n); };
const kept = []; const dups = [];
for (const r of raw) {
  const w = words(r.q);
  const hit = kept.find((k) => jac(w, k._w) >= 0.7 && norm(k.key).toLowerCase() === norm(r.key).toLowerCase());
  if (hit) { dups.push(`${r.srcId}: ${r.q} ~ ${hit.q}`); continue; }
  r._w = w; kept.push(r);
}

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// seeded shuffle + balanced answer positions (exactly even, +-1)
const deck = shuffle(kept.map((_, i) => i % 4));
const order = shuffle(kept.map((_, i) => i));
const items = kept.map((r, i) => {
  const pos = deck[order.indexOf(i)];
  const ds = shuffle(r.d);
  const options = [...ds.slice(0, pos), r.key, ...ds.slice(pos)];
  return { id: "", band: r.band, topics: r.topics, q: norm(r.q), options: options.map(norm), answer: pos, why: norm(r.why) };
});
items.sort((a, b) => ["y7", "ext"].indexOf(a.band) - ["y7", "ext"].indexOf(b.band));
items.forEach((it, i) => { it.id = `mx${String(i + 1).padStart(3, "0")}`; });

// stats
const pos = [0, 0, 0, 0]; let longest = 0; const blatant = [];
for (const it of items) {
  pos[it.answer]++;
  const lens = it.options.map((o) => o.length);
  const k = lens[it.answer], others = lens.filter((_, i) => i !== it.answer);
  if (k > Math.max(...others)) longest++;
  if (k > Math.max(...others) * 1.3 && k - Math.max(...others) > 12) blatant.push({ q: it.q, ratio: +(k / Math.max(...others)).toFixed(2) });
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generated: "tools/build-revision-bank.mjs", items }, null, 1) + "\n");

const by = {}; for (const it of items) by[it.band] = (by[it.band] || 0) + 1;
console.log(`items ${items.length}`, by);
console.log("answer positions A-D:", pos.map((n) => `${n} (${Math.round((n / items.length) * 100)}%)`).join(" "));
console.log(`key is the longest option: ${longest} (${Math.round((longest / items.length) * 100)}%); blatant (>1.3x): ${blatant.length}`);
if (process.argv.includes("--blatant")) blatant.forEach((b) => console.log(`  ${b.ratio}x  ${b.q}`));
console.log("duplicates dropped:", dups.length, dups);
console.log("topic x band:");
for (const t of TOPICS) {
  const y = items.filter((it) => it.topics.includes(t) && it.band === "y7").length;
  const e = items.filter((it) => it.topics.includes(t) && it.band === "ext").length;
  console.log(`  ${t.padEnd(22)} y7 ${String(y).padStart(3)}  ext ${String(e).padStart(3)}${t !== FN && y < 8 ? "   <-- below 8 y7" : ""}`);
}
