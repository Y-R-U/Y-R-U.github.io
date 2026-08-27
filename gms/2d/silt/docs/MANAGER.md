# SILT — manager state

Mobile-first falling-sand puzzle. `/gms/2d/silt/`. Vanilla JS + WebGL2, no build
step, no CDN, no dependencies.

**Read order:** this file -> `CONTRACTS.md` (frozen interfaces) -> `DECISIONS.md`
-> `HANDOFF.md` (append-only, most current truth).

## Phase state

| Phase | What | State |
|---|---|---|
| P0 | Skeleton, viewport, input, main.js, test hooks, boot gate | **done** |
| P1 | Sim core: grid, materials, chunks, step, clears, pieces, bot, oracle | **done** |
| P2 | WebGL2 density-field renderer | lane A |
| P3 | FLOW playable and balanced | lane C |
| P4 | Jelly soft-body, TIDE, JELLY LAB | lanes C + D |
| P5 | Reactions, HOURGLASS, ZEN | lanes C + D |
| P6 | ALCHEMY levels | lane C |
| P7 | Shell, attract screen, audio, ship | lanes B + E + manager |

## Lanes

| Lane | Owns | Status |
|---|---|---|
| manager | `js/main.js`, `js/core/**`, `js/sim/{grid,step,clears,pieces,world,materials}.js`, `tools/{sim,boot,cdp}.mjs`, `docs/**`, git | P0+P1 done |
| A renderer | `js/gfx/**`, `dev/gfx.html`, `tools/gfx_shot.mjs` | running |
| B shell/ui | `index.html`, `css/**`, `js/ui/**` | not started |
| C modes | `js/modes/**`, `js/data/**`, `tools/modesim.mjs` | running |
| D jelly | `js/sim/blobs.js`, `js/sim/reactions.js`, `tools/jellysim.mjs` | running |
| E audio | `js/audio/**`, `assets/audio/**` | running |

## Gates

```
node tools/sim.mjs                    sim oracle: mass, ledger, determinism, play, perf
node tools/sim.mjs --break ledger     falsification arm (also: rng, clears, mass)
node tools/boot.mjs                   boot + soak on a true 390x844 viewport
node tools/boot.mjs --falsify boot    also: freeze, error
node tools/boot.mjs --gpu             the only honest timings
```

All green as of P1. `tools/sim.mjs` reports 0.25 ms/tick against a 4 ms budget.

## Outstanding

- `js/core/debugdraw.js` is a PLACEHOLDER Canvas2D renderer that draws exactly
  the pixel look this project exists to avoid. **Delete it once lane A lands.**
  `main.js` only falls back to it when `js/gfx/renderer.js` is absent, and
  `__state.placeholder` reports when it is in use.
- FLOW is far too easy: the bot survives ~110 s and scores ~750k. Lane C is
  rebalancing fall speed and rescaling scoring into the thousands.
- `projects.js` entry and `assets/screenshots/silt.jpg` are deliberately held
  back until the real renderer exists — the card's screenshot is this game's
  entire first impression and a pixel-look placeholder would misrepresent it.
