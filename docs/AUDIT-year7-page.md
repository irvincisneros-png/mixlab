# Audit: Year-7 Solutions & Mixtures page (`Year-7/solutions-mixtures/content.jsx`)

Audited 2026-10-13 before reusing any content in MixLab. Quiz keys (14) are all correct. The errors are in the interactive models and a few figures. Nothing here has been fixed on the Year-7 site (that's a separate repo; ask before pushing).

## Errors that MixLab must not repeat
1. **Heating curve proportions** (lines 134–142). Boiling plateau must be ≈ 6.8× the melting plateau (Lv 2257 vs Lf 334 J/g); liquid water warms about half as fast as ice (c 4.18 vs 2.09 J/g·°C). Energy at a plateau overcomes the **attractions between particles** (potential energy rises, kinetic energy constant); it doesn't "break bonds" (lines 211, 728).
2. **Water treatment order is never checked** (607–623, 662–664: the array is compared with itself). Coagulation/flocculation missing between screening and sedimentation.
3. **Dissolving figure: the solute disappears** (970–991): solute count goes 6 → 2 → 1 → 0. The same number of solute particles must stay, spread among the water.
4. **Dissolving sim** (299–322): a fading rectangle, "Saturated soon!" at 100 % dissolved, water turns yellow when hot, stirring "gives energy". Stirring brings fresh solvent to the surface.
5. **Chromatography** (528–585): no mixture separates; origin spot duplicated; Rf called a unique fingerprint (it depends on solvent, paper and temperature).
6. **Particle pictures** (15–100, 692–715): solid particles random-walk instead of vibrating about fixed sites; liquid fills the box like a gas; particle size changes between states; the static liquid is a regular lattice.
7. **Solubility units**: data are g per 100 g water (CRC), labelled per 100 mL.
8. **Compound diagram** (1029–1048): six unconnected identical spheres labelled "water".
9. Activated carbon doesn't remove dissolved fertiliser (nitrate/phosphate) (1196).
10. Fractionating tower figure duplicates aviation fuel/kerosene and omits bitumen (1153–1157).
11. "Physical properties don't depend on particle identity" (689): wrong; the molecules are unchanged between states, but melting/boiling point and density depend on the substance.
12. Changes-of-state figure says six changes, shows five (no deposition) (744).
13. Smaller: surface tension isn't "special" to water (all liquids; water's is high) (825); density alone doesn't identify a material (859); "65 mL = Vol 15 mL" (855); crystallised honey is saturated, not supersaturated (414); Darling River fish kills: drought, low flow, stratification and a cold-change turnover as well as nutrients (Vertessy et al. 2019) (1224); dry-ice fog is condensed water vapour (774); chalk soluble/insoluble inconsistent (924 vs Q9); ethanol/water needs fractional distillation and forms an azeotrope at ~95.6 % (1111); 1.000 g/mL shown as "sinks" (225).

## Reusable
KNO₃, NaCl and sucrose solubility data (fix units), densities (water 1.00, ice 0.917, oil ≈ 0.92, ethanol 0.79, aluminium 2.70 g/mL; cite temperature), the worked density examples, the ship-floats average-density argument, the Rf formula, dynamic equilibrium at saturation, gas solubility falling with temperature, the sodium acetate hand-warmer, mixture→technique mappings, energy-direction mapping, pure/homogeneous/heterogeneous classifications, all MCQ keys.
