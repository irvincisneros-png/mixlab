# Station 2 briefs: Density, buoyancy and surface tension (Y7 4.2.1–4.2.3)

MixLab is **live** (https://irvincisneros-png.github.io/mixlab/); station 1 (States of matter) is the reference. Two builders work in parallel; each owns only the files in its section.

## Read first (both)
1. `docs/LEVEL_BRIEF.md`, then `../cellscape/LEVEL_BRIEF.md` (the contract).
2. `docs/briefs/station1-states.md`: **Shared rules** and **Visual language** apply here unchanged (own tab with explicit `tabId`, rAF tip, cache-busting, syntax check, tests, themes, portrait, tiers, clay, report < 300 words, don't commit).
3. The station 1 levels as working references: `assets/js/world/levels/states.js` + `statesContent.js` (apparatus, chart, narrative, missions, quiz, mix-ups, sources), `statesParticles.js` (particle scale, honesty cards), and **`labkit.js`** (read its API header; import from it, don't copy it; if you need a new generic builder, put it in your own file and describe it in your report so it can move into labkit later).
4. **`assets/js/world/levels/densityModel.js` + `tests/densityModel.test.mjs`**: the shared, tested density model (read-only). Model changes: describe them in your report.
5. `docs/AUDIT-year7-page.md` items 11 and 13 (density errors in the old page: "1.000 g/mL sinks", "density identifies a material", the displacement arithmetic).

## A · Density lab: apparatus scale (`density`)
**Own:** `assets/js/world/levels/density.js`, `assets/js/world/levels/densityContent.js`.

**The bench station.** An electronic balance (reads to 0.01 g, tare button), a 100 mL measuring cylinder (1 mL graduations, meniscus), a ruler, a tray of samples from `SOLIDS`, a clear tank of liquid for float/sink, and a tall **density column** cylinder. Use labkit's glass/water materials and bench.

**Measure density (4.2.2, 4.2.3).** Students pick a sample, place it on the balance (mass from `measure()`), then find its volume:
- **regular** samples: a ruler readout of length × width × height (or π r² h for a cylinder) from `measure().dims`;
- **irregular** samples: lower it into the measuring cylinder; the water rises from the start reading to `after` (show both readings, eye-level reading with meniscus);
- a **results table** (sample, mass g, volume cm³, density g/cm³, data-book value, % difference) the student fills by pressing "Record", with the calculation shown (ρ = m / V = 54.0 g ÷ 20.0 cm³ = 2.70 g/cm³). Compare with the data-book value and its `range`; never claim density identifies a material on its own (granite and aluminium are both ≈ 2.7).
- a **size** slider (`makeSample(key, size)`): a bigger piece of the same material has more mass and more volume but the **same density**.

**Float or sink (4.2.1).** Drop the current sample into the tank; result from `floatTest()` with the right fraction submerged (ice ~92 % under). Tank liquid choice: water, salt water (sea water), vegetable oil, methylated spirits. Show the predicted result before the drop ("Predict: floats / sinks") and compare. Objects within the tie are suspended (never show 1.000 as "sinks").

**Density column.** Pour liquids from `LIQUIDS` in any order (buttons); `settleColumn()` decides layering: dense at the bottom, oil on water, methylated spirits mixes into water (the layer changes colour/clarity and the column notes it), honey/syrup/dish liquid layer when poured gently (`slowMix`, note they slowly blend over hours). Then drop solids in: each settles at the layer where its density sits between the layers above and below (e.g. HDPE in oil? no: HDPE 0.95 sinks through oil 0.92, floats on water 1.00 — so it rests at the oil/water boundary). Animate the pour and settling.

**Narrative** from state: what's on the balance, the computed density, what will happen in the tank and why ("The steel bolt is heavier than the pine block? No: the big pine block weighs 32 g and the bolt 24 g, but pine is less dense than water, so it floats").

**Missions (5–6):** measure the density of a regular and an irregular object; get within 5 % of the data-book value; show a heavy object that floats and a light one that sinks; make an egg-like sample float by switching water → salt water (pick a sample whose density is between them, or note the egg idea in text with real egg density ≈ 1.03 g/cm³ and only if you cite it); build a 4-layer column; (Ext) explain why the 50:50 meths–water layer is denser than meths but lighter than water.

**Quiz (5–6)** and **"Common mix-ups"** card targeting: "heavier objects sink" / "big things sink"; "density changes when you cut it in half"; "floating objects have no weight"; "air makes things float" (only by lowering average density, e.g. ships); "1 g/mL means it sinks in water"; "density alone identifies a material".

**Data & sources card:** `SOURCES` from the model; values are typical (woods, plastics, oils, honey vary; show `range`); water density at 20 °C (0.998 g/mL); instrument resolution stated.

**Portal down:** the tank (or the column) is a portal to `densityParticles`.

Topics: `["density"]`.

## B · Density at the particle scale (`densityParticles`)
**Own:** `assets/js/world/levels/densityParticles.js`, `assets/js/world/levels/densityParticlesContent.js`.

Two views (segmented control), both honest about simplification:
1. **Why things have different densities.** Side-by-side cubes of the same tiny volume (e.g. 1 nm³) of: water (≈ 33 molecules/nm³), ice (≈ 31/nm³, open hexagonal lattice: reuse the idea, not the code, from `statesParticles.js`), vegetable oil (long chain molecules, approximate, say so), aluminium (60 atoms/nm³, fcc lattice, a = 4.05 Å), lead (33 atoms/nm³ but each atom ~7.7× heavier than Al), and air (≈ 0.025 molecules/nm³: almost always an empty cube; show the expected count). A readout per cube: particles in the cube × mass of each particle → density, matching the data-book value (show the arithmetic for Year 7 as "more particles packed in, or heavier particles, or both"). Particle counts and masses must be computed from real data (molar mass, density, Avogadro) in your content file, with the calculation in a comment and tested by a small `tests/densityParticles.test.mjs` you own.
2. **Surface tension (4.2.1).** A slab of water molecules with the surface at the top: molecules inside are pulled equally in all directions; surface molecules are pulled inward and sideways, so the surface acts like a stretched skin. Show attraction arrows (net force) on a selected molecule. A steel paper clip (ρ 7.85) rests on the surface, dimpling it; "Add a drop of detergent": detergent molecules (water-loving head, oily tail) gather at the surface, weaken the pull, and the clip sinks. Data: surface tension water 72.8 mN/m at 20 °C, ethanol ≈ 22 mN/m (CRC); all liquids have surface tension, water's is unusually high. Water striders/insects as a real-world note.

Narrative from state; missions (4–5) and quiz (5) targeting: "heavier particles always make a denser material" (packing matters: ice vs water), "air has no mass", "surface tension is a skin made of a different substance", "the paper clip floats because it's light" (it's denser than water; surface tension holds it).

Honesty card: spheres, not to scale, cube sizes and counts rounded, oil molecules simplified, motion slowed.

Topics: `["density","surface-tension","particle-theory"]`.

## Registration (orchestrator does this, not you)
`shell.js` LEVELS will have `density` ("Density lab") and `densityParticles` ("Particles and density"); `bench.js` STATIONS will get a `density` row at slot 1. Test directly with `index.html?start=density` and `?start=densityParticles`.
