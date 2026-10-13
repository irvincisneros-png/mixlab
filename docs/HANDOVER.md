# MixLab: handover prompt for a new session

Paste everything below the line into a new Claude Code session opened in `~/Documents/Local Projects/Science Simulator Website/`.

---

You're continuing **MixLab**, a 3D lab-bench simulator for NSW **Year 7 Solutions & Mixtures** (my Term 4 2026 unit, being taught now). I'm a science teacher. Work in `mixlab/`, branch `main`, GitHub repo `irvincisneros-png/mixlab` (**public, live on Pages** at https://irvincisneros-png.github.io/mixlab/ since 2026-10-13; every push to `main` goes to students; ask me before adding it to `science-sim-hub`). It runs on the engine copied from my CellScape site (`cellscape/`, live and public; read-only from here).

## Read first
1. `mixlab/docs/PLAN.md`: stations, status table, follow-ups.
2. `mixlab/README.md`: engine provenance (CellScape commit) and file map.
3. `mixlab/docs/LEVEL_BRIEF.md`, then `cellscape/LEVEL_BRIEF.md`: the station contract.
4. `mixlab/docs/briefs/`: builder briefs so far (good templates).
5. `mixlab/docs/AUDIT-year7-page.md`: errors in my old Year-7 page; don't repeat them.
6. `git -C mixlab log --oneline | head -20`.

## Key facts
- Static site, no build. Three.js r169 vendored; import map in `index.html`. Levels in `assets/js/world/levels/`, registered in `shell.js` `LEVELS`. `?start=<id>` opens a station; `?year=7|ext`; `?code=Y7-4.1.2`.
- Bands: `y7` and `ext` (Extension → Years 8–10 chemistry).
- Models are pure modules with node tests in `tests/` (e.g. `statesModel.js`: enthalpy-based heating/cooling of water with cited data).
- Dev server: `.claude/launch.json` config `mixlab` (port 8430).
- Testing tips: hidden pane → `window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 33)`; module caching → `fetch(url, {cache: "reload"})` then `location.reload()`; syntax → `node --input-type=module --check < file.js`; tests → `for t in tests/*.mjs; do node $t; done`.

## How I like to work
- **Decide, don't ask.** Say your recommendation in one line and keep building. Ask before outward-facing actions (public repo, Pages, pushes to other repos, hub).
- Concise, teacher-friendly updates. Science accuracy first; real data with citations; be honest about simplifications on the page.
- Visual bar: polished, realistic 3D (real lab glass, refracting liquids, molecular-animation particles), never toy-like. Keep depth of field subtle.
- Builders: a brief per station in `docs/briefs/`; Sonnet 5.5 builders, one per level, file-scoped, parallel, own browser tab with explicit `tabId`; Haiku 5.5 for searches. Review each in the browser before committing.
- Codex adversarial review (`codex-ask --cd mixlab "..."`), two rounds max; verify claims before fixing; send fixes back to the builder that wrote the code.
- Commit and push as work lands; commit messages end with the `Co-Authored-By` line from the system attribution reminder. Keep `docs/PLAN.md` and this file current.

## Next steps
See the status table in `docs/PLAN.md`.
