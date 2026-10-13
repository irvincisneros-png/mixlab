# Station 1 briefs: lab bench + States of matter (Y7 4.1.1–4.1.4)

This is the first MixLab release. The owner's Year 7 classes are on **4.1 States of matter right now** (Term 4 2026), so it ships as soon as it is solid. Three builders work in parallel; each owns only the files in its section.

## Read first (everyone)
1. `docs/LEVEL_BRIEF.md` (MixLab differences), then `../cellscape/LEVEL_BRIEF.md` (the full contract).
2. `assets/js/world/engine.js`, `shell.js`, `lens.js`, `materials.js`, `assets/js/kit.js`, `assets/css/world.css`.
3. A reference level in CellScape (read-only): `../cellscape/assets/js/world/levels/cell.js` + `cellContent.js`, and `animalCell.js` for `placeClamped`.
4. `docs/AUDIT-year7-page.md`: errors found in the owner's old 2D page. Don't repeat them.
5. `assets/js/world/levels/statesModel.js` + `tests/statesModel.test.mjs`: **the shared, tested heating model (read-only for everyone).** If you need a model change, describe it in your report.

## Shared rules
- Edit only your own files. Never edit CellScape. Engine/shell/lens/kit/CSS changes: describe them in your report.
- The dev server runs at **http://localhost:8430**. If it isn't up, start it with the Claude_Browser `preview_start {name: "mixlab"}` tool; never with Bash.
- **Browser:** create your own tab (`tabs_create`), pass an explicit `tabId` on every call, never touch other tabs, close yours when done.
- Hidden pane: `window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 33)`. Module caching: `await fetch(url, {cache: "reload"})` per edited module, then `location.reload()`.
- `node --input-type=module --check < file.js` on every JS file you touch; run `for t in tests/*.mjs; do node $t; done`.
- Check: console clean, light and dark page themes, portrait 375×812 (reset to desktop after), Graphics tiers Cinematic/Balanced/Fast, and Look → Clay model (real → clay → real restores exactly).
- **Owner priorities:** science accuracy (classrooms use this; be honest about simplifications on the page); polished, realistic 3D, never toy-like (real lab glass with refraction, liquids with real colour); plain, teacher-friendly words, Australian spelling.
- Bands `{ y7, ext }`. Year 7 wording is plain; Extension adds kinetic/potential energy, intermolecular forces, specific heat capacity and latent heat with numbers.
- Don't commit. Report in under 300 words: what you built, model/assumptions, science you're unsure of, what you checked, engine changes needed.

## Visual language (all three builders)
A clean, modern school lab under soft studio light: a matte dark-grey epoxy-resin bench top (subtle roughness variation), borosilicate glassware (`MeshPhysicalMaterial`: `transmission: 1`, `ior: 1.47`, `thickness` small, `roughness ≈ 0.02`, slight blue-green `attenuationColor`, clearcoat), white printed graduations, brushed-steel retort stand and hotplate with a glowing ring when on. Water uses transmission with `ior: 1.33` and a faint blue `attenuationColor`; a slightly raised **meniscus** rim. Ice cubes: frosted (`roughness 0.15–0.3`, transmission, ior 1.31), with trapped-air streaks. Steam: in an open beaker, invisible water vapour plus a faint white **mist of condensed droplets** just above the surface (it's droplets, not steam; say so on hover). Bubbles in boiling water are **water vapour**, not air. Set `env` so the stage reads as a lit lab (warmer, brighter than CellScape's dark cell interior) while keeping contrast for labels.

---

## A · Lab bench (`bench`)
**Own:** `assets/js/world/levels/bench.js` (new), `teacher.html`, `assets/js/teacher.js`, `assets/css/teacher.css`.

1. **The home level** (`bench`, root of the stack). A realistic lab bench seen at a comfortable 3/4 angle: bench top, a tiled splash-back or soft out-of-focus lab wall, a few decorative items (wash bottle, safety glasses, a stand) kept light (`userData.lod = true` on repeated decor).
2. **Stations.** One station per *built* level. For now only **`states`**: a beaker of ice on a hotplate with a thermometer, the portal into `states`. Lay the bench out so more stations (density column, dissolving beaker, separation kit, fractionating column, water-treatment train) can be added later at fixed slots, but **show only built stations** (no dead ends): build the station list from a const `STATIONS = [{ to: "states", label: "States of matter", codes: "Y7 4.1", slot: 0 }]`, skipping any whose `to` isn't in `engine.levelsDef`.
3. Each station has a 3D label (name + school codes) and hover/selection info. Double-click or zoom in dives (portal `radius` ≈ the apparatus size). Panel cards: "Welcome to MixLab" (what the bench is, how to zoom: bench → apparatus → particles), "Stations" (buttons that dive), and the topics `["states-of-matter","heating-curves","particle-theory"]` (union of built stations) so the Syllabus card lists the dot points.
4. `metersPerUnit`: pick a real scale (e.g. 1 unit = 0.1 m) so the scale bar reads in cm. Portrait framing must show the station.
5. **Teacher page.** Adapt CellScape's `teacher.html`/`teacher.js` for MixLab: start-station list from MixLab's levels (`bench`, `states`, `particles`), links use `index.html?start=<id>` (shell already supports `?start=`), year bands Year 7 / Extension, syllabus search over `content/syllabus.json` (`?code=Y7-4.1.2`), options lock/noquiz/present/paused/clay unchanged, branding MixLab, theme key `mixlab.theme`. QR code must still work offline.

## B · States of matter: apparatus scale (`states`)
**Own:** `assets/js/world/levels/states.js`, `assets/js/world/levels/statesContent.js`, `assets/js/world/levels/labkit.js` (new: reusable glassware/liquid/hotplate/thermometer builders that later stations will import; document its API at the top).

**The apparatus.** A 250 mL beaker on a hotplate (or, switchable, in a **cold bath** of ice and salt), a **thermometer** whose liquid column reads the model temperature, a stirrer, a stopwatch readout. Container choice: **Open beaker** or **Sealed syringe** (glass syringe with a plunger at atmospheric pressure, so steam stays and can be heated past 100 °C; the plunger moves out as vapour forms: the volume change is real, use ≈ 1700× volume liquid→steam at 100 °C, clamped visually, and say it's clamped). Ice cubes float (ice 0.917 g/cm³ vs water 1.00) and shrink as `model.solid` falls; the water level follows `model.liquid` (volume = mass / density); bubbles of vapour form at the bottom and rise when `model.phaseChange === "boiling"`; evaporation mist at the surface scales with `model.evapRate`.

**The model.** Use `createStatesModel()` from `statesModel.js`. Controls:
- hotplate power slider 0–250 W (shows "heat in" in W); cold bath on/off (bath at −15 °C);
- container Open / Sealed (resets);
- start: ice at −20 °C / water at 20 °C / reset;
- mass 50–300 g (reset);
- **time speed** 10×–120× (default 40×); one simulated time step per frame = `dt × speed` (use `simDt`, so pause works).
Expose the model as `inst.model` so the particle level (C) can read it: `engine.stack.at(-2).inst.model`.

**Live heating curve** (the centrepiece of 4.1.2). A panel chart (canvas, `K.chartCol()` colours) of temperature (°C) vs time (min) from `model.history`, with horizontal guides at 0 °C and 100 °C, the current point, and shaded labels on the flat sections ("melting: temperature stays at 0 °C" / "boiling"). Also a small stage chip with T, state and time. Students should be able to **predict, then test**: a "Predict" toggle lets them sketch a line on the chart before heating (pointer drag), then compare.

**Narrative ("What's happening")** from model state each refresh, e.g. "The hotplate is putting in 150 W. The temperature has stopped rising at 0 °C: the energy is going into pulling the ice particles out of their fixed positions (melting), not into making them move faster. 43 g of ice left." Use actual `heatIn`, `heatLoss`, `latentRate`, masses, `evapRate`. Y7 vs Ext wording (Ext: kinetic vs potential energy, intermolecular attractions, J/g figures, "6.8× longer to boil than melt the same mass").

**Water on Earth (4.1.1).** A small card linking the current change to the water cycle, generated from `phaseChange`: melting ↔ glaciers and sea ice melting; evaporation ↔ oceans, lakes, puddles drying (happens below 100 °C!); boiling (not in nature except geysers/hot springs); condensing ↔ clouds, dew, the mist above the beaker; freezing ↔ snow, sea ice.

**Missions** (5–6, `K.missions`), e.g.: melt all the ice and record how long the temperature stayed at 0 °C; find the boiling point of water; show the temperature doesn't rise while boiling (stays at 100 °C for at least 2 min at max power); make water above 100 °C (only possible in the sealed syringe: steam); freeze water in the cold bath and find the freezing point; (Ext) double the mass and show both flat sections take twice as long.

**Quiz** (5–6, `K.quiz`) targeting misconceptions; **"Common mix-ups" card**:
- "temperature keeps rising while boiling";
- "bubbles in boiling water are air";
- "the white cloud above a kettle is steam" (it's condensed droplets; steam is invisible);
- "evaporation only happens at 100 °C";
- "melting and dissolving are the same thing" (brief mention, links forward);
- "ice has to be heated to 0 °C before anything happens" is true, but "ice is always 0 °C" isn't (start at −20 °C).

**Data & sources card**: `WATER.sources` from the model, plus the simplifications (one temperature throughout, constant heat capacities, no supercooling/superheating, teaching-scale heat loss and evaporation, sealed syringe at constant pressure).

**Portal down:** the water in the beaker is a portal (`to: "particles"`, label "Zoom into the particles"), with a pulsing "dive" label.

Topics: `["states-of-matter","heating-curves","water-cycle"]`.

## C · States of matter: particle scale (`particles`)
**Own:** `assets/js/world/levels/statesParticles.js`, `assets/js/world/levels/statesParticlesContent.js`.

**What it shows.** Water molecules (one red-ish oxygen, two white hydrogens at 104.5°, O–H drawn proportionally; glossy, molecular-animation style; InstancedMesh, ≤ 300 molecules) in a view through the beaker's contents. `metersPerUnit` so the scale bar reads in nm (a water molecule is ≈ 0.28 nm across).

**Driven by the same model.** Read the parent's model (`engine.stack.at(-2)?.inst?.model`); if there is no parent (opened via `?start=particles`), create your own `createStatesModel()` with a small control set (heat/cool, speed). Never duplicate physics: phase fractions and temperature come from the model.
- **Solid (ice):** molecules in an open hexagonal lattice, **vibrating about fixed positions** (amplitude grows with temperature, √T-ish), not wandering.
- **Liquid:** molecules touching, disordered, sliding past each other; speed grows with T.
- **Gas:** far apart, fast, straight-line paths with collisions. Honest note: real spacing in steam at 100 °C is ~12× the molecule size; it's compressed here so it fits.
- **Mixed states:** during melting, ice region + liquid region with molecules leaving the lattice at the boundary at a rate matching `model.solid` falling; during boiling/evaporation, molecules escaping from the liquid surface (in an open beaker they leave; sealed, they stay as gas). Evaporation below boiling: only the occasional fastest molecule escapes.
- **Molecules never change size or shape** between states (a key misconception: "particles expand when heated"). Show a selected molecule's speed in a chip; the average speed tracks temperature (Ext: ∝ √(T in K)).
- Optional attraction cue: faint links between near neighbours (hydrogen bonds), many in ice, fewer in liquid, none in gas. Ext text names them intermolecular attractions (hydrogen bonds for water).

**Properties of solids, liquids and gases (4.1.4).** A "Test the state" card with a **squeeze test** (a piston pushes in: gas compresses a lot, liquid and solid barely; the particle view shows why: gaps), a **shape/flow test** (tilt: solid keeps its shape, liquid flows to the bottom but keeps its volume, gas fills the box), and a **"Compare substances"** card: melting and boiling points of oxygen (−218 / −183 °C), ethanol (−114 / 78 °C), water (0 / 100 °C), sodium chloride (801 / 1465 °C), iron (1538 / 2862 °C) (cite CRC Handbook / RSC Periodic Table / PubChem), linking stronger attractions between particles to higher melting/boiling points. Check each value against a source and put the source on the card.

**Narrative** from model state (positions are illustrative, numbers come from the model). **Missions** (5–6) and **quiz** (5–6) targeting: "particles expand when heated", "there's air between the particles", "particles in a solid don't move", "gas particles are bigger", "melting particles break apart into atoms" (molecules stay whole; Ext: intermolecular vs covalent bonds). **Honesty card:** spheres, not to scale, colours are conventions, gas spacing compressed, 2D-ish slice of a 3D sample, motion slowed down enormously (real molecules move ~600 m/s at room temperature).

Topics: `["states-of-matter","particle-theory"]`.
