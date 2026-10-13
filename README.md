# MixLab: Solutions & Mixtures

A 3D lab bench for NSW **Year 7 Solutions & Mixtures** (Science 7–10 (2023), Stage 4, SC4-SOL-01; school codes Y7 4.1.1–4.5.1). Each station on the bench is an experiment; zoom in from the bench to the apparatus and down to the particles.

Static site, no build step. Three.js r169 vendored in `assets/vendor/three`, loaded through an import map.

## Run locally
```bash
python3 -m http.server 8430
```
Then open http://localhost:8430/. Tests: `for t in tests/*.mjs; do node $t; done`.

## Engine provenance
The engine layer is copied from **CellScape** (`irvincisneros-png/cellscape`) at commit `c803344c2f97547a2518b8ad287f59e639d4d6a4` (2026-10-12). A shared engine package comes later; until then, port fixes by hand.

| File | Copied from | Changes |
|---|---|---|
| `assets/js/world/engine.js`, `materials.js`, `style.js`, `a11y.js`, `teacherMode.js` | `cellscape/assets/js/world/` | none |
| `assets/js/world/shell.js` | same | MixLab registry, branding, no microscope, `?start=` param, two-band syllabus card, `mixlab.look` key |
| `assets/js/world/lens.js` | same | bands `y7` and `ext`, `mixlab.lens` key |
| `assets/js/world/theme.js` | same | `mixlab.theme` key |
| `assets/js/world/revision.js` | same | band tiers for `y7`/`ext` |
| `assets/js/kit.js`, `assets/css/*.css`, `teacher.html`, `assets/js/teacher.js` | `cellscape/assets/…` | branding; teacher page adapted to MixLab |
| `assets/vendor/three`, `assets/textures/clay-height.png` | same | none |

Removed: biology levels, `microscope.js`, the library page.

## Docs
- `docs/PLAN.md`: stations, status, follow-ups.
- `docs/HANDOVER.md`: how to continue in a new session.
- `docs/LEVEL_BRIEF.md`: the station contract (on top of CellScape's).
- `docs/briefs/`: builder briefs.
- `docs/AUDIT-year7-page.md`: science errors found in the old Year-7 page.
