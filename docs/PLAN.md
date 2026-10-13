# MixLab: Plan (updated 2026-10-13)

**MixLab** = NSW Year 7 Solutions & Mixtures (Science 7–10 (2023) Stage 4 focus area *Solutions and mixtures*, outcome SC4-SOL-01; school codes Y7 4.1.1–4.5.1). Term 4 2026 unit, taught now: ship stations as they become solid, in teaching order.

**Zoom metaphor:** lab bench → apparatus → particles. Each station is a level on the bench; diving into the apparatus goes to the particle scale. Engine copied from CellScape (see `README.md`).

**Year lens:** `y7` (core) and `ext` (Extension: links to Years 8–10 chemistry).

## Stations (teaching order)

| # | Station | Codes | Levels | Status |
|---|---|---|---|---|
| 0 | Lab bench (home) + teacher page | — | `bench` | ✅ 2026-10-13 |
| 1 | States of matter: heating/cooling, live heating curve, water cycle, particle view, properties of states | 4.1.1–4.1.4 | `states` → `particles` | ✅ 2026-10-13. Model `statesModel.js` tested; Codex 2 rounds, fixed |
| 2 | Density: density column, float/sink lab (measured m and V, ρ = m/V), buoyancy, surface tension | 4.2.1–4.2.3 | `density` → `densityParticles` | ✅ 2026-10-13. Model `densityModel.js` + particle counts tested; Codex 2 rounds, fixed |
| 3 | Dissolving: particle view of solute and solvent; temperature, stirring, particle size | 4.3.1, 4.3.4 | — | Planned |
| 4 | Solubility: saturation, solubility curves (KNO₃, NaCl, CuSO₄; real cited data, g/100 g water), crystals on cooling, supersaturation | 4.3.2, 4.3.3, 4.3.5 | — | Planned |
| 5 | Concentration: dilute/concentrated, g/L | 4.3.5 | — | Planned (may merge with 4) |
| 6 | Pure vs mixture: elements, compounds, mixtures at particle level | 4.4.1, 4.4.2 | — | Planned |
| 7 | Separation lab + "which technique and why" challenge | 4.4.3, 4.4.4 | — | Planned |
| 8 | First Nations separation techniques (sourced only) | 4.4.5 | — | Planned |
| 9 | Fractional distillation of crude oil | 4.4.6 | — | Planned |
| 10 | Water treatment: build a sequence, measure turbidity/contaminants | 4.5.1 | — | Planned |

Cross-station: revision quiz bank ✅ (`content/revision.json`: 200 items, 172 Y7 / 28 Ext; first-nations empty until sourced), syllabus map (`content/syllabus.json`: 19 Y7 + 9 Extension dot points, all 19 school codes matched 1:1).

## Publishing
**Live** (public repo + GitHub Pages, 2026-10-13): https://irvincisneros-png.github.io/mixlab/. Every push to `main` goes to students, so verify before pushing. Ask before adding it to `science-sim-hub`.

## Known follow-ups
- Station 1: Extension "double the mass" mission not exercised end to end; Balanced tier glass reads milky (transmission → alpha); glass is alpha-blended (three.js transmission can't see other transmissive meshes), water is the one refracting volume.
- Revision bank: key is still the longest option in 56 % of items.
- CellScape has the same `style.js` clay→real crash on material arrays (fixed here 2026-10-13); port it when next working in CellScape (ask before pushing).
- Density lab: portrait starts on a partial overview; Look at buttons give close-ups.
- Real-device check (Chromebooks, phones) not done yet.
- Year-7 site (`Year-7/solutions-mixtures/content.jsx`) has the science errors listed in `docs/AUDIT-year7-page.md`. Not fixed (separate repo; ask before pushing).
- Syllabus: the 2023 syllabus has no explicit intermolecular-forces dot point; Extension links use Stage 5 Materials/Reactions points instead.
