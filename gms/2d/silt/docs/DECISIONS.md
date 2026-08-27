# SILT — decisions

Append-only. Each entry is a decision that would otherwise be re-litigated.

**D1. CPU sim, GPU render.** The grid is plain typed arrays in JS; the renderer is
a pure function of it. A GPU cellular automaton is faster but makes soft-body
jelly, flood-fill clear detection and node testing all painful, and nothing in
this repo has ever written one. Measured cost: 0.25 ms/tick against a 4 ms
budget, so perf was never the constraint — testability was.

**D2. No build step, no CDN, no dependencies.** House default, and SILT needs
nothing external. With no importmap there is nothing to hang on a failed fetch,
which is the bug that cost this repo a lot of debugging.

**D3. 3 tints, mono-coloured pieces, 8-connected clears. MEASURED, NOT CHOSEN.**
A chain clears when one tint spans left wall to right wall. Swept in node:

| tintMode | 3 tints | 4 tints | 5 tints |
|---|---|---|---|
| mono, 8-conn | **10.5 chains/game** | 0.8 | 0.8 |
| duo, 8-conn | 0.3 | 0.3 | 0.0 |
| mixed, 8-conn | 0.7 | 0.0 | 0.0 |
| mono, 4-conn | 8.2 | 1.3 | 0.7 |

4+ tints is dead at every board size (80x160, 96x192, 112x224) and with any bot
weighting. This is the site-percolation threshold — a colour holding 25% of cells
cannot span a lattice whose threshold is ~0.41 (8-connected) — not a tuning
problem. Consequences, all deliberate:
- Difficulty comes from **fall speed and board width**, never colour count.
- Pieces are **single-coloured**, so each landing deposits ~256 contiguous
  same-tint grains and the board grows monochrome regions instead of a mosaic.
- Visual variety must come from **materials** (water, lava, jelly, crystal) and
  biome grading, not from more tints. A restrained 3-colour palette is a
  constraint worth having anyway.

**D4. Connectivity is by TINT, not by material.** Blue water completes a chain of
blue sand. This is what makes TIDE's rising water a resource as well as a threat.

**D5. Gravity is a cardinal unit vector, not a hardcoded row offset.** HOURGLASS
flips it and a tilt mode can turn it sideways for free. Verified: sand settles at
the bottom, top and right for the three directions with mass preserved.

**D6. Jelly is a soft body, not a cellular automaton.** Blob id + centroid +
wobble spring, rasterised back into the grid each tick so clear detection keeps
running unchanged on the plain grid.

**D7. Chemistry runs before movement.** After a cell moves, its index refers to a
different cell, so reacting there transforms a bystander. Cost one real bug.

**D8. Relative drag, not absolute column targeting.** The thumb never covers the
board. This is a game about watching sand.

**D9. Every gate ships with a falsification arm.** The first version of the boot
gate's arm assigned to `window.__state` — an accessor property — so the
assignment silently did nothing and all eight checks stayed green while
"broken". A check never proven to fail is not evidence.
