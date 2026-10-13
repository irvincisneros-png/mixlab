# MixLab: Plan (updated 2026-10-13)

**MixLab** = NSW Year 7 Solutions & Mixtures (Science 7–10 (2023) Stage 4 focus area *Solutions and mixtures*, outcome SC4-SOL-01; school codes Y7 4.1.1–4.5.1). Term 4 2026 unit, taught now: ship stations as they become solid, in teaching order.

**Zoom metaphor:** lab bench → apparatus → particles. Each station is a level on the bench; diving into the apparatus goes to the particle scale. Engine copied from CellScape (see `README.md`).

**Year lens:** `y7` (core) and `ext` (Extension: links to Years 8–10 chemistry).

## Stations (teaching order)

| # | Station | Codes | Levels | Status |
|---|---|---|---|---|
| 0 | Lab bench (home) + teacher page | — | `bench` | Building (builder A) |
| 1 | States of matter: heating/cooling, live heating curve, water cycle, particle view, properties of states | 4.1.1–4.1.4 | `states` → `particles` | Building (B apparatus, C particles). Model `statesModel.js` tested (`tests/statesModel.test.mjs`) |
| 2 | Density: density column, float/sink lab (measured m and V, ρ = m/V), buoyancy, surface tension | 4.2.1–4.2.3 | — | Next |
| 3 | Dissolving: particle view of solute and solvent; temperature, stirring, particle size | 4.3.1, 4.3.4 | — | Planned |
| 4 | Solubility: saturation, solubility curves (KNO₃, NaCl, CuSO₄; real cited data, g/100 g water), crystals on cooling, supersaturation | 4.3.2, 4.3.3, 4.3.5 | — | Planned |
| 5 | Concentration: dilute/concentrated, g/L | 4.3.5 | — | Planned (may merge with 4) |
| 6 | Pure vs mixture: elements, compounds, mixtures at particle level | 4.4.1, 4.4.2 | — | Planned |
| 7 | Separation lab + "which technique and why" challenge | 4.4.3, 4.4.4 | — | Planned |
| 8 | First Nations separation techniques (sourced only) | 4.4.5 | — | Planned |
| 9 | Fractional distillation of crude oil | 4.4.6 | — | Planned |
| 10 | Water treatment: build a sequence, measure turbidity/contaminants | 4.5.1 | — | Planned |

Cross-station: revision quiz bank (`content/revision.json`, builder D), syllabus map (`content/syllabus.json`: 19 Y7 + 9 Extension dot points, all 19 school codes matched 1:1).

## Publishing
Repo `irvincisneros-png/mixlab` is **private**. Ask the owner before making it public or turning on GitHub Pages; after that, every push to `main` goes to students. Ask before adding it to `science-sim-hub`.

## Known follow-ups
- Year-7 site (`Year-7/solutions-mixtures/content.jsx`) has the science errors listed in `docs/AUDIT-year7-page.md`. Not fixed (separate repo; ask before pushing).
- Syllabus: the 2023 syllabus has no explicit intermolecular-forces dot point; Extension links use Stage 5 Materials/Reactions points instead.
