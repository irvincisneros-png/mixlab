# MixLab: level (station) brief

MixLab is a **lab bench that zooms in**: bench → beaker or apparatus → particles. Each station on the bench is a level; diving into the apparatus goes down to the particle scale. It runs on the CellScape engine (copied; see `README.md`).

**The level contract is CellScape's.** Read `../cellscape/LEVEL_BRIEF.md` in full (fields, panel rules, performance, notes after Phase 2). Everything there applies here, with these differences:

| CellScape | MixLab |
|---|---|
| Year bands `y7-8`, `y9-10`, `y11`, `y12` | **`y7`** (core) and **`ext`** (Extension: links forward to Years 8–10 chemistry). Write text as `{ y7: "...", ext: "..." }`; `lens.pick()` falls back to `y7`. Missions/quiz items use `band: "ext"` for extension-only items. |
| Reference level `levels/cell.js` | Reference levels are in `../cellscape/assets/js/world/levels/` (read-only): `cell.js` + `cellContent.js` (narrative from model state, missions, quiz), `animalCell.js` (`placeClamped` labels on narrow stages). Copy patterns; never edit CellScape. |
| Topic tags (biology) | `states-of-matter`, `heating-curves`, `particle-theory`, `density`, `surface-tension`, `solutions`, `solubility`, `concentration`, `pure-mixtures`, `separation`, `first-nations`, `fractional-distillation`, `water-treatment`, `water-cycle` (see `content/syllabus.json`) |
| Dev server :8420 | **http://localhost:8430** (root = `mixlab/`) |
| `window.cellscape.engine` | `window.mixlab.engine` (the `cellscape` alias also works) |
| Microscope button | none |
| localStorage keys `cellscape.*` | `mixlab.*` (both sites share the github.io origin) |

## MixLab rules on top of the contract
- **Honest particles.** Wherever particles are drawn, say on the page what is simplified: drawn as spheres, not to scale, spacing in gases far larger than shown, colours are not real, etc. At Year 7 name particles honestly but simply ("water particles (molecules)", "sodium ions").
- **Real data, cited.** Every number from the real world (melting/boiling points, densities, solubility, heat capacities) comes with a source shown on the page (a "Data & sources" line or card).
- **Misconceptions.** Each station names the misconceptions it targets (in its brief and in a short "Common mix-ups" card) and contains a situation where each one visibly fails.
- **Every station is a working system.** Students change variables and see consequences; the "What's happening" text is generated from model state (actual rates and amounts), never from switch states.
- **Visual bar:** polished, realistic 3D in molecular-animation style, never toy-like. Glassware looks like real lab glass (`MeshPhysicalMaterial` with transmission, ior ≈ 1.5, thin walls, rim highlights, a meniscus); liquids refract and have real colour (attenuation). Particle scenes: glossy, softly lit, subtle motion, depth of field kept subtle (the owner dislikes blur).
- **Performance:** school Chromebooks. Transmission is expensive: keep transmissive meshes few, and let the engine's Fast tier downgrade them (`applyTier` in `materials.js`). Mark decorative InstancedMeshes `userData.lod = true`.
- **Narrow stages:** labels clamped and stacked below the HUD chips (see `placeClamped` in CellScape's `animalCell.js`). Check 375×812.
- **Light theme:** chart colours through `K.chartCol()`.
- **Australian spelling**, plain teacher-friendly words.

## Testing
- `node --input-type=module --check < file.js` for every JS file (plain `node --check` misses errors).
- `for t in tests/*.mjs; do node $t; done`.
- Hidden pane: `window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 33)`.
- Module caching: `await fetch(url, {cache: "reload"})` for each edited module, then `location.reload()`.
- Dive from the parent: `const e = window.mixlab.engine; await e.dive(e.current.portals.find(p => p.to === "<id>"));` and back with `await e.up()`.
